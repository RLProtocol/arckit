// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TokenVesting} from "../src/TokenVesting.sol";

/// Usage:
///   forge script script/DeployVesting.s.sol:DeployVesting \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// Optional env:
///   FEE_RECEIVER=0x...   treasury for schedule fees; deployer if unset.
contract DeployVesting is Script {
    function run() external returns (TokenVesting vesting) {
        address feeReceiver = vm.envOr("FEE_RECEIVER", address(0));

        vm.startBroadcast();
        vesting = new TokenVesting(feeReceiver);
        vm.stopBroadcast();

        console.log("TokenVesting deployed at:", address(vesting));
        console.log("Owner:                   ", vesting.owner());
        console.log("Fee receiver:            ", vesting.feeReceiver());
        console.log("Fee (wei):               ", vesting.fee());
    }
}
