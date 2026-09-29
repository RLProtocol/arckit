// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title BulkAirdrop
/// @notice Send an ERC20 or the native coin to many wallets in one transaction.
///
/// ERC20 sends use `transferFrom(sender, recipient, amount)` per recipient, so
/// this contract never holds user tokens: approve the total once, sign once.
/// Fee-on-transfer tokens therefore behave exactly as a direct transfer would.
///
/// Native sends forward `msg.value - fee` to recipients and refund any excess.
///
/// A flat fee per transaction is charged in the native coin and accumulates for
/// pull-payment by the fee receiver. The contract owner can only change the fee
/// and the fee receiver.
contract BulkAirdrop is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Errors ----------

    error EmptyList();
    error TooMany(uint256 count, uint256 max);
    error LengthMismatch();
    error ZeroAddress();
    error ZeroAmount();
    error WrongFee(uint256 sent, uint256 required);
    error InsufficientValue(uint256 sent, uint256 required);
    error NativeSendFailed(address to);
    error RefundFailed();
    error NoFeesToClaim();
    error FeeTransferFailed();
    error NotFeeReceiver();

    // ---------- Storage ----------

    /// Upper bound on recipients per call so a batch always fits in a block. Frontends chunk above this.
    uint256 public constant MAX_RECIPIENTS = 500;

    /// Flat native-coin fee per airdrop transaction. Set to 0 to disable.
    uint256 public fee = 10 ether;
    address public feeReceiver;
    uint256 public pendingFees;

    /// Lifetime counters, handy for the UI.
    uint256 public totalAirdrops;
    uint256 public totalRecipients;

    // ---------- Events ----------

    event AirdropERC20(address indexed sender, address indexed token, uint256 recipients, uint256 totalAmount);
    event AirdropNative(address indexed sender, uint256 recipients, uint256 totalAmount);
    event FeeUpdated(uint256 newFee);
    event FeeReceiverUpdated(address indexed newReceiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    constructor(address _feeReceiver) Ownable(msg.sender) {
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ---------- ERC20 ----------

    /// @notice Send `amounts[i]` of `token` to `recipients[i]`. `msg.value` must equal `fee`.
    /// @dev Caller must have approved this contract for the sum of `amounts`.
    function airdropERC20(address token, address[] calldata recipients, uint256[] calldata amounts)
        external
        payable
        nonReentrant
        returns (uint256 total)
    {
        uint256 n = recipients.length;
        _checkList(n);
        if (amounts.length != n) revert LengthMismatch();
        if (msg.value != fee) revert WrongFee(msg.value, fee);

        IERC20 erc20 = IERC20(token);
        for (uint256 i = 0; i < n; i++) {
            address to = recipients[i];
            uint256 amt = amounts[i];
            if (to == address(0)) revert ZeroAddress();
            if (amt == 0) revert ZeroAmount();
            erc20.safeTransferFrom(msg.sender, to, amt);
            total += amt;
        }

        _afterAirdrop(n);
        emit AirdropERC20(msg.sender, token, n, total);
    }

    /// @notice Send the same `amount` of `token` to every recipient. `msg.value` must equal `fee`.
    function airdropERC20Same(address token, address[] calldata recipients, uint256 amount)
        external
        payable
        nonReentrant
        returns (uint256 total)
    {
        uint256 n = recipients.length;
        _checkList(n);
        if (amount == 0) revert ZeroAmount();
        if (msg.value != fee) revert WrongFee(msg.value, fee);

        IERC20 erc20 = IERC20(token);
        for (uint256 i = 0; i < n; i++) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();
            erc20.safeTransferFrom(msg.sender, to, amount);
        }
        total = amount * n;

        _afterAirdrop(n);
        emit AirdropERC20(msg.sender, token, n, total);
    }

    // ---------- Native coin ----------

    /// @notice Send `amounts[i]` of the native coin to `recipients[i]`.
    ///         `msg.value` must be at least `fee + sum(amounts)`; any excess is refunded.
    function airdropNative(address[] calldata recipients, uint256[] calldata amounts)
        external
        payable
        nonReentrant
        returns (uint256 total)
    {
        uint256 n = recipients.length;
        _checkList(n);
        if (amounts.length != n) revert LengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
        }
        uint256 required = total + fee;
        if (msg.value < required) revert InsufficientValue(msg.value, required);

        for (uint256 i = 0; i < n; i++) {
            (bool ok,) = recipients[i].call{value: amounts[i]}("");
            if (!ok) revert NativeSendFailed(recipients[i]);
        }

        _afterAirdrop(n);
        emit AirdropNative(msg.sender, n, total);

        uint256 excess = msg.value - required;
        if (excess > 0) {
            (bool r,) = msg.sender.call{value: excess}("");
            if (!r) revert RefundFailed();
        }
    }

    // ---------- Fees / admin ----------

    function claimFees() external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert NotFeeReceiver();
        uint256 amount = pendingFees;
        if (amount == 0) revert NoFeesToClaim();

        pendingFees = 0;
        emit FeesClaimed(feeReceiver, amount);

        (bool sent,) = feeReceiver.call{value: amount}("");
        if (!sent) revert FeeTransferFailed();
    }

    function setFee(uint256 newFee) external onlyOwner {
        fee = newFee;
        emit FeeUpdated(newFee);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(newReceiver);
    }

    // ---------- Internal ----------

    function _checkList(uint256 n) internal pure {
        if (n == 0) revert EmptyList();
        if (n > MAX_RECIPIENTS) revert TooMany(n, MAX_RECIPIENTS);
    }

    function _afterAirdrop(uint256 n) internal {
        if (fee > 0) pendingFees += fee;
        totalAirdrops += 1;
        totalRecipients += n;
    }
}
