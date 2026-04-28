"""
Credit Score Model — Inference
================================
Loads the trained pipeline and exposes a single predict() function.

Usage:
    from credit_score.model import predict_credit_score

    score = predict_credit_score(
        repayment_rate=0.9,
        loan_frequency=3,
        avg_loan_size=2000.0,
        income_proof_flag=1,
        default_count=0,
    )
    # → float in [0, 100]
"""
import numpy as np
import joblib
from pathlib import Path
from dataclasses import dataclass

MODEL_PATH = Path(__file__).parent / "credit_score_model.pkl"

# Lazy-loaded singleton
_pipeline = None


def _load_model():
    global _pipeline
    if _pipeline is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Run train.py first."
            )
        _pipeline = joblib.load(MODEL_PATH)
    return _pipeline


@dataclass
class CreditScoreInput:
    repayment_rate: float      # 0.0–1.0  fraction of loans repaid on time
    loan_frequency: int        # number of loans in past 12 months
    avg_loan_size: float       # average loan size in USDC
    income_proof_flag: int     # 1 = submitted, 0 = not submitted
    default_count: int         # number of past defaults


def predict_credit_score(
    repayment_rate: float,
    loan_frequency: int,
    avg_loan_size: float,
    income_proof_flag: int,
    default_count: int,
) -> float:
    """
    Returns a credit score in [0, 100].
    Higher is better.
    """
    model = _load_model()
    X = np.array([[
        repayment_rate,
        float(loan_frequency),
        avg_loan_size,
        float(income_proof_flag),
        float(default_count),
    ]])
    raw = model.predict(X)[0]
    return float(np.clip(raw, 0.0, 100.0))


def predict_from_input(inp: CreditScoreInput) -> float:
    return predict_credit_score(
        repayment_rate=inp.repayment_rate,
        loan_frequency=inp.loan_frequency,
        avg_loan_size=inp.avg_loan_size,
        income_proof_flag=inp.income_proof_flag,
        default_count=inp.default_count,
    )
