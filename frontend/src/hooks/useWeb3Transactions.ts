/**
 * useWeb3Transactions.ts
 * ----------------------
 * React hooks that wrap web3.ts functions with loading/error/status state.
 * Components import these instead of calling web3.ts directly.
 */

import { useState, useCallback } from "react";
import type { TxStatus, TxResult } from "@/services/web3";
import {
  connectWallet,
  getCurrentWallet,
  sendLoanFunding,
  repayLoanOnChain,
  approveGuarantorOnChain,
  approveUSDC,
  getUSDCBalance,
  getTotalDue,
} from "@/services/web3";

// ── Generic tx hook ───────────────────────────────────────────────────────────

interface TxState {
  status: TxStatus;
  hash:   string | null;
  error:  string | null;
}

function useTx<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<TxResult>
) {
  const [state, setState] = useState<TxState>({
    status: "idle",
    hash:   null,
    error:  null,
  });

  const execute = useCallback(
    async (...args: TArgs) => {
      setState({ status: "pending", hash: null, error: null });
      try {
        const result = await fn(...args);
        setState({
          status: result.status,
          hash:   result.hash,
          error:  result.status === "failed" ? "Transaction reverted on-chain" : null,
        });
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Transaction failed";
        setState({ status: "failed", hash: null, error: msg });
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn]
  );

  const reset = useCallback(() => {
    setState({ status: "idle", hash: null, error: null });
  }, []);

  return { ...state, execute, reset, isPending: state.status === "pending" };
}

// ── Wallet connection ─────────────────────────────────────────────────────────

export function useConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }, []);

  return { address, isConnecting, error, connect };
}

// ── USDC approval ─────────────────────────────────────────────────────────────

export function useApproveUSDC() {
  return useTx(approveUSDC);
}

// ── Loan funding ──────────────────────────────────────────────────────────────

/**
 * Fund a loan on-chain (approve USDC + depositFromLender).
 * Usage:
 *   const { execute, status, hash, error, isPending } = useFundLoan();
 *   await execute(chainLoanId, amountUsdc);
 */
export function useFundLoan() {
  return useTx(sendLoanFunding);
}

// ── Loan repayment ────────────────────────────────────────────────────────────

/**
 * Repay a loan on-chain (approve USDC + repayLoan).
 * Usage:
 *   const { execute, status, hash, error, isPending } = useRepayLoanOnChain();
 *   await execute(chainLoanId);
 */
export function useRepayLoanOnChain() {
  return useTx(repayLoanOnChain);
}

// ── Guarantor approval ────────────────────────────────────────────────────────

export function useApproveGuarantor() {
  return useTx(approveGuarantorOnChain);
}

// ── Read: total due ───────────────────────────────────────────────────────────

export function useTotalDue(loanId: number | null) {
  const [data, setData]   = useState<{ principal: string; interest: string; total: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getTotalDue(loanId);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch total due");
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  return { data, loading, error, fetch };
}

// ── Read: USDC balance ────────────────────────────────────────────────────────

export function useUSDCBalance(address: string | null) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const bal = await getUSDCBalance(address);
      setBalance(bal);
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { balance, loading, refresh };
}

export type { TxStatus, TxResult };
