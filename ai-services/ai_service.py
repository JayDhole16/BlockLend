"""
ai_service.py
==============
Unified entry point for the backend to call both AI models.

The backend calls score_borrower() when a loan request is created.
Both models are lazy-loaded on first call (models must be trained first).

If models are not yet trained, falls back to safe defaults so the
platform can still operate without AI scores.
"""
from dataclasses import dataclass
from typing import Literal

FraudRisk = Literal["LOW", "MEDIUM", "HIGH"]

FRAUD_RISK_INT = {"LOW": 0, "MEDIUM": 50, "HIGH": 100}


@dataclass
class BorrowerScores:
    credit_score: float       # 0–100, higher is better
    fraud_risk: FraudRisk     # LOW | MEDIUM | HIGH
    fraud_risk_int: int       # 0 | 50 | 100  (for on-chain storage)


@dataclass
class CreditScoreFeatures:
    repayment_rate: float      # 0.0–1.0
    loan_frequency: int        # loans in past 12 months
    avg_loan_size: float       # USDC
    income_proof_flag: int     # 1 = submitted
    default_count: int


@dataclass
class FraudFeatures:
    wallet_age_days: int
    tx_count_30d: int
    rapid_loan_requests: int   # loan requests in last 7 days
    repayment_delay_avg: float # avg days late
    unique_counterparties: int
    large_tx_flag: int         # 1 if any tx > 10k USDC in last 30 days


def score_borrower(
    credit_features: CreditScoreFeatures,
    fraud_features: FraudFeatures,
) -> BorrowerScores:
    """
    Run both models and return combined scores.
    Falls back to neutral defaults if models are not trained yet.
    """
    credit_score = _run_credit_model(credit_features)
    fraud_risk   = _run_fraud_model(fraud_features)

    return BorrowerScores(
        credit_score=credit_score,
        fraud_risk=fraud_risk,
        fraud_risk_int=FRAUD_RISK_INT[fraud_risk],
    )


def _run_credit_model(features: CreditScoreFeatures) -> float:
    try:
        from credit_score.model import predict_credit_score
        return predict_credit_score(
            repayment_rate=features.repayment_rate,
            loan_frequency=features.loan_frequency,
            avg_loan_size=features.avg_loan_size,
            income_proof_flag=features.income_proof_flag,
            default_count=features.default_count,
        )
    except FileNotFoundError:
        # Model not trained yet — return neutral score
        return 50.0
    except Exception as exc:
        print(f"[AI] Credit model error: {exc}")
        return 50.0


def _run_fraud_model(features: FraudFeatures) -> FraudRisk:
    try:
        from fraud_detection.model import predict_fraud_risk
        return predict_fraud_risk(
            wallet_age_days=features.wallet_age_days,
            tx_count_30d=features.tx_count_30d,
            rapid_loan_requests=features.rapid_loan_requests,
            repayment_delay_avg=features.repayment_delay_avg,
            unique_counterparties=features.unique_counterparties,
            large_tx_flag=features.large_tx_flag,
        )
    except FileNotFoundError:
        return "LOW"
    except Exception as exc:
        print(f"[AI] Fraud model error: {exc}")
        return "LOW"
