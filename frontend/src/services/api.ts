/**
 * api.ts
 * -------
 * Centralised Axios service layer. All backend communication goes through here.
 * Components never call fetch/axios directly — they use these functions.
 *
 * Base URL is read from NEXT_PUBLIC_BACKEND_URL (set in .env.local).
 */

import axios, { AxiosError } from "axios";

// ── Types mirroring backend Pydantic schemas ──────────────────────────────────

export type UserRole = "borrower" | "lender" | "guarantor";

export type LoanStatus =
  | "GUARANTOR_PENDING"
  | "OPEN_FOR_LENDERS"
  | "READY_TO_FUND"
  | "ACTIVE"
  | "REPAID"
  | "DEFAULTED";

export interface RegisterUserPayload {
  wallet_address: string;
  role: UserRole;
  private_key?: string; // optional: triggers on-chain NFT mint
}

export interface UserProfile {
  id: string;
  wallet_address: string;
  role: UserRole;
  nft_token_id: number | null;
  reputation_score: number;
  ai_credit_score: number;
  fraud_risk: number;
}

export interface CreateLoanPayload {
  borrower_address: string;
  amount_usdc: number;
  duration_days: number;
  interest_rate_bps: number;
  guarantors?: string[];
  ipfs_hash?: string;
  borrower_private_key: string;
}

export interface Loan {
  id: string;
  chain_loan_id: number | null;
  borrower_address: string;
  lender_address: string | null;
  amount: number;
  duration_days: number;
  interest_rate_bps: number;
  guarantors: string | null; // JSON-encoded array
  status: LoanStatus;
  ipfs_hash: string | null;
}

export interface LoanCreateResponse extends Loan {
  ai_credit_score: number;
  ai_fraud_risk: "LOW" | "MEDIUM" | "HIGH";
}

export interface DocumentResponse {
  id: string;
  loan_id: string;
  filename: string;
  ipfs_hash: string;
  gateway_url: string;
}

export interface RepayLoanPayload {
  borrower_private_key: string;
}

export interface AIScores {
  wallet: string;
  reputation_score: number;
  ai_credit_score: number;
  fraud_risk: number;
}

export interface ApiError {
  detail: string;
}

// ── Axios instance ────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Normalise error messages so callers always get a plain string
export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiError | undefined;
    return data?.detail ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ── Auth / Registration ───────────────────────────────────────────────────────

/**
 * Register a new user. Optionally mints a soulbound NFT on-chain
 * when private_key is provided.
 */
export async function registerUser(data: RegisterUserPayload): Promise<UserProfile> {
  const res = await api.post<UserProfile>("/register", data);
  return res.data;
}

/**
 * Fetch a user profile by wallet address.
 */
export async function getUserProfile(wallet: string): Promise<UserProfile> {
  const res = await api.get<UserProfile>(`/users/${wallet}`);
  return res.data;
}

/**
 * Fetch live AI scores from the blockchain for a wallet.
 */
export async function getAIScores(wallet: string): Promise<AIScores> {
  const res = await api.get<AIScores>(`/users/${wallet}/scores`);
  return res.data;
}

// ── Loans ─────────────────────────────────────────────────────────────────────

/**
 * Create a new loan request. Returns the loan + AI scores.
 */
export async function createLoanRequest(data: CreateLoanPayload): Promise<LoanCreateResponse> {
  const res = await api.post<LoanCreateResponse>("/loan/create", data);
  return res.data;
}

/**
 * List loans. Optionally filter by borrower address or status.
 */
export async function getLoans(params?: {
  borrower?: string;
  status?: LoanStatus;
  skip?: number;
  limit?: number;
}): Promise<Loan[]> {
  const res = await api.get<Loan[]>("/loan/list", { params });
  return res.data;
}

/**
 * Fetch a single loan by its internal UUID.
 */
export async function getLoanById(id: string): Promise<Loan> {
  const res = await api.get<Loan>(`/loan/${id}`);
  return res.data;
}

/**
 * Sync a loan's status from the blockchain into the DB, then return it.
 */
export async function syncLoan(id: string): Promise<Loan> {
  const res = await api.get<Loan>(`/loan/${id}/sync`);
  return res.data;
}

/**
 * Upload a document for a loan. Returns the IPFS hash + gateway URL.
 */
export async function uploadDocuments(
  loanId: string,
  formData: FormData,
  borrowerPrivateKey?: string
): Promise<DocumentResponse> {
  const params = borrowerPrivateKey
    ? { borrower_private_key: borrowerPrivateKey }
    : undefined;

  const res = await api.post<DocumentResponse>(
    `/loan/${loanId}/upload-doc`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return res.data;
}

/**
 * Repay a loan. Borrower signs the on-chain tx via their private key.
 */
export async function repayLoan(
  loanId: string,
  data: RepayLoanPayload
): Promise<Loan> {
  const res = await api.post<Loan>(`/loan/${loanId}/repay`, data);
  return res.data;
}

/**
 * Guarantor approves their participation in a loan (backend signs tx).
 */
export async function approveGuarantorBackend(
  loanId: string,
  privateKey: string
): Promise<Loan> {
  const res = await api.post<Loan>(`/loan/${loanId}/approve-guarantor`, {
    private_key: privateKey,
  });
  return res.data;
}

/**
 * Platform releases escrowed funds to borrower (READY_TO_FUND → ACTIVE).
 */
export async function releaseLoan(loanId: string): Promise<Loan> {
  const res = await api.post<Loan>(`/loan/${loanId}/release`);
  return res.data;
}

/**
 * Fetch recent blockchain events (LoanCreated, LoanFunded, etc.)
 */
export async function getLoanEvents(fromBlock = 0) {
  const res = await api.get("/loan/events", { params: { from_block: fromBlock } });
  return res.data;
}

export default api;
