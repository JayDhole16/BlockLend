"""
POST /loan/create
GET  /loan/list
GET  /loan/{id}
POST /loan/{id}/upload-doc
POST /loan/{id}/repay
POST /loan/{id}/approve-guarantor
POST /loan/{id}/release          — platform releases funds to borrower
GET  /loan/{id}/sync             — pull latest status from chain
GET  /loan/events                — recent blockchain events
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_db
from app.models.loan import LoanStatus
from app.schemas.loan import (
    CreateLoanRequest,
    LoanResponse,
    LoanCreateResponse,
    DocumentResponse,
    RepayLoanRequest,
)
from app.services.loan_service import loan_service
from app.services.ipfs_service import ipfs_service
from app.services.blockchain_service import blockchain_service

router = APIRouter(prefix="/loan", tags=["loans"])


class ApproveGuarantorRequest(BaseModel):
    private_key: str


@router.post("/create", response_model=LoanCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_loan(payload: CreateLoanRequest, db: AsyncSession = Depends(get_db)):
    try:
        loan, ai_scores = await loan_service.create_loan(
            db=db,
            borrower_address=payload.borrower_address,
            amount_usdc=payload.amount_usdc,
            duration_days=payload.duration_days,
            interest_rate_bps=payload.interest_rate_bps,
            guarantors=payload.guarantors,
            ipfs_hash=payload.ipfs_hash,
            borrower_private_key=payload.borrower_private_key,
        )
        return LoanCreateResponse(
            id=loan.id,
            chain_loan_id=loan.chain_loan_id,
            borrower_address=loan.borrower_address,
            lender_address=loan.lender_address,
            amount=loan.amount,
            duration_days=loan.duration_days,
            interest_rate_bps=loan.interest_rate_bps,
            guarantors=loan.guarantors,
            status=loan.status,
            ipfs_hash=loan.ipfs_hash,
            ai_credit_score=ai_scores["credit_score"],
            ai_fraud_risk=ai_scores["fraud_risk"],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/list", response_model=list[LoanResponse])
async def list_loans(
    borrower: str | None = Query(None),
    loan_status: LoanStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await loan_service.list_loans(db, borrower=borrower, status=loan_status, skip=skip, limit=limit)


@router.get("/events")
async def get_events(from_block: int = Query(0)):
    """Fetch recent LoanCreated / Activated / Repaid / Defaulted events from chain."""
    try:
        return blockchain_service.get_recent_loan_events(from_block=from_block)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{loan_id}", response_model=LoanResponse)
async def get_loan(loan_id: str, db: AsyncSession = Depends(get_db)):
    loan = await loan_service.get_loan(db, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return loan


@router.post("/{loan_id}/approve-guarantor", response_model=LoanResponse)
async def approve_guarantor(
    loan_id: str,
    payload: ApproveGuarantorRequest,
    db: AsyncSession = Depends(get_db),
):
    """Guarantor approves their participation. Signs tx with provided private key."""
    try:
        loan = await loan_service.get_loan(db, loan_id)
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        if loan.chain_loan_id is None:
            raise HTTPException(status_code=400, detail="Loan not yet on-chain")

        result = blockchain_service.approve_guarantor(
            loan_id=loan.chain_loan_id,
            guarantor_wallet="",  # derived from private key inside service
            private_key=payload.private_key,
        )

        # If all guarantors approved, chain emits LoanOpenedForFunding — sync now
        updated = await loan_service.sync_status_from_chain(db, loan_id)
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/{loan_id}/release", response_model=LoanResponse)
async def release_to_borrower(
    loan_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Platform (deployer) releases escrowed funds to borrower. Loan must be READY_TO_FUND."""
    try:
        loan = await loan_service.get_loan(db, loan_id)
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        if loan.chain_loan_id is None:
            raise HTTPException(status_code=400, detail="Loan not yet on-chain")

        blockchain_service.release_to_borrower(loan.chain_loan_id)
        return await loan_service.sync_status_from_chain(db, loan_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/{loan_id}/upload-doc", response_model=DocumentResponse)
async def upload_document(
    loan_id: str,
    file: UploadFile = File(...),
    borrower_private_key: str | None = Query(None, description="Sign on-chain doc update"),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    try:
        doc = await loan_service.upload_document(
            db=db,
            loan_id=loan_id,
            filename=file.filename or "document",
            content=content,
            content_type=file.content_type or "application/octet-stream",
            borrower_private_key=borrower_private_key,
        )
        return DocumentResponse(
            id=doc.id,
            loan_id=doc.loan_id,
            filename=doc.filename,
            ipfs_hash=doc.ipfs_hash,
            gateway_url=ipfs_service.gateway_url(doc.ipfs_hash),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/{loan_id}/repay", response_model=LoanResponse)
async def repay_loan(
    loan_id: str,
    payload: RepayLoanRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await loan_service.repay_loan(db, loan_id, payload.borrower_private_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{loan_id}/sync", response_model=LoanResponse)
async def sync_loan(loan_id: str, db: AsyncSession = Depends(get_db)):
    """Pull latest status from LoanFactory contract and update DB."""
    try:
        return await loan_service.sync_status_from_chain(db, loan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
