// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcPayRouter} from "../src/ArcPayRouter.sol";

/// Usage:
///   ARCPAY_TREASURY=0x... forge script script/DeployArcPay.s.sol:DeployArcPay \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployArcPay is Script {
    function run() external returns (ArcPayRouter router) {
        address payable treasury = payable(vm.envAddress("ARCPAY_TREASURY"));
        vm.startBroadcast();
        router = new ArcPayRouter(treasury);
        vm.stopBroadcast();
        console.log("ArcPayRouter:", address(router));
        console.log("treasury:    ", router.treasury());
        console.log("owner:       ", router.owner());
    }
}
