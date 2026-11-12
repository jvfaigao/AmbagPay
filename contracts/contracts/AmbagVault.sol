// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AmbagVault
/// @notice Transparent student contributions ("ambagan") for one student org.
///         Members pay into collections, an AI Treasurer Agent proposes expenses,
///         and this contract enforces budget caps and approval levels.
///         The agent can only propose: it can make the rules stricter, never looser.
contract AmbagVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");         // org president
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE"); // first approval
    bytes32 public constant ADVISER_ROLE = keccak256("ADVISER_ROLE");     // second approval
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");         // AI backend: propose only

    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────

    enum CollectionStatus { Open, Closed }
    enum Risk { LOW, MEDIUM, HIGH }
    enum ExpenseStatus { Proposed, Executed, Rejected }

    struct Collection {
        string name;              // e.g. "Org Fee 1st Sem"
        uint256 amountPerMember;  // e.g. 150e18 = ₱150
        uint64 deadline;          // informational; payments allowed while Open
        CollectionStatus status;
        uint256 totalCollected;
        uint256 totalSpent;
        uint32 payerCount;
        uint32 pendingCount;      // proposals not yet executed or rejected
        uint256 refundPerMember;  // set when the collection closes
    }

    struct Category {
        string name;              // e.g. "Printing"
        uint256 cap;              // e.g. 2000e18 = ₱2,000
        uint256 spent;
    }

    struct Expense {
        uint256 collectionId;
        uint8 categoryIndex;
        uint256 amount;
        address payee;
        bytes32 receiptHash;      // keccak256 of the receipt file
        string receiptURI;        // link to the receipt (e.g. BNB Greenfield)
        Risk risk;
        ExpenseStatus status;
        bool treasurerApproved;
        bool adviserApproved;
        address proposer;
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    IERC20 public immutable token;
    uint256 public immutable adviserThreshold; // above this, adviser approval is required

    uint8 public constant MAX_CATEGORIES = 20;

    Collection[] private _collections;
    mapping(uint256 => Category[]) private _categories;
    Expense[] private _expenses;

    mapping(uint256 => mapping(address => bool)) public hasPaid;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(bytes32 => bool) public receiptInUse;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    event CollectionCreated(uint256 indexed id, string name, uint256 amountPerMember, uint64 deadline);
    event Paid(uint256 indexed collectionId, address indexed member, uint256 amount);
    event ExpenseProposed(
        uint256 indexed expenseId,
        uint256 indexed collectionId,
        uint256 amount,
        Risk risk,
        bytes32 receiptHash,
        string receiptURI,
        address indexed proposer
    );
    event ExpenseApproved(uint256 indexed expenseId, address indexed by, bytes32 role);
    event ExpenseExecuted(uint256 indexed expenseId, address indexed payee, uint256 amount);
    event ExpenseRejected(uint256 indexed expenseId, address indexed by, string reason);
    event CollectionClosed(uint256 indexed id, uint256 leftover, uint256 refundPerMember);
    event RefundClaimed(uint256 indexed collectionId, address indexed member, uint256 amount);

    // ─────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────

    error InvalidInput();
    error CollectionNotFound();
    error ExpenseNotFound();
    error InvalidCategory();
    error NotOpen();
    error NotClosed();
    error AlreadyPaid();
    error NotProposer();
    error NotApprover();
    error ReceiptAlreadyUsed(bytes32 receiptHash);
    error OverBudget(uint256 remaining, uint256 requested);
    error InsufficientFunds(uint256 available, uint256 requested);
    error NotProposed();
    error AlreadyApproved();
    error NotApproved();
    error AdviserRequired();
    error PendingExpenses(uint32 pending);
    error NothingToClaim();

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────

    /// @param token_ The stablecoin used for contributions (tPHP in the demo).
    /// @param adviserThreshold_ Amount above which adviser approval is required (e.g. 1000e18).
    /// @param admin The org president's wallet.
    constructor(IERC20 token_, uint256 adviserThreshold_, address admin) {
        if (address(token_) == address(0) || admin == address(0)) revert InvalidInput();
        token = token_;
        adviserThreshold = adviserThreshold_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        // The president (ADMIN_ROLE) assigns the treasurer, adviser and agent.
        _setRoleAdmin(TREASURER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ADVISER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(AGENT_ROLE, ADMIN_ROLE);
    }

    // ─────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────

    /// @notice Create a new collection with a budget per category.
    function createCollection(
        string calldata name,
        uint256 amountPerMember,
        uint64 deadline,
        string[] calldata categoryNames,
        uint256[] calldata caps
    ) external onlyRole(ADMIN_ROLE) returns (uint256 id) {
        uint256 count = categoryNames.length;
        if (
            bytes(name).length == 0 ||
            amountPerMember == 0 ||
            count == 0 ||
            count > MAX_CATEGORIES ||
            count != caps.length
        ) revert InvalidInput();

        id = _collections.length;
        Collection storage c = _collections.push();
        c.name = name;
        c.amountPerMember = amountPerMember;
        c.deadline = deadline;
        c.status = CollectionStatus.Open;

        for (uint256 i = 0; i < count; i++) {
            if (bytes(categoryNames[i]).length == 0) revert InvalidInput();
            _categories[id].push(Category({name: categoryNames[i], cap: caps[i], spent: 0}));
        }

        emit CollectionCreated(id, name, amountPerMember, deadline);
    }

    /// @notice Close a collection and open refunds of the leftover.
    function closeCollection(uint256 collectionId) external onlyRole(ADMIN_ROLE) {
        Collection storage c = _getCollection(collectionId);
        if (c.status != CollectionStatus.Open) revert NotOpen();
        if (c.pendingCount != 0) revert PendingExpenses(c.pendingCount);

        c.status = CollectionStatus.Closed;
        uint256 leftover = c.totalCollected - c.totalSpent;
        if (c.payerCount > 0) {
            c.refundPerMember = leftover / c.payerCount;
        }

        emit CollectionClosed(collectionId, leftover, c.refundPerMember);
    }

    // ─────────────────────────────────────────────────────────────
    // Members
    // ─────────────────────────────────────────────────────────────

    /// @notice Pay a collection. Requires a prior token approve().
    function pay(uint256 collectionId) external nonReentrant {
        _pay(collectionId, msg.sender);
    }

    /// @notice Pay in one transaction using an EIP-2612 permit signature.
    function payWithPermit(
        uint256 collectionId,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Collection storage c = _getCollection(collectionId);
        // try/catch: if someone front-runs the same permit, the allowance is already set
        // and the payment below still succeeds.
        try IERC20Permit(address(token)).permit(
            msg.sender, address(this), c.amountPerMember, permitDeadline, v, r, s
        ) {} catch {}
        _pay(collectionId, msg.sender);
    }

    /// @notice Claim your share of the leftover after a collection closes.
    function claimRefund(uint256 collectionId) external nonReentrant {
        Collection storage c = _getCollection(collectionId);
        if (c.status != CollectionStatus.Closed) revert NotClosed();
        if (!hasPaid[collectionId][msg.sender] || hasClaimed[collectionId][msg.sender] || c.refundPerMember == 0) {
            revert NothingToClaim();
        }

        hasClaimed[collectionId][msg.sender] = true;
        token.safeTransfer(msg.sender, c.refundPerMember);

        emit RefundClaimed(collectionId, msg.sender, c.refundPerMember);
    }

    // ─────────────────────────────────────────────────────────────
    // Expenses
    // ─────────────────────────────────────────────────────────────

    /// @notice Propose an expense. Called by the AI agent, or by the treasurer as a fallback.
    /// @dev A treasurer's manual proposal is always HIGH risk (adviser required),
    ///      and counts as the treasurer's approval.
    function proposeExpense(
        uint256 collectionId,
        uint8 categoryIndex,
        uint256 amount,
        address payee,
        bytes32 receiptHash,
        string calldata receiptURI,
        Risk risk
    ) external returns (uint256 expenseId) {
        bool isAgent = hasRole(AGENT_ROLE, msg.sender);
        if (!isAgent && !hasRole(TREASURER_ROLE, msg.sender)) revert NotProposer();
        if (payee == address(0) || receiptHash == bytes32(0)) revert InvalidInput();
        if (receiptInUse[receiptHash]) revert ReceiptAlreadyUsed(receiptHash);

        _checkSpend(collectionId, categoryIndex, amount);

        receiptInUse[receiptHash] = true;
        _collections[collectionId].pendingCount += 1;

        expenseId = _expenses.length;
        Expense storage e = _expenses.push();
        e.collectionId = collectionId;
        e.categoryIndex = categoryIndex;
        e.amount = amount;
        e.payee = payee;
        e.receiptHash = receiptHash;
        e.receiptURI = receiptURI;
        e.risk = isAgent ? risk : Risk.HIGH; // manual proposal = always HIGH risk
        e.status = ExpenseStatus.Proposed;
        e.treasurerApproved = !isAgent;      // manual proposal = treasurer already approved
        e.proposer = msg.sender;

        emit ExpenseProposed(expenseId, collectionId, amount, e.risk, receiptHash, receiptURI, msg.sender);
    }

    /// @notice Approve an expense as treasurer or adviser.
    function approveExpense(uint256 expenseId) external {
        Expense storage e = _getExpense(expenseId);
        if (e.status != ExpenseStatus.Proposed) revert NotProposed();

        if (hasRole(ADVISER_ROLE, msg.sender)) {
            if (e.adviserApproved) revert AlreadyApproved();
            e.adviserApproved = true;
            emit ExpenseApproved(expenseId, msg.sender, ADVISER_ROLE);
        } else if (hasRole(TREASURER_ROLE, msg.sender)) {
            if (e.treasurerApproved) revert AlreadyApproved();
            e.treasurerApproved = true;
            emit ExpenseApproved(expenseId, msg.sender, TREASURER_ROLE);
        } else {
            revert NotApprover();
        }
    }

    /// @notice Release the money once every required approval is in. Anyone can call it.
    function executeExpense(uint256 expenseId) external nonReentrant {
        Expense storage e = _getExpense(expenseId);
        if (e.status != ExpenseStatus.Proposed) revert NotProposed();
        if (!e.treasurerApproved) revert NotApproved();
        if (_needsAdviser(e) && !e.adviserApproved) revert AdviserRequired();

        Collection storage c = _collections[e.collectionId];
        Category storage cat = _categories[e.collectionId][e.categoryIndex];

        // Re-check: another expense may have been executed since this was proposed.
        if (cat.spent + e.amount > cat.cap) revert OverBudget(cat.cap - cat.spent, e.amount);
        uint256 available = c.totalCollected - c.totalSpent;
        if (e.amount > available) revert InsufficientFunds(available, e.amount);

        e.status = ExpenseStatus.Executed;
        cat.spent += e.amount;
        c.totalSpent += e.amount;
        c.pendingCount -= 1;

        token.safeTransfer(e.payee, e.amount);

        emit ExpenseExecuted(expenseId, e.payee, e.amount);
    }

    /// @notice Reject an expense. Its receipt is released so it can be proposed again if corrected.
    function rejectExpense(uint256 expenseId, string calldata reason) external {
        if (!hasRole(TREASURER_ROLE, msg.sender) && !hasRole(ADVISER_ROLE, msg.sender)) revert NotApprover();

        Expense storage e = _getExpense(expenseId);
        if (e.status != ExpenseStatus.Proposed) revert NotProposed();

        e.status = ExpenseStatus.Rejected;
        receiptInUse[e.receiptHash] = false;
        _collections[e.collectionId].pendingCount -= 1;

        emit ExpenseRejected(expenseId, msg.sender, reason);
    }

    // ─────────────────────────────────────────────────────────────
    // Views (for the dashboard)
    // ─────────────────────────────────────────────────────────────

    function collectionCount() external view returns (uint256) {
        return _collections.length;
    }

    function expenseCount() external view returns (uint256) {
        return _expenses.length;
    }

    function getCollection(uint256 collectionId) external view returns (Collection memory) {
        return _getCollectionView(collectionId);
    }

    function getCategories(uint256 collectionId) external view returns (Category[] memory) {
        _getCollectionView(collectionId);
        return _categories[collectionId];
    }

    function getExpense(uint256 expenseId) external view returns (Expense memory) {
        if (expenseId >= _expenses.length) revert ExpenseNotFound();
        return _expenses[expenseId];
    }

    function needsAdviser(uint256 expenseId) external view returns (bool) {
        if (expenseId >= _expenses.length) revert ExpenseNotFound();
        return _needsAdviser(_expenses[expenseId]);
    }

    function availableBalance(uint256 collectionId) external view returns (uint256) {
        Collection memory c = _getCollectionView(collectionId);
        return c.totalCollected - c.totalSpent;
    }

    // ─────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────

    function _pay(uint256 collectionId, address member) internal {
        Collection storage c = _getCollection(collectionId);
        if (c.status != CollectionStatus.Open) revert NotOpen();
        if (hasPaid[collectionId][member]) revert AlreadyPaid();

        hasPaid[collectionId][member] = true;
        c.payerCount += 1;
        c.totalCollected += c.amountPerMember;

        token.safeTransferFrom(member, address(this), c.amountPerMember);

        emit Paid(collectionId, member, c.amountPerMember);
    }

    /// @dev Shared checks for a new expense: open collection, valid category, within cap and balance.
    function _checkSpend(uint256 collectionId, uint8 categoryIndex, uint256 amount) internal view {
        Collection storage c = _getCollection(collectionId);
        if (c.status != CollectionStatus.Open) revert NotOpen();
        if (amount == 0) revert InvalidInput();
        if (categoryIndex >= _categories[collectionId].length) revert InvalidCategory();

        Category storage cat = _categories[collectionId][categoryIndex];
        if (cat.spent + amount > cat.cap) revert OverBudget(cat.cap - cat.spent, amount);

        uint256 available = c.totalCollected - c.totalSpent;
        if (amount > available) revert InsufficientFunds(available, amount);
    }

    function _needsAdviser(Expense storage e) internal view returns (bool) {
        return e.amount > adviserThreshold || e.risk == Risk.HIGH;
    }

    function _getCollection(uint256 collectionId) internal view returns (Collection storage) {
        if (collectionId >= _collections.length) revert CollectionNotFound();
        return _collections[collectionId];
    }

    function _getCollectionView(uint256 collectionId) internal view returns (Collection memory) {
        if (collectionId >= _collections.length) revert CollectionNotFound();
        return _collections[collectionId];
    }

    function _getExpense(uint256 expenseId) internal view returns (Expense storage) {
        if (expenseId >= _expenses.length) revert ExpenseNotFound();
        return _expenses[expenseId];
    }
}
