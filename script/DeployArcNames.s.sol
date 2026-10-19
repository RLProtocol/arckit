// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ArcNames} from "../src/ArcNames.sol";

/// Usage:
///   forge script script/DeployArcNames.s.sol:DeployArcNames \
///     --rpc-url https://5042.rpc.thirdweb.com --private-key $PRIVATE_KEY --broadcast
///
/// Owner and fee receiver are the deployer. Yearly prices in native USDC (18 decimals): 3 chars 50, 4 chars 20,
/// 5+ chars 5. The reserved list blocks impersonation from day one; the owner assigns those names later.
contract DeployArcNames is Script {
    function run() external returns (ArcNames names) {
        address deployer = msg.sender;
        uint256[3] memory prices = [uint256(50 ether), 20 ether, 5 ether];

        string[] memory reserved = new string[](24);
        reserved[0] = "arckit";
        reserved[1] = "arc";
        reserved[2] = "circle";
        reserved[3] = "usdc";
        reserved[4] = "eurc";
        reserved[5] = "usyc";
        reserved[6] = "argus";
        reserved[7] = "admin";
        reserved[8] = "support";
        reserved[9] = "wallet";
        reserved[10] = "official";
        reserved[11] = "team";
        reserved[12] = "help";
        reserved[13] = "security";
        reserved[14] = "arcpay";
        reserved[15] = "arclock";
        reserved[16] = "arclend";
        reserved[17] = "arccash";
        reserved[18] = "arcp2p";
        reserved[19] = "arcflow";
        reserved[20] = "akit";
        reserved[21] = "names";
        reserved[22] = "www";
        reserved[23] = "app";

        vm.startBroadcast();
        names = new ArcNames(deployer, deployer, prices);
        names.setReserved(reserved, true);
        vm.stopBroadcast();

        console.log("ArcNames deployed at:", address(names));
        console.log("Owner / fee receiver:", names.owner(), names.feeReceiver());
    }
}
