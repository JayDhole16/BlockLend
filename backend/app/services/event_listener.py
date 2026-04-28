"""
event_listener.py
==================
Background task that polls the Hardhat node for new blockchain events
and writes them into PostgreSQL.

Listens for:
  LoanFactory → LoanCreated, GuarantorApproved, LoanOpenedForFunding,
                LoanActivated, LoanRepaid, LoanDefaulted
  Escrow      → LoanFunded, LoanRepaymentReceived, LoanMarkedDefaulted

Each event handler updates the `loans` and `users` tables accordingly.

Usage (started from main.py lifespan):
    from app.services.event_listener import start_event_listener
    asyncio.create_task(start_event_listener())
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import AsyncSessionLocal
from app.models.loan import Loan, LoanStatus
from app.models.user import User
from app.services.blockchain_service import blockchain_service

log = logging.getLogger(__name__)

# How often to poll for new blocks (seconds)
POLL_INTERVAL = 5

# Status string → LoanStatus enum
_STATUS_ENUM: dict[str, LoanStatus] = {s.value: s for s in LoanStatus}


# ─────────────────────────────────────────────────────────────────────────────
# Main polling loop
# ─────────────────────────────────────────────────────────────────────────────

async def start_event_listener() -> None:
    """
    Long-running coroutine. Call once from the FastAPI lifespan.
    Polls every POLL_INTERVAL seconds and processes any new events.
    """
    log.info("Event listener started (poll interval: %ss)", POLL_INTERVAL)
    last_block: int = _get_current_block()

    while True:
        try:
            current_block = _get_current_block()
            if current_block > last_block:
                await _process_blocks(last_block + 1, current_block)
                last_block = current_block
        except Exception as exc:
            log.error("Event listener error: %s", exc, exc_info=True)

        await asyncio.sleep(POLL_INTERVAL)


def _get_current_block() -> int:
    try:
        return blockchain_service.w3.eth.block_number
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Block range processor
# ─────────────────────────────────────────────────────────────────────────────

async def _process_blocks(from_block: int, to_block: int) -> None:
    """Fetch all relevant events in [from_block, to_block] and handle each."""
    log.debug("Scanning blocks %s → %s", from_block, to_block)

    event_specs = [
        # (contract, event_class, handler)
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.LoanCreated,          _on_loan_created),
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.GuarantorApproved,    _on_guarantor_approved),
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.LoanOpenedForFunding, _on_loan_opened),
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.LoanActivated,        _on_loan_activated),
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.LoanRepaid,           _on_loan_repaid),
        (blockchain_service.loan_factory, blockchain_service.loan_factory.events.LoanDefaulted,        _on_loan_defaulted),
        (blockchain_service.escrow,       blockchain_service.escrow.events.LoanFunded,                 _on_loan_funded),
        (blockchain_service.escrow,       blockchain_service.escrow.events.LoanRepaymentReceived,      _on_repayment_received),
        (blockchain_service.escrow,       blockchain_service.escrow.events.LoanMarkedDefaulted,        _on_loan_marked_defaulted),
    ]

    async with AsyncSessionLocal() as db:
        for _, event_cls, handler in event_specs:
            try:
                logs = event_cls().get_logs(fromBlock=from_block, toBlock=to_block)
                for entry in logs:
                    try:
                        await handler(db, entry)
                    except Exception as exc:
                        log.error(
                            "Handler %s failed for tx %s: %s",
                            handler.__name__,
                            entry["transactionHash"].hex(),
                            exc,
                            exc_info=True,
                        )
            except Exception as exc:
                log.warning("Failed to fetch %s: %s", event_cls.event_name, exc)

        await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Event handlers — each receives the raw web3 log entry
# ─────────────────────────────────────────────────────────────────────────────

async def _on_loan_created(db: AsyncSession, entry: dict) -> None:
    """
    LoanCreated(loanId, borrower, amount, duration, interestRate, guarantors, ipfsHash)
    → Upsert Loan row with GUARANTOR_PENDING or OPEN_FOR_LENDERS status.
    """
    args = entry["args"]
    loan_id   = int(args["loanId"])
    guarantors = list(args["guarantors"])
    status = LoanStatus.OPEN_FOR_LENDERS if not guarantors else LoanStatus.GUARANTOR_PENDING

    existing = await _find_loan_by_chain_id(db, loan_id)
    if existing:
        # Already created via API — just ensure status is correct
        existing.status     = status
        existing.updated_at = datetime.utcnow()
        log.debug("LoanCreated (update): chain_id=%s", loan_id)
    else:
        import json
        loan = Loan(
            chain_loan_id=loan_id,
            borrower_address=args["borrower"].lower(),
            amount=args["amount"] / 10**6,
            duration_days=int(args["duration"]) // 86_400,
            interest_rate_bps=int(args["interestRate"]),
            guarantors=json.dumps(guarantors),
            ipfs_hash=args.get("ipfsHash", ""),
            status=status,
        )
        db.add(loan)
        log.info("LoanCreated (insert): chain_id=%s borrower=%s", loan_id, args["borrower"])


async def _on_guarantor_approved(db: AsyncSession, entry: dict) -> None:
    """
    GuarantorApproved(loanId, guarantor, approvedCount, totalRequired)
    → No status change yet; logged for audit. Status changes on LoanOpenedForFunding.
    """
    args = entry["args"]
    log.info(
        "GuarantorApproved: loan=%s guarantor=%s (%s/%s)",
        args["loanId"], args["guarantor"],
        args["approvedCount"], args["totalRequired"],
    )


async def _on_loan_opened(db: AsyncSession, entry: dict) -> None:
    """
    LoanOpenedForFunding(loanId)
    → Set status to OPEN_FOR_LENDERS.
    """
    loan_id = int(entry["args"]["loanId"])
    await _update_loan_status(db, loan_id, LoanStatus.OPEN_FOR_LENDERS)
    log.info("LoanOpenedForFunding: chain_id=%s", loan_id)


async def _on_loan_funded(db: AsyncSession, entry: dict) -> None:
    """
    LoanFunded(loanId, lender, amount)
    → Set status to READY_TO_FUND, record lender address.
    → Auto-release funds to borrower (platform acts as operator).
    """
    args    = entry["args"]
    loan_id = int(args["loanId"])
    lender  = args["lender"].lower()

    loan = await _find_loan_by_chain_id(db, loan_id)
    if loan:
        loan.status         = LoanStatus.READY_TO_FUND
        loan.lender_address = lender
        loan.updated_at     = datetime.utcnow()
        log.info("LoanFunded: chain_id=%s lender=%s", loan_id, lender)

    # Auto-release: platform (deployer) releases funds to borrower
    try:
        blockchain_service.release_to_borrower(loan_id)
        log.info("Auto-released funds to borrower: chain_id=%s", loan_id)
        # Status will be updated by the subsequent LoanActivated event
    except Exception as exc:
        log.error("Auto-release failed for loan %s: %s", loan_id, exc)


async def _on_loan_activated(db: AsyncSession, entry: dict) -> None:
    """
    LoanActivated(loanId)
    → Set status to ACTIVE.
    """
    loan_id = int(entry["args"]["loanId"])
    await _update_loan_status(db, loan_id, LoanStatus.ACTIVE)
    log.info("LoanActivated: chain_id=%s", loan_id)


async def _on_repayment_received(db: AsyncSession, entry: dict) -> None:
    """
    LoanRepaymentReceived(loanId, borrower, totalRepaid)
    → Logged; status update comes from LoanRepaid event.
    """
    args = entry["args"]
    log.info(
        "RepaymentReceived: loan=%s borrower=%s total=%s",
        args["loanId"], args["borrower"], args["totalRepaid"] / 10**6,
    )


async def _on_loan_repaid(db: AsyncSession, entry: dict) -> None:
    """
    LoanRepaid(loanId)
    → Set status to REPAID. Update borrower reputation in DB.
    """
    loan_id = int(entry["args"]["loanId"])
    loan = await _update_loan_status(db, loan_id, LoanStatus.REPAID)

    if loan:
        await _sync_reputation(db, loan.borrower_address)
    log.info("LoanRepaid: chain_id=%s", loan_id)


async def _on_loan_defaulted(db: AsyncSession, entry: dict) -> None:
    """
    LoanDefaulted(loanId)
    → Set status to DEFAULTED. Update borrower reputation in DB.
    """
    loan_id = int(entry["args"]["loanId"])
    loan = await _update_loan_status(db, loan_id, LoanStatus.DEFAULTED)

    if loan:
        await _sync_reputation(db, loan.borrower_address)
    log.info("LoanDefaulted: chain_id=%s", loan_id)


async def _on_loan_marked_defaulted(db: AsyncSession, entry: dict) -> None:
    """
    LoanMarkedDefaulted(loanId) — emitted by Escrow (mirrors LoanDefaulted from Factory).
    Idempotent: status already set by _on_loan_defaulted.
    """
    loan_id = int(entry["args"]["loanId"])
    log.debug("LoanMarkedDefaulted (escrow): chain_id=%s", loan_id)


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _find_loan_by_chain_id(db: AsyncSession, chain_loan_id: int) -> Loan | None:
    result = await db.execute(
        select(Loan).where(Loan.chain_loan_id == chain_loan_id)
    )
    return result.scalar_one_or_none()


async def _update_loan_status(
    db: AsyncSession,
    chain_loan_id: int,
    new_status: LoanStatus,
) -> Loan | None:
    loan = await _find_loan_by_chain_id(db, chain_loan_id)
    if loan:
        loan.status     = new_status
        loan.updated_at = datetime.utcnow()
    else:
        log.warning(
            "Received %s event for unknown chain_loan_id=%s",
            new_status, chain_loan_id,
        )
    return loan


async def _sync_reputation(db: AsyncSession, wallet_address: str) -> None:
    """Pull latest reputation score from chain and update the users table."""
    try:
        score = blockchain_service.get_reputation_score(wallet_address)
        result = await db.execute(
            select(User).where(User.wallet_address == wallet_address.lower())
        )
        user = result.scalar_one_or_none()
        if user:
            user.reputation_score = score
            user.updated_at       = datetime.utcnow()
            log.debug("Reputation synced: wallet=%s score=%s", wallet_address, score)
    except Exception as exc:
        log.warning("Failed to sync reputation for %s: %s", wallet_address, exc)
