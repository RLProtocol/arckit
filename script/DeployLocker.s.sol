// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TokenLocker} from "../src/TokenLocker.sol";

/// Usage:
///   forge script script/DeployLocker.s.sol:DeployLocker \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// Optional env:
///   FEE_RECEIVER=0x...   treasury for lock fees. If unset, the deployer
///                        (the broadcasting account) becomes the fee receiver.
contract DeployLocker is Script {
    function run() external returns (TokenLocker locker) {
        // Read the treasury explicitly instead of relying on the script's msg.sender,
        // which differs between --private-key, --account and --ledger invocations.
        address feeReceiver = vm.envOr("FEE_RECEIVER", address(0));

        vm.startBroadcast();
        // address(0) makes the constructor fall back to msg.sender, which inside a
        // broadcast is always the real deployer.
        locker = new TokenLocker(feeReceiver);
        vm.stopBroadcast();

        console.log("TokenLocker deployed at:", address(locker));
        console.log("Owner:                  ", locker.owner());
        console.log("Fee receiver:           ", locker.feeReceiver());
        console.log("Lock fee (wei):         ", locker.lockFee());
    }
}
