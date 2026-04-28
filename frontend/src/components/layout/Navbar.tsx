"use client";
import React from "react";
import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import { Button } from "@/components/ui/button";
import { WalletCards } from "lucide-react";

export default function Navbar() {
  const { account, connectWallet, role, disconnect } = useWeb3();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-indigo-400 flex items-center gap-2">
          <WalletCards className="w-6 h-6" />
          Nakshatra
        </Link>

        <div className="flex items-center gap-6">
          {role && (
            <Link 
              href={`/${role.toLowerCase()}`}
              className="text-sm font-medium text-neutral-300 hover:text-white transition-colors capitalize"
            >
              {role} Dashboard
            </Link>
          )}

          {account ? (
            <div className="flex items-center gap-3">
              {role && (
                <span className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-400 capitalize">
                  Role: {role}
                </span>
              )}
              <Button variant="secondary" onClick={disconnect} className="text-sm">
                {truncateAddress(account)}
              </Button>
            </div>
          ) : (
            <Button onClick={connectWallet} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
