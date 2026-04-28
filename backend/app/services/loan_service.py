"""
loan_service.py
Orchestrates loan lifecycle: DB persistence + blockchain calls + IPFS uploads.
"""
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan import Loan, LoanDocument, LoanStatus
from app.models.user import User
from app.services.blockchain_service import blockchain_service
from app.services.ipfs_service import ipfs_service
from app.services.ai_scoring_service import (
    run_ai_scoring,
    default_request_from_loan,
    AIScoreRequest,
)

_STATUS_ENUM: dict[str, LoanStatus] = {s.value: s for s in LoanStatus}


class LoanService:

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_loan(
        self,
        db: AsyncSession,
        borrower_address: str,
        amount_usdc: float,
        duration_days: int,
        interest_rate_bps: int,
        guarantors: list[str],
        ipfs_hash: str,
        borrower_private_key: str,
        ai_request: AIScoreRequest | None = None,
    ) -> tuple[Loan, dict]:
        duration_seconds = duration_days * 86_400
        amount_raw = int(amount_usdc * 10**6)  # USDC has 6 decimals

        # ── Run AI scoring before submitting to chain ──────────────────────
        score_req = ai_request or default_request_from_loan(amount_usdc, duration_days)
        scores = run_ai_scoring(
            wallet_address=borrower_address,
            request=score_req,
            push_to_chain=False,  # set True once NFT is registered
        )

        # Submit to blockchain
        result = blockchain_service.create_loan_request(
            borrower_wallet=borrower_address,
            amount=amount_usdc,
            duration=duration_seconds,
            interest_rate=interest_rate_bps,
            guarantors=guarantors,
            ipfs_hash=ipfs_hash,
            private_key=borrower_private_key,
        )

        loan = Loan(
            borrower_address=borrower_address.lower(),
            amount=amount_usdc,
            duration_days=duration_days,
            interest_rate_bps=interest_rate_bps,
            guarantors=json.dumps(guarantors),
            ipfs_hash=ipfs_hash,
            status=LoanStatus.GUARANTOR_PENDING if guarantors else LoanStatus.OPEN_FOR_LENDERS,
            chain_loan_id=result.get("chain_loan_id"),
        )
        db.add(loan)
        await db.flush()

        ai_scores = {
            "credit_score":   round(scores.credit_score, 2),
            "fraud_risk":     scores.fraud_risk,
            "fraud_risk_int": scores.fraud_risk_int,
        }
        return loan, ai_scores

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_loan(self, db: AsyncSession, loan_id: str) -> Loan | None:
        result = await db.execute(select(Loan).where(Loan.id == loan_id))
        return result.scalar_one_or_none()

    async def list_loans(
        self,
        db: AsyncSession,
        borrower: str | None = None,
        status: LoanStatus | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> list[Loan]:
        q = select(Loan)
        if borrower:
            q = q.where(Loan.borrower_address == borrower.lower())
        if status:
            q = q.where(Loan.status == status)
        q = q.offset(skip).limit(limit).order_by(Loan.created_at.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    # ── Document upload ───────────────────────────────────────────────────────

    async def upload_document(
        self,
        db: AsyncSession,
        loan_id: str,
        filename: str,
        content: bytes,
        content_type: str,
        borrower_private_key: str | None = None,
    ) -> LoanDocument:
        loan = await self.get_loan(db, loan_id)
        if not loan:
            raise ValueError(f"Loan {loan_id} not found")

        # Upload to IPFS
        cid = await ipfs_service.upload_file(filename, content, content_type)

        # Persist document record
        doc = LoanDocument(loan_id=loan_id, filename=filename, ipfs_hash=cid)
        db.add(doc)

        # Update loan's primary ipfs_hash and push to chain if key provided
        loan.ipfs_hash = cid
        loan.updated_at = datetime.utcnow()

        if borrower_private_key and loan.chain_loan_id is not None:
            blockchain_service.update_loan_documents(
                loan.chain_loan_id, cid, borrower_private_key
            )

        await db.flush()
        return doc

    async def get_documents(self, db: AsyncSession, loan_id: str) -> list[LoanDocument]:
        result = await db.execute(
            select(LoanDocument).where(LoanDocument.loan_id == loan_id)
        )
        return list(result.scalars().all())

    # ── Repay ─────────────────────────────────────────────────────────────────

    async def repay_loan(
        self,
        db: AsyncSession,
        loan_id: str,
        borrower_private_key: str,
    ) -> Loan:
        loan = await self.get_loan(db, loan_id)
        if not loan:
            raise ValueError(f"Loan {loan_id} not found")
        if loan.status != LoanStatus.ACTIVE:
            raise ValueError("Only ACTIVE loans can be repaid")

        blockchain_service.repay_loan(
            loan_id=loan.chain_loan_id,
            borrower_wallet=loan.borrower_address,
            amount=blockchain_service.get_total_due(loan.chain_loan_id)["total"],
            private_key=borrower_private_key,
        )

        loan.status = LoanStatus.REPAID
        loan.updated_at = datetime.utcnow()
        await db.flush()
        return loan

    # ── Sync status from chain ────────────────────────────────────────────────

    async def sync_status_from_chain(self, db: AsyncSession, loan_id: str) -> Loan:
        """Pull latest status from LoanFactory and update DB."""
        loan = await self.get_loan(db, loan_id)
        if not loan or loan.chain_loan_id is None:
            raise ValueError("Loan not found or not yet on-chain")

        on_chain = blockchain_service.get_loan_onchain(loan.chain_loan_id)
        chain_status_str = on_chain["status"]  # already a string like "ACTIVE"
        new_status = _STATUS_ENUM.get(chain_status_str, loan.status)
        loan.status = new_status
        loan.ipfs_hash = on_chain["ipfs_hash"] or loan.ipfs_hash
        # Sync lender address from escrow record if available
        if chain_status_str in ("READY_TO_FUND", "ACTIVE", "REPAID"):
            try:
                rec = blockchain_service.get_escrow_record(loan.chain_loan_id)
                if rec["lender"] and rec["lender"] != "0x0000000000000000000000000000000000000000":
                    loan.lender_address = rec["lender"].lower()
            except Exception:
                pass
        loan.updated_at = datetime.utcnow()
        await db.flush()
        return loan


loan_service = LoanService()
