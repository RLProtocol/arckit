// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcFlowVault} from "../src/arcflow/ArcFlowVault.sol";

/// Deploys ArcFlowVault against Arc's official Uniswap v4 PoolManager and USDC.
///
///   forge script script/DeployArcFlow.s.sol:DeployArcFlow \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// Optional env: ARCFLOW_TREASURY=0x...  (deployer if unset)
contract DeployArcFlow is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    function run() external returns (ArcFlowVault vault) {
        require(block.chainid == 5042, "ArcFlowVault is wired to Arc mainnet addresses");
        address treasury = vm.envOr("ARCFLOW_TREASURY", address(0));

        vm.startBroadcast();
        vault = new ArcFlowVault(POOL_MANAGER, USDC, treasury);
        vm.stopBroadcast();

        console.log("ArcFlowVault deployed at:", address(vault));
        console.log("Owner:                   ", vault.owner());
        console.log("Treasury:                ", vault.treasury());
        console.log("Protocol fee bps:        ", vault.protocolFeeBps());
        console.log("PoolManager:             ", address(vault.poolManager()));
    }
}
