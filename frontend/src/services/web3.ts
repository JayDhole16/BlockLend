/**
 * web3.ts
 * -------
 * MetaMask wallet service + contract interaction layer.
 * All blockchain transactions go through here — pages never touch ethers directly.
 *
 * Supported network: Hardhat Local  RPC: http://127.0.0.1:8545  ChainID: 31337
 */

import { ethers, BrowserProvider, JsonRpcSigner, Contract } from "ethers";

// ── Network config ────────────────────────────────────────────────────────────

export const HARDHAT_CHAIN_ID = 31337;
export const HARDHAT_RPC      = "http://127.0.0.1:8545";

// ── Contract addresses (set by deploy.js — update after each fresh deploy) ───
// These are the deterministic Hardhat addresses for a clean deploy from account[0]

export const CONTRACT_ADDRESSES = {
  USDC:        process.env.NEXT_PUBLIC_USDC_ADDRESS        ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  LOAN_FACTORY: process.env.NEXT_PUBLIC_LOAN_FACTORY_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  ESCROW:      process.env.NEXT_PUBLIC_ESCROW_ADDRESS       ?? "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
} as const;

// ── Minimal ABIs (only functions the frontend calls) ─────────────────────────

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() pure returns (uint8)",
] as const;

const ESCROW_ABI = [
  "function depositFromLender(uint256 loanId)",
  "function repayLoan(uint256 loanId)",
  "function getTotalDue(uint256 loanId) view returns (uint256 principal, uint256 interest, uint256 total)",
] as const;

const LOAN_FACTORY_ABI = [
  "function getLoan(uint256 loanId) view returns (tuple(uint256 id, address borrower, uint256 amount, uint256 duration, uint256 interestRate, address[] guarantors, address[] approvedGuarantors, uint8 status, string ipfsHash))",
  "function approveGuarantor(uint256 loanId)",
  "function totalLoans() view returns (uint256)",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxStatus = "idle" | "pending" | "confirmed" | "failed";

export interface TxResult {
  hash: string;
  status: "confirmed" | "failed";
}

// ── Provider helpers ──────────────────────────────────────────────────────────

function getEthereumProvider(): NonNullable<typeof window.ethereum> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed. Please install it to continue.");
  }
  // Prefer MetaMask when multiple wallets are injected
  const providers = (window.ethereum as any).providers as any[] | undefined;
  if (providers?.length) {
    const mm = providers.find((p) => p.isMetaMask);
    if (mm) return mm;
  }
  return window.ethereum;
}

async function getBrowserProvider(): Promise<BrowserProvider> {
  return new BrowserProvider(getEthereumProvider() as any);
}

// ── Network guard ─────────────────────────────────────────────────────────────

async function assertHardhatNetwork(provider: BrowserProvider): Promise<void> {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== HARDHAT_CHAIN_ID) {
    // Ask MetaMask to switch
    try {
      await (getEthereumProvider() as any).request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}` }],
      });
    } catch (switchErr: any) {
      // Chain not added yet — add it
      if (switchErr.code === 4902) {
        await (getEthereumProvider() as any).request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}`,
            chainName: "Hardhat Local",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [HARDHAT_RPC],
          }],
        });
      } else {
        throw new Error(`Please switch MetaMask to the Hardhat Local network (Chain ID ${HARDHAT_CHAIN_ID}).`);
      }
    }
  }
}

// ── Wallet functions ──────────────────────────────────────────────────────────

/**
 * Request MetaMask account access and return the connected address.
 * Switches to Hardhat network automatically if needed.
 */
export async function connectWallet(): Promise<string> {
  const provider = await getBrowserProvider();
  await assertHardhatNetwork(provider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return signer.getAddress();
}

/**
 * Return the currently connected wallet address without prompting.
 * Returns null if no wallet is connected.
 */
export async function getCurrentWallet(): Promise<string | null> {
  try {
    const provider = await getBrowserProvider();
    const accounts = await provider.send("eth_accounts", []);
    return (accounts as string[])[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Return an ethers Signer for the connected wallet.
 * Throws if MetaMask is not connected.
 */
export async function getSigner(): Promise<JsonRpcSigner> {
  const provider = await getBrowserProvider();
  await assertHardhatNetwork(provider);
  return provider.getSigner();
}

// ── Contract factories ────────────────────────────────────────────────────────

async function getUSDC(signer: JsonRpcSigner): Promise<Contract> {
  return new Contract(CONTRACT_ADDRESSES.USDC, USDC_ABI, signer);
}

async function getEscrow(signer: JsonRpcSigner): Promise<Contract> {
  return new Contract(CONTRACT_ADDRESSES.ESCROW, ESCROW_ABI, signer);
}

async function getLoanFactory(signer: JsonRpcSigner): Promise<Contract> {
  return new Contract(CONTRACT_ADDRESSES.LOAN_FACTORY, LOAN_FACTORY_ABI, signer);
}

// ── USDC helpers ──────────────────────────────────────────────────────────────

/**
 * Approve `spender` to spend `amount` USDC (in human units, e.g. 1000 = 1000 USDC).
 * Returns the tx receipt once confirmed.
 */
export async function approveUSDC(
  spender: string,
  amountHuman: number
): Promise<TxResult> {
  const signer = await getSigner();
  const usdc   = await getUSDC(signer);
  const decimals: bigint = await usdc.decimals();
  const amount = ethers.parseUnits(String(amountHuman), Number(decimals));

  const tx = await usdc.approve(spender, amount);
  const receipt = await tx.wait();
  return {
    hash:   tx.hash,
    status: receipt?.status === 1 ? "confirmed" : "failed",
  };
}

/**
 * Return the current USDC balance for `address` in human-readable units.
 */
export async function getUSDCBalance(address: string): Promise<string> {
  const provider = await getBrowserProvider();
  const usdc = new Contract(CONTRACT_ADDRESSES.USDC, USDC_ABI, provider);
  const decimals: bigint = await usdc.decimals();
  const raw: bigint = await usdc.balanceOf(address);
  return ethers.formatUnits(raw, Number(decimals));
}

// ── Loan funding ──────────────────────────────────────────────────────────────

/**
 * Fund a loan as a lender:
 *   1. Approve USDC allowance to Escrow
 *   2. Call Escrow.depositFromLender(loanId)
 *
 * `amountHuman` is the loan amount in USDC (e.g. 1000).
 */
export async function sendLoanFunding(
  loanId: number,
  amountHuman: number
): Promise<TxResult> {
  const signer = await getSigner();
  const usdc   = await getUSDC(signer);
  const escrow = await getEscrow(signer);
  const decimals: bigint = await usdc.decimals();
  const amount = ethers.parseUnits(String(amountHuman), Number(decimals));

  // Step 1 — approve
  const approveTx = await usdc.approve(CONTRACT_ADDRESSES.ESCROW, amount);
  await approveTx.wait();

  // Step 2 — deposit
  const depositTx = await escrow.depositFromLender(loanId);
  const receipt   = await depositTx.wait();

  return {
    hash:   depositTx.hash,
    status: receipt?.status === 1 ? "confirmed" : "failed",
  };
}

// ── Loan repayment ────────────────────────────────────────────────────────────

/**
 * Repay a loan as the borrower:
 *   1. Fetch total due from Escrow.getTotalDue(loanId)
 *   2. Approve USDC allowance to Escrow
 *   3. Call Escrow.repayLoan(loanId)
 */
export async function repayLoanOnChain(loanId: number): Promise<TxResult> {
  const signer = await getSigner();
  const usdc   = await getUSDC(signer);
  const escrow = await getEscrow(signer);

  // Fetch exact amount due
  const due = await escrow.getTotalDue(loanId);
  const totalDue: bigint = due.total;

  // Approve
  const approveTx = await usdc.approve(CONTRACT_ADDRESSES.ESCROW, totalDue);
  await approveTx.wait();

  // Repay
  const repayTx = await escrow.repayLoan(loanId);
  const receipt = await repayTx.wait();

  return {
    hash:   repayTx.hash,
    status: receipt?.status === 1 ? "confirmed" : "failed",
  };
}

// ── Guarantor approval ────────────────────────────────────────────────────────

/**
 * Approve a loan as a guarantor via LoanFactory.approveGuarantor(loanId).
 */
export async function approveGuarantorOnChain(loanId: number): Promise<TxResult> {
  const signer  = await getSigner();
  const factory = await getLoanFactory(signer);

  const tx      = await factory.approveGuarantor(loanId);
  const receipt = await tx.wait();

  return {
    hash:   tx.hash,
    status: receipt?.status === 1 ? "confirmed" : "failed",
  };
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch on-chain loan data directly from LoanFactory.
 */
export async function getLoanOnChain(loanId: number) {
  const provider = await getBrowserProvider();
  const factory  = new Contract(CONTRACT_ADDRESSES.LOAN_FACTORY, LOAN_FACTORY_ABI, provider);
  return factory.getLoan(loanId);
}

/**
 * Fetch total repayment due for a loan.
 * Returns { principal, interest, total } as human-readable USDC strings.
 */
export async function getTotalDue(loanId: number) {
  const provider = await getBrowserProvider();
  const escrow   = new Contract(CONTRACT_ADDRESSES.ESCROW, ESCROW_ABI, provider);
  const usdc     = new Contract(CONTRACT_ADDRESSES.USDC, USDC_ABI, provider);
  const decimals: bigint = await usdc.decimals();
  const due      = await escrow.getTotalDue(loanId);
  const fmt      = (v: bigint) => ethers.formatUnits(v, Number(decimals));
  return {
    principal: fmt(due.principal),
    interest:  fmt(due.interest),
    total:     fmt(due.total),
  };
}
