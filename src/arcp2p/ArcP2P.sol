// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {ArcTwapOracle} from "../arclend/ArcTwapOracle.sol";

/// @title ArcP2P
/// @notice Permissionless peer-to-peer token sales on Arc, quoted in native USDC. A seller escrows any ERC-20
///         and names a price; buyers take all or part of it and pay USDC as `msg.value`. Fills settle atomically:
///         tokens to the buyer, USDC to the seller, excess USDC back to the buyer.
///
/// Pricing modes:
///   - Fixed: a USDC price per whole token the seller sets.
///   - Market: the token's Uniswap v4 USDC pool price (ArcTwapOracle) with a spread in basis points, negative
///     for a discount and positive for a premium, and an optional floor. The reference is the higher of the
///     30-minute TWAP and spot once the TWAP has 10 minutes of coverage, so a flash dump in the pool cannot
///     drain a discounted listing; before that it is spot.
///
/// The owner only sets the taker fee (capped) and its receiver, and withdraws accrued fees. It can never move
/// escrowed tokens or change a listing. No upgrades, no pause.
contract ArcP2P is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 100; // 1%
    int32 public constant MIN_SPREAD_BPS = -9_000; // up to 90% below market
    int32 public constant MAX_SPREAD_BPS = 10_000; // up to 100% above market
    uint32 public constant TWAP_WINDOW = 30 minutes;
    uint32 public constant MIN_TWAP_COVERAGE = 10 minutes;

    enum Mode {
        Fixed,
        Market
    }

    // ---------- Types ----------
    struct Pricing {
        Mode mode;
        uint256 fixedPrice; // Fixed: USDC wei per whole token
        int32 spreadBps; // Market: added to the reference price, negative = discount
        uint256 floorPrice; // Market: never sell below this (USDC wei per whole token), 0 = none
    }

    struct Pool {
        PoolId poolId; // Uniswap v4 pool of token/USDC; required for Market mode
        bool usdcIs0; // USDC is currency0 of that pool
        uint8 poolUsdcDecimals; // 6 for the ERC-20 USDC view, 18 for native
    }

    struct Terms {
        uint128 minFill; // smallest fill in token base units; the full remainder is always allowed. 0 = none
        uint40 expiry; // unix seconds after which fills stop; 0 = never
        address buyer; // only this address may fill; address(0) = anyone
    }

    struct Listing {
        address seller;
        IERC20 token;
        uint8 tokenDecimals;
        uint40 createdAt;
        uint128 remaining; // token base units still for sale
        uint128 sold; // token base units sold so far
        uint256 proceeds; // USDC wei paid to the seller so far (after fees)
        Pricing pricing;
        Pool pool;
        Terms terms;
    }

    // ---------- Storage ----------
    ArcTwapOracle public immutable oracle;
    uint16 public feeBps = 50; // 0.5% of each fill, taken from the seller's proceeds
    address public feeReceiver;
    uint256 public accruedFees; // USDC wei waiting for withdrawFees()
    mapping(address => uint256) public pendingPayouts; // USDC owed to addresses that rejected a direct transfer

    Listing[] private _listings;
    mapping(address => uint256[]) private _bySeller;

    // ---------- Events ----------
    event Listed(uint256 indexed id, address indexed seller, address indexed token, uint256 amount, Pricing pricing, Terms terms);
    event Filled(uint256 indexed id, address indexed buyer, uint256 amount, uint256 cost, uint256 price, uint256 fee);
    event Updated(uint256 indexed id, Pricing pricing, Terms terms);
    event ToppedUp(uint256 indexed id, uint256 amount, uint256 remaining);
    event Cancelled(uint256 indexed id, uint256 returned);
    event PayoutQueued(address indexed to, uint256 amount);
    event PayoutClaimed(address indexed to, uint256 amount);
    event FeeUpdated(uint16 feeBps, address feeReceiver);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ---------- Errors ----------
    error ListingNotFound();
    error NotSeller();
    error NotActive();
    error Expired();
    error NotAllowedBuyer();
    error ZeroAmount();
    error ExceedsRemaining(uint256 remaining);
    error BelowMinFill(uint256 minFill);
    error InsufficientPayment(uint256 cost, uint256 sent);
    error BadPrice();
    error BadSpread();
    error BadPoolDecimals();
    error PoolRequired();
    error BadExpiry();
    error FeeTooHigh();
    error NothingToClaim();
    error TransferFailed();

    constructor(ArcTwapOracle _oracle, address _feeReceiver) Ownable(msg.sender) {
        oracle = _oracle;
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ============================================================ sellers

    /// @notice Escrow `amount` of `token` for sale. Fee-on-transfer tokens list the amount actually received.
    /// @param pool the token's USDC pool; required for Market pricing, may be zeroed for Fixed
    function list(IERC20 token, uint256 amount, Pricing calldata pricing, Pool calldata pool, Terms calldata terms)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        _validate(pricing, pool, terms);

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        id = _listings.length;
        _listings.push();
        Listing storage l = _listings[id];
        l.seller = msg.sender;
        l.token = token;
        l.tokenDecimals = _decimals(token);
        l.createdAt = uint40(block.timestamp);
        l.remaining = uint128(received);
        l.pricing = pricing;
        l.pool = pool;
        l.terms = terms;
        _bySeller[msg.sender].push(id);

        if (pricing.mode == Mode.Market) {
            oracle.poke(pool.poolId); // proves the pool exists and starts the TWAP
            if (_marketPrice(l) == 0) revert BadPrice();
        }
        emit Listed(id, msg.sender, address(token), received, pricing, terms);
    }

    /// @notice Change price, spread, floor, minimum fill, expiry or allowed buyer. The pool cannot change.
    function update(uint256 id, Pricing calldata pricing, Terms calldata terms) external {
        Listing storage l = _listing(id);
        if (l.seller != msg.sender) revert NotSeller();
        _validate(pricing, l.pool, terms);
        l.pricing = pricing;
        l.terms = terms;
        if (pricing.mode == Mode.Market && _marketPrice(l) == 0) revert BadPrice();
        emit Updated(id, pricing, terms);
    }

    /// @notice Add more tokens to an existing listing.
    function topUp(uint256 id, uint256 amount) external nonReentrant {
        Listing storage l = _listing(id);
        if (l.seller != msg.sender) revert NotSeller();
        if (amount == 0) revert ZeroAmount();
        uint256 before = l.token.balanceOf(address(this));
        l.token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = l.token.balanceOf(address(this)) - before;
        l.remaining += uint128(received);
        emit ToppedUp(id, received, l.remaining);
    }

    /// @notice Take the unsold tokens back and close the listing.
    function cancel(uint256 id) external nonReentrant {
        Listing storage l = _listing(id);
        if (l.seller != msg.sender) revert NotSeller();
        uint256 back = l.remaining;
        if (back == 0) revert NotActive();
        l.remaining = 0;
        l.token.safeTransfer(msg.sender, back);
        emit Cancelled(id, back);
    }

    // ============================================================ buyers

    /// @notice Buy `amount` token base units. Send at least the quoted cost as msg.value; any excess is refunded
    ///         in the same transaction, so a market-priced fill cannot overcharge when the price moves.
    function fill(uint256 id, uint256 amount) external payable nonReentrant returns (uint256 cost) {
        Listing storage l = _listing(id);
        if (l.remaining == 0) revert NotActive();
        if (l.terms.expiry != 0 && block.timestamp > l.terms.expiry) revert Expired();
        if (l.terms.buyer != address(0) && msg.sender != l.terms.buyer) revert NotAllowedBuyer();
        if (amount == 0) revert ZeroAmount();
        if (amount > l.remaining) revert ExceedsRemaining(l.remaining);
        if (amount != l.remaining && amount < l.terms.minFill) revert BelowMinFill(l.terms.minFill);

        if (l.pricing.mode == Mode.Market) oracle.poke(l.pool.poolId);
        uint256 unit = _price(l);
        if (unit == 0) revert BadPrice();
        cost = FullMath.mulDivRoundingUp(amount, unit, 10 ** uint256(l.tokenDecimals));
        if (cost == 0) revert BadPrice();
        if (msg.value < cost) revert InsufficientPayment(cost, msg.value);

        uint256 fee = (cost * feeBps) / BPS;
        uint256 toSeller = cost - fee;
        l.remaining -= uint128(amount);
        l.sold += uint128(amount);
        l.proceeds += toSeller;
        accruedFees += fee;

        l.token.safeTransfer(msg.sender, amount);
        _payOrQueue(l.seller, toSeller);
        if (msg.value > cost) _pay(msg.sender, msg.value - cost);
        emit Filled(id, msg.sender, amount, cost, unit, fee);
    }

    /// @notice Collect USDC that could not be delivered directly (a seller contract that rejected the transfer).
    function claimPayout() external nonReentrant {
        uint256 owed = pendingPayouts[msg.sender];
        if (owed == 0) revert NothingToClaim();
        pendingPayouts[msg.sender] = 0;
        _pay(msg.sender, owed);
        emit PayoutClaimed(msg.sender, owed);
    }

    // ============================================================ views

    /// @notice Current USDC wei per whole token for a listing, and the raw market reference it came from
    ///         (0 for Fixed listings).
    function price(uint256 id) external view returns (uint256 current, uint256 marketRef) {
        Listing storage l = _listing(id);
        if (l.pricing.mode == Mode.Fixed) return (l.pricing.fixedPrice, 0);
        marketRef = _marketPrice(l);
        current = _applySpread(l, marketRef);
    }

    /// @notice Cost in USDC wei to buy `amount` base units now, the fee the seller would pay, and the unit price.
    function quote(uint256 id, uint256 amount) external view returns (uint256 cost, uint256 fee, uint256 unitPrice) {
        Listing storage l = _listing(id);
        unitPrice = _price(l);
        cost = FullMath.mulDivRoundingUp(amount, unitPrice, 10 ** uint256(l.tokenDecimals));
        fee = (cost * feeBps) / BPS;
    }

    /// @notice Token base units `usdc` wei buys right now, capped at what is left.
    function amountFor(uint256 id, uint256 usdc) external view returns (uint256 amount) {
        Listing storage l = _listing(id);
        uint256 p = _price(l);
        if (p == 0) return 0;
        amount = FullMath.mulDiv(usdc, 10 ** uint256(l.tokenDecimals), p);
        if (amount > l.remaining) amount = l.remaining;
    }

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function getListing(uint256 id) external view returns (Listing memory) {
        return _listing(id);
    }

    /// @notice Listings `from` (inclusive) to `to` (exclusive), clamped to the array, for paging in the UI.
    function getListings(uint256 from, uint256 to) external view returns (Listing[] memory out) {
        if (to > _listings.length) to = _listings.length;
        if (from >= to) return out;
        out = new Listing[](to - from);
        for (uint256 i = from; i < to; i++) {
            out[i - from] = _listings[i];
        }
    }

    function listingsOf(address seller) external view returns (uint256[] memory) {
        return _bySeller[seller];
    }

    function isActive(uint256 id) external view returns (bool) {
        Listing storage l = _listing(id);
        return l.remaining > 0 && (l.terms.expiry == 0 || block.timestamp <= l.terms.expiry);
    }

    // ============================================================ owner

    function setFee(uint16 _feeBps, address _feeReceiver) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = _feeBps;
        if (_feeReceiver != address(0)) feeReceiver = _feeReceiver;
        emit FeeUpdated(feeBps, feeReceiver);
    }

    function withdrawFees() external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        uint256 amount = accruedFees;
        accruedFees = 0;
        _pay(feeReceiver, amount);
        emit FeesWithdrawn(feeReceiver, amount);
    }

    // ============================================================ internals

    function _listing(uint256 id) internal view returns (Listing storage l) {
        if (id >= _listings.length) revert ListingNotFound();
        l = _listings[id];
    }

    function _validate(Pricing calldata pricing, Pool memory pool, Terms calldata terms) internal view {
        if (terms.expiry != 0 && terms.expiry <= block.timestamp) revert BadExpiry();
        if (pricing.mode == Mode.Fixed) {
            if (pricing.fixedPrice == 0) revert BadPrice();
        } else {
            if (PoolId.unwrap(pool.poolId) == bytes32(0)) revert PoolRequired();
            if (pool.poolUsdcDecimals != 6 && pool.poolUsdcDecimals != 18) revert BadPoolDecimals();
            if (pricing.spreadBps < MIN_SPREAD_BPS || pricing.spreadBps > MAX_SPREAD_BPS) revert BadSpread();
        }
    }

    function _price(Listing storage l) internal view returns (uint256) {
        if (l.pricing.mode == Mode.Fixed) return l.pricing.fixedPrice;
        return _applySpread(l, _marketPrice(l));
    }

    /// @dev Reference price: max(TWAP, spot) once the TWAP covers MIN_TWAP_COVERAGE, else spot.
    function _marketPrice(Listing storage l) internal view returns (uint256 ref) {
        (uint256 twap, uint256 spotPrice, uint32 covered) =
            oracle.prices(l.pool.poolId, TWAP_WINDOW, l.pool.usdcIs0, l.tokenDecimals, l.pool.poolUsdcDecimals);
        ref = spotPrice;
        if (covered >= MIN_TWAP_COVERAGE && twap > ref) ref = twap;
    }

    function _applySpread(Listing storage l, uint256 ref) internal view returns (uint256 p) {
        int256 bps = int256(BPS) + int256(l.pricing.spreadBps);
        p = FullMath.mulDiv(ref, uint256(bps), BPS);
        if (l.pricing.floorPrice != 0 && p < l.pricing.floorPrice) p = l.pricing.floorPrice;
    }

    function _decimals(IERC20 token) internal view returns (uint8) {
        try IERC20Metadata(address(token)).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Pay a seller; if the address rejects USDC, hold it for claimPayout so one bad seller cannot block fills.
    function _payOrQueue(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount, gas: 50_000}("");
        if (!ok) {
            pendingPayouts[to] += amount;
            emit PayoutQueued(to, amount);
        }
    }
}
