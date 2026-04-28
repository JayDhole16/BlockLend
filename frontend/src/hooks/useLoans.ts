/**
 * useLoans.ts
 * -----------
 * React Query hooks for all loan-related data fetching.
 * Components import these instead of calling api.ts directly.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import {
  getLoans,
  getLoanById,
  syncLoan,
  createLoanRequest,
  repayLoan,
  uploadDocuments,
  getLoanEvents,
  approveGuarantorBackend,
  releaseLoan,
  CreateLoanPayload,
  RepayLoanPayload,
  Loan,
  LoanStatus,
} from "@/services/api";

// ── Query keys ────────────────────────────────────────────────────────────────
export const loanKeys = {
  all:    ["loans"] as const,
  list:   (filters?: object) => [...loanKeys.all, "list", filters] as const,
  detail: (id: string) => [...loanKeys.all, "detail", id] as const,
  events: (fromBlock: number) => [...loanKeys.all, "events", fromBlock] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

/** Fetch all loans, optionally filtered. */
export function useLoans(params?: {
  borrower?: string;
  status?: LoanStatus;
  skip?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: loanKeys.list(params),
    queryFn:  () => getLoans(params),
    staleTime: 15_000, // 15 s
  });
}

/** Fetch a single loan by UUID. */
export function useLoan(
  id: string,
  options?: Partial<UseQueryOptions<Loan>>
) {
  return useQuery({
    queryKey: loanKeys.detail(id),
    queryFn:  () => getLoanById(id),
    enabled:  !!id,
    staleTime: 10_000,
    ...options,
  });
}

/** Fetch open loans (lender marketplace). */
export function useOpenLoans() {
  return useLoans({ status: "OPEN_FOR_LENDERS" });
}

/** Fetch loans for a specific borrower. */
export function useBorrowerLoans(wallet: string) {
  return useLoans({ borrower: wallet });
}

/** Fetch recent blockchain events. */
export function useLoanEvents(fromBlock = 0) {
  return useQuery({
    queryKey: loanKeys.events(fromBlock),
    queryFn:  () => getLoanEvents(fromBlock),
    staleTime: 10_000,
    refetchInterval: 15_000, // auto-refresh every 15 s
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a new loan request. */
export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLoanPayload) => createLoanRequest(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all });
    },
  });
}

/** Repay a loan (backend signs tx via private key). */
export function useRepayLoan(loanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RepayLoanPayload) => repayLoan(loanId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.detail(loanId) });
      qc.invalidateQueries({ queryKey: loanKeys.all });
    },
  });
}

/** Guarantor approves via backend (private key flow). */
export function useApproveGuarantorBackend(loanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (privateKey: string) => approveGuarantorBackend(loanId, privateKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.detail(loanId) });
      qc.invalidateQueries({ queryKey: loanKeys.all });
    },
  });
}

/** Platform releases funds to borrower. */
export function useReleaseLoan(loanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => releaseLoan(loanId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.detail(loanId) });
      qc.invalidateQueries({ queryKey: loanKeys.all });
    },
  });
}

/** Upload a document for a loan. */
export function useUploadDocument(loanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      formData,
      privateKey,
    }: {
      formData: FormData;
      privateKey?: string;
    }) => uploadDocuments(loanId, formData, privateKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.detail(loanId) });
    },
  });
}

/** Sync a loan's status from the blockchain. */
export function useSyncLoan(loanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncLoan(loanId),
    onSuccess: (updated) => {
      qc.setQueryData(loanKeys.detail(loanId), updated);
    },
  });
}
