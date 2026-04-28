// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title LoanFactory
 * @notice Creates and manages loan requests through their lifecycle.
 *
 * Loan lifecycle:
 *   createLoanRequest()  → GUARANTOR_PENDING
 *   approveGuarantor()   → GUARANTOR_PENDING (until all approved) → OPEN_FOR_LENDERS
 *   openLoanForFunding() → OPEN_FOR_LENDERS  (manual override by borrower)
 *   Escrow.depositFromLender() calls markReadyToFund() → READY_TO_FUND
 *   Escrow.releaseToBorrower() calls markActive()      → ACTIVE
 *   Escrow.repayLoan()         calls markRepaid()      → REPAID
 *   Escrow.handleDefault()     calls markDefaulted()   → DEFAULTED
 */
contract LoanFactory is Ownable, ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum LoanStatus {
        GUARANTOR_PENDING,
        OPEN_FOR_LENDERS,
        READY_TO_FUND,
        ACTIVE,
        REPAID,
        DEFAULTED
    }

    struct LoanRequest {
        uint256     id;
        address     borrower;
        uint256     amount;        // in token smallest unit (e.g. USDC 6 decimals)
        uint256     duration;      // in seconds
        uint256     interestRate;  // basis points (e.g. 500 = 5%)
        address[]   guarantors;
        address[]   approvedGuarantors;
        LoanStatus  status;
        string      ipfsHash;      // IPFS CID for loan documents
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _nextLoanId;

    /// loanId → LoanRequest
    mapping(uint256 => LoanRequest) public loanRequests;
    /// borrower → list of their loan IDs
    mapping(address => uint256[]) public borrowerLoans;
    /// loanId → guarantor → approved
    mapping(uint256 => mapping(address => bool)) public guarantorApproved;

    /// Address of the Escrow contract (set after deployment)
    address public escrow;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 duration,
        uint256 interestRate,
        address[] guarantors,
        string ipfsHash
    );

    event GuarantorApproved(
        uint256 indexed loanId,
        address indexed guarantor,
        uint256 approvedCount,
        uint256 totalRequired
    );

    event LoanOpenedForFunding(uint256 indexed loanId);
    event LoanReadyToFund(uint256 indexed loanId);
    event LoanActivated(uint256 indexed loanId);
    event LoanRepaid(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId);
    event DocumentsUpdated(uint256 indexed loanId, string newIpfsHash);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotBorrower(uint256 loanId, address caller);
    error NotGuarantor(uint256 loanId, address caller);
    error AlreadyApproved(uint256 loanId, address guarantor);
    error InvalidStatus(uint256 loanId, LoanStatus current, LoanStatus required);
    error NotEscrow();
    error ZeroAmount();
    error ZeroDuration();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    modifier onlyBorrower(uint256 loanId) {
        if (loanRequests[loanId].borrower != msg.sender) revert NotBorrower(loanId, msg.sender);
        _;
    }

    modifier inStatus(uint256 loanId, LoanStatus required) {
        LoanStatus current = loanRequests[loanId].status;
        if (current != required) revert InvalidStatus(loanId, current, required);
        _;
    }

    // ─── Setup ────────────────────────────────────────────────────────────────

    /// @notice Link the Escrow contract. Called once after deployment.
    function setEscrow(address _escrow) external onlyOwner {
        escrow = _escrow;
    }

    // ─── External ─────────────────────────────────────────────────────────────

    /**
     * @notice Borrower creates a new loan request.
     * @param amount       Loan amount in token units.
     * @param duration     Loan duration in seconds.
     * @param interestRate Annual interest rate in basis points.
     * @param guarantors   List of guarantor wallet addresses (can be empty).
     * @param ipfsHash     IPFS CID of supporting documents.
     */
    function createLoanRequest(
        uint256   amount,
        uint256   duration,
        uint256   interestRate,
        address[] calldata guarantors,
        string    calldata ipfsHash
    ) external nonReentrant returns (uint256 loanId) {
        if (amount == 0)   revert ZeroAmount();
        if (duration == 0) revert ZeroDuration();

        _nextLoanId++;
        loanId = _nextLoanId;

        LoanRequest storage req = loanRequests[loanId];
        req.id           = loanId;
        req.borrower     = msg.sender;
        req.amount       = amount;
        req.duration     = duration;
        req.interestRate = interestRate;
        req.ipfsHash     = ipfsHash;
        req.status       = LoanStatus.GUARANTOR_PENDING;

        for (uint256 i = 0; i < guarantors.length; i++) {
            req.guarantors.push(guarantors[i]);
        }

        borrowerLoans[msg.sender].push(loanId);

        emit LoanCreated(loanId, msg.sender, amount, duration, interestRate, guarantors, ipfsHash);

        // If no guarantors required, move straight to open
        if (guarantors.length == 0) {
            req.status = LoanStatus.OPEN_FOR_LENDERS;
            emit LoanOpenedForFunding(loanId);
        }
    }

    /**
     * @notice A listed guarantor approves their participation.
     *         Once all guarantors approve, status moves to OPEN_FOR_LENDERS.
     */
    function approveGuarantor(uint256 loanId)
        external
        inStatus(loanId, LoanStatus.GUARANTOR_PENDING)
    {
        LoanRequest storage req = loanRequests[loanId];

        // Verify caller is a listed guarantor
        bool isGuarantor = false;
        for (uint256 i = 0; i < req.guarantors.length; i++) {
            if (req.guarantors[i] == msg.sender) { isGuarantor = true; break; }
        }
        if (!isGuarantor) revert NotGuarantor(loanId, msg.sender);
        if (guarantorApproved[loanId][msg.sender]) revert AlreadyApproved(loanId, msg.sender);

        guarantorApproved[loanId][msg.sender] = true;
        req.approvedGuarantors.push(msg.sender);

        emit GuarantorApproved(loanId, msg.sender, req.approvedGuarantors.length, req.guarantors.length);

        // All guarantors approved → open for lenders
        if (req.approvedGuarantors.length == req.guarantors.length) {
            req.status = LoanStatus.OPEN_FOR_LENDERS;
            emit LoanOpenedForFunding(loanId);
        }
    }

    /**
     * @notice Borrower can manually open the loan for funding
     *         (e.g. after partial guarantor approval or no guarantors).
     */
    function openLoanForFunding(uint256 loanId)
        external
        onlyBorrower(loanId)
        inStatus(loanId, LoanStatus.GUARANTOR_PENDING)
    {
        loanRequests[loanId].status = LoanStatus.OPEN_FOR_LENDERS;
        emit LoanOpenedForFunding(loanId);
    }

    /**
     * @notice Update IPFS document hash (borrower only, before loan is active).
     */
    function updateDocuments(uint256 loanId, string calldata newIpfsHash)
        external
        onlyBorrower(loanId)
    {
        LoanStatus s = loanRequests[loanId].status;
        require(
            s == LoanStatus.GUARANTOR_PENDING || s == LoanStatus.OPEN_FOR_LENDERS,
            "Cannot update after funding"
        );
        loanRequests[loanId].ipfsHash = newIpfsHash;
        emit DocumentsUpdated(loanId, newIpfsHash);
    }

    // ─── Escrow callbacks ─────────────────────────────────────────────────────

    function markReadyToFund(uint256 loanId) external onlyEscrow {
        loanRequests[loanId].status = LoanStatus.READY_TO_FUND;
        emit LoanReadyToFund(loanId);
    }

    function markActive(uint256 loanId) external onlyEscrow {
        loanRequests[loanId].status = LoanStatus.ACTIVE;
        emit LoanActivated(loanId);
    }

    function markRepaid(uint256 loanId) external onlyEscrow {
        loanRequests[loanId].status = LoanStatus.REPAID;
        emit LoanRepaid(loanId);
    }

    function markDefaulted(uint256 loanId) external onlyEscrow {
        loanRequests[loanId].status = LoanStatus.DEFAULTED;
        emit LoanDefaulted(loanId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getLoan(uint256 loanId) external view returns (LoanRequest memory) {
        return loanRequests[loanId];
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function totalLoans() external view returns (uint256) {
        return _nextLoanId;
    }
}
