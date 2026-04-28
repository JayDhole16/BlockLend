"use client";
import React, { useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useLoans, apiFetch, type ApiLoan } from "@/hooks/useApi";
import { useApproveGuarantor } from "@/hooks/useWeb3Transactions";
import TxStatusBanner from "@/components/TxStatus";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

export default function GuarantorDashboard() {
  const { account } = useWeb3();
  const { data: loans, loading, error, refetch } =
    useLoans({ status: "GUARANTOR_PENDING" });

  // Only show loans where this wallet is a listed guarantor
  const myLoans = (loans ?? []).filter(loan => {
    const guarantors: string[] = loan.guarantors ? JSON.parse(loan.guarantors) : [];
    return guarantors.some(g => g.toLowerCase() === account?.toLowerCase());
  });

  if (!account) return <div className="text-center py-20 text-neutral-400">Please connect wallet</div>;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Guarantor Dashboard</h1>
        <p className="text-neutral-400">
          Loans waiting for your guarantee.
          <span className="ml-2 font-mono text-xs text-neutral-500">{account}</span>
        </p>
      </div>

      {loading && <p className="text-neutral-500">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && myLoans.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-700 py-20 text-center text-neutral-500">
          No loans awaiting your approval.
        </div>
      )}

      <div className="space-y-4">
        {myLoans.map(loan => (
          <GuarantorLoanCard key={loan.id} loan={loan} onApproved={refetch} />
        ))}
      </div>
    </div>
  );
}

function GuarantorLoanCard({ loan, onApproved }: { loan: ApiLoan; onApproved: () => void }) {
  // MetaMask on-chain path
  const onChain = useApproveGuarantor();

  // Backend private-key fallback
  const [pk, setPk]           = useState("");
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkDone, setPkDone]   = useState(false);

  const approved = onChain.status === "confirmed" || pkDone;

  async function handleMetaMask() {
    if (!loan.chain_loan_id) return;
    const result = await onChain.execute(loan.chain_loan_id);
    if (result?.status === "confirmed") onApproved();
  }

  async function handlePrivateKey(e: React.FormEvent) {
    e.preventDefault();
    setPkLoading(true);
    setPkError(null);
    try {
      await apiFetch(`/loan/${loan.id}/approve-guarantor`, {
        method: "POST",
        body: JSON.stringify({ private_key: pk }),
      });
      setPkDone(true);
      onApproved();
    } catch (err: unknown) {
      setPkError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPkLoading(false);
    }
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-500">Loan #{loan.chain_loan_id ?? "—"}</p>
            <CardTitle className="text-xl">${loan.amount.toLocaleString()} USDC</CardTitle>
            <p className="text-sm text-neutral-400 mt-1">
              {loan.duration_days}d &nbsp;|&nbsp; {(loan.interest_rate_bps / 100).toFixed(2)}% APR
            </p>
            <p className="text-xs text-neutral-500 font-mono mt-1 truncate">
              Borrower: {loan.borrower_address}
            </p>
          </div>
          {approved && (
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
              <Check className="w-3 h-3 mr-1" /> Approved
            </Badge>
          )}
        </div>
      </CardHeader>

      {!approved && (
        <CardContent className="space-y-4">
          {/* MetaMask path */}
          <div className="rounded-lg border border-indigo-900 bg-neutral-950 p-4 space-y-3">
            <p className="text-xs font-medium text-indigo-300">Approve via MetaMask (recommended)</p>
            <TxStatusBanner status={onChain.status} hash={onChain.hash} error={onChain.error} />
            <Button onClick={handleMetaMask} disabled={onChain.isPending || !loan.chain_loan_id}
              className="w-full bg-indigo-600 hover:bg-indigo-500">
              {onChain.isPending ? "Waiting for MetaMask..." : "Approve with MetaMask"}
            </Button>
          </div>

          {/* Private key fallback */}
          <details className="rounded-lg border border-neutral-800 bg-neutral-950">
            <summary className="cursor-pointer px-4 py-3 text-xs text-neutral-500 hover:text-neutral-300">
              Or approve with private key (test wallets only)
            </summary>
            <form onSubmit={handlePrivateKey} className="px-4 pb-4 space-y-3">
              <input type="password" required value={pk} onChange={e => setPk(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none" />
              <p className="text-xs text-yellow-500">Test wallets only — never use real private keys</p>
              {pkError && <p className="text-sm text-red-400">{pkError}</p>}
              <Button type="submit" disabled={pkLoading}
                className="w-full bg-neutral-700 hover:bg-neutral-600">
                {pkLoading ? "Submitting..." : "Approve with Private Key"}
              </Button>
            </form>
          </details>
        </CardContent>
      )}
    </Card>
  );
}
