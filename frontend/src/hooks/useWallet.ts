/**
 * useWallet.ts
 * ------------
 * Manages MetaMask connection state.
 * Exposes wallet address, connection status, and connect/disconnect helpers.
 */

import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress]       = useState<string | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask is not installed");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      setAddress(accounts[0] ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  // Sync on account change
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list[0] ?? null);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setAddress(list[0]);
      })
      .catch(() => {});
  }, []);

  return {
    address,
    isConnected: !!address,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
