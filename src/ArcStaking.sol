// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ArcStaking
/// @notice Registry of time-boxed staking pools for any ERC20. A project creates a pool
///         by choosing a duration and depositing a reward amount; the rewards stream evenly
///         per second over the duration to everyone staked, pro-rata. APY is a consequence
///         of rewards remaining vs. total staked, so creators never set a rate.
///
/// Early withdrawal: a pool may carry a penalty (e.g. 10%) charged on principal withdrawn
/// before the pool ends. When the reward token is the staked token the penalty is added to
/// the reward pool for the stakers who stay; otherwise it is sent to the creator. Once the
/// pool has ended, withdrawals are always free.
///
/// Creator controls: add rewards (raises the rate for the remaining time), extend the pool
/// with more time and rewards, pause new stakes (never withdrawals or claims), and after the
/// end reclaim rewards that were never earned because nobody was staked. Creators can never
/// touch staked principal.
///
/// Protocol: flat native-coin fee to create a pool, pull-payment to the fee receiver. The
/// contract owner can only change that fee and its receiver.
contract ArcStaking is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Types ----------

    struct PoolConfig {
        address stakeToken;
        address rewardToken;
        uint64 startTime; // 0 = now
        uint64 duration; // seconds rewards are streamed over (>= 1 hour, <= 4 years)
        uint16 penaltyBps; // early-withdrawal penalty on principal, 0..5000
        uint256 minStake; // per wallet, 0 = none
        uint256 maxStakePerWallet; // 0 = none
        uint256 maxTotalStaked; // 0 = none
        string name; // display name, up to 48 chars
    }

    struct Pool {
        PoolConfig cfg;
        address creator;
        bool paused; // blocks new stakes only
        uint64 periodFinish; // rewards stop streaming here
        uint64 lastUpdate;
        uint256 rewardRate; // reward wei per second, scaled 1e18
        uint256 rewardPerTokenStored; // scaled 1e18
        uint256 totalStaked;
        uint256 rewardReserve; // reward tokens held for this pool (funded + penalties, minus claims)
        uint256 accruedTotal; // lifetime rewards accrued to stakers
        uint256 claimedTotal; // lifetime rewards paid out
        uint256 totalRewardsAdded; // lifetime funding (for display)
        uint256 stakers;
    }

    struct UserInfo {
        uint256 staked;
        uint256 rewardPerTokenPaid;
        uint256 rewards; // accrued, unclaimed
        uint64 firstStakeAt;
    }

    // ---------- Errors ----------

    error ZeroAddress();
    error ZeroAmount();
    error WrongFee(uint256 sent, uint256 required);
    error BadConfig();
    error NotCreator();
    error PoolNotFound();
    error PoolPaused();
    error NotStarted();
    error Ended();
    error NotEnded();
    error BelowMinStake();
    error AboveMaxStake();
    error PoolFull();
    error InsufficientStake();
    error NothingToClaim();
    error NothingReceived();
    error RewardTokenMismatch();
    error NothingToReclaim();
    error NoFeesToClaim();
    error FeeTransferFailed();
    error NotFeeReceiver();

    // ---------- Storage ----------

    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_PENALTY_BPS = 5_000;
    uint256 private constant PRECISION = 1e18;

    uint256 public nextPoolId = 1;
    mapping(uint256 => Pool) private pools;
    mapping(uint256 => mapping(address => UserInfo)) public users;
    mapping(address => uint256[]) private creatorPools;
    mapping(address => uint256[]) private stakeTokenPools;
    mapping(address => uint256[]) private userPools;
    mapping(uint256 => mapping(address => bool)) private inUserPools;

    uint256 public createFee = 10 ether;
    address public feeReceiver;
    uint256 public pendingFees;

    // ---------- Events ----------

    event PoolCreated(uint256 indexed poolId, address indexed creator, address indexed stakeToken, address rewardToken, uint64 startTime, uint64 duration, uint256 rewards, uint16 penaltyBps, string name);
    event RewardsAdded(uint256 indexed poolId, address indexed from, uint256 amount, uint64 periodFinish, uint256 rewardRate);
    event PoolExtended(uint256 indexed poolId, uint64 newFinish, uint256 addedRewards, uint256 rewardRate);
    event PoolPausedSet(uint256 indexed poolId, bool paused);
    event UndistributedReclaimed(uint256 indexed poolId, uint256 amount);
    event Staked(uint256 indexed poolId, address indexed user, uint256 amount);
    event Unstaked(uint256 indexed poolId, address indexed user, uint256 amount, uint256 penalty);
    event Claimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event FeeUpdated(uint256 newFee);
    event FeeReceiverUpdated(address indexed newReceiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    constructor(address _feeReceiver) Ownable(msg.sender) {
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ============================================================
    //                        CREATE / FUND
    // ============================================================

    /// @notice Create a pool and deposit its rewards. `msg.value` must equal `createFee`.
    function createPool(PoolConfig calldata cfg, uint256 rewardAmount) external payable nonReentrant returns (uint256 id) {
        if (msg.value != createFee) revert WrongFee(msg.value, createFee);
        if (cfg.stakeToken == address(0) || cfg.rewardToken == address(0)) revert ZeroAddress();
        if (rewardAmount == 0) revert ZeroAmount();
        if (cfg.duration < 1 hours || cfg.duration > 4 * 365 days) revert BadConfig();
        if (cfg.penaltyBps > MAX_PENALTY_BPS) revert BadConfig();
        if (cfg.maxStakePerWallet != 0 && cfg.minStake > cfg.maxStakePerWallet) revert BadConfig();
        if (cfg.startTime != 0 && cfg.startTime < block.timestamp) revert BadConfig();
        if (bytes(cfg.name).length > 48) revert BadConfig();

        id = nextPoolId++;
        Pool storage p = pools[id];
        p.cfg = cfg;
        uint64 start = cfg.startTime == 0 ? uint64(block.timestamp) : cfg.startTime;
        p.cfg.startTime = start;
        p.creator = msg.sender;
        p.lastUpdate = start;
        p.periodFinish = start + cfg.duration;

        uint256 received = _pull(cfg.rewardToken, rewardAmount);
        p.rewardReserve = received;
        p.totalRewardsAdded = received;
        p.rewardRate = (received * PRECISION) / cfg.duration;

        creatorPools[msg.sender].push(id);
        stakeTokenPools[cfg.stakeToken].push(id);
        if (msg.value > 0) pendingFees += msg.value;

        emit PoolCreated(id, msg.sender, cfg.stakeToken, cfg.rewardToken, start, cfg.duration, received, cfg.penaltyBps, cfg.name);
    }

    /// @notice Add rewards to a running pool. The rate rises for the remaining time; the end does not move.
    ///         Anyone may add. Reverts once the pool has ended (use `extendPool`).
    function addRewards(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= p.periodFinish) revert Ended();
        _updatePool(poolId);
        uint256 received = _pull(p.cfg.rewardToken, amount);
        p.rewardReserve += received;
        p.totalRewardsAdded += received;
        _notify(p, received);
        emit RewardsAdded(poolId, msg.sender, received, p.periodFinish, p.rewardRate);
    }

    /// @notice Creator: push the end later by `extraDuration` and optionally add rewards. Works on
    ///         running or ended pools; leftover undistributed rewards are re-streamed over the new period.
    function extendPool(uint256 poolId, uint64 extraDuration, uint256 extraRewards) external nonReentrant onlyCreator(poolId) {
        if (extraDuration == 0 || extraDuration > 4 * 365 days) revert BadConfig();
        Pool storage p = pools[poolId];
        _updatePool(poolId);
        uint256 received = extraRewards > 0 ? _pull(p.cfg.rewardToken, extraRewards) : 0;
        p.rewardReserve += received;
        p.totalRewardsAdded += received;

        uint64 base = block.timestamp > p.periodFinish ? uint64(block.timestamp) : p.periodFinish;
        uint64 newFinish = base + extraDuration;
        // everything in the reserve that is not owed to stakers gets streamed over [now, newFinish]
        uint256 owed = p.accruedTotal - p.claimedTotal;
        uint256 toStream = p.rewardReserve > owed ? p.rewardReserve - owed : 0;
        p.periodFinish = newFinish;
        p.lastUpdate = uint64(block.timestamp);
        p.rewardRate = (toStream * PRECISION) / (newFinish - uint64(block.timestamp));
        p.cfg.duration = uint64(newFinish - p.cfg.startTime);
        emit PoolExtended(poolId, newFinish, received, p.rewardRate);
    }

    // ============================================================
    //                        CREATOR CONTROLS
    // ============================================================

    modifier onlyCreator(uint256 poolId) {
        if (pools[poolId].creator == address(0)) revert PoolNotFound();
        if (pools[poolId].creator != msg.sender) revert NotCreator();
        _;
    }

    /// @notice Pause or resume new stakes. Withdrawals and claims are never paused.
    function setPaused(uint256 poolId, bool paused) external onlyCreator(poolId) {
        pools[poolId].paused = paused;
        emit PoolPausedSet(poolId, paused);
    }

    /// @notice After the pool has ended: reclaim rewards that were never earned (streamed while nobody was staked).
    function reclaimUndistributed(uint256 poolId) external nonReentrant onlyCreator(poolId) returns (uint256 amount) {
        Pool storage p = pools[poolId];
        if (block.timestamp < p.periodFinish) revert NotEnded();
        _updatePool(poolId);
        uint256 owed = p.accruedTotal - p.claimedTotal;
        amount = p.rewardReserve > owed ? p.rewardReserve - owed : 0;
        if (amount == 0) revert NothingToReclaim();
        p.rewardReserve -= amount;
        IERC20(p.cfg.rewardToken).safeTransfer(msg.sender, amount);
        emit UndistributedReclaimed(poolId, amount);
    }

    // ============================================================
    //                            STAKING
    // ============================================================

    function stake(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        if (p.paused) revert PoolPaused();
        if (block.timestamp < p.cfg.startTime) revert NotStarted();
        if (block.timestamp >= p.periodFinish) revert Ended();

        _updatePool(poolId);
        _updateUser(poolId, msg.sender);

        uint256 received = _pull(p.cfg.stakeToken, amount);
        UserInfo storage u = users[poolId][msg.sender];
        uint256 newBal = u.staked + received;
        if (p.cfg.minStake != 0 && newBal < p.cfg.minStake) revert BelowMinStake();
        if (p.cfg.maxStakePerWallet != 0 && newBal > p.cfg.maxStakePerWallet) revert AboveMaxStake();
        if (p.cfg.maxTotalStaked != 0 && p.totalStaked + received > p.cfg.maxTotalStaked) revert PoolFull();

        if (u.staked == 0) {
            p.stakers += 1;
            u.firstStakeAt = uint64(block.timestamp);
            if (!inUserPools[poolId][msg.sender]) {
                inUserPools[poolId][msg.sender] = true;
                userPools[msg.sender].push(poolId);
            }
        }
        u.staked = newBal;
        p.totalStaked += received;
        emit Staked(poolId, msg.sender, received);
    }

    /// @notice Withdraw principal. Before the pool ends, `penaltyBps` of the amount is deducted
    ///         (if the pool has a penalty). After the end, withdrawals are free.
    function unstake(uint256 poolId, uint256 amount) external nonReentrant {
        _unstake(poolId, amount);
    }

    /// @notice Claim accrued rewards.
    function claim(uint256 poolId) external nonReentrant returns (uint256 paid) {
        paid = _claim(poolId, msg.sender);
        if (paid == 0) revert NothingToClaim();
    }

    /// @notice Unstake everything and claim in one call.
    function exit(uint256 poolId) external nonReentrant {
        uint256 bal = users[poolId][msg.sender].staked;
        if (bal > 0) _unstake(poolId, bal);
        _claim(poolId, msg.sender);
    }

    /// @notice Claim and restake rewards. Only when reward token == stake token and the pool is running.
    function compound(uint256 poolId) external nonReentrant returns (uint256 added) {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (p.cfg.rewardToken != p.cfg.stakeToken) revert RewardTokenMismatch();
        if (p.paused) revert PoolPaused();
        if (block.timestamp >= p.periodFinish) revert Ended();
        _updatePool(poolId);
        _updateUser(poolId, msg.sender);
        UserInfo storage u = users[poolId][msg.sender];
        added = u.rewards;
        if (added == 0) revert NothingToClaim();
        if (p.cfg.maxStakePerWallet != 0 && u.staked + added > p.cfg.maxStakePerWallet) revert AboveMaxStake();
        if (p.cfg.maxTotalStaked != 0 && p.totalStaked + added > p.cfg.maxTotalStaked) revert PoolFull();
        u.rewards = 0;
        p.rewardReserve -= added;
        p.claimedTotal += added;
        u.staked += added;
        p.totalStaked += added;
        emit Claimed(poolId, msg.sender, added);
        emit Staked(poolId, msg.sender, added);
    }

    function _unstake(uint256 poolId, uint256 amount) internal {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        UserInfo storage u = users[poolId][msg.sender];
        if (u.staked < amount) revert InsufficientStake();

        _updatePool(poolId);
        _updateUser(poolId, msg.sender);

        u.staked -= amount;
        p.totalStaked -= amount;
        if (u.staked == 0) p.stakers -= 1;

        uint256 penalty;
        if (p.cfg.penaltyBps > 0 && block.timestamp < p.periodFinish) {
            penalty = (amount * p.cfg.penaltyBps) / 10_000;
            if (penalty > 0) {
                if (p.cfg.rewardToken == p.cfg.stakeToken) {
                    // redistribute to the stakers who stay, over the remaining time
                    p.rewardReserve += penalty;
                    _notify(p, penalty);
                } else {
                    IERC20(p.cfg.stakeToken).safeTransfer(p.creator, penalty);
                }
            }
        }
        IERC20(p.cfg.stakeToken).safeTransfer(msg.sender, amount - penalty);
        emit Unstaked(poolId, msg.sender, amount - penalty, penalty);
    }

    function _claim(uint256 poolId, address who) internal returns (uint256 paid) {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        _updatePool(poolId);
        _updateUser(poolId, who);
        UserInfo storage u = users[poolId][who];
        paid = u.rewards;
        if (paid == 0) return 0;
        // reserve always covers accrued rewards (rate is derived from the reserve); guard for rounding
        if (paid > p.rewardReserve) paid = p.rewardReserve;
        u.rewards -= paid;
        p.rewardReserve -= paid;
        p.claimedTotal += paid;
        IERC20(p.cfg.rewardToken).safeTransfer(who, paid);
        emit Claimed(poolId, who, paid);
    }

    // ============================================================
    //                            VIEWS
    // ============================================================

    function poolInfo(uint256 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    function poolExists(uint256 poolId) external view returns (bool) {
        return pools[poolId].creator != address(0);
    }

    /// @notice Rewards accrued to `who` right now.
    function earned(uint256 poolId, address who) public view returns (uint256) {
        UserInfo storage u = users[poolId][who];
        return u.rewards + (u.staked * (_rewardPerToken(poolId) - u.rewardPerTokenPaid)) / PRECISION;
    }

    /// @notice Rewards still to be streamed between now and the end.
    function rewardsRemaining(uint256 poolId) public view returns (uint256) {
        Pool storage p = pools[poolId];
        if (block.timestamp >= p.periodFinish) return 0;
        uint256 from = block.timestamp < p.cfg.startTime ? p.cfg.startTime : block.timestamp;
        return ((p.periodFinish - from) * p.rewardRate) / PRECISION;
    }

    /// @notice Current APR in basis points for same-token pools: rewards/year at the current rate over total staked.
    ///         Returns 0 when nothing is staked or the pool has ended. For different tokens, convert with prices off-chain.
    function currentAprBps(uint256 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalStaked == 0 || block.timestamp >= p.periodFinish) return 0;
        uint256 perYear = (p.rewardRate * YEAR) / PRECISION;
        return (perYear * 10_000) / p.totalStaked;
    }

    /// @notice What the APR would be with `hypotheticalStaked` in the pool (for the create form and "if I stake X").
    function aprBpsFor(uint256 poolId, uint256 hypotheticalStaked) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (hypotheticalStaked == 0 || block.timestamp >= p.periodFinish) return 0;
        uint256 perYear = (p.rewardRate * YEAR) / PRECISION;
        return (perYear * 10_000) / hypotheticalStaked;
    }

    /// @notice Penalty a wallet would pay right now to withdraw `amount`.
    function penaltyFor(uint256 poolId, uint256 amount) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.cfg.penaltyBps == 0 || block.timestamp >= p.periodFinish) return 0;
        return (amount * p.cfg.penaltyBps) / 10_000;
    }

    function getPoolsByCreator(address who) external view returns (uint256[] memory) {
        return creatorPools[who];
    }

    function getPoolsByStakeToken(address token) external view returns (uint256[] memory) {
        return stakeTokenPools[token];
    }

    function getPoolsForUser(address who) external view returns (uint256[] memory) {
        return userPools[who];
    }

    // ============================================================
    //                        FEES / ADMIN
    // ============================================================

    function claimFees() external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert NotFeeReceiver();
        uint256 amount = pendingFees;
        if (amount == 0) revert NoFeesToClaim();
        pendingFees = 0;
        emit FeesClaimed(feeReceiver, amount);
        (bool sent,) = feeReceiver.call{value: amount}("");
        if (!sent) revert FeeTransferFailed();
    }

    function setCreateFee(uint256 newFee) external onlyOwner {
        createFee = newFee;
        emit FeeUpdated(newFee);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(newReceiver);
    }

    // ============================================================
    //                          INTERNALS
    // ============================================================

    function _lastTimeApplicable(Pool storage p) internal view returns (uint64) {
        uint64 t = uint64(block.timestamp);
        if (t > p.periodFinish) t = p.periodFinish;
        if (t < p.cfg.startTime) t = p.cfg.startTime;
        return t;
    }

    function _rewardPerToken(uint256 poolId) internal view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalStaked == 0) return p.rewardPerTokenStored;
        uint64 t = _lastTimeApplicable(p);
        if (t <= p.lastUpdate) return p.rewardPerTokenStored;
        return p.rewardPerTokenStored + (uint256(t - p.lastUpdate) * p.rewardRate) / p.totalStaked;
    }

    function _updatePool(uint256 poolId) internal {
        Pool storage p = pools[poolId];
        uint256 rpt = _rewardPerToken(poolId);
        if (rpt != p.rewardPerTokenStored) {
            p.accruedTotal += (p.totalStaked * (rpt - p.rewardPerTokenStored)) / PRECISION;
            p.rewardPerTokenStored = rpt;
        }
        uint64 t = _lastTimeApplicable(p);
        if (t > p.lastUpdate) p.lastUpdate = t;
    }

    function _updateUser(uint256 poolId, address who) internal {
        Pool storage p = pools[poolId];
        UserInfo storage u = users[poolId][who];
        u.rewards += (u.staked * (p.rewardPerTokenStored - u.rewardPerTokenPaid)) / PRECISION;
        u.rewardPerTokenPaid = p.rewardPerTokenStored;
    }

    /// @dev Fold `amount` into the stream for the remaining time (pool must be running; caller checked).
    function _notify(Pool storage p, uint256 amount) internal {
        uint64 now_ = uint64(block.timestamp);
        if (now_ >= p.periodFinish) return; // nothing to stream into; stays in reserve for extend/reclaim
        uint64 from = now_ < p.cfg.startTime ? p.cfg.startTime : now_;
        uint256 remaining = ((p.periodFinish - from) * p.rewardRate) / PRECISION;
        p.rewardRate = ((remaining + amount) * PRECISION) / (p.periodFinish - from);
    }

    function _pull(address token, uint256 amount) internal returns (uint256 received) {
        IERC20 t = IERC20(token);
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        received = t.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
    }
}
