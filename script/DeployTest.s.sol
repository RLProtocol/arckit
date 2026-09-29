// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TokenLocker} from "../src/TokenLocker.sol";
import {TokenVesting} from "../src/TokenVesting.sol";

/// Test-only deployment: fresh TokenLocker + TokenVesting with a 0.1 USDC fee,
/// used for end-to-end exercising on the live chain. Not the production pair.
///
///   forge script script/DeployTest.s.sol:DeployTest \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployTest is Script {
    uint256 constant TEST_FEE = 0.1 ether;

    function run() external returns (TokenLocker locker, TokenVesting vesting) {
        vm.startBroadcast();
        locker = new TokenLocker(address(0));
        locker.setLockFee(TEST_FEE);
        vesting = new TokenVesting(address(0));
        vesting.setFee(TEST_FEE);
        vm.stopBroadcast();

        console.log("TEST TokenLocker: ", address(locker));
        console.log("TEST TokenVesting:", address(vesting));
        console.log("fee (wei):        ", locker.lockFee());
    }
}
