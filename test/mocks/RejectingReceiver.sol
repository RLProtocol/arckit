// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Contract that refuses all incoming native value. Used to prove a broken
/// fee receiver cannot block lock creation.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}
