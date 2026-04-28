/**
 * TxStatus.tsx
 * ------------
 * Reusable transaction status banner.
 * Shows pending spinner, confirmed checkmark, or failed error.
 */

import type { TxStatus } from "@/services/web3";

interface Props {
  status: TxStatus;
  hash:   string | null;
  error:  string | null;
}

export default function TxStatusBanner({ status, hash, error }: Props) {
  if (status === "idle") return null;

  if (status === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent" />
        Transaction pending…
      </div>
    );
  }

  if (status === "confirmed") {
    return (
      <div className="rounded-lg bg-green-950 px-4 py-3 text-sm text-green-400">
        ✓ Transaction confirmed
        {hash && (
          <span className="ml-2 font-mono text-xs text-green-600">
            {hash.slice(0, 10)}…{hash.slice(-6)}
          </span>
        )}
      </div>
    );
  }

  // failed
  return (
    <div className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-400">
      ✗ {error ?? "Transaction failed"}
    </div>
  );
}
