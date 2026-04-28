"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, Users, ShieldCheck } from "lucide-react";

export default function Register() {
  const { account, role, setRole } = useWeb3();
  const router = useRouter();

  useEffect(() => {
    if (!account) {
      router.push("/");
    } else if (role) {
      router.push(`/${role.toLowerCase()}`);
    }
  }, [account, role, router]);

  const handleSelectRole = (selectedRole: string) => {
    setRole(selectedRole);
    router.push(`/${selectedRole.toLowerCase()}`);
  };

  if (!account) return null;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3">Select Your Role</h1>
        <p className="text-neutral-400">Choose how you want to participate in the Nakshatra network.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-neutral-900 border-neutral-800 hover:border-indigo-500/50 transition-colors cursor-pointer group" onClick={() => handleSelectRole("Borrower")}>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-indigo-500/10 p-4 rounded-full mb-4 group-hover:bg-indigo-500/20 transition-colors">
              <Banknote className="w-8 h-8 text-indigo-400" />
            </div>
            <CardTitle>Borrower</CardTitle>
            <CardDescription>Request loans and manage repayments</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full mt-4 border-neutral-700 hover:bg-neutral-800">
              Join as Borrower
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 hover:border-cyan-500/50 transition-colors cursor-pointer group" onClick={() => handleSelectRole("Guarantor")}>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-cyan-500/10 p-4 rounded-full mb-4 group-hover:bg-cyan-500/20 transition-colors">
              <Users className="w-8 h-8 text-cyan-400" />
            </div>
            <CardTitle>Guarantor</CardTitle>
            <CardDescription>Back borrowers and earn yield</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full mt-4 border-neutral-700 hover:bg-neutral-800">
              Join as Guarantor
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 hover:border-purple-500/50 transition-colors cursor-pointer group" onClick={() => handleSelectRole("Lender")}>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-purple-500/10 p-4 rounded-full mb-4 group-hover:bg-purple-500/20 transition-colors">
              <ShieldCheck className="w-8 h-8 text-purple-400" />
            </div>
            <CardTitle>Lender</CardTitle>
            <CardDescription>Fund open loans and earn interest</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full mt-4 border-neutral-700 hover:bg-neutral-800">
              Join as Lender
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
