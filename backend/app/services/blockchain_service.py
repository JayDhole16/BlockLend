"""
blockchain_service.py
======================
Web3.py integration layer for all deployed Hardhat contracts.

Contracts covered:
  - MockUSDC       (ERC20 stablecoin)
  - UserProfileNFT (soulbound identity NFT)
  - LoanFactory    (loan lifecycle state machine)
  - Escrow         (fund custody + repayment)
  - Reputation     (on-chain score tracking)

All write functions accept a private_key parameter so any wallet can sign.
The deployer key (from env) is used as the default for owner-only calls.

Environment variables consumed (via Settings):
  RPC_URL                  → WEB3_PROVIDER_URL
  LOAN_FACTORY_ADDRESS
  ESCROW_ADDRESS
  USDC_ADDRESS             → MOCK_USDC_ADDRESS
  USER_PROFILE_NFT_ADDRESS
  REPUTATION_ADDRESS
  DEPLOYER_PRIVATE_KEY
  CHAIN_ID
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract
from web3.exceptions import ContractLogicError
from web3.types import TxReceipt

try:
    from web3.middleware import geth_poa_middleware  # web3 < 6.x
except ImportError:
    try:
        from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware  # web3 >= 6.x
    except ImportError:
        geth_poa_middleware = None

from app.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

# ── ABI resolution ────────────────────────────────────────────────────────────
# Hardhat artifacts live at:  blockchain/artifacts/contracts/<Name>.sol/<Name>.json
# In Docker the artifacts volume is mounted at /blockchain/artifacts
# Locally they are at <repo-root>/blockchain/artifacts/contracts

def _find_artifacts_dir() -> Path:
    # Docker: volume mounted at /blockchain/artifacts
    docker_path = Path("/blockchain/artifacts/contracts")
    if docker_path.exists():
        return docker_path
    # Local: relative to this file (parents[4] = repo root)
    local_path = Path(__file__).resolve().parents[4] / "blockchain" / "artifacts" / "contracts"
    return local_path

_ARTIFACTS_DIR = _find_artifacts_dir()

# On-chain status index → Python enum name
_CHAIN_STATUS_MAP = {
    0: "GUARANTOR_PENDING",
    1: "OPEN_FOR_LENDERS",
    2: "READY_TO_FUND",
    3: "ACTIVE",
    4: "REPAID",
    5: "DEFAULTED",
}

USDC_DECIMALS = 6


def _load_abi(contract_name: str) -> list[dict]:
    path = _ARTIFACTS_DIR / f"{contract_name}.sol" / f"{contract_name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"ABI not found at {path}. Run `npx hardhat compile` first."
        )
    with open(path) as fh:
        return json.load(fh)["abi"]


def _to_usdc_units(amount_human: float) -> int:
    """Convert human-readable USDC (e.g. 1000.0) to raw 6-decimal units."""
    return int(amount_human * 10**USDC_DECIMALS)


def _from_usdc_units(amount_raw: int) -> float:
    """Convert raw USDC units back to human-readable float."""
    return amount_raw / 10**USDC_DECIMALS


# ─────────────────────────────────────────────────────────────────────────────
# BlockchainService
# ─────────────────────────────────────────────────────────────────────────────

class BlockchainService:
    """
    Singleton service that wraps every on-chain interaction.

    Usage:
        from app.services.blockchain_service import blockchain_service
        profile = blockchain_service.get_user_profile("0xABC...")
    """

    def __init__(self) -> None:
        self.w3 = Web3(Web3.HTTPProvider(settings.WEB3_PROVIDER_URL))
        # Required for Hardhat / Clique PoA chains (inject if available)
        if geth_poa_middleware is not None:
            try:
                self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
            except Exception:
                pass

        self._deployer_key: str | None = settings.DEPLOYER_PRIVATE_KEY or None
        self._deployer_address: str | None = (
            self.w3.eth.account.from_key(self._deployer_key).address
            if self._deployer_key
            else None
        )

        # Lazy-loaded contract instances
        self._cache: dict[str, Contract] = {}

    # ── Connection check ──────────────────────────────────────────────────────

    @property
    def is_connected(self) -> bool:
        return self.w3.is_connected()

    # ── Contract accessors ────────────────────────────────────────────────────

    def _get_contract(self, name: str, address: str) -> Contract:
        if name not in self._cache:
            if not address:
                raise ValueError(
                    f"Address for {name} is not set. "
                    "Check your .env after running deploy.js."
                )
            self._cache[name] = self.w3.eth.contract(
                address=Web3.to_checksum_address(address),
                abi=_load_abi(name),
            )
        return self._cache[name]

    @property
    def usdc(self) -> Contract:
        return self._get_contract("MockUSDC", settings.MOCK_USDC_ADDRESS)

    @property
    def profile_nft(self) -> Contract:
        return self._get_contract("UserProfileNFT", settings.USER_PROFILE_NFT_ADDRESS)

    @property
    def loan_factory(self) -> Contract:
        return self._get_contract("LoanFactory", settings.LOAN_FACTORY_ADDRESS)

    @property
    def escrow(self) -> Contract:
        return self._get_contract("Escrow", settings.ESCROW_ADDRESS)

    @property
    def reputation(self) -> Contract:
        return self._get_contract("Reputation", settings.REPUTATION_ADDRESS)

    # ── Transaction helper ────────────────────────────────────────────────────

    def _send_tx(
        self,
        fn: Any,
        private_key: str | None = None,
        gas: int = 500_000,
        value: int = 0,
    ) -> TxReceipt:
        """
        Build → sign → broadcast a transaction and wait for receipt.

        Args:
            fn:          A web3 contract function call object (not yet called).
            private_key: Signer's private key. Falls back to deployer key.
            gas:         Gas limit.
            value:       ETH value to send (wei). Usually 0 for ERC20 flows.

        Returns:
            Transaction receipt dict.

        Raises:
            ValueError:          No private key available.
            ContractLogicError:  Revert from the contract.
        """
        pk = private_key or self._deployer_key
        if not pk:
            raise ValueError(
                "No private key provided and DEPLOYER_PRIVATE_KEY is not set."
            )

        account = self.w3.eth.account.from_key(pk)
        nonce = self.w3.eth.get_transaction_count(account.address, "pending")

        tx_params: dict[str, Any] = {
            "from":     account.address,
            "nonce":    nonce,
            "gas":      gas,
            "gasPrice": self.w3.eth.gas_price,
            "chainId":  settings.CHAIN_ID,
        }
        if value:
            tx_params["value"] = value

        built_tx = fn.build_transaction(tx_params)
        signed   = self.w3.eth.account.sign_transaction(built_tx, pk)
        tx_hash  = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt  = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] == 0:
            raise ContractLogicError(
                f"Transaction reverted. Hash: {tx_hash.hex()}"
            )

        log.debug("tx %s mined in block %s", tx_hash.hex(), receipt["blockNumber"])
        return receipt

    # =========================================================================
    # UserProfileNFT
    # =========================================================================

    def get_user_profile(self, wallet_address: str) -> dict:
        """
        Fetch the on-chain soulbound NFT profile for a wallet.

        Returns:
            {
                wallet_address, reputation_score, ai_credit_score,
                fraud_risk, roles (list of int)
            }

        Raises:
            ContractLogicError: if wallet is not registered.
        """
        checksum = Web3.to_checksum_address(wallet_address)
        raw = self.profile_nft.functions.getProfile(checksum).call()
        # web3.py returns structs as either a list/tuple or an AttributeDict
        if isinstance(raw, (list, tuple)):
            return {
                "wallet_address":   raw[0],
                "reputation_score": raw[1],
                "ai_credit_score":  raw[2],
                "fraud_risk":       raw[3],
                "roles":            list(raw[4]),
            }
        # AttributeDict / dict form
        return {
            "wallet_address":   raw.get("walletAddress", raw.get("wallet_address", "")),
            "reputation_score": raw.get("reputationScore", raw.get("reputation_score", 50)),
            "ai_credit_score":  raw.get("aiCreditScore", raw.get("ai_credit_score", 0)),
            "fraud_risk":       raw.get("fraudRisk", raw.get("fraud_risk", 0)),
            "roles":            list(raw.get("roles", [])),
        }

    def register_user_onchain(
        self,
        wallet_address: str,
        role_index: int,
        private_key: str,
    ) -> int | None:
        """
        Mint a soulbound NFT for the user.

        role_index: 1=BORROWER  2=LENDER  3=GUARANTOR

        Returns:
            tokenId (int) on success, None if event not found.
        """
        fn = self.profile_nft.functions.register(role_index)
        receipt = self._send_tx(fn, private_key=private_key, gas=300_000)
        logs = self.profile_nft.events.UserRegistered().process_receipt(receipt)
        return int(logs[0]["args"]["tokenId"]) if logs else None

    def update_ai_scores_onchain(
        self,
        wallet_address: str,
        ai_credit_score: int,
        fraud_risk: int,
    ) -> TxReceipt:
        """Push AI scores to the NFT. Signed by deployer (owner)."""
        fn = self.profile_nft.functions.updateAIScores(
            Web3.to_checksum_address(wallet_address),
            ai_credit_score,
            fraud_risk,
        )
        return self._send_tx(fn)

    # =========================================================================
    # LoanFactory
    # =========================================================================

    def create_loan_request(
        self,
        borrower_wallet: str,
        amount: float,
        duration: int,
        interest_rate: int,
        guarantors: list[str],
        ipfs_hash: str,
        private_key: str,
    ) -> dict:
        """
        Submit a new loan request on-chain.

        Args:
            borrower_wallet: Borrower's Ethereum address.
            amount:          Loan amount in human USDC (e.g. 1000.0).
            duration:        Loan duration in seconds.
            interest_rate:   Annual rate in basis points (e.g. 500 = 5%).
            guarantors:      List of guarantor wallet addresses.
            ipfs_hash:       IPFS CID of supporting documents.
            private_key:     Borrower's private key to sign the tx.

        Returns:
            {"chain_loan_id": int, "tx_hash": str, "status": str}
        """
        amount_raw = _to_usdc_units(amount)
        checksum_guarantors = [Web3.to_checksum_address(g) for g in guarantors]

        fn = self.loan_factory.functions.createLoanRequest(
            amount_raw,
            duration,
            interest_rate,
            checksum_guarantors,
            ipfs_hash,
        )
        receipt = self._send_tx(fn, private_key=private_key, gas=600_000)
        logs = self.loan_factory.events.LoanCreated().process_receipt(receipt)

        if not logs:
            raise RuntimeError("LoanCreated event not found in receipt")

        loan_id = int(logs[0]["args"]["loanId"])
        status  = "OPEN_FOR_LENDERS" if not guarantors else "GUARANTOR_PENDING"

        log.info("LoanCreated on-chain: id=%s borrower=%s", loan_id, borrower_wallet)
        return {
            "chain_loan_id": loan_id,
            "tx_hash":       receipt["transactionHash"].hex(),
            "status":        status,
        }

    def approve_guarantor(
        self,
        loan_id: int,
        guarantor_wallet: str,
        private_key: str,
    ) -> dict:
        """
        Guarantor approves their participation in a loan.

        Args:
            loan_id:          On-chain loan ID.
            guarantor_wallet: Guarantor's address (for logging only; tx is signed by them).
            private_key:      Guarantor's private key.

        Returns:
            {"tx_hash": str, "approved_count": int, "total_required": int}
        """
        fn = self.loan_factory.functions.approveGuarantor(loan_id)
        receipt = self._send_tx(fn, private_key=private_key, gas=200_000)
        logs = self.loan_factory.events.GuarantorApproved().process_receipt(receipt)

        result: dict[str, Any] = {"tx_hash": receipt["transactionHash"].hex()}
        if logs:
            args = logs[0]["args"]
            result["approved_count"] = int(args["approvedCount"])
            result["total_required"] = int(args["totalRequired"])
            log.info(
                "GuarantorApproved: loan=%s guarantor=%s (%s/%s)",
                loan_id, guarantor_wallet,
                result["approved_count"], result["total_required"],
            )
        return result

    def get_open_loans(self) -> list[dict]:
        """
        Return all loans currently in OPEN_FOR_LENDERS status.

        Scans from loan ID 1 to totalLoans() — suitable for local Hardhat
        where total loan count is small. For mainnet, use event indexing instead.

        Returns:
            List of loan dicts with human-readable amounts.
        """
        total = self.loan_factory.functions.totalLoans().call()
        open_loans: list[dict] = []

        for loan_id in range(1, total + 1):
            raw = self.loan_factory.functions.getLoan(loan_id).call()
            status_idx = raw[7]
            if status_idx == 1:  # OPEN_FOR_LENDERS
                open_loans.append(self._parse_loan_tuple(raw))

        return open_loans

    def get_loan_onchain(self, chain_loan_id: int) -> dict:
        """Fetch a single loan by its on-chain ID."""
        raw = self.loan_factory.functions.getLoan(chain_loan_id).call()
        return self._parse_loan_tuple(raw)

    def update_loan_documents(
        self,
        loan_id: int,
        ipfs_hash: str,
        private_key: str,
    ) -> TxReceipt:
        """Update the IPFS document hash for a loan (borrower only)."""
        fn = self.loan_factory.functions.updateDocuments(loan_id, ipfs_hash)
        return self._send_tx(fn, private_key=private_key, gas=150_000)

    # =========================================================================
    # Escrow
    # =========================================================================

    def fund_loan(
        self,
        loan_id: int,
        lender_wallet: str,
        private_key: str,
    ) -> dict:
        """
        Lender funds a loan.

        Steps performed atomically:
          1. Fetch loan amount from LoanFactory.
          2. Approve Escrow to spend that amount of USDC.
          3. Call Escrow.depositFromLender().

        Args:
            loan_id:       On-chain loan ID.
            lender_wallet: Lender's address (used for logging).
            private_key:   Lender's private key.

        Returns:
            {"tx_hash": str, "amount_usdc": float, "loan_id": int}
        """
        # 1. Get loan amount
        loan = self.get_loan_onchain(loan_id)
        amount_raw = _to_usdc_units(loan["amount"])

        # 2. Approve Escrow to pull USDC
        approve_fn = self.usdc.functions.approve(
            Web3.to_checksum_address(settings.ESCROW_ADDRESS),
            amount_raw,
        )
        self._send_tx(approve_fn, private_key=private_key, gas=100_000)
        log.debug("USDC approved: lender=%s amount=%s", lender_wallet, amount_raw)

        # 3. Deposit into Escrow
        deposit_fn = self.escrow.functions.depositFromLender(loan_id)
        receipt = self._send_tx(deposit_fn, private_key=private_key, gas=300_000)

        logs = self.escrow.events.LoanFunded().process_receipt(receipt)
        log.info("LoanFunded: loan=%s lender=%s amount=%s", loan_id, lender_wallet, amount_raw)

        return {
            "tx_hash":    receipt["transactionHash"].hex(),
            "amount_usdc": loan["amount"],
            "loan_id":    loan_id,
        }

    def release_to_borrower(self, loan_id: int) -> TxReceipt:
        """
        Platform (deployer/owner) releases escrowed funds to the borrower.
        Loan must be in READY_TO_FUND status.
        """
        fn = self.escrow.functions.releaseToBorrower(loan_id)
        receipt = self._send_tx(fn, gas=200_000)
        log.info("FundsReleased: loan=%s", loan_id)
        return receipt

    def repay_loan(
        self,
        loan_id: int,
        borrower_wallet: str,
        amount: float,
        private_key: str,
    ) -> dict:
        """
        Borrower repays a loan (principal + interest).

        Steps:
          1. Approve Escrow to pull `amount` USDC from borrower.
          2. Call Escrow.repayLoan().

        Args:
            loan_id:         On-chain loan ID.
            borrower_wallet: Borrower's address (for logging).
            amount:          Total repayment amount in human USDC.
                             Use get_total_due() to calculate the exact figure.
            private_key:     Borrower's private key.

        Returns:
            {"tx_hash": str, "amount_repaid_usdc": float}
        """
        amount_raw = _to_usdc_units(amount)

        # 1. Approve
        approve_fn = self.usdc.functions.approve(
            Web3.to_checksum_address(settings.ESCROW_ADDRESS),
            amount_raw,
        )
        self._send_tx(approve_fn, private_key=private_key, gas=100_000)

        # 2. Repay
        repay_fn = self.escrow.functions.repayLoan(loan_id)
        receipt  = self._send_tx(repay_fn, private_key=private_key, gas=400_000)

        log.info("LoanRepaid: loan=%s borrower=%s amount=%s", loan_id, borrower_wallet, amount_raw)
        return {
            "tx_hash":            receipt["transactionHash"].hex(),
            "amount_repaid_usdc": amount,
        }

    def get_total_due(self, loan_id: int) -> dict:
        """
        Calculate the exact repayment amount for a loan.

        Returns:
            {"principal": float, "interest": float, "total": float}  (human USDC)
        """
        raw = self.escrow.functions.getTotalDue(loan_id).call()
        return {
            "principal": _from_usdc_units(raw[0]),
            "interest":  _from_usdc_units(raw[1]),
            "total":     _from_usdc_units(raw[2]),
        }

    def handle_default(self, loan_id: int) -> TxReceipt:
        """Mark a loan as defaulted (owner only). Returns remaining escrow to lender."""
        fn = self.escrow.functions.handleDefault(loan_id)
        receipt = self._send_tx(fn, gas=300_000)
        log.info("LoanDefaulted: loan=%s", loan_id)
        return receipt

    def get_escrow_record(self, loan_id: int) -> dict:
        """Fetch the raw escrow record for a loan."""
        raw = self.escrow.functions.escrowRecords(loan_id).call()
        return {
            "lender":           raw[0],
            "deposited_amount": _from_usdc_units(raw[1]),
            "repaid_amount":    _from_usdc_units(raw[2]),
            "start_time":       raw[3],
            "released":         raw[4],
            "repaid":           raw[5],
        }

    # =========================================================================
    # MockUSDC helpers
    # =========================================================================

    def get_usdc_balance(self, wallet_address: str) -> float:
        """Return USDC balance in human units."""
        raw = self.usdc.functions.balanceOf(
            Web3.to_checksum_address(wallet_address)
        ).call()
        return _from_usdc_units(raw)

    def approve_usdc(
        self,
        spender: str,
        amount: float,
        private_key: str,
    ) -> TxReceipt:
        """Approve a spender to pull USDC. Useful for frontend pre-approval flows."""
        fn = self.usdc.functions.approve(
            Web3.to_checksum_address(spender),
            _to_usdc_units(amount),
        )
        return self._send_tx(fn, private_key=private_key, gas=100_000)

    # =========================================================================
    # Reputation
    # =========================================================================

    def get_reputation_score(self, wallet_address: str) -> int:
        return self.reputation.functions.getScore(
            Web3.to_checksum_address(wallet_address)
        ).call()

    # =========================================================================
    # Event fetching (pull-based, for REST endpoints)
    # =========================================================================

    def get_recent_loan_events(self, from_block: int = 0) -> list[dict]:
        """
        Pull all loan lifecycle events from the chain since `from_block`.

        Events fetched:
          LoanFactory: LoanCreated, GuarantorApproved, LoanOpenedForFunding,
                       LoanActivated, LoanRepaid, LoanDefaulted
          Escrow:      LoanFunded, LoanRepaymentReceived, LoanMarkedDefaulted

        Returns:
            List of event dicts sorted by block number.
        """
        events: list[dict] = []

        factory_event_classes = [
            self.loan_factory.events.LoanCreated,
            self.loan_factory.events.GuarantorApproved,
            self.loan_factory.events.LoanOpenedForFunding,
            self.loan_factory.events.LoanActivated,
            self.loan_factory.events.LoanRepaid,
            self.loan_factory.events.LoanDefaulted,
        ]
        escrow_event_classes = [
            self.escrow.events.LoanFunded,
            self.escrow.events.LoanRepaymentReceived,
            self.escrow.events.LoanMarkedDefaulted,
        ]

        for cls in factory_event_classes + escrow_event_classes:
            try:
                logs = cls().get_logs(fromBlock=from_block)
                for log_entry in logs:
                    args = dict(log_entry["args"])
                    # Normalise amount fields to human USDC
                    for key in ("amount", "totalRepaid", "depositedAmount"):
                        if key in args and isinstance(args[key], int):
                            args[key] = _from_usdc_units(args[key])
                    events.append({
                        "event":   cls.event_name,
                        "loan_id": args.get("loanId"),
                        "block":   log_entry["blockNumber"],
                        "tx_hash": log_entry["transactionHash"].hex(),
                        "args":    args,
                    })
            except Exception as exc:
                log.warning("Failed to fetch %s events: %s", cls.event_name, exc)

        return sorted(events, key=lambda e: e["block"])

    # =========================================================================
    # Internal helpers
    # =========================================================================

    def _parse_loan_tuple(self, raw: tuple) -> dict:
        """
        Convert the raw tuple returned by LoanFactory.getLoan() into a dict.

        Solidity struct order:
          0: id, 1: borrower, 2: amount, 3: duration, 4: interestRate,
          5: guarantors[], 6: approvedGuarantors[], 7: status, 8: ipfsHash
        """
        return {
            "chain_loan_id":      int(raw[0]),
            "borrower":           raw[1],
            "amount":             _from_usdc_units(raw[2]),
            "duration_seconds":   int(raw[3]),
            "interest_rate_bps":  int(raw[4]),
            "guarantors":         list(raw[5]),
            "approved_guarantors": list(raw[6]),
            "status":             _CHAIN_STATUS_MAP.get(raw[7], str(raw[7])),
            "ipfs_hash":          raw[8],
        }


# ── Module-level singleton ────────────────────────────────────────────────────
blockchain_service = BlockchainService()
