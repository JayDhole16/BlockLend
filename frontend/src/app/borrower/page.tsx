"use client";
import React, { useState, useRef } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useLoans, useMutation, useUserProfile, type ApiLoan } from "@/hooks/useApi";
import { useRepayLoanOnChain, useTotalDue } from "@/hooks/useWeb3Transactions";
import TxStatusBanner from "@/components/TxStatus";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Hardhat borrower wallet[2] key — pre-filled for local dev
const BORROWER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const STATUS_COLOR: Record<string, string> = {
  GUARANTOR_PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  OPEN_FOR_LENDERS:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  READY_TO_FUND:     "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ACTIVE:            "bg-green-500/10 text-green-400 border-green-500/20",
  REPAID:            "bg-neutral-700 text-neutral-300 border-neutral-600",
  DEFAULTED:         "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function BorrowerDashboard() {
  const { account } = useWeb3();

  // Real data
  const { data: loans, loading: loansLoading, error: loansError, refetch } =
    useLoans(account ? { borrower: account } : undefined);
  const { data: profile } = useUserProfile(account);

  // Create loan form state
  const [form, setForm] = useState({
    amount_usdc: "",
    duration_days: "30",
    interest_rate_bps: "500",
    guarantors: "",
    borrower_private_key: BORROWER_KEY,
  });

  const createLoan = useMutation<object, object>("/loan/create");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    const guarantors = form.guarantors.split(",").map(g => g.trim()).filter(Boolean);
    const result = await createLoan.mutate({
      borrower_address: account,
      amount_usdc: parseFloat(form.amount_usdc),
      duration_days: parseInt(form.duration_days),
      interest_rate_bps: parseInt(form.interest_rate_bps),
      guarantors,
      ipfs_hash: "",
      borrower_private_key: form.borrower_private_key,
    });
    if (result) refetch();
  }

  if (!account) return <div className="text-center py-20 text-neutral-400">Please connect wallet</div>;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Borrower Dashboard</h1>
          <p className="text-neutral-400 font-mono text-sm">{account}</p>
        </div>
        {profile && (
          <div className="flex gap-3 text-center">
            <Stat label="Reputation" value={String(profile.reputation_score)} />
            <Stat label="Credit Score" value={String(profile.ai_credit_score)} />
            <Stat label="Fraud Risk" value={String(profile.fraud_risk)} />
          </div>
        )}
      </div>

      <Tabs defaultValue="loans" className="space-y-6">
        <TabsList className="bg-neutral-900 border border-neutral-800">
          <TabsTrigger value="loans">My Loans</TabsTrigger>
          <TabsTrigger value="request">New Request</TabsTrigger>
        </TabsList>

        {/* ── My Loans ── */}
        <TabsContent value="loans" className="space-y-4">
          {loansLoading && <p className="text-neutral-500">Loading loans...</p>}
          {loansError && <p className="text-red-400 text-sm">{loansError}</p>}
          {loans && loans.length === 0 && (
            <p className="text-neutral-500 text-center py-12">No loans yet. Create your first request.</p>
          )}
          {loans?.map(loan => (
            <LoanRow key={loan.id} loan={loan} onRepaid={refetch} />
          ))}
        </TabsContent>

        {/* ── New Request ── */}
        <TabsContent value="request">
          <Card className="bg-neutral-900 border-neutral-800 max-w-lg">
            <CardHeader>
              <CardTitle>Create Loan Request</CardTitle>
              <CardDescription>Submitted on-chain via the backend service.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <Field label="Amount (USDC)">
                  <Input required type="number" min="1" step="0.01"
                    value={form.amount_usdc} onChange={e => setForm(p => ({ ...p, amount_usdc: e.target.value }))}
                    placeholder="e.g. 1000" className="bg-neutral-950 border-neutral-800" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Duration (days)">
                    <Input required type="number" min="1"
                      value={form.duration_days} onChange={e => setForm(p => ({ ...p, duration_days: e.target.value }))}
                      className="bg-neutral-950 border-neutral-800" />
                  </Field>
                  <Field label="Interest (bps)">
                    <Input required type="number" min="0"
                      value={form.interest_rate_bps} onChange={e => setForm(p => ({ ...p, interest_rate_bps: e.target.value }))}
                      className="bg-neutral-950 border-neutral-800" />
                    <p className="text-xs text-neutral-500 mt-1">500 = 5% APR</p>
                  </Field>
                </div>
                <Field label="Guarantors (comma-separated, optional)">
                  <Input value={form.guarantors} onChange={e => setForm(p => ({ ...p, guarantors: e.target.value }))}
                    placeholder="0xABC..., 0xDEF..." className="bg-neutral-950 border-neutral-800" />
                </Field>
                <Field label="Signing Key">
                  <Input type="password" required value={form.borrower_private_key}
                    onChange={e => setForm(p => ({ ...p, borrower_private_key: e.target.value }))}
                    className="bg-neutral-950 border-neutral-800" />
                  <p className="text-xs text-yellow-500 mt-1">Pre-filled with Hardhat wallet[2] for local dev</p>
                </Field>
                {createLoan.error && <p className="text-sm text-red-400">{createLoan.error}</p>}
                {createLoan.success && (
                  <p className="text-sm text-green-400">Loan created on-chain!</p>
                )}
                <Button type="submit" disabled={createLoan.loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {createLoan.loading ? "Submitting..." : "Submit Loan Request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Loan row with on-chain repay ──────────────────────────────────────────────

function LoanRow({ loan, onRepaid }: { loan: ApiLoan; onRepaid: () => void }) {
  const repay    = useRepayLoanOnChain();
  const totalDue = useTotalDue(loan.chain_loan_id ?? null);
  const [showRepay, setShowRepay] = useState(false);
  const guarantors: string[] = loan.guarantors ? JSON.parse(loan.guarantors) : [];

  async function handleRepay() {
    if (!loan.chain_loan_id) return;
    const result = await repay.execute(loan.chain_loan_id);
    if (result?.status === "confirmed") onRepaid();
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">${loan.amount.toLocaleString()} USDC</span>
              <Badge variant="outline" className={STATUS_COLOR[loan.status] ?? ""}>
                {loan.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-neutral-400">
              Chain ID: {loan.chain_loan_id ?? "—"} &nbsp;|&nbsp;
              {loan.duration_days}d &nbsp;|&nbsp;
              {(loan.interest_rate_bps / 100).toFixed(2)}% APR &nbsp;|&nbsp;
              {guarantors.length} guarantor{guarantors.length !== 1 ? "s" : ""}
            </p>
            {loan.lender_address && (
              <p className="text-xs text-neutral-500">Lender: {loan.lender_address.slice(0, 10)}...</p>
            )}
          </div>

          {loan.status === "ACTIVE" && (
            <Button size="sm" onClick={() => { setShowRepay(v => !v); totalDue.fetch(); }}
              className="bg-green-700 hover:bg-green-600 shrink-0">
              Repay
            </Button>
          )}
        </div>

        {showRepay && loan.status === "ACTIVE" && (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
            {totalDue.data && (
              <div className="text-sm space-y-1">
                <p className="text-neutral-400">Principal: <span className="text-white">{totalDue.data.principal} USDC</span></p>
                <p className="text-neutral-400">Interest: <span className="text-white">{totalDue.data.interest} USDC</span></p>
                <p className="text-neutral-400 font-medium">Total due: <span className="text-green-400 font-bold">{totalDue.data.total} USDC</span></p>
              </div>
            )}
            <TxStatusBanner status={repay.status} hash={repay.hash} error={repay.error} />
            {repay.status !== "confirmed" && (
              <Button onClick={handleRepay} disabled={repay.isPending}
                className="w-full bg-green-700 hover:bg-green-600">
                {repay.isPending ? "Waiting for MetaMask..." : "Repay via MetaMask"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-center min-w-[80px]">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-neutral-300">{label}</Label>
      {children}
    </div>
  );
}
