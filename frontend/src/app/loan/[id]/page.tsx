"use client";
import React, { useEffect } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useParams, useRouter } from "next/navigation";
import { useLoan, apiFetch } from "@/hooks/useApi";
import { useRepayLoanOnChain, useTotalDue, useApproveGuarantor } from "@/hooks/useWeb3Transactions";
import TxStatusBanner from "@/components/TxStatus";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ShieldCheck, CheckCircle2 } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  GUARANTOR_PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  OPEN_FOR_LENDERS:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  READY_TO_FUND:     "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ACTIVE:            "bg-green-500/10 text-green-400 border-green-500/20",
  REPAID:            "bg-neutral-700 text-neutral-300 border-neutral-600",
  DEFAULTED:         "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function LoanDetails() {
  const { account, role } = useWeb3();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data: loan, loading, error, refetch } = useLoan(id);

  const repay    = useRepayLoanOnChain();
  const approve  = useApproveGuarantor();
  const totalDue = useTotalDue(loan?.chain_loan_id ?? null);

  useEffect(() => {
    if (loan?.status === "ACTIVE" && loan.chain_loan_id) totalDue.fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.status]);

  if (!account) return <div className="text-center py-20 text-neutral-400">Please connect wallet</div>;
  if (loading)  return <Skeleton />;
  if (error)    return <p className="text-red-400 p-8">{error}</p>;
  if (!loan)    return null;

  const guarantors: string[] = loan.guarantors ? JSON.parse(loan.guarantors) : [];
  const isBorrower  = account.toLowerCase() === loan.borrower_address.toLowerCase();
  const isGuarantor = guarantors.some(g => g.toLowerCase() === account.toLowerCase());
  const isLender    = role?.toLowerCase() === "lender";

  async function handleRepay() {
    if (!loan!.chain_loan_id) return;
    const result = await repay.execute(loan!.chain_loan_id);
    if (result?.status === "confirmed") refetch();
  }

  async function handleApprove() {
    if (!loan!.chain_loan_id) return;
    const result = await approve.execute(loan!.chain_loan_id);
    if (result?.status === "confirmed") refetch();
  }

  async function handleSync() {
    await apiFetch(`/loan/${id}/sync`);
    refetch();
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <Badge variant="outline" className={STATUS_COLOR[loan.status] ?? ""}>
            {loan.status.replace(/_/g, " ")}
          </Badge>
          <h1 className="text-3xl font-bold mt-2">Loan #{loan.chain_loan_id ?? id.slice(0, 8)}</h1>
          <p className="text-neutral-400 mt-1 font-mono text-sm">{loan.borrower_address}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-sm text-neutral-500">Amount</p>
          <p className="text-3xl font-bold">${loan.amount.toLocaleString()} USDC</p>
          <Button variant="ghost" size="sm" onClick={handleSync} className="text-xs text-neutral-500">
            Sync from chain
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Details */}
        <Card className="bg-neutral-900 border-neutral-800 md:col-span-2">
          <CardHeader><CardTitle>Loan Details</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Interest Rate" value={`${(loan.interest_rate_bps / 100).toFixed(2)}% APR`} />
              <Detail label="Duration" value={`${loan.duration_days} days`} />
              {loan.lender_address && (
                <Detail label="Lender" value={`${loan.lender_address.slice(0, 10)}...`} />
              )}
            </div>

            {/* Total due */}
            {loan.status === "ACTIVE" && totalDue.data && (
              <div className="rounded-lg bg-neutral-950 border border-neutral-800 p-4 text-sm space-y-1">
                <p className="font-medium text-neutral-200 mb-2">Repayment Breakdown</p>
                <p className="text-neutral-400">Principal: <span className="text-white">{totalDue.data.principal} USDC</span></p>
                <p className="text-neutral-400">Interest: <span className="text-white">{totalDue.data.interest} USDC</span></p>
                <p className="text-neutral-400 font-medium">Total due: <span className="text-green-400 font-bold">{totalDue.data.total} USDC</span></p>
              </div>
            )}

            {/* Guarantors */}
            {guarantors.length > 0 && (
              <div className="border-t border-neutral-800 pt-4">
                <h3 className="font-semibold mb-3">Guarantors</h3>
                <div className="space-y-2">
                  {guarantors.map((g, i) => (
                    <div key={i} className="flex justify-between items-center bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                      <span className="font-mono text-sm">{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IPFS */}
            {loan.ipfs_hash && (
              <div className="border-t border-neutral-800 pt-4">
                <h3 className="font-semibold mb-3">Documents</h3>
                <a href={`https://ipfs.io/ipfs/${loan.ipfs_hash}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800 hover:border-indigo-500 transition-colors">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <span className="text-sm text-indigo-400 truncate">{loan.ipfs_hash}</span>
                  <ShieldCheck className="w-4 h-4 text-green-400 ml-auto" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-4">
          <Card className="bg-neutral-900 border-indigo-500/30">
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              {/* Lender: fund */}
              {isLender && loan.status === "OPEN_FOR_LENDERS" && (
                <>
                  <p className="text-sm text-neutral-400">Fund this loan via MetaMask. Funds go into escrow.</p>
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => router.push("/lender")}>
                    Fund from Marketplace
                  </Button>
                </>
              )}

              {/* Borrower: repay */}
              {isBorrower && loan.status === "ACTIVE" && (
                <>
                  <TxStatusBanner status={repay.status} hash={repay.hash} error={repay.error} />
                  {repay.status === "confirmed" ? (
                    <div className="text-center space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto" />
                      <p className="text-green-400 font-semibold">Repaid!</p>
                    </div>
                  ) : (
                    <Button onClick={handleRepay} disabled={repay.isPending}
                      className="w-full bg-green-700 hover:bg-green-600">
                      {repay.isPending ? "Waiting for MetaMask..." : "Repay via MetaMask"}
                    </Button>
                  )}
                </>
              )}

              {/* Guarantor: approve */}
              {isGuarantor && loan.status === "GUARANTOR_PENDING" && (
                <>
                  <TxStatusBanner status={approve.status} hash={approve.hash} error={approve.error} />
                  {approve.status === "confirmed" ? (
                    <p className="text-green-400 text-sm text-center">Approved!</p>
                  ) : (
                    <Button onClick={handleApprove} disabled={approve.isPending}
                      className="w-full bg-yellow-700 hover:bg-yellow-600">
                      {approve.isPending ? "Waiting for MetaMask..." : "Approve Guarantee"}
                    </Button>
                  )}
                </>
              )}

              {/* Neutral states */}
              {loan.status === "REPAID" && (
                <div className="text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto" />
                  <p className="text-green-400 font-semibold">Loan Repaid</p>
                </div>
              )}
              {loan.status === "DEFAULTED" && (
                <p className="text-red-400 text-sm text-center">This loan has defaulted.</p>
              )}
              {loan.status === "READY_TO_FUND" && (
                <p className="text-purple-400 text-sm text-center">Funded — awaiting release to borrower.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs">{label}</p>
      <p className="font-semibold text-neutral-200">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-800" />
      ))}
    </div>
  );
}
