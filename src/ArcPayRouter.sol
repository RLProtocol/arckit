// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ArcPayRouter
/// @notice The on-chain receipt for an ArcPay purchase. On Arc the gas coin is USDC, so a buyer pays an
///         order in ONE transaction with no token approval: `pay(orderId)` with the amount as msg.value.
///
///         The contract never holds money. Every payment is forwarded to the treasury in the same call,
///         and a `Paid` event ties the payer, the amount and the order id together so the backend can
///         verify a payment from a transaction hash alone and nobody can claim someone else's payment.
///
///         Each order id can be paid once. A second payment for the same id reverts, so a buyer cannot
///         be double charged by a retry or a stuck wallet.
contract ArcPayRouter is Ownable2Step {
    error ZeroAmount();
    error ZeroAddress();
    error EmptyOrderId();
    error AlreadyPaid(bytes32 orderId);
    error ForwardFailed();

    address payable public treasury;
    uint256 public totalPaid;
    uint256 public paymentCount;

    struct Payment {
        address payer;
        uint96 paidAt;
        uint256 amount;
    }

    mapping(bytes32 => Payment) public payments;

    event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount, address treasury);
    event TreasuryUpdated(address indexed treasury);

    constructor(address payable _treasury) Ownable(msg.sender) {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    /// @notice Pay for an order. `msg.value` is native USDC (18 decimals on Arc).
    function pay(bytes32 orderId) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (orderId == bytes32(0)) revert EmptyOrderId();
        if (payments[orderId].payer != address(0)) revert AlreadyPaid(orderId);

        payments[orderId] = Payment(msg.sender, uint96(block.timestamp), msg.value);
        totalPaid += msg.value;
        paymentCount += 1;
        emit Paid(orderId, msg.sender, msg.value, treasury);

        (bool ok,) = treasury.call{value: msg.value}("");
        if (!ok) revert ForwardFailed();
    }

    function isPaid(bytes32 orderId) external view returns (bool) {
        return payments[orderId].payer != address(0);
    }

    function setTreasury(address payable t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }
}
