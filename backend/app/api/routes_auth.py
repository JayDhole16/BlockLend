"""
POST /register
Registers a user in the DB and optionally mints their soulbound NFT on-chain.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_db
from app.models.user import User
from app.schemas.user import RegisterRequest, UserResponse
from app.services.blockchain_service import blockchain_service

router = APIRouter(prefix="/register", tags=["auth"])

ROLE_INDEX = {"borrower": 1, "lender": 2, "guarantor": 3}


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    existing = await db.execute(
        select(User).where(User.wallet_address == payload.wallet_address)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Wallet already registered")

    nft_token_id = None

    # Mint NFT on-chain if private key provided
    if payload.private_key:
        try:
            nft_token_id = blockchain_service.register_user_onchain(
                wallet_address=payload.wallet_address,
                role_index=ROLE_INDEX[payload.role.value],
                private_key=payload.private_key,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Blockchain error: {exc}")

    user = User(
        wallet_address=payload.wallet_address,
        role=payload.role,
        nft_token_id=nft_token_id,
    )
    db.add(user)
    await db.flush()
    return user
