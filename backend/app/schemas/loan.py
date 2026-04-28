from pydantic import BaseModel, field_validator
from app.models.loan import LoanStatus


class CreateLoanRequest(BaseModel):
    borrower_address: str
    amount_usdc: float
    duration_days: int
    interest_rate_bps: int
    guarantors: list[str] = []
    ipfs_hash: str = ""
    # Borrower's private key to sign the on-chain tx
    # In production replace with a wallet-signing flow (e.g. MetaMask signature)
    borrower_private_key: str

    @field_validator("amount_usdc")
    @classmethod
    def positive_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount_usdc must be positive")
        return v

    @field_validator("duration_days")
    @classmethod
    def positive_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("duration_days must be positive")
        return v


class RepayLoanRequest(BaseModel):
    borrower_private_key: str


class LoanResponse(BaseModel):
    id: str
    chain_loan_id: int | None
    borrower_address: str
    lender_address: str | None
    amount: float
    duration_days: int
    interest_rate_bps: int
    guarantors: str | None
    status: LoanStatus
    ipfs_hash: str | None

    model_config = {"from_attributes": True}


class LoanCreateResponse(LoanResponse):
    """Extended response for POST /loan/create — includes AI scores."""
    ai_credit_score: float        # 0–100
    ai_fraud_risk: str            # LOW | MEDIUM | HIGH


class DocumentResponse(BaseModel):
    id: str
    loan_id: str
    filename: str
    ipfs_hash: str
    gateway_url: str

    model_config = {"from_attributes": True}
