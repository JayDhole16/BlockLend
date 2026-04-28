"""
Fraud Detection Model — Inference
====================================
Loads the trained pipeline and exposes predict_fraud_risk().

Usage:
    from fraud_detection.model import predict_fraud_risk

    risk = predict_fraud_risk(
        wallet_age_days=120,
        tx_count_30d=5,
        rapid_loan_requests=1,
        repayment_delay_avg=0.0,
        unique_counterparties=10,
        large_tx_flag=0,
    )
    # → "LOW" | "MEDIUM" | "HIGH"
"""
import numpy as np
import joblib
from pathlib import Path
from dataclasses import dataclass
from typing import Literal

MODEL_PATH   = Path(__file__).parent / "fraud_model.pkl"
ENCODER_PATH = Path(__file__).parent / "fraud_label_encoder.pkl"

FraudRisk = Literal["LOW", "MEDIUM", "HIGH"]

_pipeline = None
_encoder  = None


def _load_models():
    global _pipeline, _encoder
    if _pipeline is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Run train.py first."
            )
        _pipeline = joblib.load(MODEL_PATH)
        _encoder  = joblib.load(ENCODER_PATH)
    return _pipeline, _encoder


@dataclass
class FraudInput:
    wallet_age_days: int           # days since wallet first tx
    tx_count_30d: int              # transactions in last 30 days
    rapid_loan_requests: int       # loan requests in last 7 days
    repayment_delay_avg: float     # avg days late on repayments
    unique_counterparties: int     # unique wallets interacted with
    large_tx_flag: int             # 1 if any tx > 10k USDC in last 30 days


def predict_fraud_risk(
    wallet_age_days: int,
    tx_count_30d: int,
    rapid_loan_requests: int,
    repayment_delay_avg: float,
    unique_counterparties: int,
    large_tx_flag: int,
) -> FraudRisk:
    """
    Returns "LOW", "MEDIUM", or "HIGH".
    """
    pipeline, encoder = _load_models()
    X = np.array([[
        float(wallet_age_days),
        float(tx_count_30d),
        float(rapid_loan_requests),
        repayment_delay_avg,
        float(unique_counterparties),
        float(large_tx_flag),
    ]])
    pred_idx = pipeline.predict(X)[0]
    return str(encoder.inverse_transform([pred_idx])[0])


def predict_fraud_proba(
    wallet_age_days: int,
    tx_count_30d: int,
    rapid_loan_requests: int,
    repayment_delay_avg: float,
    unique_counterparties: int,
    large_tx_flag: int,
) -> dict[str, float]:
    """Returns class probabilities: {"LOW": 0.8, "MEDIUM": 0.15, "HIGH": 0.05}"""
    pipeline, encoder = _load_models()
    X = np.array([[
        float(wallet_age_days),
        float(tx_count_30d),
        float(rapid_loan_requests),
        repayment_delay_avg,
        float(unique_counterparties),
        float(large_tx_flag),
    ]])
    proba = pipeline.predict_proba(X)[0]
    return {cls: float(p) for cls, p in zip(encoder.classes_, proba)}


def predict_from_input(inp: FraudInput) -> FraudRisk:
    return predict_fraud_risk(
        wallet_age_days=inp.wallet_age_days,
        tx_count_30d=inp.tx_count_30d,
        rapid_loan_requests=inp.rapid_loan_requests,
        repayment_delay_avg=inp.repayment_delay_avg,
        unique_counterparties=inp.unique_counterparties,
        large_tx_flag=inp.large_tx_flag,
    )
