"use client";
import React, { useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useLoans, type ApiLoan } from "@/hooks/useApi";
import { useFundLoan } from "@/hooks/useWeb3Transactions";
import TxStatusBanner from "@/components/TxStatus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LenderDashboard() {
  const { account } = useWeb3();
  const { data: loans, loading, error, refetch } =
    useLoans({ status: "OPEN_FOR_LENDERS" });

  const [filterRisk, setFilterRisk] = useState("All");
  const [maxAmount, setMaxAmount]   = useState("");
  const [minRate, setMinRate]       = useState("");

  const filtered = (loans ?? []).filter(loan => {
    if (maxAmount && loan.amount > parseFloat(maxAmount)) return false;
    if (minRate && (loan.interest_rate_bps / 100) < parseFloat(minRate)) return false;
    return true;
  });

  if (!account) return <div className="text-center py-20 text-neutral-400">Please connect wallet</div>;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
      {/* Filters */}
      <div className="w-full md:w-56 space-y-5 shrink-0">
        <h2 className="text-xl font-bold">Filters</h2>

        <div className="space-y-1">
          <Label>Max Amount (USDC)</Label>
          <Input type="number" placeholder="e.g. 50000" value={maxAmount}
            onChange={e => setMaxAmount(e.target.value)}
            className="bg-neutral-900 border-neutral-800" />
        </div>

        <div className="space-y-1">
          <Label>Min Interest (%)</Label>
          <Input type="number" placeholder="e.g. 5" value={minRate}
            onChange={e => setMinRate(e.target.value)}
            className="bg-neutral-900 border-neutral-800" />
        </div>

        <Button variant="outline" className="w-full border-neutral-700"
          onClick={() => { setMaxAmount(""); setMinRate(""); }}>
          Clear Filters
        </Button>
      </div>

      {/* Loan list */}
      <div className="flex-1">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold">Lending Marketplace</h1>
            <p className="text-neutral-400">Fund open loan requests on-chain via MetaMask.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">{filtered.length} open</span>
            <Button variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
          </div>
        </div>

        {loading && (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-neutral-800" />
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-700 py-20 text-center text-neutral-500">
            No open loans available right now.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(loan => (
            <LoanFundCard key={loan.id} loan={loan} onFunded={refetch} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoanFundCard({ loan, onFunded }: { loan: ApiLoan; onFunded: () => void }) {
  const fund = useFundLoan();
  const guarantors: string[] = loan.guarantors ? JSON.parse(loan.guarantors) : [];

  async function handleFund() {
    if (!loan.chain_loan_id) return;
    const result = await fund.execute(loan.chain_loan_id, loan.amount);
    if (result?.status === "confirmed") onFunded();
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800 flex flex-col">
      <CardContent className="pt-5 flex-1 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-neutral-500">Loan #{loan.chain_loan_id ?? "—"}</p>
            <p className="text-2xl font-bold">${loan.amount.toLocaleString()}
              <span className="text-sm font-normal text-neutral-400 ml-1">USDC</span>
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
            Open
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="rounded-lg bg-neutral-800 p-2">
            <p className="text-neutral-500">APR</p>
            <p className="font-semibold text-neutral-200">{(loan.interest_rate_bps / 100).toFixed(2)}%</p>
          </div>
          <div className="rounded-lg bg-neutral-800 p-2">
            <p className="text-neutral-500">Duration</p>
            <p className="font-semibold text-neutral-200">{loan.duration_days}d</p>
          </div>
          <div className="rounded-lg bg-neutral-800 p-2">
            <p className="text-neutral-500">Guarantors</p>
            <p className="font-semibold text-neutral-200">{guarantors.length}</p>
          </div>
        </div>

        <p className="text-xs text-neutral-500 font-mono truncate">
          Borrower: {loan.borrower_address}
        </p>

        {/* Tx status + fund button */}
        <TxStatusBanner status={fund.status} hash={fund.hash} error={fund.error} />

        {fund.status === "confirmed" ? (
          <p className="text-sm text-green-400 text-center">Funded successfully!</p>
        ) : (
          <Button onClick={handleFund}
            disabled={!loan.chain_loan_id || fund.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-500">
            {fund.isPending ? "Waiting for MetaMask..." : "Fund Loan"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
