// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./LoanFactory.sol";
import "./Reputation.sol";

/**
 * @title Escrow
 * @notice Holds loan funds and orchestrates the full funding → repayment flow.
 *
 * Flow:
 *   1. depositFromLender()   – lender deposits exact loan amount → READY_TO_FUND
 *   2. releaseToBorrower()   – owner/platform releases funds to borrower → ACTIVE
 *   3. repayLoan()           – borrower repays principal + interest → REPAID
 *   4. distributeInterest()  – splits interest between lender and guarantors
 *   5. handleDefault()       – owner marks loan defaulted → DEFAULTED
 */
contract Escrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20      public immutable usdc;
    LoanFactory public immutable loanFactory;
    Reputation  public reputation;

    struct EscrowRecord {
        address lender;
        uint256 depositedAmount;
        uint256 repaidAmount;
        uint256 startTime;
        bool    released;
        bool    repaid;
    }

    /// loanId → escrow record
    mapping(uint256 => EscrowRecord) public escrowRecords;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 amount);
    event FundsReleasedToBorrower(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanRepaymentReceived(uint256 indexed loanId, address indexed borrower, uint256 totalRepaid);
    event InterestDistributed(uint256 indexed loanId, address indexed lender, uint256 lenderShare, uint256 guarantorShare);
    event LoanMarkedDefaulted(uint256 indexed loanId);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error WrongLoanStatus(uint256 loanId);
    error AlreadyFunded(uint256 loanId);
    error AlreadyReleased(uint256 loanId);
    error AlreadyRepaid(uint256 loanId);
    error IncorrectRepayAmount(uint256 expected, uint256 provided);
    error NotBorrower(uint256 loanId);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _loanFactory) {
        usdc        = IERC20(_usdc);
        loanFactory = LoanFactory(_loanFactory);
    }

    /// @notice Link Reputation contract after deployment.
    function setReputation(address _reputation) external onlyOwner {
        reputation = Reputation(_reputation);
    }

    // ─── External ─────────────────────────────────────────────────────────────

    /**
     * @notice Lender deposits the exact loan amount into escrow.
     *         Loan must be in OPEN_FOR_LENDERS status.
     *         Caller must have approved this contract for `amount` USDC.
     */
    function depositFromLender(uint256 loanId) external nonReentrant {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);

        if (req.status != LoanFactory.LoanStatus.OPEN_FOR_LENDERS)
            revert WrongLoanStatus(loanId);
        if (escrowRecords[loanId].lender != address(0))
            revert AlreadyFunded(loanId);

        usdc.safeTransferFrom(msg.sender, address(this), req.amount);

        escrowRecords[loanId] = EscrowRecord({
            lender:          msg.sender,
            depositedAmount: req.amount,
            repaidAmount:    0,
            startTime:       0,
            released:        false,
            repaid:          false
        });

        loanFactory.markReadyToFund(loanId);

        emit LoanFunded(loanId, msg.sender, req.amount);
    }

    /**
     * @notice Platform releases escrowed funds to the borrower.
     *         Loan must be in READY_TO_FUND status.
     */
    function releaseToBorrower(uint256 loanId) external onlyOwner nonReentrant {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);
        EscrowRecord storage rec = escrowRecords[loanId];

        if (req.status != LoanFactory.LoanStatus.READY_TO_FUND)
            revert WrongLoanStatus(loanId);
        if (rec.released) revert AlreadyReleased(loanId);

        rec.released  = true;
        rec.startTime = block.timestamp;

        usdc.safeTransfer(req.borrower, rec.depositedAmount);
        loanFactory.markActive(loanId);

        emit FundsReleasedToBorrower(loanId, req.borrower, rec.depositedAmount);
    }

    /**
     * @notice Borrower repays principal + interest.
     *         Total due = principal + (principal * interestRate * duration) / (10000 * 365 days)
     *         Caller must have approved this contract for `totalDue` USDC.
     */
    function repayLoan(uint256 loanId) external nonReentrant {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);
        EscrowRecord storage rec = escrowRecords[loanId];

        if (req.status != LoanFactory.LoanStatus.ACTIVE)
            revert WrongLoanStatus(loanId);
        if (msg.sender != req.borrower)
            revert NotBorrower(loanId);
        if (rec.repaid) revert AlreadyRepaid(loanId);

        uint256 interest  = _calculateInterest(rec.depositedAmount, req.interestRate, req.duration);
        uint256 totalDue  = rec.depositedAmount + interest;

        usdc.safeTransferFrom(msg.sender, address(this), totalDue);

        rec.repaid       = true;
        rec.repaidAmount = totalDue;

        loanFactory.markRepaid(loanId);

        // Update reputation
        if (address(reputation) != address(0)) {
            reputation.recordRepayment(req.borrower);
        }

        emit LoanRepaymentReceived(loanId, req.borrower, totalDue);

        // Distribute immediately
        _distributeInterest(loanId, req, rec, interest);
    }

    /**
     * @notice Distribute interest: 80% to lender, 20% split among guarantors.
     *         Can also be called manually by owner after repayment.
     */
    function distributeInterest(uint256 loanId) external onlyOwner nonReentrant {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);
        EscrowRecord storage rec = escrowRecords[loanId];

        require(rec.repaid, "Loan not yet repaid");

        uint256 interest = _calculateInterest(rec.depositedAmount, req.interestRate, req.duration);
        _distributeInterest(loanId, req, rec, interest);
    }

    /**
     * @notice Mark a loan as defaulted. Releases remaining escrow to lender.
     */
    function handleDefault(uint256 loanId) external onlyOwner nonReentrant {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);
        EscrowRecord storage rec = escrowRecords[loanId];

        if (req.status != LoanFactory.LoanStatus.ACTIVE)
            revert WrongLoanStatus(loanId);

        loanFactory.markDefaulted(loanId);

        // Update reputation
        if (address(reputation) != address(0)) {
            reputation.recordDefault(req.borrower);
        }

        // Return whatever is still in escrow to the lender
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0 && rec.lender != address(0)) {
            usdc.safeTransfer(rec.lender, balance);
        }

        emit LoanMarkedDefaulted(loanId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Calculate total repayment amount for a loan.
     */
    function getTotalDue(uint256 loanId) external view returns (uint256 principal, uint256 interest, uint256 total) {
        LoanFactory.LoanRequest memory req = loanFactory.getLoan(loanId);
        EscrowRecord memory rec = escrowRecords[loanId];
        principal = rec.depositedAmount;
        interest  = _calculateInterest(principal, req.interestRate, req.duration);
        total     = principal + interest;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Simple interest: principal * rate * duration / (10000 * 365 days)
     */
    function _calculateInterest(
        uint256 principal,
        uint256 rateBps,
        uint256 durationSeconds
    ) internal pure returns (uint256) {
        return (principal * rateBps * durationSeconds) / (10_000 * 365 days);
    }

    function _distributeInterest(
        uint256 loanId,
        LoanFactory.LoanRequest memory req,
        EscrowRecord storage rec,
        uint256 interest
    ) internal {
        // 80% to lender (principal already returned via repayLoan transfer)
        uint256 lenderInterest    = (interest * 80) / 100;
        uint256 guarantorInterest = interest - lenderInterest;

        usdc.safeTransfer(rec.lender, rec.depositedAmount + lenderInterest);

        // Split guarantor share equally
        if (req.approvedGuarantors.length > 0 && guarantorInterest > 0) {
            uint256 perGuarantor = guarantorInterest / req.approvedGuarantors.length;
            for (uint256 i = 0; i < req.approvedGuarantors.length; i++) {
                usdc.safeTransfer(req.approvedGuarantors[i], perGuarantor);
            }
        } else if (guarantorInterest > 0) {
            // No guarantors: extra goes to lender
            usdc.safeTransfer(rec.lender, guarantorInterest);
        }

        emit InterestDistributed(loanId, rec.lender, lenderInterest, guarantorInterest);
    }
}
