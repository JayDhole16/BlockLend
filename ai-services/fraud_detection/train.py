"""
Fraud Detection Model — Training Script
=========================================
Trains a RandomForestClassifier to predict fraud risk: LOW / MEDIUM / HIGH.

Features:
  - wallet_age_days        : days since wallet first transaction
  - tx_count_30d           : number of transactions in last 30 days
  - rapid_loan_requests    : loan requests in last 7 days
  - repayment_delay_avg    : average days late on repayments (0 = always on time)
  - unique_counterparties  : number of unique wallets interacted with
  - large_tx_flag          : 1 if any single tx > 10k USDC in last 30 days

Classes:
  0 = LOW, 1 = MEDIUM, 2 = HIGH

Run:
    python train.py
Outputs:
    fraud_model.pkl
    fraud_label_encoder.pkl
"""
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report

SEED = 42
MODEL_PATH   = Path(__file__).parent / "fraud_model.pkl"
ENCODER_PATH = Path(__file__).parent / "fraud_label_encoder.pkl"
N_SAMPLES = 3000


def generate_synthetic_data(n: int = N_SAMPLES):
    rng = np.random.default_rng(SEED)

    wallet_age_days       = rng.integers(1, 1500, n).astype(float)
    tx_count_30d          = rng.integers(0, 200, n).astype(float)
    rapid_loan_requests   = rng.integers(0, 10, n).astype(float)
    repayment_delay_avg   = rng.uniform(0, 60, n)
    unique_counterparties = rng.integers(1, 100, n).astype(float)
    large_tx_flag         = rng.integers(0, 2, n).astype(float)

    # Heuristic risk score → label
    risk = (
        - 0.01 * wallet_age_days
        + 0.02 * tx_count_30d
        + 0.5  * rapid_loan_requests
        + 0.05 * repayment_delay_avg
        - 0.01 * unique_counterparties
        + 1.5  * large_tx_flag
        + rng.normal(0, 0.5, n)
    )

    labels = np.where(risk < 1.5, "LOW", np.where(risk < 4.0, "MEDIUM", "HIGH"))

    X = np.column_stack([
        wallet_age_days,
        tx_count_30d,
        rapid_loan_requests,
        repayment_delay_avg,
        unique_counterparties,
        large_tx_flag,
    ])
    return X, labels


def train():
    X, y_str = generate_synthetic_data()

    le = LabelEncoder()
    y = le.fit_transform(y_str)   # LOW=1, MEDIUM=2, HIGH=0 (alphabetical)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            class_weight="balanced",
            random_state=SEED,
        )),
    ])

    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    print("[FraudDetection] Classification report:")
    print(classification_report(y_test, preds, target_names=le.classes_))

    joblib.dump(pipeline, MODEL_PATH)
    joblib.dump(le, ENCODER_PATH)
    print(f"[FraudDetection] Model saved   → {MODEL_PATH}")
    print(f"[FraudDetection] Encoder saved → {ENCODER_PATH}")
    return pipeline, le


if __name__ == "__main__":
    train()
