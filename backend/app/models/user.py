import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database.db import Base
import enum


class UserRole(str, enum.Enum):
    BORROWER  = "borrower"
    LENDER    = "lender"
    GUARANTOR = "guarantor"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    wallet_address: Mapped[str] = mapped_column(String(42), unique=True, nullable=False, index=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)

    # NFT token ID minted on-chain
    nft_token_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # AI scores (synced from AI service / blockchain)
    reputation_score: Mapped[int] = mapped_column(Integer, default=50)
    ai_credit_score: Mapped[int] = mapped_column(Integer, default=0)
    fraud_risk: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
