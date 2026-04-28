"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

interface Web3ContextType {
  account: string | null;
  provider: ethers.BrowserProvider | null;
  role: string | null;
  connectWallet: () => Promise<void>;
  setRole: (role: string) => void;
  disconnect: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [role, setRoleState] = useState<string | null>(null);

  useEffect(() => {
    const savedRole = localStorage.getItem("role");
    if (savedRole) setRoleState(savedRole);

    checkIfWalletIsConnected();
  }, []);

  const getEthereumProvider = () => {
    if (typeof window.ethereum === "undefined") return null;
    
    // Handle multiple injected providers (e.g., MetaMask alongside other wallets)
    if ((window.ethereum as any).providers?.length) {
      const metaMaskProvider = (window.ethereum as any).providers.find(
        (p: any) => p.isMetaMask
      );
      if (metaMaskProvider) return metaMaskProvider;
    }
    
    return window.ethereum;
  };

  const checkIfWalletIsConnected = async () => {
    try {
      const ethProvider = getEthereumProvider();
      if (!ethProvider) return;

      const p = new ethers.BrowserProvider(ethProvider as any);
      setProvider(p);
      const accounts = await p.send("eth_accounts", []);
      if (accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (e) {
      console.error("Silent connect error:", e);
    }
  };

  const connectWallet = async () => {
    try {
      const ethProvider = getEthereumProvider();
      if (!ethProvider) {
        alert("Please install MetaMask!");
        return;
      }

      const p = new ethers.BrowserProvider(ethProvider as any);
      await p.send("eth_requestAccounts", []);
      const signer = await p.getSigner();
      const acc = await signer.getAddress();
      setProvider(p);
      setAccount(acc);
    } catch (err: any) {
      console.error("User rejected request or provider error:", err?.message || err);
    }
  };

  const setRole = (r: string) => {
    setRoleState(r);
    localStorage.setItem("role", r);
  };

  const disconnect = () => {
    setAccount(null);
    setRoleState(null);
    localStorage.removeItem("role");
  };

  return (
    <Web3Context.Provider value={{ account, provider, role, connectWallet, setRole, disconnect }}>
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};
