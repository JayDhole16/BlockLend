"""
GET /users/{wallet}        — fetch user profile from DB + live chain scores
GET /users/{wallet}/scores — fetch AI scores from blockchain
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_db
from app.models.user import User
from app.schemas.user import UserResponse
from app.services.blockchain_service import blockchain_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{wallet}", response_model=UserResponse)
async def get_user(wallet: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.wallet_address == wallet.lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{wallet}/scores")
async def get_ai_scores(wallet: str):
    """Returns live on-chain reputation + AI scores."""
    try:
        profile = blockchain_service.get_user_profile(wallet)
        return {
            "wallet":           wallet,
            "reputation_score": profile["reputation_score"],
            "ai_credit_score":  profile["ai_credit_score"],
            "fraud_risk":       profile["fraud_risk"],
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Blockchain error: {exc}")
