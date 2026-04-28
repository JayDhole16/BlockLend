"""
Credit Score Model — Training Script
=====================================
Trains a GradientBoostingRegressor to predict a credit score (0–100).

Features:
  - repayment_rate       : fraction of past loans repaid on time (0.0–1.0)
  - loan_frequency       : number of loans taken in the past 12 months
  - avg_loan_size        : average loan size in USDC
  - income_proof_flag    : 1 if borrower submitted income proof, else 0
  - default_count        : number of past defaults

Run:
    python train.py
Outputs:
    credit_score_model.pkl
"""
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error

SEED = 42
MODEL_PATH = Path(__file__).parent / "credit_score_model.pkl"
N_SAMPLES = 2000


def generate_synthetic_data(n: int = N_SAMPLES):
    rng = np.random.default_rng(SEED)

    repayment_rate    = rng.beta(5, 2, n)                          # skewed toward good payers
    loan_frequency    = rng.integers(0, 20, n).astype(float)
    avg_loan_size     = rng.uniform(100, 50_000, n)
    income_proof_flag = rng.integers(0, 2, n).astype(float)
    default_count     = rng.integers(0, 6, n).astype(float)

    # Ground-truth score formula (what the model learns to approximate)
    score = (
        40 * repayment_rate
        + 15 * (1 - default_count / 6)
        + 20 * income_proof_flag
        + 10 * np.clip(loan_frequency / 10, 0, 1)
        + 15 * (1 - np.clip(avg_loan_size / 50_000, 0, 1))
    )
    score = np.clip(score + rng.normal(0, 3, n), 0, 100)

    X = np.column_stack([
        repayment_rate,
        loan_frequency,
        avg_loan_size,
        income_proof_flag,
        default_count,
    ])
    return X, score


def train():
    X, y = generate_synthetic_data()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED)

    pipeline = Pipeline([
        ("scaler", MinMaxScaler()),
        ("model", GradientBoostingRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            random_state=SEED,
        )),
    ])

    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    print(f"[CreditScore] MAE on test set: {mae:.2f} points")

    joblib.dump(pipeline, MODEL_PATH)
    print(f"[CreditScore] Model saved → {MODEL_PATH}")
    return pipeline


if __name__ == "__main__":
    train()
