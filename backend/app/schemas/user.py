from pydantic import BaseModel, field_validator
from app.models.user import UserRole


class RegisterRequest(BaseModel):
    wallet_address: str
    role: UserRole
    # Optional: borrower signs their own tx; if omitted, registration is off-chain only
    private_key: str | None = None

    @field_validator("wallet_address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not v.startswith("0x") or len(v) != 42:
            raise ValueError("Invalid Ethereum address")
        return v.lower()


class UserResponse(BaseModel):
    id: str
    wallet_address: str
    role: UserRole
    nft_token_id: int | None
    reputation_score: int
    ai_credit_score: int
    fraud_risk: int

    model_config = {"from_attributes": True}
