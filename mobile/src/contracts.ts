import { parseAbi } from "viem";
import { ARGUS_ERRORS } from "./argus";

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export const arcP2PAbi = parseAbi([
  "struct Pricing { uint8 mode; uint256 fixedPrice; int32 spreadBps; uint256 floorPrice; bool dumpProtection; }",
  "struct Pool { bytes32 poolId; bool usdcIs0; uint8 poolUsdcDecimals; }",
  "struct Terms { uint128 minFill; uint40 expiry; address buyer; }",
  "struct Listing { address seller; address token; uint8 tokenDecimals; uint40 createdAt; uint128 remaining; uint128 sold; uint256 proceeds; Pricing pricing; Pool pool; Terms terms; }",
  "function listingCount() view returns (uint256)",
  "function getListings(uint256 from, uint256 to) view returns (Listing[])",
  "function listingsOf(address seller) view returns (uint256[])",
  "function price(uint256 id) view returns (uint256 current, uint256 marketRef)",
  "function quote(uint256 id, uint256 amount) view returns (uint256 cost, uint256 fee, uint256 unitPrice)",
  "function pendingPayouts(address) view returns (uint256)",
  "function list(address token, uint256 amount, Pricing pricing, Pool pool, Terms terms) returns (uint256 id)",
  "function cancel(uint256 id)",
  "function fill(uint256 id, uint256 amount) payable returns (uint256 cost)",
  "function claimPayout()",
]);

export const arcLendAbi = parseAbi([
  "struct RiskParams { uint16 ltvBps; uint16 liqThresholdBps; uint16 liqBonusBps; uint16 reserveFactorBps; uint16 baseRateBps; uint16 slope1Bps; uint16 slope2Bps; uint16 kinkBps; uint256 supplyCap; uint256 borrowCap; }",
  "struct Market { address token; uint8 tokenDecimals; uint8 poolUsdcDecimals; bool usdcIs0; bool borrowsPaused; bytes32 poolId; RiskParams risk; uint256 totalSupplyShares; uint256 cash; uint256 totalBorrows; uint256 borrowIndex; uint64 lastAccrual; uint256 reserves; uint256 totalCollateral; }",
  "struct Account { uint256 supplyShares; uint256 collateral; uint256 borrowPrincipal; uint256 borrowIndexSnapshot; }",
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 id) view returns (Market)",
  "function getAccount(uint256 id, address user) view returns (Account)",
  "function debtOf(uint256 id, address user) view returns (uint256)",
  "function supplyBalanceOf(uint256 id, address user) view returns (uint256)",
  "function healthFactor(uint256 id, address user) view returns (uint256)",
  "function rates(uint256 id) view returns (uint256 borrowAprBps, uint256 supplyAprBps, uint256 utilBps)",
  "function priceOf(uint256 id) view returns (uint256 twap, uint256 spotPrice, uint32 covered)",
  "function supply(uint256 id) payable returns (uint256 shares)",
  "function withdraw(uint256 id, uint256 shares) returns (uint256 amount)",
  "function depositCollateral(uint256 id, uint256 amount)",
  "function withdrawCollateral(uint256 id, uint256 amount)",
  "function borrow(uint256 id, uint256 amount)",
  "function repay(uint256 id, address borrower) payable returns (uint256 repaid)",
]);

/** Plain-language versions of contract errors, shared with the web app's wording. */
export const ERROR_TEXT: Record<string, string> = {
  ListingNotFound: "That listing does not exist.",
  NotActive: "This listing has nothing left to sell.",
  Expired: "This listing has expired.",
  NotAllowedBuyer: "This listing is reserved for another buyer.",
  ExceedsRemaining: "That is more than the listing has left.",
  BelowMinFill: "That is below the seller's minimum fill.",
  InsufficientPayment: "The price moved; not enough USDC was sent. Try again.",
  SupplyCapReached: "This market's supply cap is reached.",
  BorrowCapReached: "This market's borrow cap is reached.",
  ExceedsBorrowLimit: "Your collateral does not cover that much.",
  InsufficientLiquidity: "Not enough idle USDC in the market right now.",
  OracleNotReady: "The price average is still filling. Try again in a few minutes.",
  PriceDeviation: "Spot price is too far from the average; borrowing is paused for a moment.",
  ...ARGUS_ERRORS,
};

export const lockerAbi = parseAbi([
  "function lockFee() view returns (uint256)",
  "function lock(address token, uint256 amount, uint256 unlockDate, address withdrawer) payable returns (uint256 lockId)",
]);

export const stakingAbi = parseAbi([
  "struct PoolConfig { address stakeToken; address rewardToken; uint64 startTime; uint64 duration; uint16 penaltyBps; uint256 minStake; uint256 maxStakePerWallet; uint256 maxTotalStaked; string name; }",
  "function createFee() view returns (uint256)",
  "function createPool(PoolConfig cfg, uint256 rewardAmount) payable returns (uint256 poolId)",
]);

export const airdropAbi = parseAbi([
  "function fee() view returns (uint256)",
  "function airdropERC20(address token, address[] recipients, uint256[] amounts) payable returns (uint256 total)",
  "function airdropERC20Same(address token, address[] recipients, uint256 amount) payable returns (uint256 total)",
  "error TooMany(uint256 count, uint256 max)",
  "error WrongFee(uint256 sent, uint256 required)",
  "error LengthMismatch()",
  "error EmptyList()",
]);
