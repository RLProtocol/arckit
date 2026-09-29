// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint128} from "@uniswap/v4-core/src/libraries/FixedPoint128.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ArcFlowBase} from "./ArcFlowBase.sol";

/// @title ArcFlowPositions ("Pools")
/// @notice Shaped, self-directed liquidity positions on Uniswap v4 (Arc), with an optional time lock.
///
///  - A position is a set of weighted tick ranges ("legs") minted together on any existing v4 pool:
///      Spot    one range around the price
///      Curve   nested ranges, so liquidity is densest at the price and thins out toward the edges
///      BidAsk  bands that get heavier toward the edges, thin in the middle
///      Custom  any legs the caller supplies
///  - Enter with both tokens, or with USDC only: the contract swaps the right share in the same pool.
///  - Each position uses its own salt in the PoolManager, so its fees are tracked by Uniswap itself and
///    can never mix with another user's.
///  - `lock` freezes a position's liquidity until a timestamp (fees stay collectable). This is the v4
///    equivalent of an LP lock: a public, on-chain proof that liquidity cannot be pulled.
///
/// Trust: the owner can set the protocol fee on collected swap fees (capped), the lock fee and the
///        treasury. There is no pause, no upgrade and no path for anyone but a position's owner to move it.
contract ArcFlowPositions is ArcFlowBase, ReentrancyGuard, Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    // ---------- Errors ----------

    error BadShape();
    error BadLegs();
    error NotPositionOwner();
    error PositionClosed();
    error PositionLocked(uint64 until);
    error BadLockTime();
    error WrongFee(uint256 sent, uint256 required);
    error PoolHasNoUsdc();
    error InsufficientLiquidityOut(uint256 got, uint256 min);
    error InsufficientOutput();
    error BadBps();
    error FeeTooHigh();
    error ZeroAddress();
    error NoFeesToClaim();
    error FeeTransferFailed();

    // ---------- Types ----------

    enum Shape {
        Spot,
        Curve,
        BidAsk,
        Custom
    }

    struct Leg {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    struct Position {
        address owner;
        PoolId poolId;
        Shape shape;
        uint64 createdAt;
        uint64 lockedUntil;
        bool closed;
    }

    // ---------- Constants ----------

    uint256 public constant MAX_LEGS = 12;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 1_000; // 10 % of collected swap fees
    uint64 public constant MAX_LOCK = 10 * 365 days;

    // ---------- State ----------

    address public treasury;
    uint256 public protocolFeeBps = 100; // 1 % of collected swap fees
    uint256 public lockFee = 10 ether; // native USDC (18 decimals on Arc)
    uint256 public pendingLockFees;

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) internal positions;
    mapping(uint256 => Leg[]) internal positionLegs;
    mapping(PoolId => PoolKey) internal poolKeys;
    mapping(address => uint256[]) internal ownerPositions;
    mapping(uint256 => uint256) internal ownerIndex;
    mapping(PoolId => uint256[]) internal poolPositions;
    uint256[] internal lockedPositions; // append-only: every position that was ever locked

    // ---------- Events ----------

    event PositionMinted(uint256 indexed positionId, address indexed owner, PoolId indexed poolId, Shape shape, uint256 legs, uint256 amount0, uint256 amount1);
    event PositionDecreased(uint256 indexed positionId, uint256 bps, uint256 amount0, uint256 amount1, bool closed);
    event FeesCollected(uint256 indexed positionId, uint256 fees0, uint256 fees1, uint256 cut0, uint256 cut1);
    event PositionLockedUntil(uint256 indexed positionId, uint64 until);
    event PositionTransferred(uint256 indexed positionId, address indexed from, address indexed to);
    event ProtocolFeeUpdated(uint256 bps);
    event LockFeeUpdated(uint256 fee);
    event TreasuryUpdated(address treasury);
    event LockFeesClaimed(address indexed to, uint256 amount);

    constructor(IPoolManager _poolManager, IERC20 _usdc, address _treasury) ArcFlowBase(_poolManager, _usdc) Ownable(msg.sender) {
        treasury = _treasury == address(0) ? msg.sender : _treasury;
    }

    // ============================================================
    //                            MINT
    // ============================================================

    /// @notice Mint a shaped position with USDC only. The pool must have USDC on one side.
    /// @param halfWidthTicks Distance from the current price to the outer edge, in ticks (rounded to the spacing).
    /// @param custom Only read when `shape == Custom`.
    /// @param minLiquidity Revert if the summed liquidity of all legs is below this.
    function mintUsdc(
        PoolKey calldata key,
        Shape shape,
        uint24 halfWidthTicks,
        LegSpec[] calldata custom,
        uint256 usdcAmount,
        uint256 slippageBps,
        uint256 minLiquidity
    ) external nonReentrant returns (uint256 positionId) {
        if (usdcAmount == 0) revert ZeroAmount();
        bool is0 = Currency.unwrap(key.currency0) == address(usdc);
        if (!is0 && Currency.unwrap(key.currency1) != address(usdc)) revert PoolHasNoUsdc();
        LegSpec[] memory legs = _resolveLegs(key, shape, halfWidthTicks, custom);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        positionId = _mint(key, shape, legs, is0 ? usdcAmount : 0, is0 ? 0 : usdcAmount, true, slippageBps, minLiquidity);
    }

    /// @notice Mint a shaped position with both tokens. Whatever does not fit the shape's ratio is refunded.
    function mintPair(
        PoolKey calldata key,
        Shape shape,
        uint24 halfWidthTicks,
        LegSpec[] calldata custom,
        uint256 amount0,
        uint256 amount1,
        uint256 minLiquidity
    ) external nonReentrant returns (uint256 positionId) {
        if (amount0 == 0 && amount1 == 0) revert ZeroAmount();
        LegSpec[] memory legs = _resolveLegs(key, shape, halfWidthTicks, custom);
        if (amount0 > 0) IERC20(Currency.unwrap(key.currency0)).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(Currency.unwrap(key.currency1)).safeTransferFrom(msg.sender, address(this), amount1);
        positionId = _mint(key, shape, legs, amount0, amount1, false, 0, minLiquidity);
    }

    function _mint(
        PoolKey calldata key,
        Shape shape,
        LegSpec[] memory legs,
        uint256 amount0,
        uint256 amount1,
        bool zap,
        uint256 slippageBps,
        uint256 minLiquidity
    ) internal returns (uint256 positionId) {
        PoolId id = key.toId();
        if (poolKeys[id].tickSpacing == 0) poolKeys[id] = key;

        positionId = nextPositionId++;
        positions[positionId] = Position(msg.sender, id, shape, uint64(block.timestamp), 0, false);
        ownerIndex[positionId] = ownerPositions[msg.sender].length;
        ownerPositions[msg.sender].push(positionId);
        poolPositions[id].push(positionId);

        (uint256 used0, uint256 used1, uint256 totalLiq) = abi.decode(
            _unlock(abi.encode(Action.Mint, positionId, abi.encode(MintArgs(legs, amount0, amount1, zap, slippageBps)))),
            (uint256, uint256, uint256)
        );
        if (totalLiq == 0) revert ZeroAmount();
        if (totalLiq < minLiquidity) revert InsufficientLiquidityOut(totalLiq, minLiquidity);
        emit PositionMinted(positionId, msg.sender, id, shape, legs.length, used0, used1);
    }

    // ============================================================
    //                     COLLECT / DECREASE
    // ============================================================

    /// @notice Collect the swap fees earned by every leg. Allowed while locked.
    function collect(uint256 positionId) external nonReentrant returns (uint256 fees0, uint256 fees1) {
        _requireOwner(positionId);
        (fees0, fees1) = abi.decode(_unlock(abi.encode(Action.Collect, positionId, bytes(""))), (uint256, uint256));
    }

    /// @notice Remove `bps` (1..10000) of every leg's liquidity. 10000 closes the position.
    /// @param toUsdc Swap the non-USDC side to USDC in the same pool (pool must contain USDC).
    function decrease(uint256 positionId, uint256 bps, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1)
        external
        nonReentrant
        returns (uint256 out0, uint256 out1)
    {
        Position storage p = _requireOwner(positionId);
        if (bps == 0 || bps > 10_000) revert BadBps();
        if (block.timestamp < p.lockedUntil) revert PositionLocked(p.lockedUntil);
        (out0, out1) = abi.decode(
            _unlock(abi.encode(Action.Decrease, positionId, abi.encode(bps, toUsdc, slippageBps))), (uint256, uint256)
        );
        if (out0 < minOut0 || out1 < minOut1) revert InsufficientOutput();
        PoolKey memory key = poolKeys[p.poolId];
        _payout(key.currency0, msg.sender, out0);
        _payout(key.currency1, msg.sender, out1);
        if (bps == 10_000) p.closed = true;
        emit PositionDecreased(positionId, bps, out0, out1, bps == 10_000);
    }

    // ============================================================
    //                       LOCK / TRANSFER
    // ============================================================

    /// @notice Freeze the position's liquidity until `until`. Costs `lockFee` (native USDC). Fees stay collectable.
    function lock(uint256 positionId, uint64 until) external payable nonReentrant {
        Position storage p = _requireOwner(positionId);
        if (msg.value != lockFee) revert WrongFee(msg.value, lockFee);
        if (until <= block.timestamp || until <= p.lockedUntil || until > block.timestamp + MAX_LOCK) revert BadLockTime();
        if (p.lockedUntil == 0) lockedPositions.push(positionId);
        p.lockedUntil = until;
        pendingLockFees += msg.value;
        emit PositionLockedUntil(positionId, until);
    }

    /// @notice Push an existing lock later. Free.
    function extendLock(uint256 positionId, uint64 until) external {
        Position storage p = _requireOwner(positionId);
        if (p.lockedUntil == 0 || until <= p.lockedUntil || until > block.timestamp + MAX_LOCK) revert BadLockTime();
        p.lockedUntil = until;
        emit PositionLockedUntil(positionId, until);
    }

    /// @notice Hand the position (and its lock) to another address.
    function transferPosition(uint256 positionId, address to) external {
        Position storage p = _requireOwner(positionId);
        if (to == address(0)) revert ZeroAddress();
        // swap-and-pop out of the sender's list
        uint256[] storage list = ownerPositions[msg.sender];
        uint256 idx = ownerIndex[positionId];
        uint256 last = list[list.length - 1];
        list[idx] = last;
        ownerIndex[last] = idx;
        list.pop();
        ownerIndex[positionId] = ownerPositions[to].length;
        ownerPositions[to].push(positionId);
        p.owner = to;
        emit PositionTransferred(positionId, msg.sender, to);
    }

    // ============================================================
    //                            VIEWS
    // ============================================================

    /// @notice The legs a shape would produce right now for this pool.
    function previewLegs(PoolKey calldata key, Shape shape, uint24 halfWidthTicks) external view returns (LegSpec[] memory) {
        LegSpec[] memory none;
        return _resolveLegsMem(key, shape, halfWidthTicks, none);
    }

    /// @notice Token amounts one UNIT of the shape needs at the current price, and the share of value in currency0 (WAD).
    function previewRatio(PoolKey calldata key, Shape shape, uint24 halfWidthTicks)
        external
        view
        returns (uint256 need0, uint256 need1, uint256 share0Wad)
    {
        LegSpec[] memory none;
        LegSpec[] memory legs = _resolveLegsMem(key, shape, halfWidthTicks, none);
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        (need0, need1) = _unitNeeds(sqrtP, legs);
        uint256 v0 = _value0In1(need0, sqrtP);
        share0Wad = v0 + need1 == 0 ? 0 : FullMath.mulDiv(v0, WAD, v0 + need1);
    }

    function positionInfo(uint256 positionId) external view returns (Position memory p, PoolKey memory key, Leg[] memory legs) {
        p = positions[positionId];
        key = poolKeys[p.poolId];
        legs = positionLegs[positionId];
    }

    /// @notice Principal held by the position at the pool's spot price (excludes uncollected fees).
    function positionAmounts(uint256 positionId) external view returns (uint256 amount0, uint256 amount1, bool inRange) {
        Position storage p = positions[positionId];
        (uint160 sqrtP, int24 tick,,) = poolManager.getSlot0(p.poolId);
        Leg[] storage legs = positionLegs[positionId];
        for (uint256 i = 0; i < legs.length; i++) {
            (uint256 a0, uint256 a1) = _amountsFor(sqrtP, legs[i].tickLower, legs[i].tickUpper, legs[i].liquidity, false);
            amount0 += a0;
            amount1 += a1;
            if (legs[i].liquidity > 0 && tick >= legs[i].tickLower && tick < legs[i].tickUpper) inRange = true;
        }
    }

    /// @notice Swap fees earned and not yet collected, read from Uniswap's own fee growth accounting.
    function pendingFees(uint256 positionId) external view returns (uint256 fees0, uint256 fees1) {
        Position storage p = positions[positionId];
        Leg[] storage legs = positionLegs[positionId];
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].liquidity == 0) continue;
            (uint128 liq, uint256 last0, uint256 last1) =
                poolManager.getPositionInfo(p.poolId, address(this), legs[i].tickLower, legs[i].tickUpper, bytes32(positionId));
            (uint256 g0, uint256 g1) = poolManager.getFeeGrowthInside(p.poolId, legs[i].tickLower, legs[i].tickUpper);
            unchecked {
                fees0 += FullMath.mulDiv(g0 - last0, liq, FixedPoint128.Q128);
                fees1 += FullMath.mulDiv(g1 - last1, liq, FixedPoint128.Q128);
            }
        }
    }

    function positionsOf(address who) external view returns (uint256[] memory) {
        return ownerPositions[who];
    }

    function positionsInPool(PoolId id) external view returns (uint256[] memory) {
        return poolPositions[id];
    }

    function lockedPositionIds(uint256 offset, uint256 limit) external view returns (uint256[] memory out, uint256 total) {
        total = lockedPositions.length;
        if (offset >= total) return (new uint256[](0), total);
        uint256 n = total - offset < limit ? total - offset : limit;
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) out[i] = lockedPositions[offset + i];
    }

    function poolIdFor(PoolKey calldata key) external pure returns (PoolId) {
        return key.toId();
    }

    // ============================================================
    //                            ADMIN
    // ============================================================

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
    }

    function setLockFee(uint256 fee) external onlyOwner {
        lockFee = fee;
        emit LockFeeUpdated(fee);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    function claimLockFees() external nonReentrant {
        if (msg.sender != treasury && msg.sender != owner()) revert NotPositionOwner();
        uint256 amount = pendingLockFees;
        if (amount == 0) revert NoFeesToClaim();
        pendingLockFees = 0;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert FeeTransferFailed();
        emit LockFeesClaimed(treasury, amount);
    }

    // ============================================================
    //                      SHAPES -> LEGS
    // ============================================================

    function _resolveLegs(PoolKey calldata key, Shape shape, uint24 halfWidthTicks, LegSpec[] calldata custom)
        internal
        view
        returns (LegSpec[] memory)
    {
        LegSpec[] memory c = custom;
        return _resolveLegsMem(key, shape, halfWidthTicks, c);
    }

    function _resolveLegsMem(PoolKey calldata key, Shape shape, uint24 halfWidthTicks, LegSpec[] memory custom)
        internal
        view
        returns (LegSpec[] memory legs)
    {
        (,, int24 tick) = _checkKey(key);
        int24 sp = key.tickSpacing;
        if (shape == Shape.Custom) {
            if (custom.length == 0 || custom.length > MAX_LEGS) revert BadLegs();
            for (uint256 i = 0; i < custom.length; i++) {
                LegSpec memory l = custom[i];
                if (l.weight == 0 || l.tickLower >= l.tickUpper || l.tickLower % sp != 0 || l.tickUpper % sp != 0) revert BadLegs();
                if (l.tickLower != _clampTick(l.tickLower, sp) || l.tickUpper != _clampTick(l.tickUpper, sp)) revert BadLegs();
            }
            return custom;
        }

        // `steps` = half width in spacing units, at least 1
        int24 steps = int24(uint24(halfWidthTicks)) / sp;
        if (int24(uint24(halfWidthTicks)) % sp != 0) steps += 1;
        if (steps < 1) steps = 1;
        int24 c = _floorTick(tick, sp); // the active band is [c, c + sp)

        if (shape == Shape.Spot) {
            legs = new LegSpec[](1);
            legs[0] = LegSpec(_clampTick(c - steps * sp, sp), _clampTick(c + sp + steps * sp, sp), 1);
        } else if (shape == Shape.Curve) {
            // nested ranges: every leg contains the price, so liquidity stacks up toward the centre
            int24 n = steps < 4 ? steps : int24(4);
            legs = new LegSpec[](uint256(uint24(n)));
            for (int24 i = 1; i <= n; i++) {
                int24 h = ((steps * i) / n) * sp;
                legs[uint256(uint24(i - 1))] = LegSpec(_clampTick(c - h, sp), _clampTick(c + sp + h, sp), 1);
            }
        } else if (shape == Shape.BidAsk) {
            // a thin band at the price, then bands on each side that get heavier toward the edges
            int24 n = steps < 3 ? steps : int24(3);
            legs = new LegSpec[](uint256(uint24(2 * n + 1)));
            legs[0] = LegSpec(c, c + sp, 1);
            int24 prev = 0;
            for (int24 j = 1; j <= n; j++) {
                int24 h = ((steps * j) / n) * sp;
                uint32 w = uint32(uint24(j)) + 1;
                legs[uint256(uint24(2 * j - 1))] = LegSpec(_clampTick(c - h, sp), _clampTick(c - prev, sp), w);
                legs[uint256(uint24(2 * j))] = LegSpec(_clampTick(c + sp + prev, sp), _clampTick(c + sp + h, sp), w);
                prev = h;
            }
        } else {
            revert BadShape();
        }
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].tickLower >= legs[i].tickUpper) revert BadLegs();
        }
    }

    // ============================================================
    //                    POOL MANAGER CALLBACK
    // ============================================================

    enum Action {
        Mint,
        Collect,
        Decrease
    }

    function _onUnlock(bytes calldata data) internal override returns (bytes memory) {
        (Action action, uint256 positionId, bytes memory args) = abi.decode(data, (Action, uint256, bytes));
        Position storage p = positions[positionId];
        PoolKey memory key = poolKeys[p.poolId];
        if (action == Action.Mint) return _cbMint(p, key, positionId, args);
        if (action == Action.Collect) {
            (uint256 f0, uint256 f1) = _touchAll(p, key, positionId);
            return abi.encode(f0, f1);
        }
        return _cbDecrease(p, key, positionId, args);
    }

    struct MintArgs {
        LegSpec[] legs;
        uint256 bal0;
        uint256 bal1;
        bool zap;
        uint256 slippageBps;
    }

    function _cbMint(Position storage p, PoolKey memory key, uint256 positionId, bytes memory args) internal returns (bytes memory) {
        MintArgs memory m = abi.decode(args, (MintArgs));
        if (m.zap) {
            bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
            (m.bal0, m.bal1) = _zapUsdc(key, usdcIs0, m.legs, usdcIs0 ? m.bal0 : m.bal1, m.slippageBps);
        }
        (uint256 used0, uint256 used1, uint256 totalLiq) = _addLegs(key, positionId, m.legs, _scaleAt(p.poolId, m.legs, m.bal0, m.bal1));
        if (used0 > m.bal0 || used1 > m.bal1) revert InsufficientInput();
        _pay(key.currency0, used0);
        _pay(key.currency1, used1);
        _payout(key.currency0, p.owner, m.bal0 - used0);
        _payout(key.currency1, p.owner, m.bal1 - used1);
        return abi.encode(used0, used1, totalLiq);
    }

    function _scaleAt(PoolId id, LegSpec[] memory legs, uint256 bal0, uint256 bal1) internal view returns (uint256) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        (uint256 need0, uint256 need1) = _unitNeeds(sqrtP, legs);
        return _scaleFor(need0, need1, bal0, bal1);
    }

    function _addLegs(PoolKey memory key, uint256 positionId, LegSpec[] memory legs, uint256 scale)
        internal
        returns (uint256 used0, uint256 used1, uint256 totalLiq)
    {
        Leg[] storage stored = positionLegs[positionId];
        for (uint256 i = 0; i < legs.length; i++) {
            uint128 liq = _legLiquidity(legs[i].weight, scale);
            stored.push(Leg(legs[i].tickLower, legs[i].tickUpper, liq));
            if (liq == 0) continue;
            (BalanceDelta d,) = poolManager.modifyLiquidity(
                key, IPoolManager.ModifyLiquidityParams(legs[i].tickLower, legs[i].tickUpper, int256(uint256(liq)), bytes32(positionId)), ""
            );
            if (d.amount0() < 0) used0 += uint256(uint128(-d.amount0()));
            if (d.amount1() < 0) used1 += uint256(uint128(-d.amount1()));
            totalLiq += liq;
        }
    }

    function _cbDecrease(Position storage p, PoolKey memory key, uint256 positionId, bytes memory args) internal returns (bytes memory) {
        (uint256 bps, bool toUsdc, uint256 slippageBps) = abi.decode(args, (uint256, bool, uint256));
        // principal comes back to this contract; fees go straight to the owner inside _touchAll
        (uint256 out0, uint256 out1) = _touchAllPrincipal(p, key, positionId, bps);
        if (toUsdc) {
            bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
            if (!usdcIs0 && Currency.unwrap(key.currency1) != address(usdc)) revert PoolHasNoUsdc();
            if (usdcIs0 && out1 > 0) {
                (uint256 paid, uint256 got) = _swapExactIn(key, false, out1, slippageBps);
                out0 += got;
                out1 -= paid;
            } else if (!usdcIs0 && out0 > 0) {
                (uint256 paid, uint256 got) = _swapExactIn(key, true, out0, slippageBps);
                out1 += got;
                out0 -= paid;
            }
        }
        return abi.encode(out0, out1);
    }

    struct Acc {
        uint256 out0;
        uint256 out1;
        uint256 f0;
        uint256 f1;
    }

    /// @dev modifyLiquidity(0) on every leg; pays the fees to the owner. Returns the owner's net fees.
    function _touchAll(Position storage p, PoolKey memory key, uint256 positionId) internal returns (uint256 net0, uint256 net1) {
        Leg[] storage legs = positionLegs[positionId];
        Acc memory a;
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].liquidity > 0) _modifyLeg(key, positionId, legs[i], 0, a);
        }
        (net0, net1) = _settleFees(p, key, positionId, a.f0, a.f1);
    }

    /// @dev Remove `bps` of each leg. Fees realised on the way are paid to the owner; principal is returned.
    function _touchAllPrincipal(Position storage p, PoolKey memory key, uint256 positionId, uint256 bps)
        internal
        returns (uint256 out0, uint256 out1)
    {
        Leg[] storage legs = positionLegs[positionId];
        Acc memory a;
        for (uint256 i = 0; i < legs.length; i++) {
            uint128 liq = legs[i].liquidity;
            if (liq == 0) continue;
            uint128 remove = bps == 10_000 ? liq : uint128((uint256(liq) * bps) / 10_000);
            _modifyLeg(key, positionId, legs[i], remove, a);
            legs[i].liquidity = liq - remove;
        }
        _take(key.currency0, a.out0);
        _take(key.currency1, a.out1);
        _settleFees(p, key, positionId, a.f0, a.f1);
        return (a.out0, a.out1);
    }

    /// @dev One leg: remove `remove` liquidity (0 = just realise fees) and add principal and fees to `a`.
    ///      callerDelta includes the fees. A hook may shave what comes back, so nothing here can underflow:
    ///      whatever actually arrives is attributed to fees first, then to principal.
    function _modifyLeg(PoolKey memory key, uint256 positionId, Leg storage leg, uint128 remove, Acc memory a) internal {
        (BalanceDelta d, BalanceDelta fees) = poolManager.modifyLiquidity(
            key, IPoolManager.ModifyLiquidityParams(leg.tickLower, leg.tickUpper, -int256(uint256(remove)), bytes32(positionId)), ""
        );
        uint256 t0 = d.amount0() > 0 ? uint256(uint128(d.amount0())) : 0;
        uint256 t1 = d.amount1() > 0 ? uint256(uint128(d.amount1())) : 0;
        uint256 lf0 = fees.amount0() > 0 ? uint256(uint128(fees.amount0())) : 0;
        uint256 lf1 = fees.amount1() > 0 ? uint256(uint128(fees.amount1())) : 0;
        if (lf0 > t0) lf0 = t0;
        if (lf1 > t1) lf1 = t1;
        a.f0 += lf0;
        a.f1 += lf1;
        a.out0 += t0 - lf0;
        a.out1 += t1 - lf1;
    }

    function _settleFees(Position storage p, PoolKey memory key, uint256 positionId, uint256 f0, uint256 f1)
        internal
        returns (uint256 net0, uint256 net1)
    {
        if (f0 == 0 && f1 == 0) return (0, 0);
        _take(key.currency0, f0);
        _take(key.currency1, f1);
        uint256 cut0 = (f0 * protocolFeeBps) / 10_000;
        uint256 cut1 = (f1 * protocolFeeBps) / 10_000;
        _payout(key.currency0, treasury, cut0);
        _payout(key.currency1, treasury, cut1);
        net0 = f0 - cut0;
        net1 = f1 - cut1;
        _payout(key.currency0, p.owner, net0);
        _payout(key.currency1, p.owner, net1);
        emit FeesCollected(positionId, f0, f1, cut0, cut1);
    }

    function _requireOwner(uint256 positionId) internal view returns (Position storage p) {
        p = positions[positionId];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (p.closed) revert PositionClosed();
    }
}
