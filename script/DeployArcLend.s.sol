// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ArcLend} from "../src/arclend/ArcLend.sol";
import {ArcTwapOracle, IStateViewSlot0} from "../src/arclend/ArcTwapOracle.sol";

/// Usage:
///   forge script script/DeployArcLend.s.sol:DeployArcLend \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast --slow
///
/// Optional env: FEE_RECEIVER=0x... (deployer if unset), ORACLE=0x... (reuse an existing ArcTwapOracle)
/// Deploys the oracle + ArcLend and lists the launch markets with the conservative parameter set.
contract DeployArcLend is Script {
    IStateViewSlot0 constant STATE_VIEW = IStateViewSlot0(0xF3334192D15450CdD385c8B70e03f9A6bD9E673b);

    struct Launch {
        string symbol;
        address token;
        bytes32 poolId;
        uint8 poolUsdcDecimals; // 6 = pool uses the USDC ERC-20 view (0x3600…), 18 = the native coin
    }

    function run() external returns (ArcTwapOracle oracle, ArcLend lend) {
        address feeReceiver = vm.envOr("FEE_RECEIVER", address(0));
        address existingOracle = vm.envOr("ORACLE", address(0));

        // Conservative launch set: LTV 50%, liquidation at 65%, 8% bonus, 10% reserve factor,
        // 2% base + 10% to the 80% kink + 50% beyond, 10k USDC supply cap, 5k USDC borrow cap per market.
        ArcLend.RiskParams memory risk = ArcLend.RiskParams({
            ltvBps: 5000,
            liqThresholdBps: 6500,
            liqBonusBps: 800,
            reserveFactorBps: 1000,
            baseRateBps: 200,
            slope1Bps: 1000,
            slope2Bps: 5000,
            kinkBps: 8000,
            supplyCap: 10_000 ether,
            borrowCap: 5_000 ether
        });

        Launch[5] memory launches = [
            Launch("AKIT", 0xBc3764348131Fe1962f267f442a8Fe30459ededD, 0x67b53af67c3f1886d0618b16f86684dfd75d486064782a3eddca83541400fdce, 6),
            Launch("ARCMAN", 0x5849Fd68a097B3eE7d87ce88a0fcBb76857648FF, 0xa3abdb2721cd343da530ff6fd0ad73f3caa77163ea2fb8206847249f9bba57d5, 6),
            Launch("ARCOON", 0x4621A0baA0b5D97AAe77704Cf2a84DabE78a4FED, 0xa2ed014384e061ec2aaccea186d41798dcf4da29264c44a676d3006fdc252ae0, 6),
            Launch("AF", 0x75d658f8101fBE6DC217FBba7E20a0312af5Fa2E, 0x1c0523377296238f6a2fd25cb3b15f75e280eb330ad29f843b974eec264dfe31, 18),
            Launch("ASTOCK", 0x4C9b47Dbd5933aa4574B2c27F82419E4DBBD0222, 0x1bb5c22ae4560dc887164d96ebeaa756130948314ce132fee3c8d14e5b95758b, 6)
        ];

        vm.startBroadcast();
        oracle = existingOracle == address(0) ? new ArcTwapOracle(STATE_VIEW) : ArcTwapOracle(existingOracle);
        lend = new ArcLend(oracle, feeReceiver);
        for (uint256 i = 0; i < launches.length; i++) {
            // every launch token's address is above USDC (0x3600…) and the native currency (0x0), so USDC is currency0
            uint256 id = lend.addMarket(IERC20(launches[i].token), PoolId.wrap(launches[i].poolId), true, launches[i].poolUsdcDecimals, risk);
            console.log(launches[i].symbol, "market", id);
        }
        vm.stopBroadcast();

        console.log("ArcTwapOracle:", address(oracle));
        console.log("ArcLend:      ", address(lend));
        console.log("owner:        ", lend.owner());
        console.log("fee receiver: ", lend.feeReceiver());
    }

}
