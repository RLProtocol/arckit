// SPDX-License-Identifier: MIT
pragma solidity >=0.4.16 >=0.6.2 ^0.8.20 ^0.8.24;

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/utils/StorageSlot.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/extensions/IERC20Metadata.sol)

/**
 * @dev Interface for the optional metadata functions from the ERC-20 standard.
 */
interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}

// lib/openzeppelin-contracts/contracts/access/Ownable2Step.sol

// OpenZeppelin Contracts (last updated v5.1.0) (access/Ownable2Step.sol)

/**
 * @dev Contract module which provides access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * This extension of the {Ownable} contract includes a two-step mechanism to transfer
 * ownership, where the new owner must call {acceptOwnership} in order to replace the
 * old one. This can help prevent common mistakes, such as transfers of ownership to
 * incorrect accounts, or to contracts that are unable to interact with the
 * permission system.
 *
 * The initial owner is specified at deployment time in the constructor for `Ownable`. This
 * can later be changed with {transferOwnership} and {acceptOwnership}.
 *
 * This module is used through inheritance. It will make available all functions
 * from parent (Ownable).
 */
abstract contract Ownable2Step is Ownable {
    address private _pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Returns the address of the pending owner.
     */
    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }

    /**
     * @dev Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one.
     * Can only be called by the current owner.
     *
     * Setting `newOwner` to the zero address is allowed; this can be used to cancel an initiated ownership transfer.
     */
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner(), newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`) and deletes any pending owner.
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual override {
        delete _pendingOwner;
        super._transferOwnership(newOwner);
    }

    /**
     * @dev The new owner accepts the ownership transfer.
     */
    function acceptOwnership() public virtual {
        address sender = _msgSender();
        if (pendingOwner() != sender) {
            revert OwnableUnauthorizedAccount(sender);
        }
        _transferOwnership(sender);
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.7.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /// @dev Attempts to fetch the token decimals. A return value of false indicates that the attempt failed in some way.
    function tryGetDecimals(IERC20 token) internal view returns (bool success, uint8 decimals) {
        bytes4 selector = IERC20Metadata.decimals.selector;
        assembly ("memory-safe") {
            mstore(0x00, selector)
            success := staticcall(gas(), token, 0x00, 4, 0x00, 0x20)
            success := and(and(success, gt(returndatasize(), 0x1f)), lt(mload(0x00), 0x100))
            decimals := mul(success, mload(0x00))
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to approve
     * @param bubble Behavior switch if the approve call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}

// src/ArcStaking.sol

/// @title ArcStaking
/// @notice Registry of time-boxed staking pools for any ERC20. A project creates a pool
///         by choosing a duration and depositing a reward amount; the rewards stream evenly
///         per second over the duration to everyone staked, pro-rata. APY is a consequence
///         of rewards remaining vs. total staked, so creators never set a rate.
///
/// Early withdrawal: a pool may carry a penalty (e.g. 10%) charged on principal withdrawn
/// before the pool ends. When the reward token is the staked token the penalty is added to
/// the reward pool for the stakers who stay; otherwise it is sent to the creator. Once the
/// pool has ended, withdrawals are always free.
///
/// Creator controls: add rewards (raises the rate for the remaining time), extend the pool
/// with more time and rewards, pause new stakes (never withdrawals or claims), and after the
/// end reclaim rewards that were never earned because nobody was staked. Creators can never
/// touch staked principal.
///
/// Protocol: flat native-coin fee to create a pool, pull-payment to the fee receiver. The
/// contract owner can only change that fee and its receiver.
contract ArcStaking is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Types ----------

    struct PoolConfig {
        address stakeToken;
        address rewardToken;
        uint64 startTime; // 0 = now
        uint64 duration; // seconds rewards are streamed over (>= 1 hour, <= 4 years)
        uint16 penaltyBps; // early-withdrawal penalty on principal, 0..5000
        uint256 minStake; // per wallet, 0 = none
        uint256 maxStakePerWallet; // 0 = none
        uint256 maxTotalStaked; // 0 = none
        string name; // display name, up to 48 chars
    }

    struct Pool {
        PoolConfig cfg;
        address creator;
        bool paused; // blocks new stakes only
        uint64 periodFinish; // rewards stop streaming here
        uint64 lastUpdate;
        uint256 rewardRate; // reward wei per second, scaled 1e18
        uint256 rewardPerTokenStored; // scaled 1e18
        uint256 totalStaked;
        uint256 rewardReserve; // reward tokens held for this pool (funded + penalties, minus claims)
        uint256 accruedTotal; // lifetime rewards accrued to stakers
        uint256 claimedTotal; // lifetime rewards paid out
        uint256 totalRewardsAdded; // lifetime funding (for display)
        uint256 stakers;
    }

    struct UserInfo {
        uint256 staked;
        uint256 rewardPerTokenPaid;
        uint256 rewards; // accrued, unclaimed
        uint64 firstStakeAt;
    }

    // ---------- Errors ----------

    error ZeroAddress();
    error ZeroAmount();
    error WrongFee(uint256 sent, uint256 required);
    error BadConfig();
    error NotCreator();
    error PoolNotFound();
    error PoolPaused();
    error NotStarted();
    error Ended();
    error NotEnded();
    error BelowMinStake();
    error AboveMaxStake();
    error PoolFull();
    error InsufficientStake();
    error NothingToClaim();
    error NothingReceived();
    error RewardTokenMismatch();
    error NothingToReclaim();
    error NoFeesToClaim();
    error FeeTransferFailed();
    error NotFeeReceiver();

    // ---------- Storage ----------

    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_PENALTY_BPS = 5_000;
    uint256 private constant PRECISION = 1e18;

    uint256 public nextPoolId = 1;
    mapping(uint256 => Pool) private pools;
    mapping(uint256 => mapping(address => UserInfo)) public users;
    mapping(address => uint256[]) private creatorPools;
    mapping(address => uint256[]) private stakeTokenPools;
    mapping(address => uint256[]) private userPools;
    mapping(uint256 => mapping(address => bool)) private inUserPools;

    uint256 public createFee = 10 ether;
    address public feeReceiver;
    uint256 public pendingFees;

    // ---------- Events ----------

    event PoolCreated(uint256 indexed poolId, address indexed creator, address indexed stakeToken, address rewardToken, uint64 startTime, uint64 duration, uint256 rewards, uint16 penaltyBps, string name);
    event RewardsAdded(uint256 indexed poolId, address indexed from, uint256 amount, uint64 periodFinish, uint256 rewardRate);
    event PoolExtended(uint256 indexed poolId, uint64 newFinish, uint256 addedRewards, uint256 rewardRate);
    event PoolPausedSet(uint256 indexed poolId, bool paused);
    event UndistributedReclaimed(uint256 indexed poolId, uint256 amount);
    event Staked(uint256 indexed poolId, address indexed user, uint256 amount);
    event Unstaked(uint256 indexed poolId, address indexed user, uint256 amount, uint256 penalty);
    event Claimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event FeeUpdated(uint256 newFee);
    event FeeReceiverUpdated(address indexed newReceiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    constructor(address _feeReceiver) Ownable(msg.sender) {
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ============================================================
    //                        CREATE / FUND
    // ============================================================

    /// @notice Create a pool and deposit its rewards. `msg.value` must equal `createFee`.
    function createPool(PoolConfig calldata cfg, uint256 rewardAmount) external payable nonReentrant returns (uint256 id) {
        if (msg.value != createFee) revert WrongFee(msg.value, createFee);
        if (cfg.stakeToken == address(0) || cfg.rewardToken == address(0)) revert ZeroAddress();
        if (rewardAmount == 0) revert ZeroAmount();
        if (cfg.duration < 1 hours || cfg.duration > 4 * 365 days) revert BadConfig();
        if (cfg.penaltyBps > MAX_PENALTY_BPS) revert BadConfig();
        if (cfg.maxStakePerWallet != 0 && cfg.minStake > cfg.maxStakePerWallet) revert BadConfig();
        if (cfg.startTime != 0 && cfg.startTime < block.timestamp) revert BadConfig();
        if (bytes(cfg.name).length > 48) revert BadConfig();

        id = nextPoolId++;
        Pool storage p = pools[id];
        p.cfg = cfg;
        uint64 start = cfg.startTime == 0 ? uint64(block.timestamp) : cfg.startTime;
        p.cfg.startTime = start;
        p.creator = msg.sender;
        p.lastUpdate = start;
        p.periodFinish = start + cfg.duration;

        uint256 received = _pull(cfg.rewardToken, rewardAmount);
        p.rewardReserve = received;
        p.totalRewardsAdded = received;
        p.rewardRate = (received * PRECISION) / cfg.duration;

        creatorPools[msg.sender].push(id);
        stakeTokenPools[cfg.stakeToken].push(id);
        if (msg.value > 0) pendingFees += msg.value;

        emit PoolCreated(id, msg.sender, cfg.stakeToken, cfg.rewardToken, start, cfg.duration, received, cfg.penaltyBps, cfg.name);
    }

    /// @notice Add rewards to a running pool. The rate rises for the remaining time; the end does not move.
    ///         Anyone may add. Reverts once the pool has ended (use `extendPool`).
    function addRewards(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= p.periodFinish) revert Ended();
        _updatePool(poolId);
        uint256 received = _pull(p.cfg.rewardToken, amount);
        p.rewardReserve += received;
        p.totalRewardsAdded += received;
        _notify(p, received);
        emit RewardsAdded(poolId, msg.sender, received, p.periodFinish, p.rewardRate);
    }

    /// @notice Creator: push the end later by `extraDuration` and optionally add rewards. Works on
    ///         running or ended pools; leftover undistributed rewards are re-streamed over the new period.
    function extendPool(uint256 poolId, uint64 extraDuration, uint256 extraRewards) external nonReentrant onlyCreator(poolId) {
        if (extraDuration == 0 || extraDuration > 4 * 365 days) revert BadConfig();
        Pool storage p = pools[poolId];
        _updatePool(poolId);
        uint256 received = extraRewards > 0 ? _pull(p.cfg.rewardToken, extraRewards) : 0;
        p.rewardReserve += received;
        p.totalRewardsAdded += received;

        uint64 base = block.timestamp > p.periodFinish ? uint64(block.timestamp) : p.periodFinish;
        uint64 newFinish = base + extraDuration;
        // everything in the reserve that is not owed to stakers gets streamed over [now, newFinish]
        uint256 owed = p.accruedTotal - p.claimedTotal;
        uint256 toStream = p.rewardReserve > owed ? p.rewardReserve - owed : 0;
        p.periodFinish = newFinish;
        p.lastUpdate = uint64(block.timestamp);
        p.rewardRate = (toStream * PRECISION) / (newFinish - uint64(block.timestamp));
        p.cfg.duration = uint64(newFinish - p.cfg.startTime);
        emit PoolExtended(poolId, newFinish, received, p.rewardRate);
    }

    // ============================================================
    //                        CREATOR CONTROLS
    // ============================================================

    modifier onlyCreator(uint256 poolId) {
        if (pools[poolId].creator == address(0)) revert PoolNotFound();
        if (pools[poolId].creator != msg.sender) revert NotCreator();
        _;
    }

    /// @notice Pause or resume new stakes. Withdrawals and claims are never paused.
    function setPaused(uint256 poolId, bool paused) external onlyCreator(poolId) {
        pools[poolId].paused = paused;
        emit PoolPausedSet(poolId, paused);
    }

    /// @notice After the pool has ended: reclaim rewards that were never earned (streamed while nobody was staked).
    function reclaimUndistributed(uint256 poolId) external nonReentrant onlyCreator(poolId) returns (uint256 amount) {
        Pool storage p = pools[poolId];
        if (block.timestamp < p.periodFinish) revert NotEnded();
        _updatePool(poolId);
        uint256 owed = p.accruedTotal - p.claimedTotal;
        amount = p.rewardReserve > owed ? p.rewardReserve - owed : 0;
        if (amount == 0) revert NothingToReclaim();
        p.rewardReserve -= amount;
        IERC20(p.cfg.rewardToken).safeTransfer(msg.sender, amount);
        emit UndistributedReclaimed(poolId, amount);
    }

    // ============================================================
    //                            STAKING
    // ============================================================

    function stake(uint256 poolId, uint256 amount) external nonReentrant {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        if (p.paused) revert PoolPaused();
        if (block.timestamp < p.cfg.startTime) revert NotStarted();
        if (block.timestamp >= p.periodFinish) revert Ended();

        _updatePool(poolId);
        _updateUser(poolId, msg.sender);

        uint256 received = _pull(p.cfg.stakeToken, amount);
        UserInfo storage u = users[poolId][msg.sender];
        uint256 newBal = u.staked + received;
        if (p.cfg.minStake != 0 && newBal < p.cfg.minStake) revert BelowMinStake();
        if (p.cfg.maxStakePerWallet != 0 && newBal > p.cfg.maxStakePerWallet) revert AboveMaxStake();
        if (p.cfg.maxTotalStaked != 0 && p.totalStaked + received > p.cfg.maxTotalStaked) revert PoolFull();

        if (u.staked == 0) {
            p.stakers += 1;
            u.firstStakeAt = uint64(block.timestamp);
            if (!inUserPools[poolId][msg.sender]) {
                inUserPools[poolId][msg.sender] = true;
                userPools[msg.sender].push(poolId);
            }
        }
        u.staked = newBal;
        p.totalStaked += received;
        emit Staked(poolId, msg.sender, received);
    }

    /// @notice Withdraw principal. Before the pool ends, `penaltyBps` of the amount is deducted
    ///         (if the pool has a penalty). After the end, withdrawals are free.
    function unstake(uint256 poolId, uint256 amount) external nonReentrant {
        _unstake(poolId, amount);
    }

    /// @notice Claim accrued rewards.
    function claim(uint256 poolId) external nonReentrant returns (uint256 paid) {
        paid = _claim(poolId, msg.sender);
        if (paid == 0) revert NothingToClaim();
    }

    /// @notice Unstake everything and claim in one call.
    function exit(uint256 poolId) external nonReentrant {
        uint256 bal = users[poolId][msg.sender].staked;
        if (bal > 0) _unstake(poolId, bal);
        _claim(poolId, msg.sender);
    }

    /// @notice Claim and restake rewards. Only when reward token == stake token and the pool is running.
    function compound(uint256 poolId) external nonReentrant returns (uint256 added) {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (p.cfg.rewardToken != p.cfg.stakeToken) revert RewardTokenMismatch();
        if (p.paused) revert PoolPaused();
        if (block.timestamp >= p.periodFinish) revert Ended();
        _updatePool(poolId);
        _updateUser(poolId, msg.sender);
        UserInfo storage u = users[poolId][msg.sender];
        added = u.rewards;
        if (added == 0) revert NothingToClaim();
        if (p.cfg.maxStakePerWallet != 0 && u.staked + added > p.cfg.maxStakePerWallet) revert AboveMaxStake();
        if (p.cfg.maxTotalStaked != 0 && p.totalStaked + added > p.cfg.maxTotalStaked) revert PoolFull();
        u.rewards = 0;
        p.rewardReserve -= added;
        p.claimedTotal += added;
        u.staked += added;
        p.totalStaked += added;
        emit Claimed(poolId, msg.sender, added);
        emit Staked(poolId, msg.sender, added);
    }

    function _unstake(uint256 poolId, uint256 amount) internal {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        if (amount == 0) revert ZeroAmount();
        UserInfo storage u = users[poolId][msg.sender];
        if (u.staked < amount) revert InsufficientStake();

        _updatePool(poolId);
        _updateUser(poolId, msg.sender);

        u.staked -= amount;
        p.totalStaked -= amount;
        if (u.staked == 0) p.stakers -= 1;

        uint256 penalty;
        if (p.cfg.penaltyBps > 0 && block.timestamp < p.periodFinish) {
            penalty = (amount * p.cfg.penaltyBps) / 10_000;
            if (penalty > 0) {
                if (p.cfg.rewardToken == p.cfg.stakeToken) {
                    // redistribute to the stakers who stay, over the remaining time
                    p.rewardReserve += penalty;
                    _notify(p, penalty);
                } else {
                    IERC20(p.cfg.stakeToken).safeTransfer(p.creator, penalty);
                }
            }
        }
        IERC20(p.cfg.stakeToken).safeTransfer(msg.sender, amount - penalty);
        emit Unstaked(poolId, msg.sender, amount - penalty, penalty);
    }

    function _claim(uint256 poolId, address who) internal returns (uint256 paid) {
        Pool storage p = pools[poolId];
        if (p.creator == address(0)) revert PoolNotFound();
        _updatePool(poolId);
        _updateUser(poolId, who);
        UserInfo storage u = users[poolId][who];
        paid = u.rewards;
        if (paid == 0) return 0;
        // reserve always covers accrued rewards (rate is derived from the reserve); guard for rounding
        if (paid > p.rewardReserve) paid = p.rewardReserve;
        u.rewards -= paid;
        p.rewardReserve -= paid;
        p.claimedTotal += paid;
        IERC20(p.cfg.rewardToken).safeTransfer(who, paid);
        emit Claimed(poolId, who, paid);
    }

    // ============================================================
    //                            VIEWS
    // ============================================================

    function poolInfo(uint256 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    function poolExists(uint256 poolId) external view returns (bool) {
        return pools[poolId].creator != address(0);
    }

    /// @notice Rewards accrued to `who` right now.
    function earned(uint256 poolId, address who) public view returns (uint256) {
        UserInfo storage u = users[poolId][who];
        return u.rewards + (u.staked * (_rewardPerToken(poolId) - u.rewardPerTokenPaid)) / PRECISION;
    }

    /// @notice Rewards still to be streamed between now and the end.
    function rewardsRemaining(uint256 poolId) public view returns (uint256) {
        Pool storage p = pools[poolId];
        if (block.timestamp >= p.periodFinish) return 0;
        uint256 from = block.timestamp < p.cfg.startTime ? p.cfg.startTime : block.timestamp;
        return ((p.periodFinish - from) * p.rewardRate) / PRECISION;
    }

    /// @notice Current APR in basis points for same-token pools: rewards/year at the current rate over total staked.
    ///         Returns 0 when nothing is staked or the pool has ended. For different tokens, convert with prices off-chain.
    function currentAprBps(uint256 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalStaked == 0 || block.timestamp >= p.periodFinish) return 0;
        uint256 perYear = (p.rewardRate * YEAR) / PRECISION;
        return (perYear * 10_000) / p.totalStaked;
    }

    /// @notice What the APR would be with `hypotheticalStaked` in the pool (for the create form and "if I stake X").
    function aprBpsFor(uint256 poolId, uint256 hypotheticalStaked) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (hypotheticalStaked == 0 || block.timestamp >= p.periodFinish) return 0;
        uint256 perYear = (p.rewardRate * YEAR) / PRECISION;
        return (perYear * 10_000) / hypotheticalStaked;
    }

    /// @notice Penalty a wallet would pay right now to withdraw `amount`.
    function penaltyFor(uint256 poolId, uint256 amount) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.cfg.penaltyBps == 0 || block.timestamp >= p.periodFinish) return 0;
        return (amount * p.cfg.penaltyBps) / 10_000;
    }

    function getPoolsByCreator(address who) external view returns (uint256[] memory) {
        return creatorPools[who];
    }

    function getPoolsByStakeToken(address token) external view returns (uint256[] memory) {
        return stakeTokenPools[token];
    }

    function getPoolsForUser(address who) external view returns (uint256[] memory) {
        return userPools[who];
    }

    // ============================================================
    //                        FEES / ADMIN
    // ============================================================

    function claimFees() external nonReentrant {
        if (msg.sender != feeReceiver && msg.sender != owner()) revert NotFeeReceiver();
        uint256 amount = pendingFees;
        if (amount == 0) revert NoFeesToClaim();
        pendingFees = 0;
        emit FeesClaimed(feeReceiver, amount);
        (bool sent,) = feeReceiver.call{value: amount}("");
        if (!sent) revert FeeTransferFailed();
    }

    function setCreateFee(uint256 newFee) external onlyOwner {
        createFee = newFee;
        emit FeeUpdated(newFee);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(newReceiver);
    }

    // ============================================================
    //                          INTERNALS
    // ============================================================

    function _lastTimeApplicable(Pool storage p) internal view returns (uint64) {
        uint64 t = uint64(block.timestamp);
        if (t > p.periodFinish) t = p.periodFinish;
        if (t < p.cfg.startTime) t = p.cfg.startTime;
        return t;
    }

    function _rewardPerToken(uint256 poolId) internal view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalStaked == 0) return p.rewardPerTokenStored;
        uint64 t = _lastTimeApplicable(p);
        if (t <= p.lastUpdate) return p.rewardPerTokenStored;
        return p.rewardPerTokenStored + (uint256(t - p.lastUpdate) * p.rewardRate) / p.totalStaked;
    }

    function _updatePool(uint256 poolId) internal {
        Pool storage p = pools[poolId];
        uint256 rpt = _rewardPerToken(poolId);
        if (rpt != p.rewardPerTokenStored) {
            p.accruedTotal += (p.totalStaked * (rpt - p.rewardPerTokenStored)) / PRECISION;
            p.rewardPerTokenStored = rpt;
        }
        uint64 t = _lastTimeApplicable(p);
        if (t > p.lastUpdate) p.lastUpdate = t;
    }

    function _updateUser(uint256 poolId, address who) internal {
        Pool storage p = pools[poolId];
        UserInfo storage u = users[poolId][who];
        u.rewards += (u.staked * (p.rewardPerTokenStored - u.rewardPerTokenPaid)) / PRECISION;
        u.rewardPerTokenPaid = p.rewardPerTokenStored;
    }

    /// @dev Fold `amount` into the stream for the remaining time (pool must be running; caller checked).
    function _notify(Pool storage p, uint256 amount) internal {
        uint64 now_ = uint64(block.timestamp);
        if (now_ >= p.periodFinish) return; // nothing to stream into; stays in reserve for extend/reclaim
        uint64 from = now_ < p.cfg.startTime ? p.cfg.startTime : now_;
        uint256 remaining = ((p.periodFinish - from) * p.rewardRate) / PRECISION;
        p.rewardRate = ((remaining + amount) * PRECISION) / (p.periodFinish - from);
    }

    function _pull(address token, uint256 amount) internal returns (uint256 received) {
        IERC20 t = IERC20(token);
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        received = t.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
    }
}
