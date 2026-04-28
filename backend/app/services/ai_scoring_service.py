"""
ai_scoring_service.py
======================
Backend-side wrapper that calls the AI models and optionally pushes
the resulting scores back on-chain via UserProfileNFT.updateAIScores().

The AI module is imported from the ai-services directory which sits
two levels above the backend package.
"""
import sys
from pathlib import Path

# Add ai-services to path so we can import directly (local dev).
# In Docker, PYTHONPATH=/ai-services is set in the Dockerfile.
_AI_SERVICES_PATH = Path(__file__).resolve().parents[3] / "ai-services"
if _AI_SERVICES_PATH.exists() and str(_AI_SERVICES_PATH) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICES_PATH))

from ai_service import (
    score_borrower,
    BorrowerScores,
    CreditScoreFeatures,
    FraudFeatures,
)
from app.services.blockchain_service import blockchain_service


class AIScoreRequest:
    """Collects all feature inputs needed for both models."""

    def __init__(
        self,
        # Credit score features
        repayment_rate: float = 0.5,
        loan_frequency: int = 0,
        avg_loan_size: float = 1000.0,
        income_proof_flag: int = 0,
        default_count: int = 0,
        # Fraud features
        wallet_age_days: int = 30,
        tx_count_30d: int = 5,
        rapid_loan_requests: int = 0,
        repayment_delay_avg: float = 0.0,
        unique_counterparties: int = 5,
        large_tx_flag: int = 0,
    ):
        self.credit = CreditScoreFeatures(
            repayment_rate=repayment_rate,
            loan_frequency=loan_frequency,
            avg_loan_size=avg_loan_size,
            income_proof_flag=income_proof_flag,
            default_count=default_count,
        )
        self.fraud = FraudFeatures(
            wallet_age_days=wallet_age_days,
            tx_count_30d=tx_count_30d,
            rapid_loan_requests=rapid_loan_requests,
            repayment_delay_avg=repayment_delay_avg,
            unique_counterparties=unique_counterparties,
            large_tx_flag=large_tx_flag,
        )


def run_ai_scoring(
    wallet_address: str,
    request: AIScoreRequest,
    push_to_chain: bool = False,
) -> BorrowerScores:
    """
    Score a borrower and optionally push results on-chain.

    Args:
        wallet_address: borrower's wallet (for on-chain update)
        request:        feature inputs for both models
        push_to_chain:  if True, calls UserProfileNFT.updateAIScores()

    Returns:
        BorrowerScores(credit_score, fraud_risk, fraud_risk_int)
    """
    scores = score_borrower(request.credit, request.fraud)

    if push_to_chain:
        try:
            blockchain_service.profile_nft.functions.updateAIScores(
                wallet_address,
                int(scores.credit_score),
                scores.fraud_risk_int,
            )
        except Exception as exc:
            # Non-fatal — scores are still returned to caller
            print(f"[AI] Failed to push scores on-chain: {exc}")

    return scores


def default_request_from_loan(
    amount_usdc: float,
    duration_days: int,
    has_income_proof: bool = False,
) -> AIScoreRequest:
    """
    Build a minimal AIScoreRequest from loan creation data alone.
    In production, enrich with historical data from DB / chain.
    """
    return AIScoreRequest(
        avg_loan_size=amount_usdc,
        income_proof_flag=1 if has_income_proof else 0,
        loan_frequency=1,
        rapid_loan_requests=1,
    )
