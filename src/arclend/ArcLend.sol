// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {ArcTwapOracle} from "./ArcTwapOracle.sol";

/// @title ArcLend
/// @notice Isolated USDC money markets on Arc. Each market pairs one collateral token with native USDC:
///         lenders supply USDC and earn interest; borrowers deposit the token and borrow USDC up to the
///         market's loan-to-value. Markets share nothing, so a bad token can only hurt its own market.
///
/// Pricing: a time-weighted average from the token's Uniswap v4 USDC pool (ArcTwapOracle). Borrowing and
/// collateral withdrawal value collateral at the lower of TWAP and spot and pause when spot deviates from the
/// TWAP by more than MAX_DEVIATION_BPS; liquidations use the TWAP so a manipulated spot cannot trigger them.
///
/// Interest: kinked utilisation curve, accrued per second. A reserve factor of each market's interest goes to
/// the protocol. The owner can add markets, tune risk within the hard caps below, set caps, pause new borrows
/// and withdraw reserves. It can never touch supplied USDC, collateral, or change what a user owes.
contract ArcLend is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Constants (hard caps the owner cannot exceed) ----------
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_LTV_BPS = 8_000;
    uint16 public constant MAX_LIQ_THRESHOLD_BPS = 9_000;
    uint16 public constant MIN_LIQ_GAP_BPS = 500; // liqThreshold - ltv
    uint16 public constant MAX_LIQ_BONUS_BPS = 2_000;
    uint16 public constant MAX_RESERVE_FACTOR_BPS = 3_000;
    uint16 public constant CLOSE_FACTOR_BPS = 5_000; // max share of debt repaid per liquidation
    uint16 public constant MAX_DEVIATION_BPS = 500; // spot vs TWAP guard for borrows
    uint32 public constant TWAP_WINDOW = 30 minutes;
    uint32 public constant MIN_TWAP_COVERAGE = 20 minutes;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // ---------- Types ----------
    struct RiskParams {
        uint16 ltvBps; // max borrow / collateral value
        uint16 liqThresholdBps; // liquidatable above this debt / collateral value
        uint16 liqBonusBps; // collateral discount for liquidators
        uint16 reserveFactorBps; // share of interest to the protocol
        uint16 baseRateBps; // annual, at 0% utilisation
        uint16 slope1Bps; // annual, added linearly up to the kink
        uint16 slope2Bps; // annual, added linearly from the kink to 100%
        uint16 kinkBps; // utilisation where slope2 starts
        uint256 supplyCap; // max USDC supplied (wei), 0 = none
        uint256 borrowCap; // max USDC borrowed (wei), 0 = none
    }

    struct Market {
        IERC20 token;
        uint8 tokenDecimals;
        uint8 poolUsdcDecimals;
        bool usdcIs0;
        bool borrowsPaused;
        PoolId poolId;
        RiskParams risk;
        // lender side
        uint256 totalSupplyShares;
        uint256 cash; // USDC held for this market (lenders' + reserves)
        // borrower side
        uint256 totalBorrows; // USDC owed incl. accrued interest
        uint256 borrowIndex; // WAD, grows with interest
        uint64 lastAccrual;
        uint256 reserves; // protocol's share of interest, part of `cash`
        uint256 totalCollateral;
    }

    struct Account {
        uint256 supplyShares;
        uint256 collateral;
        uint256 borrowPrincipal; // scaled by borrowIndexSnapshot
        uint256 borrowIndexSnapshot;
    }

    // ---------- Storage ----------
    ArcTwapOracle public immutable oracle;
    address public feeReceiver;
    /// @notice Trusted fast liquidator. May liquidate at the live spot price (public liquidations wait for the
    ///         30-minute TWAP), so a token that collapses in minutes is closed out before its collateral is worth
    ///         less than the debt. It gets the same bonus as anyone else and cannot touch healthy positions.
    address public guardian;
    Market[] internal _markets;
    mapping(uint256 => mapping(address => Account)) internal _accounts;

    // ---------- Events ----------
    event MarketAdded(uint256 indexed id, address indexed token, PoolId poolId);
    event RiskUpdated(uint256 indexed id);
    event BorrowsPaused(uint256 indexed id, bool paused);
    event Supplied(uint256 indexed id, address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(uint256 indexed id, address indexed user, uint256 amount, uint256 shares);
    event CollateralDeposited(uint256 indexed id, address indexed user, uint256 amount);
    event CollateralWithdrawn(uint256 indexed id, address indexed user, uint256 amount);
    event Borrowed(uint256 indexed id, address indexed user, uint256 amount);
    event Repaid(uint256 indexed id, address indexed user, address indexed payer, uint256 amount);
    event Liquidated(uint256 indexed id, address indexed borrower, address indexed liquidator, uint256 repaid, uint256 seized);
    event Accrued(uint256 indexed id, uint256 interest, uint256 toReserves, uint256 borrowIndex);
    event ReservesWithdrawn(uint256 indexed id, address to, uint256 amount);
    event FeeReceiverUpdated(address receiver);
    event GuardianUpdated(address guardian);

    // ---------- Errors ----------
    error MarketNotFound();
    error BadRiskParams();
    error ZeroAmount();
    error SupplyCapReached();
    error BorrowCapReached();
    error BorrowsArePaused();
    error InsufficientLiquidity();
    error InsufficientShares();
    error InsufficientCollateral();
    error ExceedsBorrowLimit();
    error NotLiquidatable();
    error NothingToRepay();
    error OracleNotReady();
    error PriceDeviation();
    error TransferFailed();
    error NothingReceived();
    error TokenAlreadyListed();
    error NotGuardian();

    constructor(ArcTwapOracle _oracle, address _feeReceiver) Ownable(msg.sender) {
        oracle = _oracle;
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ================================================================
    //                            Admin
    // ================================================================

    function addMarket(IERC20 token, PoolId poolId, bool usdcIs0, uint8 poolUsdcDecimals, RiskParams calldata risk) external onlyOwner returns (uint256 id) {
        _validateRisk(risk);
        for (uint256 i = 0; i < _markets.length; i++) if (_markets[i].token == token) revert TokenAlreadyListed();
        uint8 dec = IERC20Metadata(address(token)).decimals();
        id = _markets.length;
        _markets.push();
        Market storage m = _markets[id];
        m.token = token;
        m.tokenDecimals = dec;
        m.poolUsdcDecimals = poolUsdcDecimals;
        m.usdcIs0 = usdcIs0;
        m.poolId = poolId;
        m.risk = risk;
        m.borrowIndex = WAD;
        m.lastAccrual = uint64(block.timestamp);
        oracle.poke(poolId); // first observation, and proves the pool exists
        emit MarketAdded(id, address(token), poolId);
    }

    function setRisk(uint256 id, RiskParams calldata risk) external onlyOwner {
        _validateRisk(risk);
        Market storage m = _market(id);
        _accrue(m, id);
        m.risk = risk;
        emit RiskUpdated(id);
    }

    function setBorrowsPaused(uint256 id, bool paused) external onlyOwner {
        _market(id).borrowsPaused = paused;
        emit BorrowsPaused(id, paused);
    }

    function setFeeReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert TransferFailed();
        feeReceiver = receiver;
        emit FeeReceiverUpdated(receiver);
    }

    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianUpdated(_guardian);
    }

    /// @notice Protocol reserves are interest already earned; withdrawing them never touches lender or borrower balances.
    function withdrawReserves(uint256 id, uint256 amount) external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        Market storage m = _market(id);
        _accrue(m, id);
        if (amount > m.reserves) amount = m.reserves;
        if (amount > m.cash) amount = m.cash;
        if (amount == 0) revert ZeroAmount();
        m.reserves -= amount;
        m.cash -= amount;
        _pay(feeReceiver, amount);
        emit ReservesWithdrawn(id, feeReceiver, amount);
    }

    function _validateRisk(RiskParams calldata r) internal pure {
        if (r.ltvBps == 0 || r.ltvBps > MAX_LTV_BPS) revert BadRiskParams();
        if (r.liqThresholdBps > MAX_LIQ_THRESHOLD_BPS || r.liqThresholdBps < r.ltvBps + MIN_LIQ_GAP_BPS) revert BadRiskParams();
        if (r.liqBonusBps == 0 || r.liqBonusBps > MAX_LIQ_BONUS_BPS) revert BadRiskParams();
        if (r.reserveFactorBps > MAX_RESERVE_FACTOR_BPS) revert BadRiskParams();
        if (r.kinkBps == 0 || r.kinkBps >= BPS) revert BadRiskParams();
        if (r.baseRateBps > 5_000 || r.slope1Bps > 20_000 || r.slope2Bps > 50_000) revert BadRiskParams();
    }

    // ================================================================
    //                            Lenders
    // ================================================================

    /// @notice Supply USDC (sent as msg.value) and receive interest-bearing shares.
    function supply(uint256 id) external payable nonReentrant returns (uint256 shares) {
        if (msg.value == 0) revert ZeroAmount();
        Market storage m = _market(id);
        _accrue(m, id);
        if (m.risk.supplyCap != 0 && _underlying(m) + msg.value > m.risk.supplyCap) revert SupplyCapReached();
        shares = m.totalSupplyShares == 0 ? msg.value : FullMath.mulDiv(msg.value, m.totalSupplyShares, _underlying(m));
        if (shares == 0) revert ZeroAmount();
        m.totalSupplyShares += shares;
        m.cash += msg.value;
        _accounts[id][msg.sender].supplyShares += shares;
        emit Supplied(id, msg.sender, msg.value, shares);
    }

    /// @notice Redeem shares for USDC. Limited by the market's idle cash (what is not lent out).
    function withdraw(uint256 id, uint256 shares) external nonReentrant returns (uint256 amount) {
        Market storage m = _market(id);
        Account storage a = _accounts[id][msg.sender];
        if (shares == 0 || shares > a.supplyShares) revert InsufficientShares();
        _accrue(m, id);
        amount = FullMath.mulDiv(shares, _underlying(m), m.totalSupplyShares);
        if (amount > m.cash - m.reserves) revert InsufficientLiquidity();
        a.supplyShares -= shares;
        m.totalSupplyShares -= shares;
        m.cash -= amount;
        _pay(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount, shares);
    }

    // ================================================================
    //                           Borrowers
    // ================================================================

    function depositCollateral(uint256 id, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Market storage m = _market(id);
        uint256 before = m.token.balanceOf(address(this));
        m.token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = m.token.balanceOf(address(this)) - before; // fee-on-transfer tokens count what arrived
        if (received == 0) revert NothingReceived();
        _accounts[id][msg.sender].collateral += received;
        m.totalCollateral += received;
        emit CollateralDeposited(id, msg.sender, received);
    }

    function withdrawCollateral(uint256 id, uint256 amount) external nonReentrant {
        Market storage m = _market(id);
        Account storage a = _accounts[id][msg.sender];
        if (amount == 0 || amount > a.collateral) revert InsufficientCollateral();
        _accrue(m, id);
        a.collateral -= amount;
        m.totalCollateral -= amount;
        if (_debt(m, a) != 0) {
            uint256 price = _borrowPrice(m);
            if (_debt(m, a) > _limit(m, a.collateral, price, m.risk.ltvBps)) revert ExceedsBorrowLimit();
        }
        m.token.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(id, msg.sender, amount);
    }

    function borrow(uint256 id, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Market storage m = _market(id);
        if (m.borrowsPaused) revert BorrowsArePaused();
        Account storage a = _accounts[id][msg.sender];
        _accrue(m, id);
        if (amount > m.cash - m.reserves) revert InsufficientLiquidity();
        if (m.risk.borrowCap != 0 && m.totalBorrows + amount > m.risk.borrowCap) revert BorrowCapReached();
        uint256 price = _borrowPrice(m);
        uint256 newDebt = _debt(m, a) + amount;
        if (newDebt > _limit(m, a.collateral, price, m.risk.ltvBps)) revert ExceedsBorrowLimit();
        a.borrowPrincipal = FullMath.mulDiv(newDebt, WAD, m.borrowIndex);
        a.borrowIndexSnapshot = m.borrowIndex;
        m.totalBorrows += amount;
        m.cash -= amount;
        _pay(msg.sender, amount);
        emit Borrowed(id, msg.sender, amount);
    }

    /// @notice Repay USDC (msg.value) on behalf of `borrower`; any excess over the debt is returned.
    function repay(uint256 id, address borrower) external payable nonReentrant returns (uint256 repaid) {
        if (msg.value == 0) revert ZeroAmount();
        Market storage m = _market(id);
        Account storage a = _accounts[id][borrower];
        _accrue(m, id);
        uint256 debt = _debt(m, a);
        if (debt == 0) revert NothingToRepay();
        repaid = msg.value > debt ? debt : msg.value;
        _setDebt(m, a, debt - repaid);
        m.totalBorrows -= repaid;
        m.cash += repaid;
        if (msg.value > repaid) _pay(msg.sender, msg.value - repaid);
        emit Repaid(id, borrower, msg.sender, repaid);
    }

    // ================================================================
    //                          Liquidation
    // ================================================================

    /// @notice Repay up to CLOSE_FACTOR of an unhealthy borrower's debt (msg.value) and receive their collateral
    ///         at a liqBonus discount, priced at the TWAP. Excess USDC is returned.
    function liquidate(uint256 id, address borrower) external payable nonReentrant returns (uint256 repaid, uint256 seized) {
        Market storage m = _market(id);
        (uint256 twap,,) = _prices(m);
        return _liquidate(m, id, borrower, twap);
    }

    /// @notice Guardian-only: same rules as `liquidate`, but priced at the lower of TWAP and live spot, so a
    ///         crash that has not yet reached the 30-minute average is still closed out in time.
    function guardianLiquidate(uint256 id, address borrower) external payable nonReentrant returns (uint256 repaid, uint256 seized) {
        if (msg.sender != guardian) revert NotGuardian();
        Market storage m = _market(id);
        oracle.poke(m.poolId);
        (uint256 twap, uint256 spotPrice,) = _prices(m);
        return _liquidate(m, id, borrower, spotPrice < twap ? spotPrice : twap);
    }

    function _liquidate(Market storage m, uint256 id, address borrower, uint256 price) internal returns (uint256 repaid, uint256 seized) {
        if (msg.value == 0) revert ZeroAmount();
        Account storage a = _accounts[id][borrower];
        _accrue(m, id);
        uint256 debt = _debt(m, a);
        if (debt == 0 || debt <= _limit(m, a.collateral, price, m.risk.liqThresholdBps)) revert NotLiquidatable();

        // normally at most CLOSE_FACTOR of the debt per call; once the collateral no longer covers the debt the
        // whole position may be closed, so bad debt is not left behind by a partial liquidation
        uint256 collateralValue = _limit(m, a.collateral, price, uint16(BPS));
        uint256 maxRepay = debt > collateralValue ? debt : FullMath.mulDiv(debt, CLOSE_FACTOR_BPS, BPS);
        if (maxRepay == 0) maxRepay = debt;
        repaid = msg.value > maxRepay ? maxRepay : msg.value;
        // collateral units = repaid * (1 + bonus) / price
        seized = FullMath.mulDiv(FullMath.mulDiv(repaid, BPS + m.risk.liqBonusBps, BPS), 10 ** m.tokenDecimals, price);
        if (seized > a.collateral) {
            // not enough collateral to cover the bonus: take it all and repay proportionally less
            repaid = FullMath.mulDiv(a.collateral, price, 10 ** m.tokenDecimals);
            repaid = FullMath.mulDiv(repaid, BPS, BPS + m.risk.liqBonusBps);
            seized = a.collateral;
        }
        if (repaid == 0) revert NotLiquidatable();
        _setDebt(m, a, debt - repaid);
        m.totalBorrows -= repaid;
        m.cash += repaid;
        a.collateral -= seized;
        m.totalCollateral -= seized;
        if (msg.value > repaid) _pay(msg.sender, msg.value - repaid);
        m.token.safeTransfer(msg.sender, seized);
        emit Liquidated(id, borrower, msg.sender, repaid, seized);
    }

    // ================================================================
    //                            Views
    // ================================================================

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return _market(id);
    }

    function getAccount(uint256 id, address user) external view returns (Account memory) {
        return _accounts[id][user];
    }

    /// @notice USDC owed right now, including interest not yet accrued on-chain.
    function debtOf(uint256 id, address user) external view returns (uint256) {
        Market storage m = _market(id);
        Account storage a = _accounts[id][user];
        if (a.borrowPrincipal == 0) return 0;
        (uint256 index,,) = _projectedIndex(m);
        return FullMath.mulDiv(a.borrowPrincipal, index, WAD);
    }

    /// @notice USDC a lender can redeem right now for all their shares.
    function supplyBalanceOf(uint256 id, address user) external view returns (uint256) {
        Market storage m = _market(id);
        Account storage a = _accounts[id][user];
        if (a.supplyShares == 0) return 0;
        (, uint256 interest, uint256 toReserves) = _projectedIndex(m);
        uint256 underlying = m.cash + m.totalBorrows + interest - m.reserves - toReserves;
        return FullMath.mulDiv(a.supplyShares, underlying, m.totalSupplyShares);
    }

    /// @notice Health factor scaled 1e18: collateral value * liqThreshold / debt. Below 1e18 is liquidatable. No debt = max.
    function healthFactor(uint256 id, address user) external view returns (uint256) {
        Market storage m = _market(id);
        Account storage a = _accounts[id][user];
        if (a.borrowPrincipal == 0) return type(uint256).max;
        (uint256 index,,) = _projectedIndex(m);
        uint256 debt = FullMath.mulDiv(a.borrowPrincipal, index, WAD);
        (uint256 twap,,) = _prices(m);
        return FullMath.mulDiv(_limit(m, a.collateral, twap, m.risk.liqThresholdBps), WAD, debt);
    }

    /// @notice For liquidation bots: debt, collateral, the TWAP and spot prices, and whether the position is
    ///         liquidatable by the public (TWAP) or by the guardian (lower of TWAP and spot). `liqPrice` is the token
    ///         price (USDC wei per whole token) below which the position is liquidatable.
    function liquidationState(uint256 id, address user)
        external
        view
        returns (uint256 debt, uint256 collateral, uint256 twap, uint256 spotPrice, uint256 liqPrice, bool byPublic, bool byGuardian)
    {
        Market storage m = _market(id);
        Account storage a = _accounts[id][user];
        (uint256 index,,) = _projectedIndex(m);
        debt = a.borrowPrincipal == 0 ? 0 : FullMath.mulDiv(a.borrowPrincipal, index, WAD);
        collateral = a.collateral;
        (twap, spotPrice,) = _prices(m);
        if (debt == 0 || collateral == 0) return (debt, collateral, twap, spotPrice, 0, false, false);
        liqPrice = FullMath.mulDiv(debt * BPS, 10 ** m.tokenDecimals, collateral * m.risk.liqThresholdBps);
        byPublic = debt > _limit(m, collateral, twap, m.risk.liqThresholdBps);
        uint256 low = spotPrice < twap ? spotPrice : twap;
        byGuardian = debt > _limit(m, collateral, low, m.risk.liqThresholdBps);
    }

    /// @notice Annual rates in bps at the market's current utilisation: (borrow APR, supply APR, utilisation bps).
    function rates(uint256 id) external view returns (uint256 borrowAprBps, uint256 supplyAprBps, uint256 utilBps) {
        Market storage m = _market(id);
        utilBps = _utilBps(m);
        borrowAprBps = _borrowRateBps(m.risk, utilBps);
        supplyAprBps = (borrowAprBps * utilBps * (BPS - m.risk.reserveFactorBps)) / (BPS * BPS);
    }

    /// @notice Oracle view for the UI: TWAP price, spot price (USDC wei per whole token) and TWAP coverage.
    function priceOf(uint256 id) external view returns (uint256 twap, uint256 spotPrice, uint32 covered) {
        return _prices(_market(id));
    }

    // ================================================================
    //                           Internals
    // ================================================================

    function _market(uint256 id) internal view returns (Market storage m) {
        if (id >= _markets.length) revert MarketNotFound();
        m = _markets[id];
    }

    /// @dev Lenders' claim: cash + borrows owed - protocol reserves.
    function _underlying(Market storage m) internal view returns (uint256) {
        return m.cash + m.totalBorrows - m.reserves;
    }

    function _utilBps(Market storage m) internal view returns (uint256) {
        uint256 lendable = m.cash - m.reserves + m.totalBorrows;
        return lendable == 0 ? 0 : (m.totalBorrows * BPS) / lendable;
    }

    function _borrowRateBps(RiskParams storage r, uint256 utilBps) internal view returns (uint256) {
        if (utilBps <= r.kinkBps) return r.baseRateBps + (uint256(r.slope1Bps) * utilBps) / r.kinkBps;
        return r.baseRateBps + r.slope1Bps + (uint256(r.slope2Bps) * (utilBps - r.kinkBps)) / (BPS - r.kinkBps);
    }

    /// @dev Borrow index and interest as they would be after accruing now.
    function _projectedIndex(Market storage m) internal view returns (uint256 index, uint256 interest, uint256 toReserves) {
        index = m.borrowIndex;
        uint256 dt = block.timestamp - m.lastAccrual;
        if (dt == 0 || m.totalBorrows == 0) return (index, 0, 0);
        uint256 rateBps = _borrowRateBps(m.risk, _utilBps(m));
        // simple interest over dt, compounding at every accrual
        uint256 factor = FullMath.mulDiv(rateBps * WAD, dt, BPS * SECONDS_PER_YEAR); // WAD-scaled growth
        interest = FullMath.mulDiv(m.totalBorrows, factor, WAD);
        toReserves = FullMath.mulDiv(interest, m.risk.reserveFactorBps, BPS);
        index = FullMath.mulDiv(index, WAD + factor, WAD);
    }

    function _accrue(Market storage m, uint256 id) internal {
        (uint256 index, uint256 interest, uint256 toReserves) = _projectedIndex(m);
        if (block.timestamp == m.lastAccrual) return;
        m.lastAccrual = uint64(block.timestamp);
        if (interest == 0) return;
        m.totalBorrows += interest;
        m.reserves += toReserves;
        m.borrowIndex = index;
        emit Accrued(id, interest, toReserves, index);
    }

    function _debt(Market storage m, Account storage a) internal view returns (uint256) {
        if (a.borrowPrincipal == 0) return 0;
        return FullMath.mulDiv(a.borrowPrincipal, m.borrowIndex, WAD);
    }

    function _setDebt(Market storage m, Account storage a, uint256 debt) internal {
        a.borrowPrincipal = debt == 0 ? 0 : FullMath.mulDiv(debt, WAD, m.borrowIndex);
        a.borrowIndexSnapshot = m.borrowIndex;
    }

    /// @dev USDC value of `collateral` at `price`, scaled by a bps factor.
    function _limit(Market storage m, uint256 collateral, uint256 price, uint16 factorBps) internal view returns (uint256) {
        uint256 value = FullMath.mulDiv(collateral, price, 10 ** m.tokenDecimals);
        return FullMath.mulDiv(value, factorBps, BPS);
    }

    function _prices(Market storage m) internal view returns (uint256 twap, uint256 spotPrice, uint32 covered) {
        return oracle.prices(m.poolId, TWAP_WINDOW, m.usdcIs0, m.tokenDecimals, m.poolUsdcDecimals);
    }

    /// @dev Price used to open or extend risk: the lower of TWAP and spot, with freshness and deviation guards.
    ///      Pokes the oracle first so every borrow adds an observation.
    function _borrowPrice(Market storage m) internal returns (uint256) {
        oracle.poke(m.poolId);
        (uint256 twap, uint256 spotPrice, uint32 covered) = _prices(m);
        if (covered < MIN_TWAP_COVERAGE) revert OracleNotReady();
        uint256 diff = twap > spotPrice ? twap - spotPrice : spotPrice - twap;
        if (FullMath.mulDiv(diff, BPS, twap) > MAX_DEVIATION_BPS) revert PriceDeviation();
        return twap < spotPrice ? twap : spotPrice;
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Anyone may accrue a market and refresh its oracle observation (keepers, the UI).
    function poke(uint256 id) external {
        Market storage m = _market(id);
        _accrue(m, id);
        oracle.poke(m.poolId);
    }
}
