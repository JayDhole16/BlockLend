"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

export interface Loan {
  id: string;
  amount: string;
  interest: string;
  borrower: string;
  creditScore: number;
  fraudRisk: "Low" | "Medium" | "High";
  status: "Open" | "Pending Guarantors" | "Funded" | "Repaid";
}

interface LoanCardProps {
  loan: Loan;
  role: "Borrower" | "Guarantor" | "Lender";
}

export function LoanCard({ loan, role }: LoanCardProps) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Medium": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "High": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Open": return "bg-blue-500/10 text-blue-400";
      case "Pending Guarantors": return "bg-orange-500/10 text-orange-400";
      case "Funded": return "bg-purple-500/10 text-purple-400";
      case "Repaid": return "bg-green-500/10 text-green-400";
      default: return "bg-neutral-800 text-neutral-400";
    }
  };

  return (
    <Card className="bg-neutral-900 border-neutral-800 flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start mb-2">
          <Badge variant="outline" className={getStatusColor(loan.status)}>
            {loan.status}
          </Badge>
          <span className="text-sm text-neutral-500">ID: {loan.id}</span>
        </div>
        <CardTitle className="text-2xl font-bold flex items-end gap-2">
          {loan.amount} <span className="text-sm font-normal text-neutral-400 mb-1">USDC</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-neutral-500 mb-1">Interest Rate</p>
            <p className="font-semibold text-neutral-200">{loan.interest}% APY</p>
          </div>
          <div>
            <p className="text-neutral-500 mb-1">AI Credit Score</p>
            <p className="font-semibold text-neutral-200">{loan.creditScore} / 850</p>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-800">
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-500">Fraud Risk</span>
            <Badge variant="outline" className={`flex gap-1 ${getRiskColor(loan.fraudRisk)}`}>
              {loan.fraudRisk === "Low" ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              {loan.fraudRisk}
            </Badge>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t border-neutral-800">
        <Button asChild className="w-full bg-neutral-800 hover:bg-neutral-700 text-white">
          <Link href={`/loan/${loan.id}`}>
            View Details <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
