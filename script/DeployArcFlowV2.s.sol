// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ArcFlowPositions} from "../src/arcflow/v2/ArcFlowPositions.sol";
import {ArcFlowVaultV2} from "../src/arcflow/v2/ArcFlowVaultV2.sol";
import {ArcFlowFeeHook} from "../src/arcflow/v2/ArcFlowFeeHook.sol";

/// Usage:
///   forge script script/DeployArcFlowV2.s.sol:DeployArcFlowV2 \
///     --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast --slow
///
/// Optional env: FEE_RECEIVER=0x...  (deployer if unset)
///
/// The hook's permissions live in the low 14 bits of its address (afterInitialize | beforeSwap = 0x1080),
/// so its CREATE2 salt is mined here against Foundry's deterministic deployer.
contract DeployArcFlowV2 is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    uint160 constant HOOK_FLAGS = uint160((1 << 12) | (1 << 7));
    uint160 constant FLAG_MASK = uint160((1 << 14) - 1);

    function run() external returns (ArcFlowPositions positions, ArcFlowVaultV2 vault, ArcFlowFeeHook hook) {
        address treasury = vm.envOr("FEE_RECEIVER", address(0));

        bytes memory initCode = abi.encodePacked(type(ArcFlowFeeHook).creationCode, abi.encode(POOL_MANAGER));
        bytes32 initHash = keccak256(initCode);
        bytes32 salt;
        address predicted;
        for (uint256 i = 0; i < 500_000; i++) {
            salt = bytes32(i);
            predicted = vm.computeCreate2Address(salt, initHash, CREATE2_FACTORY);
            if (uint160(predicted) & FLAG_MASK == HOOK_FLAGS && predicted.code.length == 0) break;
        }
        require(uint160(predicted) & FLAG_MASK == HOOK_FLAGS, "no hook salt found");

        vm.startBroadcast();
        positions = new ArcFlowPositions(POOL_MANAGER, USDC, treasury);
        vault = new ArcFlowVaultV2(POOL_MANAGER, USDC, treasury);
        hook = new ArcFlowFeeHook{salt: salt}(POOL_MANAGER);
        vm.stopBroadcast();
        require(address(hook) == predicted, "hook address mismatch");

        console.log("ArcFlowPositions:", address(positions));
        console.log("ArcFlowVaultV2:  ", address(vault));
        console.log("ArcFlowFeeHook:  ", address(hook));
        console.log("hook salt:       ", uint256(salt));
        console.log("treasury:        ", positions.treasury());
    }
}
