"use client";
import { useState, useEffect, useCallback } from "react";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LoanStatus =
  | "GUARANTOR_PENDING"
  | "OPEN_FOR_LENDERS"
  | "READY_TO_FUND"
  | "ACTIVE"
  | "REPAID"
  | "DEFAULTED";

export interface ApiLoan {
  id: string;
  chain_loan_id: number | null;
  borrower_address: string;
  lender_address: string | null;
  amount: number;
  duration_days: number;
  interest_rate_bps: number;
  guarantors: string | null;
  status: LoanStatus;
  ipfs_hash: string | null;
}

export interface ApiLoanCreate extends ApiLoan {
  ai_credit_score: number;
  ai_fraud_risk: string;
}

export interface ApiUser {
  id: string;
  wallet_address: string;
  role: string;
  nft_token_id: number | null;
  reputation_score: number;
  ai_credit_score: number;
  fraud_risk: number;
}

// ── Generic fetch hook ────────────────────────────────────────────────────────

export function useFetch<T>(path: string | null) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

export function useMutation<TBody, TResult>(path: string, method = "POST") {
  const [data, setData]       = useState<TResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutate = useCallback(async (body: TBody) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await apiFetch<TResult>(path, {
        method,
        body: JSON.stringify(body),
      });
      setData(result);
      setSuccess(true);
      return result;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [path, method]);

  return { mutate, data, loading, error, success };
}

// ── Specific hooks ────────────────────────────────────────────────────────────

export function useLoans(params?: { borrower?: string; status?: LoanStatus; skip?: number; limit?: number }) {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : "";
  return useFetch<ApiLoan[]>(`/loan/list${qs}`);
}

export function useLoan(id: string | null) {
  return useFetch<ApiLoan>(id ? `/loan/${id}` : null);
}

export function useUserProfile(wallet: string | null) {
  return useFetch<ApiUser>(wallet ? `/users/${wallet}` : null);
}

export { apiFetch };
