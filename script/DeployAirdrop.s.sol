// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BulkAirdrop} from "../src/BulkAirdrop.sol";

/// Usage:
///   forge script script/DeployAirdrop.s.sol:DeployAirdrop \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// Optional env: FEE_RECEIVER=0x...  (deployer if unset)
contract DeployAirdrop is Script {
    function run() external returns (BulkAirdrop drop) {
        address feeReceiver = vm.envOr("FEE_RECEIVER", address(0));

        vm.startBroadcast();
        drop = new BulkAirdrop(feeReceiver);
        vm.stopBroadcast();

        console.log("BulkAirdrop deployed at:", address(drop));
        console.log("Owner:                  ", drop.owner());
        console.log("Fee receiver:           ", drop.feeReceiver());
        console.log("Fee (wei):              ", drop.fee());
        console.log("Max recipients per tx:  ", drop.MAX_RECIPIENTS());
    }
}
