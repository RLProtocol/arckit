// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcStaking} from "../src/ArcStaking.sol";

/// Usage:
///   forge script script/DeployStaking.s.sol:DeployStaking \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// Optional env: FEE_RECEIVER=0x...  (deployer if unset)
contract DeployStaking is Script {
    function run() external returns (ArcStaking staking) {
        address feeReceiver = vm.envOr("FEE_RECEIVER", address(0));

        vm.startBroadcast();
        staking = new ArcStaking(feeReceiver);
        vm.stopBroadcast();

        console.log("ArcStaking deployed at:", address(staking));
        console.log("Owner:                 ", staking.owner());
        console.log("Fee receiver:          ", staking.feeReceiver());
        console.log("Create fee (wei):      ", staking.createFee());
    }
}
