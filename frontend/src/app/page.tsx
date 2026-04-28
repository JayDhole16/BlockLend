"use client";
import React, { useEffect } from "react";
import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Banknote, Users } from "lucide-react";

export default function Home() {
  const { account, role, connectWallet } = useWeb3();
  const router = useRouter();

  useEffect(() => {
    if (account && role) {
      router.push(`/${role.toLowerCase()}`);
    } else if (account && !role) {
      router.push('/register');
    }
  }, [account, role, router]);

  return (
    <div className="flex flex-col items-center py-20 px-4">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="inline-block relative">
          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full" />
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight relative z-10">
            Decentralized <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">P2P Lending</span>
          </h1>
        </div>
        
        <p className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Unlock the true power of your assets. Borrow with ease, lend with confidence, 
          and guarantee loans with verifiable Web3 reputation on the Nakshatra protocol.
        </p>

        <div className="flex items-center justify-center gap-4 pt-8">
          {account ? (
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-14 text-lg" onClick={() => router.push('/register')}>
              Select Your Role <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          ) : (
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-14 text-lg" onClick={connectWallet}>
              Connect Wallet <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-32">
        <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Banknote className="w-10 h-10 text-indigo-400 mb-6" />
          <h3 className="text-xl font-bold mb-3">Borrowers</h3>
          <p className="text-neutral-400">Create loan requests with custom terms, add verified guarantors, and unlock capital instantly once funded.</p>
        </div>

        <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 backdrop-blur-sm relative overflow-hidden group hover:border-cyan-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Users className="w-10 h-10 text-cyan-400 mb-6" />
          <h3 className="text-xl font-bold mb-3">Guarantors</h3>
          <p className="text-neutral-400">Back loans to earn yield. Accept or reject requests based on borrower reputation and AI-driven risk scores.</p>
        </div>

        <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <ShieldCheck className="w-10 h-10 text-purple-400 mb-6" />
          <h3 className="text-xl font-bold mb-3">Lenders</h3>
          <p className="text-neutral-400">Browse fully collateralized or guaranteed open loans. Filter requests by interest, risk score, and amount.</p>
        </div>
      </div>
    </div>
  );
}
