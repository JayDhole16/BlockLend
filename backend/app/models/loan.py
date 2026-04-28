import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Enum as SAEnum, Text, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.database.db import Base
import enum


class LoanStatus(str, enum.Enum):
    GUARANTOR_PENDING  = "GUARANTOR_PENDING"
    OPEN_FOR_LENDERS   = "OPEN_FOR_LENDERS"
    READY_TO_FUND      = "READY_TO_FUND"
    ACTIVE             = "ACTIVE"
    REPAID             = "REPAID"
    DEFAULTED          = "DEFAULTED"


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # On-chain loan ID (set after createLoanRequest tx)
    chain_loan_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    borrower_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    lender_address: Mapped[str | None] = mapped_column(String(42), nullable=True)

    amount: Mapped[float] = mapped_column(Float, nullable=False)          # USDC (human units)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    interest_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False)  # basis points

    guarantors: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON array of addresses
    status: Mapped[LoanStatus] = mapped_column(SAEnum(LoanStatus), default=LoanStatus.GUARANTOR_PENDING)

    ipfs_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LoanDocument(Base):
    __tablename__ = "loan_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    loan_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    ipfs_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
