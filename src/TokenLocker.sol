// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TokenLocker
/// @notice Unicrypt-style locker for any standard ERC20 (plain tokens or LP pair tokens).
///
/// Roles per lock:
///  - `owner`      can top up, extend, split, and transfer the lock.
///  - `withdrawer` can pull tokens out once `unlockDate` has passed, and can
///                 reassign the withdrawer role.
///
/// Trust assumptions (read before locking on behalf of another party):
///  - The lock owner can extend `unlockDate` indefinitely. A withdrawer who is
///    not also the owner must trust the owner not to do this.
///  - The withdrawer role can only be changed by the current withdrawer. A
///    lock created with a wrong withdrawer address cannot be recovered.
///  - Tokens are recorded by the amount actually received, so fee-on-transfer
///    tokens work. Rebasing / elastic-supply tokens are NOT supported: balance
///    changes that happen outside a transfer are not tracked and may be
///    stranded or cause withdrawals to fail.
///  - The contract owner can only change the fee and the fee receiver. It has
///    no path to locked tokens.
contract TokenLocker is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Types ----------

    struct Lock {
        uint256 id;
        address token; // ERC20 or LP token address
        address owner; // can top up / extend / transfer / split the lock
        address withdrawer; // can withdraw once unlocked, can reassign this role
        uint256 amount; // remaining locked amount (as received by this contract)
        uint256 lockDate; // creation timestamp
        uint256 unlockDate; // when it becomes withdrawable
    }

    // ---------- Errors ----------

    error ZeroAmount();
    error ZeroAddress();
    error UnlockInPast();
    error WrongFee(uint256 sent, uint256 required);
    error NotLockOwner();
    error NotWithdrawer();
    error StillLocked();
    error LockMatured();
    error MustExtendForward();
    error InsufficientLockBalance();
    error InvalidSplitAmount();
    error NothingReceived();
    error NoFeesToClaim();
    error FeeTransferFailed();
    error NotFeeReceiver();

    // ---------- Storage ----------

    uint256 public nextLockId = 1;

    /// lockId => Lock. A lock with owner == address(0) does not exist.
    mapping(uint256 => Lock) public locks;

    /// token => lockIds (append only; a lock never changes token)
    mapping(address => uint256[]) private tokenLocks;

    /// user => lockIds the user currently owns
    mapping(address => uint256[]) private userLocks;

    /// lockId => (index in userLocks[owner]) + 1. Zero means not indexed.
    mapping(uint256 => uint256) private userLockIndex;

    /// Flat native-coin fee charged per lock creation. Must be sent exactly. Set to 0 to disable.
    /// Arc's native gas coin is USDC with 18 on-chain decimals, so 10 ether == 10 USDC.
    uint256 public lockFee = 10 ether;

    /// Address allowed to claim accumulated fees.
    address public feeReceiver;

    /// Fees collected but not yet claimed (pull-payment, so a misbehaving receiver cannot block locking).
    uint256 public pendingFees;

    // ---------- Events ----------

    event LockCreated(
        uint256 indexed lockId,
        address indexed token,
        address indexed owner,
        address withdrawer,
        uint256 amount,
        uint256 unlockDate
    );
    event LockWithdrawn(uint256 indexed lockId, address indexed withdrawer, uint256 amount);
    event LockExtended(uint256 indexed lockId, uint256 newUnlockDate);
    event LockOwnershipTransferred(uint256 indexed lockId, address indexed oldOwner, address indexed newOwner);
    event WithdrawerUpdated(uint256 indexed lockId, address indexed oldWithdrawer, address indexed newWithdrawer);
    event LockSplit(uint256 indexed originalLockId, uint256 indexed newLockId, uint256 amount);
    event LockIncremented(uint256 indexed lockId, uint256 amountAdded);
    event FeeUpdated(uint256 newFee);
    event FeeReceiverUpdated(address indexed newReceiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    // ---------- Constructor ----------

    /// @param _feeReceiver Treasury for lock fees. Pass address(0) to use the deployer.
    constructor(address _feeReceiver) Ownable(msg.sender) {
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ---------- Core actions ----------

    /// @notice Lock `amount` of `token`, withdrawable by `withdrawer` after `unlockDate`.
    /// @dev `msg.value` must equal `lockFee` exactly. The recorded amount is what the
    ///      contract actually received, which may be less than `amount` for tax tokens.
    function lock(address token, uint256 amount, uint256 unlockDate, address withdrawer)
        external
        payable
        nonReentrant
        returns (uint256 lockId)
    {
        if (amount == 0) revert ZeroAmount();
        if (unlockDate <= block.timestamp) revert UnlockInPast();
        if (withdrawer == address(0)) revert ZeroAddress();
        if (msg.value != lockFee) revert WrongFee(msg.value, lockFee);

        uint256 received = _pullTokens(token, amount);

        lockId = nextLockId++;
        locks[lockId] = Lock({
            id: lockId,
            token: token,
            owner: msg.sender,
            withdrawer: withdrawer,
            amount: received,
            lockDate: block.timestamp,
            unlockDate: unlockDate
        });

        tokenLocks[token].push(lockId);
        _addUserLock(msg.sender, lockId);

        if (msg.value > 0) pendingFees += msg.value;

        emit LockCreated(lockId, token, msg.sender, withdrawer, received, unlockDate);
    }

    /// @notice Add more of the same token to an existing, still-locked lock (no fee).
    function incrementLock(uint256 lockId, uint256 amount) external nonReentrant {
        Lock storage l = locks[lockId];
        if (l.owner != msg.sender) revert NotLockOwner();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= l.unlockDate) revert LockMatured();

        uint256 received = _pullTokens(l.token, amount);
        l.amount += received;

        emit LockIncremented(lockId, received);
    }

    /// @notice Push the unlock date further into the future. The new date must be
    ///         later than both the current unlock date and the current time.
    function extendLock(uint256 lockId, uint256 newUnlockDate) external {
        Lock storage l = locks[lockId];
        if (l.owner != msg.sender) revert NotLockOwner();
        if (newUnlockDate <= l.unlockDate || newUnlockDate <= block.timestamp) revert MustExtendForward();

        l.unlockDate = newUnlockDate;
        emit LockExtended(lockId, newUnlockDate);
    }

    /// @notice Withdraw part or all of a matured lock. Caller must be the withdrawer.
    function withdraw(uint256 lockId, uint256 amount) external nonReentrant {
        Lock storage l = locks[lockId];
        if (l.withdrawer != msg.sender) revert NotWithdrawer();
        if (block.timestamp < l.unlockDate) revert StillLocked();
        if (amount == 0) revert ZeroAmount();
        if (amount > l.amount) revert InsufficientLockBalance();

        l.amount -= amount;
        IERC20(l.token).safeTransfer(msg.sender, amount);

        emit LockWithdrawn(lockId, msg.sender, amount);
    }

    /// @notice Reassign the withdrawer role. Only the current withdrawer may do this.
    function setWithdrawer(uint256 lockId, address newWithdrawer) external {
        Lock storage l = locks[lockId];
        if (l.withdrawer != msg.sender) revert NotWithdrawer();
        if (newWithdrawer == address(0)) revert ZeroAddress();

        address old = l.withdrawer;
        l.withdrawer = newWithdrawer;
        emit WithdrawerUpdated(lockId, old, newWithdrawer);
    }

    /// @notice Transfer control of a lock (top-up / extend / split / transfer rights) to `newOwner`.
    /// @param transferWithdrawRights If true, also move the withdrawer role to `newOwner`.
    ///        Requires the caller to currently hold both roles.
    function transferLockOwnership(uint256 lockId, address newOwner, bool transferWithdrawRights) external {
        Lock storage l = locks[lockId];
        if (l.owner != msg.sender) revert NotLockOwner();
        if (newOwner == address(0)) revert ZeroAddress();

        if (transferWithdrawRights) {
            if (l.withdrawer != msg.sender) revert NotWithdrawer();
            address oldWithdrawer = l.withdrawer;
            l.withdrawer = newOwner;
            emit WithdrawerUpdated(lockId, oldWithdrawer, newOwner);
        }

        address old = l.owner;
        _removeUserLock(old, lockId);
        l.owner = newOwner;
        _addUserLock(newOwner, lockId);

        emit LockOwnershipTransferred(lockId, old, newOwner);
    }

    /// @notice Split `amount` out of a lock into a new lock with identical terms and roles.
    function splitLock(uint256 lockId, uint256 amount) external returns (uint256 newLockId) {
        Lock storage l = locks[lockId];
        if (l.owner != msg.sender) revert NotLockOwner();
        if (amount == 0 || amount >= l.amount) revert InvalidSplitAmount();

        l.amount -= amount;

        newLockId = nextLockId++;
        locks[newLockId] = Lock({
            id: newLockId,
            token: l.token,
            owner: l.owner,
            withdrawer: l.withdrawer,
            amount: amount,
            lockDate: l.lockDate,
            unlockDate: l.unlockDate
        });

        tokenLocks[l.token].push(newLockId);
        _addUserLock(l.owner, newLockId);

        emit LockSplit(lockId, newLockId, amount);
    }

    // ---------- Views ----------

    function getLock(uint256 lockId) external view returns (Lock memory) {
        return locks[lockId];
    }

    function getLocksForToken(address token) external view returns (uint256[] memory) {
        return tokenLocks[token];
    }

    function getLocksForTokenCount(address token) external view returns (uint256) {
        return tokenLocks[token].length;
    }

    /// @notice Paginated variant for tokens with many locks.
    function getLocksForTokenPaginated(address token, uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory page)
    {
        return _slice(tokenLocks[token], start, count);
    }

    /// @notice Lock ids currently owned by `user`. Kept exact across ownership transfers.
    function getLocksForUser(address user) external view returns (uint256[] memory) {
        return userLocks[user];
    }

    function getLocksForUserCount(address user) external view returns (uint256) {
        return userLocks[user].length;
    }

    function getLocksForUserPaginated(address user, uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory page)
    {
        return _slice(userLocks[user], start, count);
    }

    // ---------- Fees / admin ----------

    /// @notice Send accumulated fees to `feeReceiver`. Callable by the fee receiver or the contract owner.
    function claimFees() external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert NotFeeReceiver();
        uint256 amount = pendingFees;
        if (amount == 0) revert NoFeesToClaim();

        pendingFees = 0;
        emit FeesClaimed(feeReceiver, amount);

        (bool sent,) = feeReceiver.call{value: amount}("");
        if (!sent) revert FeeTransferFailed();
    }

    function setLockFee(uint256 newFee) external onlyOwner {
        lockFee = newFee;
        emit FeeUpdated(newFee);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(newReceiver);
    }

    // ---------- Internal ----------

    /// @dev Pull `amount` of `token` from the caller and return what actually arrived.
    function _pullTokens(address token, uint256 amount) internal returns (uint256 received) {
        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
    }

    function _addUserLock(address user, uint256 lockId) internal {
        userLocks[user].push(lockId);
        userLockIndex[lockId] = userLocks[user].length; // stored as index + 1
    }

    function _removeUserLock(address user, uint256 lockId) internal {
        uint256[] storage list = userLocks[user];
        uint256 idxPlusOne = userLockIndex[lockId];
        if (idxPlusOne == 0) return; // defensive; every live lock is indexed

        uint256 idx = idxPlusOne - 1;
        uint256 lastId = list[list.length - 1];
        if (lastId != lockId) {
            list[idx] = lastId;
            userLockIndex[lastId] = idxPlusOne;
        }
        list.pop();
        delete userLockIndex[lockId];
    }

    function _slice(uint256[] storage list, uint256 start, uint256 count)
        internal
        view
        returns (uint256[] memory page)
    {
        uint256 len = list.length;
        if (start >= len) return new uint256[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new uint256[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = list[i];
        }
    }
}
