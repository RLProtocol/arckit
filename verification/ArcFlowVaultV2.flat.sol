// SPDX-License-Identifier: MIT
pragma solidity =0.8.26 >=0.4.16 >=0.6.2 ^0.8.0 ^0.8.20 ^0.8.24;

// lib/v4-core/src/types/BeforeSwapDelta.sol

// Return type of the beforeSwap hook.
// Upper 128 bits is the delta in specified tokens. Lower 128 bits is delta in unspecified tokens (to match the afterSwap hook)
type BeforeSwapDelta is int256;

// Creates a BeforeSwapDelta from specified and unspecified
function toBeforeSwapDelta(int128 deltaSpecified, int128 deltaUnspecified)
    pure
    returns (BeforeSwapDelta beforeSwapDelta)
{
    assembly ("memory-safe") {
        beforeSwapDelta := or(shl(128, deltaSpecified), and(sub(shl(128, 1), 1), deltaUnspecified))
    }
}

/// @notice Library for getting the specified and unspecified deltas from the BeforeSwapDelta type
library BeforeSwapDeltaLibrary {
    /// @notice A BeforeSwapDelta of 0
    BeforeSwapDelta public constant ZERO_DELTA = BeforeSwapDelta.wrap(0);

    /// extracts int128 from the upper 128 bits of the BeforeSwapDelta
    /// returned by beforeSwap
    function getSpecifiedDelta(BeforeSwapDelta delta) internal pure returns (int128 deltaSpecified) {
        assembly ("memory-safe") {
            deltaSpecified := sar(128, delta)
        }
    }

    /// extracts int128 from the lower 128 bits of the BeforeSwapDelta
    /// returned by beforeSwap and afterSwap
    function getUnspecifiedDelta(BeforeSwapDelta delta) internal pure returns (int128 deltaUnspecified) {
        assembly ("memory-safe") {
            deltaUnspecified := signextend(15, delta)
        }
    }
}

// lib/v4-core/src/libraries/BitMath.sol

/// @title BitMath
/// @dev This library provides functionality for computing bit properties of an unsigned integer
/// @author Solady (https://github.com/Vectorized/solady/blob/8200a70e8dc2a77ecb074fc2e99a2a0d36547522/src/utils/LibBit.sol)
library BitMath {
    /// @notice Returns the index of the most significant bit of the number,
    ///     where the least significant bit is at index 0 and the most significant bit is at index 255
    /// @param x the value for which to compute the most significant bit, must be greater than 0
    /// @return r the index of the most significant bit
    function mostSignificantBit(uint256 x) internal pure returns (uint8 r) {
        require(x > 0);

        assembly ("memory-safe") {
            r := shl(7, lt(0xffffffffffffffffffffffffffffffff, x))
            r := or(r, shl(6, lt(0xffffffffffffffff, shr(r, x))))
            r := or(r, shl(5, lt(0xffffffff, shr(r, x))))
            r := or(r, shl(4, lt(0xffff, shr(r, x))))
            r := or(r, shl(3, lt(0xff, shr(r, x))))
            // forgefmt: disable-next-item
            r := or(r, byte(and(0x1f, shr(shr(r, x), 0x8421084210842108cc6318c6db6d54be)),
                0x0706060506020500060203020504000106050205030304010505030400000000))
        }
    }

    /// @notice Returns the index of the least significant bit of the number,
    ///     where the least significant bit is at index 0 and the most significant bit is at index 255
    /// @param x the value for which to compute the least significant bit, must be greater than 0
    /// @return r the index of the least significant bit
    function leastSignificantBit(uint256 x) internal pure returns (uint8 r) {
        require(x > 0);

        assembly ("memory-safe") {
            // Isolate the least significant bit.
            x := and(x, sub(0, x))
            // For the upper 3 bits of the result, use a De Bruijn-like lookup.
            // Credit to adhusson: https://blog.adhusson.com/cheap-find-first-set-evm/
            // forgefmt: disable-next-item
            r := shl(5, shr(252, shl(shl(2, shr(250, mul(x,
                0xb6db6db6ddddddddd34d34d349249249210842108c6318c639ce739cffffffff))),
                0x8040405543005266443200005020610674053026020000107506200176117077)))
            // For the lower 5 bits of the result, use a De Bruijn lookup.
            // forgefmt: disable-next-item
            r := or(r, byte(and(div(0xd76453e0, shr(r, x)), 0x1f),
                0x001f0d1e100c1d070f090b19131c1706010e11080a1a141802121b1503160405))
        }
    }
}

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

// lib/v4-core/src/libraries/CustomRevert.sol

/// @title Library for reverting with custom errors efficiently
/// @notice Contains functions for reverting with custom errors with different argument types efficiently
/// @dev To use this library, declare `using CustomRevert for bytes4;` and replace `revert CustomError()` with
/// `CustomError.selector.revertWith()`
/// @dev The functions may tamper with the free memory pointer but it is fine since the call context is exited immediately
library CustomRevert {
    /// @dev ERC-7751 error for wrapping bubbled up reverts
    error WrappedError(address target, bytes4 selector, bytes reason, bytes details);

    /// @dev Reverts with the selector of a custom error in the scratch space
    function revertWith(bytes4 selector) internal pure {
        assembly ("memory-safe") {
            mstore(0, selector)
            revert(0, 0x04)
        }
    }

    /// @dev Reverts with a custom error with an address argument in the scratch space
    function revertWith(bytes4 selector, address addr) internal pure {
        assembly ("memory-safe") {
            mstore(0, selector)
            mstore(0x04, and(addr, 0xffffffffffffffffffffffffffffffffffffffff))
            revert(0, 0x24)
        }
    }

    /// @dev Reverts with a custom error with an int24 argument in the scratch space
    function revertWith(bytes4 selector, int24 value) internal pure {
        assembly ("memory-safe") {
            mstore(0, selector)
            mstore(0x04, signextend(2, value))
            revert(0, 0x24)
        }
    }

    /// @dev Reverts with a custom error with a uint160 argument in the scratch space
    function revertWith(bytes4 selector, uint160 value) internal pure {
        assembly ("memory-safe") {
            mstore(0, selector)
            mstore(0x04, and(value, 0xffffffffffffffffffffffffffffffffffffffff))
            revert(0, 0x24)
        }
    }

    /// @dev Reverts with a custom error with two int24 arguments
    function revertWith(bytes4 selector, int24 value1, int24 value2) internal pure {
        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(fmp, selector)
            mstore(add(fmp, 0x04), signextend(2, value1))
            mstore(add(fmp, 0x24), signextend(2, value2))
            revert(fmp, 0x44)
        }
    }

    /// @dev Reverts with a custom error with two uint160 arguments
    function revertWith(bytes4 selector, uint160 value1, uint160 value2) internal pure {
        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(fmp, selector)
            mstore(add(fmp, 0x04), and(value1, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(add(fmp, 0x24), and(value2, 0xffffffffffffffffffffffffffffffffffffffff))
            revert(fmp, 0x44)
        }
    }

    /// @dev Reverts with a custom error with two address arguments
    function revertWith(bytes4 selector, address value1, address value2) internal pure {
        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(fmp, selector)
            mstore(add(fmp, 0x04), and(value1, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(add(fmp, 0x24), and(value2, 0xffffffffffffffffffffffffffffffffffffffff))
            revert(fmp, 0x44)
        }
    }

    /// @notice bubble up the revert message returned by a call and revert with a wrapped ERC-7751 error
    /// @dev this method can be vulnerable to revert data bombs
    function bubbleUpAndRevertWith(
        address revertingContract,
        bytes4 revertingFunctionSelector,
        bytes4 additionalContext
    ) internal pure {
        bytes4 wrappedErrorSelector = WrappedError.selector;
        assembly ("memory-safe") {
            // Ensure the size of the revert data is a multiple of 32 bytes
            let encodedDataSize := mul(div(add(returndatasize(), 31), 32), 32)

            let fmp := mload(0x40)

            // Encode wrapped error selector, address, function selector, offset, additional context, size, revert reason
            mstore(fmp, wrappedErrorSelector)
            mstore(add(fmp, 0x04), and(revertingContract, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(
                add(fmp, 0x24),
                and(revertingFunctionSelector, 0xffffffff00000000000000000000000000000000000000000000000000000000)
            )
            // offset revert reason
            mstore(add(fmp, 0x44), 0x80)
            // offset additional context
            mstore(add(fmp, 0x64), add(0xa0, encodedDataSize))
            // size revert reason
            mstore(add(fmp, 0x84), returndatasize())
            // revert reason
            returndatacopy(add(fmp, 0xa4), 0, returndatasize())
            // size additional context
            mstore(add(fmp, add(0xa4, encodedDataSize)), 0x04)
            // additional context
            mstore(
                add(fmp, add(0xc4, encodedDataSize)),
                and(additionalContext, 0xffffffff00000000000000000000000000000000000000000000000000000000)
            )
            revert(fmp, add(0xe4, encodedDataSize))
        }
    }
}

// lib/v4-core/src/libraries/FixedPoint128.sol

/// @title FixedPoint128
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
library FixedPoint128 {
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
}

// lib/v4-core/src/libraries/FixedPoint96.sol

/// @title FixedPoint96
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
/// @dev Used in SqrtPriceMath.sol
library FixedPoint96 {
    uint8 internal constant RESOLUTION = 96;
    uint256 internal constant Q96 = 0x1000000000000000000000000;
}

// lib/v4-core/src/libraries/FullMath.sol

/// @title Contains 512-bit math functions
/// @notice Facilitates multiplication and division that can have overflow of an intermediate value without any loss of precision
/// @dev Handles "phantom overflow" i.e., allows multiplication and division where an intermediate value overflows 256 bits
library FullMath {
    /// @notice Calculates floor(a×b÷denominator) with full precision. Throws if result overflows a uint256 or denominator == 0
    /// @param a The multiplicand
    /// @param b The multiplier
    /// @param denominator The divisor
    /// @return result The 256-bit result
    /// @dev Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = a * b
            // Compute the product mod 2**256 and mod 2**256 - 1
            // then use the Chinese Remainder Theorem to reconstruct
            // the 512 bit result. The result is stored in two 256
            // variables such that product = prod1 * 2**256 + prod0
            uint256 prod0 = a * b; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly ("memory-safe") {
                let mm := mulmod(a, b, not(0))
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Make sure the result is less than 2**256.
            // Also prevents denominator == 0
            require(denominator > prod1);

            // Handle non-overflow cases, 256 by 256 division
            if (prod1 == 0) {
                assembly ("memory-safe") {
                    result := div(prod0, denominator)
                }
                return result;
            }

            ///////////////////////////////////////////////
            // 512 by 256 division.
            ///////////////////////////////////////////////

            // Make division exact by subtracting the remainder from [prod1 prod0]
            // Compute remainder using mulmod
            uint256 remainder;
            assembly ("memory-safe") {
                remainder := mulmod(a, b, denominator)
            }
            // Subtract 256 bit number from 512 bit number
            assembly ("memory-safe") {
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator
            // Compute largest power of two divisor of denominator.
            // Always >= 1.
            uint256 twos = (0 - denominator) & denominator;
            // Divide denominator by power of two
            assembly ("memory-safe") {
                denominator := div(denominator, twos)
            }

            // Divide [prod1 prod0] by the factors of two
            assembly ("memory-safe") {
                prod0 := div(prod0, twos)
            }
            // Shift in bits from prod1 into prod0. For this we need
            // to flip `twos` such that it is 2**256 / twos.
            // If twos is zero, then it becomes one
            assembly ("memory-safe") {
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;

            // Invert denominator mod 2**256
            // Now that denominator is an odd number, it has an inverse
            // modulo 2**256 such that denominator * inv = 1 mod 2**256.
            // Compute the inverse by starting with a seed that is correct
            // correct for four bits. That is, denominator * inv = 1 mod 2**4
            uint256 inv = (3 * denominator) ^ 2;
            // Now use Newton-Raphson iteration to improve the precision.
            // Thanks to Hensel's lifting lemma, this also works in modular
            // arithmetic, doubling the correct bits in each step.
            inv *= 2 - denominator * inv; // inverse mod 2**8
            inv *= 2 - denominator * inv; // inverse mod 2**16
            inv *= 2 - denominator * inv; // inverse mod 2**32
            inv *= 2 - denominator * inv; // inverse mod 2**64
            inv *= 2 - denominator * inv; // inverse mod 2**128
            inv *= 2 - denominator * inv; // inverse mod 2**256

            // Because the division is now exact we can divide by multiplying
            // with the modular inverse of denominator. This will give us the
            // correct result modulo 2**256. Since the preconditions guarantee
            // that the outcome is less than 2**256, this is the final result.
            // We don't need to compute the high bits of the result and prod1
            // is no longer required.
            result = prod0 * inv;
            return result;
        }
    }

    /// @notice Calculates ceil(a×b÷denominator) with full precision. Throws if result overflows a uint256 or denominator == 0
    /// @param a The multiplicand
    /// @param b The multiplier
    /// @param denominator The divisor
    /// @return result The 256-bit result
    function mulDivRoundingUp(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            result = mulDiv(a, b, denominator);
            if (mulmod(a, b, denominator) != 0) {
                require(++result > 0);
            }
        }
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

// lib/v4-core/src/interfaces/external/IERC20Minimal.sol

/// @title Minimal ERC20 interface for Uniswap
/// @notice Contains a subset of the full ERC20 interface that is used in Uniswap V3
interface IERC20Minimal {
    /// @notice Returns an account's balance in the token
    /// @param account The account for which to look up the number of tokens it has, i.e. its balance
    /// @return The number of tokens held by the account
    function balanceOf(address account) external view returns (uint256);

    /// @notice Transfers the amount of token from the `msg.sender` to the recipient
    /// @param recipient The account that will receive the amount transferred
    /// @param amount The number of tokens to send from the sender to the recipient
    /// @return Returns true for a successful transfer, false for an unsuccessful transfer
    function transfer(address recipient, uint256 amount) external returns (bool);

    /// @notice Returns the current allowance given to a spender by an owner
    /// @param owner The account of the token owner
    /// @param spender The account of the token spender
    /// @return The current allowance granted by `owner` to `spender`
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Sets the allowance of a spender from the `msg.sender` to the value `amount`
    /// @param spender The account which will be allowed to spend a given amount of the owners tokens
    /// @param amount The amount of tokens allowed to be used by `spender`
    /// @return Returns true for a successful approval, false for unsuccessful
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` tokens from `sender` to `recipient` up to the allowance given to the `msg.sender`
    /// @param sender The account from which the transfer will be initiated
    /// @param recipient The recipient of the transfer
    /// @param amount The amount of the transfer
    /// @return Returns true for a successful transfer, false for unsuccessful
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /// @notice Event emitted when tokens are transferred from one address to another, either via `#transfer` or `#transferFrom`.
    /// @param from The account from which the tokens were sent, i.e. the balance decreased
    /// @param to The account to which the tokens were sent, i.e. the balance increased
    /// @param value The amount of tokens that were transferred
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Event emitted when the approval amount for the spender of a given owner's tokens changes.
    /// @param owner The account that approved spending of its tokens
    /// @param spender The account for which the spending allowance was modified
    /// @param value The new allowance from the owner to the spender
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// lib/v4-core/src/interfaces/external/IERC6909Claims.sol

/// @notice Interface for claims over a contract balance, wrapped as a ERC6909
interface IERC6909Claims {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event OperatorSet(address indexed owner, address indexed operator, bool approved);

    event Approval(address indexed owner, address indexed spender, uint256 indexed id, uint256 amount);

    event Transfer(address caller, address indexed from, address indexed to, uint256 indexed id, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                 FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Owner balance of an id.
    /// @param owner The address of the owner.
    /// @param id The id of the token.
    /// @return amount The balance of the token.
    function balanceOf(address owner, uint256 id) external view returns (uint256 amount);

    /// @notice Spender allowance of an id.
    /// @param owner The address of the owner.
    /// @param spender The address of the spender.
    /// @param id The id of the token.
    /// @return amount The allowance of the token.
    function allowance(address owner, address spender, uint256 id) external view returns (uint256 amount);

    /// @notice Checks if a spender is approved by an owner as an operator
    /// @param owner The address of the owner.
    /// @param spender The address of the spender.
    /// @return approved The approval status.
    function isOperator(address owner, address spender) external view returns (bool approved);

    /// @notice Transfers an amount of an id from the caller to a receiver.
    /// @param receiver The address of the receiver.
    /// @param id The id of the token.
    /// @param amount The amount of the token.
    /// @return bool True, always, unless the function reverts
    function transfer(address receiver, uint256 id, uint256 amount) external returns (bool);

    /// @notice Transfers an amount of an id from a sender to a receiver.
    /// @param sender The address of the sender.
    /// @param receiver The address of the receiver.
    /// @param id The id of the token.
    /// @param amount The amount of the token.
    /// @return bool True, always, unless the function reverts
    function transferFrom(address sender, address receiver, uint256 id, uint256 amount) external returns (bool);

    /// @notice Approves an amount of an id to a spender.
    /// @param spender The address of the spender.
    /// @param id The id of the token.
    /// @param amount The amount of the token.
    /// @return bool True, always
    function approve(address spender, uint256 id, uint256 amount) external returns (bool);

    /// @notice Sets or removes an operator for the caller.
    /// @param operator The address of the operator.
    /// @param approved The approval status.
    /// @return bool True, always
    function setOperator(address operator, bool approved) external returns (bool);
}

// lib/v4-core/src/interfaces/IExtsload.sol

/// @notice Interface for functions to access any storage slot in a contract
interface IExtsload {
    /// @notice Called by external contracts to access granular pool state
    /// @param slot Key of slot to sload
    /// @return value The value of the slot as bytes32
    function extsload(bytes32 slot) external view returns (bytes32 value);

    /// @notice Called by external contracts to access granular pool state
    /// @param startSlot Key of slot to start sloading from
    /// @param nSlots Number of slots to load into return value
    /// @return values List of loaded values.
    function extsload(bytes32 startSlot, uint256 nSlots) external view returns (bytes32[] memory values);

    /// @notice Called by external contracts to access sparse pool state
    /// @param slots List of slots to SLOAD from.
    /// @return values List of loaded values.
    function extsload(bytes32[] calldata slots) external view returns (bytes32[] memory values);
}

// lib/v4-core/src/interfaces/IExttload.sol

/// @notice Interface for functions to access any transient storage slot in a contract
interface IExttload {
    /// @notice Called by external contracts to access transient storage of the contract
    /// @param slot Key of slot to tload
    /// @return value The value of the slot as bytes32
    function exttload(bytes32 slot) external view returns (bytes32 value);

    /// @notice Called by external contracts to access sparse transient pool state
    /// @param slots List of slots to tload
    /// @return values List of loaded values
    function exttload(bytes32[] calldata slots) external view returns (bytes32[] memory values);
}

// lib/v4-core/src/interfaces/callback/IUnlockCallback.sol

/// @notice Interface for the callback executed when an address unlocks the pool manager
interface IUnlockCallback {
    /// @notice Called by the pool manager on `msg.sender` when the manager is unlocked
    /// @param data The data that was passed to the call to unlock
    /// @return Any data that you want to be returned from the unlock call
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

// lib/v4-core/src/libraries/LiquidityMath.sol

/// @title Math library for liquidity
library LiquidityMath {
    /// @notice Add a signed liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, int128 y) internal pure returns (uint128 z) {
        assembly ("memory-safe") {
            z := add(and(x, 0xffffffffffffffffffffffffffffffff), signextend(15, y))
            if shr(128, z) {
                // revert SafeCastOverflow()
                mstore(0, 0x93dafdf1)
                revert(0x1c, 0x04)
            }
        }
    }
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

// lib/v4-core/src/libraries/UnsafeMath.sol

/// @title Math functions that do not check inputs or outputs
/// @notice Contains methods that perform common math functions but do not do any overflow or underflow checks
library UnsafeMath {
    /// @notice Returns ceil(x / y)
    /// @dev division by 0 will return 0, and should be checked externally
    /// @param x The dividend
    /// @param y The divisor
    /// @return z The quotient, ceil(x / y)
    function divRoundingUp(uint256 x, uint256 y) internal pure returns (uint256 z) {
        assembly ("memory-safe") {
            z := add(div(x, y), gt(mod(x, y), 0))
        }
    }

    /// @notice Calculates floor(a×b÷denominator)
    /// @dev division by 0 will return 0, and should be checked externally
    /// @param a The multiplicand
    /// @param b The multiplier
    /// @param denominator The divisor
    /// @return result The 256-bit result, floor(a×b÷denominator)
    function simpleMulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        assembly ("memory-safe") {
            result := div(mul(a, b), denominator)
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

// lib/v4-core/src/libraries/SafeCast.sol

/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
    using CustomRevert for bytes4;

    error SafeCastOverflow();

    /// @notice Cast a uint256 to a uint160, revert on overflow
    /// @param x The uint256 to be downcasted
    /// @return y The downcasted integer, now type uint160
    function toUint160(uint256 x) internal pure returns (uint160 y) {
        y = uint160(x);
        if (y != x) SafeCastOverflow.selector.revertWith();
    }

    /// @notice Cast a uint256 to a uint128, revert on overflow
    /// @param x The uint256 to be downcasted
    /// @return y The downcasted integer, now type uint128
    function toUint128(uint256 x) internal pure returns (uint128 y) {
        y = uint128(x);
        if (x != y) SafeCastOverflow.selector.revertWith();
    }

    /// @notice Cast a int128 to a uint128, revert on overflow or underflow
    /// @param x The int128 to be casted
    /// @return y The casted integer, now type uint128
    function toUint128(int128 x) internal pure returns (uint128 y) {
        if (x < 0) SafeCastOverflow.selector.revertWith();
        y = uint128(x);
    }

    /// @notice Cast a int256 to a int128, revert on overflow or underflow
    /// @param x The int256 to be downcasted
    /// @return y The downcasted integer, now type int128
    function toInt128(int256 x) internal pure returns (int128 y) {
        y = int128(x);
        if (y != x) SafeCastOverflow.selector.revertWith();
    }

    /// @notice Cast a uint256 to a int256, revert on overflow
    /// @param x The uint256 to be casted
    /// @return y The casted integer, now type int256
    function toInt256(uint256 x) internal pure returns (int256 y) {
        y = int256(x);
        if (y < 0) SafeCastOverflow.selector.revertWith();
    }

    /// @notice Cast a uint256 to a int128, revert on overflow
    /// @param x The uint256 to be downcasted
    /// @return The downcasted integer, now type int128
    function toInt128(uint256 x) internal pure returns (int128) {
        if (x >= 1 << 127) SafeCastOverflow.selector.revertWith();
        return int128(int256(x));
    }
}

// lib/v4-core/src/types/BalanceDelta.sol

/// @dev Two `int128` values packed into a single `int256` where the upper 128 bits represent the amount0
/// and the lower 128 bits represent the amount1.
type BalanceDelta is int256;

using {add as +, sub as -, eq as ==, neq as !=} for BalanceDelta global;
using BalanceDeltaLibrary for BalanceDelta global;
using SafeCast for int256;

function toBalanceDelta(int128 _amount0, int128 _amount1) pure returns (BalanceDelta balanceDelta) {
    assembly ("memory-safe") {
        balanceDelta := or(shl(128, _amount0), and(sub(shl(128, 1), 1), _amount1))
    }
}

function add(BalanceDelta a, BalanceDelta b) pure returns (BalanceDelta) {
    int256 res0;
    int256 res1;
    assembly ("memory-safe") {
        let a0 := sar(128, a)
        let a1 := signextend(15, a)
        let b0 := sar(128, b)
        let b1 := signextend(15, b)
        res0 := add(a0, b0)
        res1 := add(a1, b1)
    }
    return toBalanceDelta(res0.toInt128(), res1.toInt128());
}

function sub(BalanceDelta a, BalanceDelta b) pure returns (BalanceDelta) {
    int256 res0;
    int256 res1;
    assembly ("memory-safe") {
        let a0 := sar(128, a)
        let a1 := signextend(15, a)
        let b0 := sar(128, b)
        let b1 := signextend(15, b)
        res0 := sub(a0, b0)
        res1 := sub(a1, b1)
    }
    return toBalanceDelta(res0.toInt128(), res1.toInt128());
}

function eq(BalanceDelta a, BalanceDelta b) pure returns (bool) {
    return BalanceDelta.unwrap(a) == BalanceDelta.unwrap(b);
}

function neq(BalanceDelta a, BalanceDelta b) pure returns (bool) {
    return BalanceDelta.unwrap(a) != BalanceDelta.unwrap(b);
}

/// @notice Library for getting the amount0 and amount1 deltas from the BalanceDelta type
library BalanceDeltaLibrary {
    /// @notice A BalanceDelta of 0
    BalanceDelta public constant ZERO_DELTA = BalanceDelta.wrap(0);

    function amount0(BalanceDelta balanceDelta) internal pure returns (int128 _amount0) {
        assembly ("memory-safe") {
            _amount0 := sar(128, balanceDelta)
        }
    }

    function amount1(BalanceDelta balanceDelta) internal pure returns (int128 _amount1) {
        assembly ("memory-safe") {
            _amount1 := signextend(15, balanceDelta)
        }
    }
}

// lib/v4-core/src/types/Currency.sol

type Currency is address;

using {greaterThan as >, lessThan as <, greaterThanOrEqualTo as >=, equals as ==} for Currency global;
using CurrencyLibrary for Currency global;

function equals(Currency currency, Currency other) pure returns (bool) {
    return Currency.unwrap(currency) == Currency.unwrap(other);
}

function greaterThan(Currency currency, Currency other) pure returns (bool) {
    return Currency.unwrap(currency) > Currency.unwrap(other);
}

function lessThan(Currency currency, Currency other) pure returns (bool) {
    return Currency.unwrap(currency) < Currency.unwrap(other);
}

function greaterThanOrEqualTo(Currency currency, Currency other) pure returns (bool) {
    return Currency.unwrap(currency) >= Currency.unwrap(other);
}

/// @title CurrencyLibrary
/// @dev This library allows for transferring and holding native tokens and ERC20 tokens
library CurrencyLibrary {
    /// @notice Additional context for ERC-7751 wrapped error when a native transfer fails
    error NativeTransferFailed();

    /// @notice Additional context for ERC-7751 wrapped error when an ERC20 transfer fails
    error ERC20TransferFailed();

    /// @notice A constant to represent the native currency
    Currency public constant ADDRESS_ZERO = Currency.wrap(address(0));

    function transfer(Currency currency, address to, uint256 amount) internal {
        // altered from https://github.com/transmissions11/solmate/blob/44a9963d4c78111f77caa0e65d677b8b46d6f2e6/src/utils/SafeTransferLib.sol
        // modified custom error selectors

        bool success;
        if (currency.isAddressZero()) {
            assembly ("memory-safe") {
                // Transfer the ETH and revert if it fails.
                success := call(gas(), to, amount, 0, 0, 0, 0)
            }
            // revert with NativeTransferFailed, containing the bubbled up error as an argument
            if (!success) {
                CustomRevert.bubbleUpAndRevertWith(to, bytes4(0), NativeTransferFailed.selector);
            }
        } else {
            assembly ("memory-safe") {
                // Get a pointer to some free memory.
                let fmp := mload(0x40)

                // Write the abi-encoded calldata into memory, beginning with the function selector.
                mstore(fmp, 0xa9059cbb00000000000000000000000000000000000000000000000000000000)
                mstore(add(fmp, 4), and(to, 0xffffffffffffffffffffffffffffffffffffffff)) // Append and mask the "to" argument.
                mstore(add(fmp, 36), amount) // Append the "amount" argument. Masking not required as it's a full 32 byte type.

                success :=
                    and(
                        // Set success to whether the call reverted, if not we check it either
                        // returned exactly 1 (can't just be non-zero data), or had no return data.
                        or(and(eq(mload(0), 1), gt(returndatasize(), 31)), iszero(returndatasize())),
                        // We use 68 because the length of our calldata totals up like so: 4 + 32 * 2.
                        // We use 0 and 32 to copy up to 32 bytes of return data into the scratch space.
                        // Counterintuitively, this call must be positioned second to the or() call in the
                        // surrounding and() call or else returndatasize() will be zero during the computation.
                        call(gas(), currency, 0, fmp, 68, 0, 32)
                    )

                // Now clean the memory we used
                mstore(fmp, 0) // 4 byte `selector` and 28 bytes of `to` were stored here
                mstore(add(fmp, 0x20), 0) // 4 bytes of `to` and 28 bytes of `amount` were stored here
                mstore(add(fmp, 0x40), 0) // 4 bytes of `amount` were stored here
            }
            // revert with ERC20TransferFailed, containing the bubbled up error as an argument
            if (!success) {
                CustomRevert.bubbleUpAndRevertWith(
                    Currency.unwrap(currency), IERC20Minimal.transfer.selector, ERC20TransferFailed.selector
                );
            }
        }
    }

    function balanceOfSelf(Currency currency) internal view returns (uint256) {
        if (currency.isAddressZero()) {
            return address(this).balance;
        } else {
            return IERC20Minimal(Currency.unwrap(currency)).balanceOf(address(this));
        }
    }

    function balanceOf(Currency currency, address owner) internal view returns (uint256) {
        if (currency.isAddressZero()) {
            return owner.balance;
        } else {
            return IERC20Minimal(Currency.unwrap(currency)).balanceOf(owner);
        }
    }

    function isAddressZero(Currency currency) internal pure returns (bool) {
        return Currency.unwrap(currency) == Currency.unwrap(ADDRESS_ZERO);
    }

    function toId(Currency currency) internal pure returns (uint256) {
        return uint160(Currency.unwrap(currency));
    }

    // If the upper 12 bytes are non-zero, they will be zero-ed out
    // Therefore, fromId() and toId() are not inverses of each other
    function fromId(uint256 id) internal pure returns (Currency) {
        return Currency.wrap(address(uint160(id)));
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

// lib/v4-core/src/libraries/TickMath.sol

/// @title Math library for computing sqrt prices from ticks and vice versa
/// @notice Computes sqrt price for ticks of size 1.0001, i.e. sqrt(1.0001^tick) as fixed point Q64.96 numbers. Supports
/// prices between 2**-128 and 2**128
library TickMath {
    using CustomRevert for bytes4;

    /// @notice Thrown when the tick passed to #getSqrtPriceAtTick is not between MIN_TICK and MAX_TICK
    error InvalidTick(int24 tick);
    /// @notice Thrown when the price passed to #getTickAtSqrtPrice does not correspond to a price between MIN_TICK and MAX_TICK
    error InvalidSqrtPrice(uint160 sqrtPriceX96);

    /// @dev The minimum tick that may be passed to #getSqrtPriceAtTick computed from log base 1.0001 of 2**-128
    /// @dev If ever MIN_TICK and MAX_TICK are not centered around 0, the absTick logic in getSqrtPriceAtTick cannot be used
    int24 internal constant MIN_TICK = -887272;
    /// @dev The maximum tick that may be passed to #getSqrtPriceAtTick computed from log base 1.0001 of 2**128
    /// @dev If ever MIN_TICK and MAX_TICK are not centered around 0, the absTick logic in getSqrtPriceAtTick cannot be used
    int24 internal constant MAX_TICK = 887272;

    /// @dev The minimum tick spacing value drawn from the range of type int16 that is greater than 0, i.e. min from the range [1, 32767]
    int24 internal constant MIN_TICK_SPACING = 1;
    /// @dev The maximum tick spacing value drawn from the range of type int16, i.e. max from the range [1, 32767]
    int24 internal constant MAX_TICK_SPACING = type(int16).max;

    /// @dev The minimum value that can be returned from #getSqrtPriceAtTick. Equivalent to getSqrtPriceAtTick(MIN_TICK)
    uint160 internal constant MIN_SQRT_PRICE = 4295128739;
    /// @dev The maximum value that can be returned from #getSqrtPriceAtTick. Equivalent to getSqrtPriceAtTick(MAX_TICK)
    uint160 internal constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;
    /// @dev A threshold used for optimized bounds check, equals `MAX_SQRT_PRICE - MIN_SQRT_PRICE - 1`
    uint160 internal constant MAX_SQRT_PRICE_MINUS_MIN_SQRT_PRICE_MINUS_ONE =
        1461446703485210103287273052203988822378723970342 - 4295128739 - 1;

    /// @notice Given a tickSpacing, compute the maximum usable tick
    function maxUsableTick(int24 tickSpacing) internal pure returns (int24) {
        unchecked {
            return (MAX_TICK / tickSpacing) * tickSpacing;
        }
    }

    /// @notice Given a tickSpacing, compute the minimum usable tick
    function minUsableTick(int24 tickSpacing) internal pure returns (int24) {
        unchecked {
            return (MIN_TICK / tickSpacing) * tickSpacing;
        }
    }

    /// @notice Calculates sqrt(1.0001^tick) * 2^96
    /// @dev Throws if |tick| > max tick
    /// @param tick The input tick for the above formula
    /// @return sqrtPriceX96 A Fixed point Q64.96 number representing the sqrt of the price of the two assets (currency1/currency0)
    /// at the given tick
    function getSqrtPriceAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 absTick;
            assembly ("memory-safe") {
                tick := signextend(2, tick)
                // mask = 0 if tick >= 0 else -1 (all 1s)
                let mask := sar(255, tick)
                // if tick >= 0, |tick| = tick = 0 ^ tick
                // if tick < 0, |tick| = ~~|tick| = ~(-|tick| - 1) = ~(tick - 1) = (-1) ^ (tick - 1)
                // either way, |tick| = mask ^ (tick + mask)
                absTick := xor(mask, add(mask, tick))
            }

            if (absTick > uint256(int256(MAX_TICK))) InvalidTick.selector.revertWith(tick);

            // The tick is decomposed into bits, and for each bit with index i that is set, the product of 1/sqrt(1.0001^(2^i))
            // is calculated (using Q128.128). The constants used for this calculation are rounded to the nearest integer

            // Equivalent to:
            //     price = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
            //     or price = int(2**128 / sqrt(1.0001)) if (absTick & 0x1) else 1 << 128
            uint256 price;
            assembly ("memory-safe") {
                price := xor(shl(128, 1), mul(xor(shl(128, 1), 0xfffcb933bd6fad37aa2d162d1a594001), and(absTick, 0x1)))
            }
            if (absTick & 0x2 != 0) price = (price * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) price = (price * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) price = (price * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) price = (price * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) price = (price * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) price = (price * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) price = (price * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) price = (price * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) price = (price * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) price = (price * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) price = (price * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) price = (price * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) price = (price * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) price = (price * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) price = (price * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) price = (price * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) price = (price * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) price = (price * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) price = (price * 0x48a170391f7dc42444e8fa2) >> 128;

            assembly ("memory-safe") {
                // if (tick > 0) price = type(uint256).max / price;
                if sgt(tick, 0) { price := div(not(0), price) }

                // this divides by 1<<32 rounding up to go from a Q128.128 to a Q128.96.
                // we then downcast because we know the result always fits within 160 bits due to our tick input constraint
                // we round up in the division so getTickAtSqrtPrice of the output price is always consistent
                // `sub(shl(32, 1), 1)` is `type(uint32).max`
                // `price + type(uint32).max` will not overflow because `price` fits in 192 bits
                sqrtPriceX96 := shr(32, add(price, sub(shl(32, 1), 1)))
            }
        }
    }

    /// @notice Calculates the greatest tick value such that getSqrtPriceAtTick(tick) <= sqrtPriceX96
    /// @dev Throws in case sqrtPriceX96 < MIN_SQRT_PRICE, as MIN_SQRT_PRICE is the lowest value getSqrtPriceAtTick may
    /// ever return.
    /// @param sqrtPriceX96 The sqrt price for which to compute the tick as a Q64.96
    /// @return tick The greatest tick for which the getSqrtPriceAtTick(tick) is less than or equal to the input sqrtPriceX96
    function getTickAtSqrtPrice(uint160 sqrtPriceX96) internal pure returns (int24 tick) {
        unchecked {
            // Equivalent: if (sqrtPriceX96 < MIN_SQRT_PRICE || sqrtPriceX96 >= MAX_SQRT_PRICE) revert InvalidSqrtPrice();
            // second inequality must be >= because the price can never reach the price at the max tick
            // if sqrtPriceX96 < MIN_SQRT_PRICE, the `sub` underflows and `gt` is true
            // if sqrtPriceX96 >= MAX_SQRT_PRICE, sqrtPriceX96 - MIN_SQRT_PRICE > MAX_SQRT_PRICE - MIN_SQRT_PRICE - 1
            if ((sqrtPriceX96 - MIN_SQRT_PRICE) > MAX_SQRT_PRICE_MINUS_MIN_SQRT_PRICE_MINUS_ONE) {
                InvalidSqrtPrice.selector.revertWith(sqrtPriceX96);
            }

            uint256 price = uint256(sqrtPriceX96) << 32;

            uint256 r = price;
            uint256 msb = BitMath.mostSignificantBit(r);

            if (msb >= 128) r = price >> (msb - 127);
            else r = price << (127 - msb);

            int256 log_2 = (int256(msb) - 128) << 64;

            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(63, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(62, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(61, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(60, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(59, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(58, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(57, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(56, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(55, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(54, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(53, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(52, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(51, f))
                r := shr(f, r)
            }
            assembly ("memory-safe") {
                r := shr(127, mul(r, r))
                let f := shr(128, r)
                log_2 := or(log_2, shl(50, f))
            }

            int256 log_sqrt10001 = log_2 * 255738958999603826347141; // Q22.128 number

            // Magic number represents the ceiling of the maximum value of the error when approximating log_sqrt10001(x)
            int24 tickLow = int24((log_sqrt10001 - 3402992956809132418596140100660247210) >> 128);

            // Magic number represents the minimum value of the error when approximating log_sqrt10001(x), when
            // sqrtPrice is from the range (2^-64, 2^64). This is safe as MIN_SQRT_PRICE is more than 2^-64. If MIN_SQRT_PRICE
            // is changed, this may need to be changed too
            int24 tickHi = int24((log_sqrt10001 + 291339464771989622907027621153398088495) >> 128);

            tick = tickLow == tickHi ? tickLow : getSqrtPriceAtTick(tickHi) <= sqrtPriceX96 ? tickHi : tickLow;
        }
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

// lib/v4-core/src/libraries/Position.sol

/// @title Position
/// @notice Positions represent an owner address' liquidity between a lower and upper tick boundary
/// @dev Positions store additional state for tracking fees owed to the position
library Position {
    using CustomRevert for bytes4;

    /// @notice Cannot update a position with no liquidity
    error CannotUpdateEmptyPosition();

    // info stored for each user's position
    struct State {
        // the amount of liquidity owned by this position
        uint128 liquidity;
        // fee growth per unit of liquidity as of the last update to liquidity or fees owed
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
    }

    /// @notice Returns the State struct of a position, given an owner and position boundaries
    /// @param self The mapping containing all user positions
    /// @param owner The address of the position owner
    /// @param tickLower The lower tick boundary of the position
    /// @param tickUpper The upper tick boundary of the position
    /// @param salt A unique value to differentiate between multiple positions in the same range
    /// @return position The position info struct of the given owners' position
    function get(mapping(bytes32 => State) storage self, address owner, int24 tickLower, int24 tickUpper, bytes32 salt)
        internal
        view
        returns (State storage position)
    {
        bytes32 positionKey = calculatePositionKey(owner, tickLower, tickUpper, salt);
        position = self[positionKey];
    }

    /// @notice A helper function to calculate the position key
    /// @param owner The address of the position owner
    /// @param tickLower the lower tick boundary of the position
    /// @param tickUpper the upper tick boundary of the position
    /// @param salt A unique value to differentiate between multiple positions in the same range, by the same owner. Passed in by the caller.
    function calculatePositionKey(address owner, int24 tickLower, int24 tickUpper, bytes32 salt)
        internal
        pure
        returns (bytes32 positionKey)
    {
        // positionKey = keccak256(abi.encodePacked(owner, tickLower, tickUpper, salt))
        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(add(fmp, 0x26), salt) // [0x26, 0x46)
            mstore(add(fmp, 0x06), tickUpper) // [0x23, 0x26)
            mstore(add(fmp, 0x03), tickLower) // [0x20, 0x23)
            mstore(fmp, owner) // [0x0c, 0x20)
            positionKey := keccak256(add(fmp, 0x0c), 0x3a) // len is 58 bytes

            // now clean the memory we used
            mstore(add(fmp, 0x40), 0) // fmp+0x40 held salt
            mstore(add(fmp, 0x20), 0) // fmp+0x20 held tickLower, tickUpper, salt
            mstore(fmp, 0) // fmp held owner
        }
    }

    /// @notice Credits accumulated fees to a user's position
    /// @param self The individual position to update
    /// @param liquidityDelta The change in pool liquidity as a result of the position update
    /// @param feeGrowthInside0X128 The all-time fee growth in currency0, per unit of liquidity, inside the position's tick boundaries
    /// @param feeGrowthInside1X128 The all-time fee growth in currency1, per unit of liquidity, inside the position's tick boundaries
    /// @return feesOwed0 The amount of currency0 owed to the position owner
    /// @return feesOwed1 The amount of currency1 owed to the position owner
    function update(
        State storage self,
        int128 liquidityDelta,
        uint256 feeGrowthInside0X128,
        uint256 feeGrowthInside1X128
    ) internal returns (uint256 feesOwed0, uint256 feesOwed1) {
        uint128 liquidity = self.liquidity;

        if (liquidityDelta == 0) {
            // disallow pokes for 0 liquidity positions
            if (liquidity == 0) CannotUpdateEmptyPosition.selector.revertWith();
        } else {
            self.liquidity = LiquidityMath.addDelta(liquidity, liquidityDelta);
        }

        // calculate accumulated fees. overflow in the subtraction of fee growth is expected
        unchecked {
            feesOwed0 =
                FullMath.mulDiv(feeGrowthInside0X128 - self.feeGrowthInside0LastX128, liquidity, FixedPoint128.Q128);
            feesOwed1 =
                FullMath.mulDiv(feeGrowthInside1X128 - self.feeGrowthInside1LastX128, liquidity, FixedPoint128.Q128);
        }

        // update the position
        self.feeGrowthInside0LastX128 = feeGrowthInside0X128;
        self.feeGrowthInside1LastX128 = feeGrowthInside1X128;
    }
}

// lib/v4-core/src/libraries/SqrtPriceMath.sol

/// @title Functions based on Q64.96 sqrt price and liquidity
/// @notice Contains the math that uses square root of price as a Q64.96 and liquidity to compute deltas
library SqrtPriceMath {
    using SafeCast for uint256;

    error InvalidPriceOrLiquidity();
    error InvalidPrice();
    error NotEnoughLiquidity();
    error PriceOverflow();

    /// @notice Gets the next sqrt price given a delta of currency0
    /// @dev Always rounds up, because in the exact output case (increasing price) we need to move the price at least
    /// far enough to get the desired output amount, and in the exact input case (decreasing price) we need to move the
    /// price less in order to not send too much output.
    /// The most precise formula for this is liquidity * sqrtPX96 / (liquidity +- amount * sqrtPX96),
    /// if this is impossible because of overflow, we calculate liquidity / (liquidity / sqrtPX96 +- amount).
    /// @param sqrtPX96 The starting price, i.e. before accounting for the currency0 delta
    /// @param liquidity The amount of usable liquidity
    /// @param amount How much of currency0 to add or remove from virtual reserves
    /// @param add Whether to add or remove the amount of currency0
    /// @return The price after adding or removing amount, depending on add
    function getNextSqrtPriceFromAmount0RoundingUp(uint160 sqrtPX96, uint128 liquidity, uint256 amount, bool add)
        internal
        pure
        returns (uint160)
    {
        // we short circuit amount == 0 because the result is otherwise not guaranteed to equal the input price
        if (amount == 0) return sqrtPX96;
        uint256 numerator1 = uint256(liquidity) << FixedPoint96.RESOLUTION;

        if (add) {
            unchecked {
                uint256 product = amount * sqrtPX96;
                if (product / amount == sqrtPX96) {
                    uint256 denominator = numerator1 + product;
                    if (denominator >= numerator1) {
                        // always fits in 160 bits
                        return uint160(FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator));
                    }
                }
            }
            // denominator is checked for overflow
            return uint160(UnsafeMath.divRoundingUp(numerator1, (numerator1 / sqrtPX96) + amount));
        } else {
            unchecked {
                uint256 product = amount * sqrtPX96;
                // if the product overflows, we know the denominator underflows
                // in addition, we must check that the denominator does not underflow
                // equivalent: if (product / amount != sqrtPX96 || numerator1 <= product) revert PriceOverflow();
                assembly ("memory-safe") {
                    if iszero(
                        and(
                            eq(div(product, amount), and(sqrtPX96, 0xffffffffffffffffffffffffffffffffffffffff)),
                            gt(numerator1, product)
                        )
                    ) {
                        mstore(0, 0xf5c787f1) // selector for PriceOverflow()
                        revert(0x1c, 0x04)
                    }
                }
                uint256 denominator = numerator1 - product;
                return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator).toUint160();
            }
        }
    }

    /// @notice Gets the next sqrt price given a delta of currency1
    /// @dev Always rounds down, because in the exact output case (decreasing price) we need to move the price at least
    /// far enough to get the desired output amount, and in the exact input case (increasing price) we need to move the
    /// price less in order to not send too much output.
    /// The formula we compute is within <1 wei of the lossless version: sqrtPX96 +- amount / liquidity
    /// @param sqrtPX96 The starting price, i.e., before accounting for the currency1 delta
    /// @param liquidity The amount of usable liquidity
    /// @param amount How much of currency1 to add, or remove, from virtual reserves
    /// @param add Whether to add, or remove, the amount of currency1
    /// @return The price after adding or removing `amount`
    function getNextSqrtPriceFromAmount1RoundingDown(uint160 sqrtPX96, uint128 liquidity, uint256 amount, bool add)
        internal
        pure
        returns (uint160)
    {
        // if we're adding (subtracting), rounding down requires rounding the quotient down (up)
        // in both cases, avoid a mulDiv for most inputs
        if (add) {
            uint256 quotient = (
                amount <= type(uint160).max
                    ? (amount << FixedPoint96.RESOLUTION) / liquidity
                    : FullMath.mulDiv(amount, FixedPoint96.Q96, liquidity)
            );

            return (uint256(sqrtPX96) + quotient).toUint160();
        } else {
            uint256 quotient = (
                amount <= type(uint160).max
                    ? UnsafeMath.divRoundingUp(amount << FixedPoint96.RESOLUTION, liquidity)
                    : FullMath.mulDivRoundingUp(amount, FixedPoint96.Q96, liquidity)
            );

            // equivalent: if (sqrtPX96 <= quotient) revert NotEnoughLiquidity();
            assembly ("memory-safe") {
                if iszero(gt(and(sqrtPX96, 0xffffffffffffffffffffffffffffffffffffffff), quotient)) {
                    mstore(0, 0x4323a555) // selector for NotEnoughLiquidity()
                    revert(0x1c, 0x04)
                }
            }
            // always fits 160 bits
            unchecked {
                return uint160(sqrtPX96 - quotient);
            }
        }
    }

    /// @notice Gets the next sqrt price given an input amount of currency0 or currency1
    /// @dev Throws if price or liquidity are 0, or if the next price is out of bounds
    /// @param sqrtPX96 The starting price, i.e., before accounting for the input amount
    /// @param liquidity The amount of usable liquidity
    /// @param amountIn How much of currency0, or currency1, is being swapped in
    /// @param zeroForOne Whether the amount in is currency0 or currency1
    /// @return uint160 The price after adding the input amount to currency0 or currency1
    function getNextSqrtPriceFromInput(uint160 sqrtPX96, uint128 liquidity, uint256 amountIn, bool zeroForOne)
        internal
        pure
        returns (uint160)
    {
        // equivalent: if (sqrtPX96 == 0 || liquidity == 0) revert InvalidPriceOrLiquidity();
        assembly ("memory-safe") {
            if or(
                iszero(and(sqrtPX96, 0xffffffffffffffffffffffffffffffffffffffff)),
                iszero(and(liquidity, 0xffffffffffffffffffffffffffffffff))
            ) {
                mstore(0, 0x4f2461b8) // selector for InvalidPriceOrLiquidity()
                revert(0x1c, 0x04)
            }
        }

        // round to make sure that we don't pass the target price
        return zeroForOne
            ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
            : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
    }

    /// @notice Gets the next sqrt price given an output amount of currency0 or currency1
    /// @dev Throws if price or liquidity are 0 or the next price is out of bounds
    /// @param sqrtPX96 The starting price before accounting for the output amount
    /// @param liquidity The amount of usable liquidity
    /// @param amountOut How much of currency0, or currency1, is being swapped out
    /// @param zeroForOne Whether the amount out is currency1 or currency0
    /// @return uint160 The price after removing the output amount of currency0 or currency1
    function getNextSqrtPriceFromOutput(uint160 sqrtPX96, uint128 liquidity, uint256 amountOut, bool zeroForOne)
        internal
        pure
        returns (uint160)
    {
        // equivalent: if (sqrtPX96 == 0 || liquidity == 0) revert InvalidPriceOrLiquidity();
        assembly ("memory-safe") {
            if or(
                iszero(and(sqrtPX96, 0xffffffffffffffffffffffffffffffffffffffff)),
                iszero(and(liquidity, 0xffffffffffffffffffffffffffffffff))
            ) {
                mstore(0, 0x4f2461b8) // selector for InvalidPriceOrLiquidity()
                revert(0x1c, 0x04)
            }
        }

        // round to make sure that we pass the target price
        return zeroForOne
            ? getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false)
            : getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
    }

    /// @notice Gets the amount0 delta between two prices
    /// @dev Calculates liquidity / sqrt(lower) - liquidity / sqrt(upper),
    /// i.e. liquidity * (sqrt(upper) - sqrt(lower)) / (sqrt(upper) * sqrt(lower))
    /// @param sqrtPriceAX96 A sqrt price
    /// @param sqrtPriceBX96 Another sqrt price
    /// @param liquidity The amount of usable liquidity
    /// @param roundUp Whether to round the amount up or down
    /// @return uint256 Amount of currency0 required to cover a position of size liquidity between the two passed prices
    function getAmount0Delta(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            if (sqrtPriceAX96 > sqrtPriceBX96) (sqrtPriceAX96, sqrtPriceBX96) = (sqrtPriceBX96, sqrtPriceAX96);

            // equivalent: if (sqrtPriceAX96 == 0) revert InvalidPrice();
            assembly ("memory-safe") {
                if iszero(and(sqrtPriceAX96, 0xffffffffffffffffffffffffffffffffffffffff)) {
                    mstore(0, 0x00bfc921) // selector for InvalidPrice()
                    revert(0x1c, 0x04)
                }
            }

            uint256 numerator1 = uint256(liquidity) << FixedPoint96.RESOLUTION;
            uint256 numerator2 = sqrtPriceBX96 - sqrtPriceAX96;

            return roundUp
                ? UnsafeMath.divRoundingUp(FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtPriceBX96), sqrtPriceAX96)
                : FullMath.mulDiv(numerator1, numerator2, sqrtPriceBX96) / sqrtPriceAX96;
        }
    }

    /// @notice Equivalent to: `a >= b ? a - b : b - a`
    function absDiff(uint160 a, uint160 b) internal pure returns (uint256 res) {
        assembly ("memory-safe") {
            let diff :=
                sub(and(a, 0xffffffffffffffffffffffffffffffffffffffff), and(b, 0xffffffffffffffffffffffffffffffffffffffff))
            // mask = 0 if a >= b else -1 (all 1s)
            let mask := sar(255, diff)
            // if a >= b, res = a - b = 0 ^ (a - b)
            // if a < b, res = b - a = ~~(b - a) = ~(-(b - a) - 1) = ~(a - b - 1) = (-1) ^ (a - b - 1)
            // either way, res = mask ^ (a - b + mask)
            res := xor(mask, add(mask, diff))
        }
    }

    /// @notice Gets the amount1 delta between two prices
    /// @dev Calculates liquidity * (sqrt(upper) - sqrt(lower))
    /// @param sqrtPriceAX96 A sqrt price
    /// @param sqrtPriceBX96 Another sqrt price
    /// @param liquidity The amount of usable liquidity
    /// @param roundUp Whether to round the amount up, or down
    /// @return amount1 Amount of currency1 required to cover a position of size liquidity between the two passed prices
    function getAmount1Delta(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256 amount1)
    {
        uint256 numerator = absDiff(sqrtPriceAX96, sqrtPriceBX96);
        uint256 denominator = FixedPoint96.Q96;
        uint256 _liquidity = uint256(liquidity);

        /**
         * Equivalent to:
         *   amount1 = roundUp
         *       ? FullMath.mulDivRoundingUp(liquidity, sqrtPriceBX96 - sqrtPriceAX96, FixedPoint96.Q96)
         *       : FullMath.mulDiv(liquidity, sqrtPriceBX96 - sqrtPriceAX96, FixedPoint96.Q96);
         * Cannot overflow because `type(uint128).max * type(uint160).max >> 96 < (1 << 192)`.
         */
        amount1 = FullMath.mulDiv(_liquidity, numerator, denominator);
        assembly ("memory-safe") {
            amount1 := add(amount1, and(gt(mulmod(_liquidity, numerator, denominator), 0), roundUp))
        }
    }

    /// @notice Helper that gets signed currency0 delta
    /// @param sqrtPriceAX96 A sqrt price
    /// @param sqrtPriceBX96 Another sqrt price
    /// @param liquidity The change in liquidity for which to compute the amount0 delta
    /// @return int256 Amount of currency0 corresponding to the passed liquidityDelta between the two prices
    function getAmount0Delta(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, int128 liquidity)
        internal
        pure
        returns (int256)
    {
        unchecked {
            return liquidity < 0
                ? getAmount0Delta(sqrtPriceAX96, sqrtPriceBX96, uint128(-liquidity), false).toInt256()
                : -getAmount0Delta(sqrtPriceAX96, sqrtPriceBX96, uint128(liquidity), true).toInt256();
        }
    }

    /// @notice Helper that gets signed currency1 delta
    /// @param sqrtPriceAX96 A sqrt price
    /// @param sqrtPriceBX96 Another sqrt price
    /// @param liquidity The change in liquidity for which to compute the amount1 delta
    /// @return int256 Amount of currency1 corresponding to the passed liquidityDelta between the two prices
    function getAmount1Delta(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, int128 liquidity)
        internal
        pure
        returns (int256)
    {
        unchecked {
            return liquidity < 0
                ? getAmount1Delta(sqrtPriceAX96, sqrtPriceBX96, uint128(-liquidity), false).toInt256()
                : -getAmount1Delta(sqrtPriceAX96, sqrtPriceBX96, uint128(liquidity), true).toInt256();
        }
    }
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

// lib/v4-core/src/interfaces/IHooks.sol

/// @notice V4 decides whether to invoke specific hooks by inspecting the least significant bits
/// of the address that the hooks contract is deployed to.
/// For example, a hooks contract deployed to address: 0x0000000000000000000000000000000000002400
/// has the lowest bits '10 0100 0000 0000' which would cause the 'before initialize' and 'after add liquidity' hooks to be used.
/// See the Hooks library for the full spec.
/// @dev Should only be callable by the v4 PoolManager.
interface IHooks {
    /// @notice The hook called before the state of a pool is initialized
    /// @param sender The initial msg.sender for the initialize call
    /// @param key The key for the pool being initialized
    /// @param sqrtPriceX96 The sqrt(price) of the pool as a Q64.96
    /// @return bytes4 The function selector for the hook
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96) external returns (bytes4);

    /// @notice The hook called after the state of a pool is initialized
    /// @param sender The initial msg.sender for the initialize call
    /// @param key The key for the pool being initialized
    /// @param sqrtPriceX96 The sqrt(price) of the pool as a Q64.96
    /// @param tick The current tick after the state of a pool is initialized
    /// @return bytes4 The function selector for the hook
    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick)
        external
        returns (bytes4);

    /// @notice The hook called before liquidity is added
    /// @param sender The initial msg.sender for the add liquidity call
    /// @param key The key for the pool
    /// @param params The parameters for adding liquidity
    /// @param hookData Arbitrary data handed into the PoolManager by the liquidity provider to be passed on to the hook
    /// @return bytes4 The function selector for the hook
    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external returns (bytes4);

    /// @notice The hook called after liquidity is added
    /// @param sender The initial msg.sender for the add liquidity call
    /// @param key The key for the pool
    /// @param params The parameters for adding liquidity
    /// @param delta The caller's balance delta after adding liquidity; the sum of principal delta, fees accrued, and hook delta
    /// @param feesAccrued The fees accrued since the last time fees were collected from this position
    /// @param hookData Arbitrary data handed into the PoolManager by the liquidity provider to be passed on to the hook
    /// @return bytes4 The function selector for the hook
    /// @return BalanceDelta The hook's delta in token0 and token1. Positive: the hook is owed/took currency, negative: the hook owes/sent currency
    function afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external returns (bytes4, BalanceDelta);

    /// @notice The hook called before liquidity is removed
    /// @param sender The initial msg.sender for the remove liquidity call
    /// @param key The key for the pool
    /// @param params The parameters for removing liquidity
    /// @param hookData Arbitrary data handed into the PoolManager by the liquidity provider to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external returns (bytes4);

    /// @notice The hook called after liquidity is removed
    /// @param sender The initial msg.sender for the remove liquidity call
    /// @param key The key for the pool
    /// @param params The parameters for removing liquidity
    /// @param delta The caller's balance delta after removing liquidity; the sum of principal delta, fees accrued, and hook delta
    /// @param feesAccrued The fees accrued since the last time fees were collected from this position
    /// @param hookData Arbitrary data handed into the PoolManager by the liquidity provider to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    /// @return BalanceDelta The hook's delta in token0 and token1. Positive: the hook is owed/took currency, negative: the hook owes/sent currency
    function afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external returns (bytes4, BalanceDelta);

    /// @notice The hook called before a swap
    /// @param sender The initial msg.sender for the swap call
    /// @param key The key for the pool
    /// @param params The parameters for the swap
    /// @param hookData Arbitrary data handed into the PoolManager by the swapper to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    /// @return BeforeSwapDelta The hook's delta in specified and unspecified currencies. Positive: the hook is owed/took currency, negative: the hook owes/sent currency
    /// @return uint24 Optionally override the lp fee, only used if three conditions are met: 1. the Pool has a dynamic fee, 2. the value's 2nd highest bit is set (23rd bit, 0x400000), and 3. the value is less than or equal to the maximum fee (1 million)
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external returns (bytes4, BeforeSwapDelta, uint24);

    /// @notice The hook called after a swap
    /// @param sender The initial msg.sender for the swap call
    /// @param key The key for the pool
    /// @param params The parameters for the swap
    /// @param delta The amount owed to the caller (positive) or owed to the pool (negative)
    /// @param hookData Arbitrary data handed into the PoolManager by the swapper to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    /// @return int128 The hook's delta in unspecified currency. Positive: the hook is owed/took currency, negative: the hook owes/sent currency
    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external returns (bytes4, int128);

    /// @notice The hook called before donate
    /// @param sender The initial msg.sender for the donate call
    /// @param key The key for the pool
    /// @param amount0 The amount of token0 being donated
    /// @param amount1 The amount of token1 being donated
    /// @param hookData Arbitrary data handed into the PoolManager by the donor to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    function beforeDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external returns (bytes4);

    /// @notice The hook called after donate
    /// @param sender The initial msg.sender for the donate call
    /// @param key The key for the pool
    /// @param amount0 The amount of token0 being donated
    /// @param amount1 The amount of token1 being donated
    /// @param hookData Arbitrary data handed into the PoolManager by the donor to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    function afterDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external returns (bytes4);
}

// lib/v4-core/src/interfaces/IPoolManager.sol

/// @notice Interface for the PoolManager
interface IPoolManager is IProtocolFees, IERC6909Claims, IExtsload, IExttload {
    /// @notice Thrown when a currency is not netted out after the contract is unlocked
    error CurrencyNotSettled();

    /// @notice Thrown when trying to interact with a non-initialized pool
    error PoolNotInitialized();

    /// @notice Thrown when unlock is called, but the contract is already unlocked
    error AlreadyUnlocked();

    /// @notice Thrown when a function is called that requires the contract to be unlocked, but it is not
    error ManagerLocked();

    /// @notice Pools are limited to type(int16).max tickSpacing in #initialize, to prevent overflow
    error TickSpacingTooLarge(int24 tickSpacing);

    /// @notice Pools must have a positive non-zero tickSpacing passed to #initialize
    error TickSpacingTooSmall(int24 tickSpacing);

    /// @notice PoolKey must have currencies where address(currency0) < address(currency1)
    error CurrenciesOutOfOrderOrEqual(address currency0, address currency1);

    /// @notice Thrown when a call to updateDynamicLPFee is made by an address that is not the hook,
    /// or on a pool that does not have a dynamic swap fee.
    error UnauthorizedDynamicLPFeeUpdate();

    /// @notice Thrown when trying to swap amount of 0
    error SwapAmountCannotBeZero();

    ///@notice Thrown when native currency is passed to a non native settlement
    error NonzeroNativeValue();

    /// @notice Thrown when `clear` is called with an amount that is not exactly equal to the open currency delta.
    error MustClearExactPositiveDelta();

    /// @notice Emitted when a new pool is initialized
    /// @param id The abi encoded hash of the pool key struct for the new pool
    /// @param currency0 The first currency of the pool by address sort order
    /// @param currency1 The second currency of the pool by address sort order
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param tickSpacing The minimum number of ticks between initialized ticks
    /// @param hooks The hooks contract address for the pool, or address(0) if none
    /// @param sqrtPriceX96 The price of the pool on initialization
    /// @param tick The initial tick of the pool corresponding to the initialized price
    event Initialize(
        PoolId indexed id,
        Currency indexed currency0,
        Currency indexed currency1,
        uint24 fee,
        int24 tickSpacing,
        IHooks hooks,
        uint160 sqrtPriceX96,
        int24 tick
    );

    /// @notice Emitted when a liquidity position is modified
    /// @param id The abi encoded hash of the pool key struct for the pool that was modified
    /// @param sender The address that modified the pool
    /// @param tickLower The lower tick of the position
    /// @param tickUpper The upper tick of the position
    /// @param liquidityDelta The amount of liquidity that was added or removed
    /// @param salt The extra data to make positions unique
    event ModifyLiquidity(
        PoolId indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt
    );

    /// @notice Emitted for swaps between currency0 and currency1
    /// @param id The abi encoded hash of the pool key struct for the pool that was modified
    /// @param sender The address that initiated the swap call, and that received the callback
    /// @param amount0 The delta of the currency0 balance of the pool
    /// @param amount1 The delta of the currency1 balance of the pool
    /// @param sqrtPriceX96 The sqrt(price) of the pool after the swap, as a Q64.96
    /// @param liquidity The liquidity of the pool after the swap
    /// @param tick The log base 1.0001 of the price of the pool after the swap
    /// @param fee The swap fee in hundredths of a bip
    event Swap(
        PoolId indexed id,
        address indexed sender,
        int128 amount0,
        int128 amount1,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        int24 tick,
        uint24 fee
    );

    /// @notice Emitted for donations
    /// @param id The abi encoded hash of the pool key struct for the pool that was donated to
    /// @param sender The address that initiated the donate call
    /// @param amount0 The amount donated in currency0
    /// @param amount1 The amount donated in currency1
    event Donate(PoolId indexed id, address indexed sender, uint256 amount0, uint256 amount1);

    /// @notice All interactions on the contract that account deltas require unlocking. A caller that calls `unlock` must implement
    /// `IUnlockCallback(msg.sender).unlockCallback(data)`, where they interact with the remaining functions on this contract.
    /// @dev The only functions callable without an unlocking are `initialize` and `updateDynamicLPFee`
    /// @param data Any data to pass to the callback, via `IUnlockCallback(msg.sender).unlockCallback(data)`
    /// @return The data returned by the call to `IUnlockCallback(msg.sender).unlockCallback(data)`
    function unlock(bytes calldata data) external returns (bytes memory);

    /// @notice Initialize the state for a given pool ID
    /// @dev A swap fee totaling MAX_SWAP_FEE (100%) makes exact output swaps impossible since the input is entirely consumed by the fee
    /// @param key The pool key for the pool to initialize
    /// @param sqrtPriceX96 The initial square root price
    /// @return tick The initial tick of the pool
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);

    struct ModifyLiquidityParams {
        // the lower and upper tick of the position
        int24 tickLower;
        int24 tickUpper;
        // how to modify the liquidity
        int256 liquidityDelta;
        // a value to set if you want unique liquidity positions at the same range
        bytes32 salt;
    }

    /// @notice Modify the liquidity for the given pool
    /// @dev Poke by calling with a zero liquidityDelta
    /// @param key The pool to modify liquidity in
    /// @param params The parameters for modifying the liquidity
    /// @param hookData The data to pass through to the add/removeLiquidity hooks
    /// @return callerDelta The balance delta of the caller of modifyLiquidity. This is the total of both principal, fee deltas, and hook deltas if applicable
    /// @return feesAccrued The balance delta of the fees generated in the liquidity range. Returned for informational purposes
    /// @dev Note that feesAccrued can be artificially inflated by a malicious actor and integrators should be careful using the value
    /// For pools with a single liquidity position, actors can donate to themselves to inflate feeGrowthGlobal (and consequently feesAccrued)
    /// atomically donating and collecting fees in the same unlockCallback may make the inflated value more extreme
    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (BalanceDelta callerDelta, BalanceDelta feesAccrued);

    struct SwapParams {
        /// Whether to swap token0 for token1 or vice versa
        bool zeroForOne;
        /// The desired input amount if negative (exactIn), or the desired output amount if positive (exactOut)
        int256 amountSpecified;
        /// The sqrt price at which, if reached, the swap will stop executing
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swap against the given pool
    /// @param key The pool to swap in
    /// @param params The parameters for swapping
    /// @param hookData The data to pass through to the swap hooks
    /// @return swapDelta The balance delta of the address swapping
    /// @dev Swapping on low liquidity pools may cause unexpected swap amounts when liquidity available is less than amountSpecified.
    /// Additionally note that if interacting with hooks that have the BEFORE_SWAP_RETURNS_DELTA_FLAG or AFTER_SWAP_RETURNS_DELTA_FLAG
    /// the hook may alter the swap input/output. Integrators should perform checks on the returned swapDelta.
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (BalanceDelta swapDelta);

    /// @notice Donate the given currency amounts to the in-range liquidity providers of a pool
    /// @dev Calls to donate can be frontrun adding just-in-time liquidity, with the aim of receiving a portion donated funds.
    /// Donors should keep this in mind when designing donation mechanisms.
    /// @dev This function donates to in-range LPs at slot0.tick. In certain edge-cases of the swap algorithm, the `sqrtPrice` of
    /// a pool can be at the lower boundary of tick `n`, but the `slot0.tick` of the pool is already `n - 1`. In this case a call to
    /// `donate` would donate to tick `n - 1` (slot0.tick) not tick `n` (getTickAtSqrtPrice(slot0.sqrtPriceX96)).
    /// Read the comments in `Pool.swap()` for more information about this.
    /// @param key The key of the pool to donate to
    /// @param amount0 The amount of currency0 to donate
    /// @param amount1 The amount of currency1 to donate
    /// @param hookData The data to pass through to the donate hooks
    /// @return BalanceDelta The delta of the caller after the donate
    function donate(PoolKey memory key, uint256 amount0, uint256 amount1, bytes calldata hookData)
        external
        returns (BalanceDelta);

    /// @notice Writes the current ERC20 balance of the specified currency to transient storage
    /// This is used to checkpoint balances for the manager and derive deltas for the caller.
    /// @dev This MUST be called before any ERC20 tokens are sent into the contract, but can be skipped
    /// for native tokens because the amount to settle is determined by the sent value.
    /// However, if an ERC20 token has been synced and not settled, and the caller instead wants to settle
    /// native funds, this function can be called with the native currency to then be able to settle the native currency
    function sync(Currency currency) external;

    /// @notice Called by the user to net out some value owed to the user
    /// @dev Will revert if the requested amount is not available, consider using `mint` instead
    /// @dev Can also be used as a mechanism for free flash loans
    /// @param currency The currency to withdraw from the pool manager
    /// @param to The address to withdraw to
    /// @param amount The amount of currency to withdraw
    function take(Currency currency, address to, uint256 amount) external;

    /// @notice Called by the user to pay what is owed
    /// @return paid The amount of currency settled
    function settle() external payable returns (uint256 paid);

    /// @notice Called by the user to pay on behalf of another address
    /// @param recipient The address to credit for the payment
    /// @return paid The amount of currency settled
    function settleFor(address recipient) external payable returns (uint256 paid);

    /// @notice WARNING - Any currency that is cleared, will be non-retrievable, and locked in the contract permanently.
    /// A call to clear will zero out a positive balance WITHOUT a corresponding transfer.
    /// @dev This could be used to clear a balance that is considered dust.
    /// Additionally, the amount must be the exact positive balance. This is to enforce that the caller is aware of the amount being cleared.
    function clear(Currency currency, uint256 amount) external;

    /// @notice Called by the user to move value into ERC6909 balance
    /// @param to The address to mint the tokens to
    /// @param id The currency address to mint to ERC6909s, as a uint256
    /// @param amount The amount of currency to mint
    /// @dev The id is converted to a uint160 to correspond to a currency address
    /// If the upper 12 bytes are not 0, they will be 0-ed out
    function mint(address to, uint256 id, uint256 amount) external;

    /// @notice Called by the user to move value from ERC6909 balance
    /// @param from The address to burn the tokens from
    /// @param id The currency address to burn from ERC6909s, as a uint256
    /// @param amount The amount of currency to burn
    /// @dev The id is converted to a uint160 to correspond to a currency address
    /// If the upper 12 bytes are not 0, they will be 0-ed out
    function burn(address from, uint256 id, uint256 amount) external;

    /// @notice Updates the pools lp fees for the a pool that has enabled dynamic lp fees.
    /// @dev A swap fee totaling MAX_SWAP_FEE (100%) makes exact output swaps impossible since the input is entirely consumed by the fee
    /// @param key The key of the pool to update dynamic LP fees for
    /// @param newDynamicLPFee The new dynamic pool LP fee
    function updateDynamicLPFee(PoolKey memory key, uint24 newDynamicLPFee) external;
}

// lib/v4-core/src/interfaces/IProtocolFees.sol

/// @notice Interface for all protocol-fee related functions in the pool manager
interface IProtocolFees {
    /// @notice Thrown when protocol fee is set too high
    error ProtocolFeeTooLarge(uint24 fee);

    /// @notice Thrown when collectProtocolFees or setProtocolFee is not called by the controller.
    error InvalidCaller();

    /// @notice Thrown when collectProtocolFees is attempted on a token that is synced.
    error ProtocolFeeCurrencySynced();

    /// @notice Emitted when the protocol fee controller address is updated in setProtocolFeeController.
    event ProtocolFeeControllerUpdated(address indexed protocolFeeController);

    /// @notice Emitted when the protocol fee is updated for a pool.
    event ProtocolFeeUpdated(PoolId indexed id, uint24 protocolFee);

    /// @notice Given a currency address, returns the protocol fees accrued in that currency
    /// @param currency The currency to check
    /// @return amount The amount of protocol fees accrued in the currency
    function protocolFeesAccrued(Currency currency) external view returns (uint256 amount);

    /// @notice Sets the protocol fee for the given pool
    /// @param key The key of the pool to set a protocol fee for
    /// @param newProtocolFee The fee to set
    function setProtocolFee(PoolKey memory key, uint24 newProtocolFee) external;

    /// @notice Sets the protocol fee controller
    /// @param controller The new protocol fee controller
    function setProtocolFeeController(address controller) external;

    /// @notice Collects the protocol fees for a given recipient and currency, returning the amount collected
    /// @dev This will revert if the contract is unlocked
    /// @param recipient The address to receive the protocol fees
    /// @param currency The currency to withdraw
    /// @param amount The amount of currency to withdraw
    /// @return amountCollected The amount of currency successfully withdrawn
    function collectProtocolFees(address recipient, Currency currency, uint256 amount)
        external
        returns (uint256 amountCollected);

    /// @notice Returns the current protocol fee controller address
    /// @return address The current protocol fee controller address
    function protocolFeeController() external view returns (address);
}

// lib/v4-core/src/types/PoolId.sol

type PoolId is bytes32;

/// @notice Library for computing the ID of a pool
library PoolIdLibrary {
    /// @notice Returns value equal to keccak256(abi.encode(poolKey))
    function toId(PoolKey memory poolKey) internal pure returns (PoolId poolId) {
        assembly ("memory-safe") {
            // 0xa0 represents the total size of the poolKey struct (5 slots of 32 bytes)
            poolId := keccak256(poolKey, 0xa0)
        }
    }
}

// lib/v4-core/src/types/PoolKey.sol

using PoolIdLibrary for PoolKey global;

/// @notice Returns the key for identifying a pool
struct PoolKey {
    /// @notice The lower currency of the pool, sorted numerically
    Currency currency0;
    /// @notice The higher currency of the pool, sorted numerically
    Currency currency1;
    /// @notice The pool LP fee, capped at 1_000_000. If the highest bit is 1, the pool has a dynamic fee and must be exactly equal to 0x800000
    uint24 fee;
    /// @notice Ticks that involve positions must be a multiple of tick spacing
    int24 tickSpacing;
    /// @notice The hooks of the pool
    IHooks hooks;
}

// lib/v4-core/src/libraries/StateLibrary.sol

/// @notice A helper library to provide state getters that use extsload
library StateLibrary {
    /// @notice index of pools mapping in the PoolManager
    bytes32 public constant POOLS_SLOT = bytes32(uint256(6));

    /// @notice index of feeGrowthGlobal0X128 in Pool.State
    uint256 public constant FEE_GROWTH_GLOBAL0_OFFSET = 1;

    // feeGrowthGlobal1X128 offset in Pool.State = 2

    /// @notice index of liquidity in Pool.State
    uint256 public constant LIQUIDITY_OFFSET = 3;

    /// @notice index of TicksInfo mapping in Pool.State: mapping(int24 => TickInfo) ticks;
    uint256 public constant TICKS_OFFSET = 4;

    /// @notice index of tickBitmap mapping in Pool.State
    uint256 public constant TICK_BITMAP_OFFSET = 5;

    /// @notice index of Position.State mapping in Pool.State: mapping(bytes32 => Position.State) positions;
    uint256 public constant POSITIONS_OFFSET = 6;

    /**
     * @notice Get Slot0 of the pool: sqrtPriceX96, tick, protocolFee, lpFee
     * @dev Corresponds to pools[poolId].slot0
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @return sqrtPriceX96 The square root of the price of the pool, in Q96 precision.
     * @return tick The current tick of the pool.
     * @return protocolFee The protocol fee of the pool.
     * @return lpFee The swap fee of the pool.
     */
    function getSlot0(IPoolManager manager, PoolId poolId)
        internal
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
    {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        bytes32 data = manager.extsload(stateSlot);

        //   24 bits  |24bits|24bits      |24 bits|160 bits
        // 0x000000   |000bb8|000000      |ffff75 |0000000000000000fe3aa841ba359daa0ea9eff7
        // ---------- | fee  |protocolfee | tick  | sqrtPriceX96
        assembly ("memory-safe") {
            // bottom 160 bits of data
            sqrtPriceX96 := and(data, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            // next 24 bits of data
            tick := signextend(2, shr(160, data))
            // next 24 bits of data
            protocolFee := and(shr(184, data), 0xFFFFFF)
            // last 24 bits of data
            lpFee := and(shr(208, data), 0xFFFFFF)
        }
    }

    /**
     * @notice Retrieves the tick information of a pool at a specific tick.
     * @dev Corresponds to pools[poolId].ticks[tick]
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param tick The tick to retrieve information for.
     * @return liquidityGross The total position liquidity that references this tick
     * @return liquidityNet The amount of net liquidity added (subtracted) when tick is crossed from left to right (right to left)
     * @return feeGrowthOutside0X128 fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
     * @return feeGrowthOutside1X128 fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
     */
    function getTickInfo(IPoolManager manager, PoolId poolId, int24 tick)
        internal
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128
        )
    {
        bytes32 slot = _getTickInfoSlot(poolId, tick);

        // read all 3 words of the TickInfo struct
        bytes32[] memory data = manager.extsload(slot, 3);
        assembly ("memory-safe") {
            let firstWord := mload(add(data, 32))
            liquidityNet := sar(128, firstWord)
            liquidityGross := and(firstWord, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            feeGrowthOutside0X128 := mload(add(data, 64))
            feeGrowthOutside1X128 := mload(add(data, 96))
        }
    }

    /**
     * @notice Retrieves the liquidity information of a pool at a specific tick.
     * @dev Corresponds to pools[poolId].ticks[tick].liquidityGross and pools[poolId].ticks[tick].liquidityNet. A more gas efficient version of getTickInfo
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param tick The tick to retrieve liquidity for.
     * @return liquidityGross The total position liquidity that references this tick
     * @return liquidityNet The amount of net liquidity added (subtracted) when tick is crossed from left to right (right to left)
     */
    function getTickLiquidity(IPoolManager manager, PoolId poolId, int24 tick)
        internal
        view
        returns (uint128 liquidityGross, int128 liquidityNet)
    {
        bytes32 slot = _getTickInfoSlot(poolId, tick);

        bytes32 value = manager.extsload(slot);
        assembly ("memory-safe") {
            liquidityNet := sar(128, value)
            liquidityGross := and(value, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        }
    }

    /**
     * @notice Retrieves the fee growth outside a tick range of a pool
     * @dev Corresponds to pools[poolId].ticks[tick].feeGrowthOutside0X128 and pools[poolId].ticks[tick].feeGrowthOutside1X128. A more gas efficient version of getTickInfo
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param tick The tick to retrieve fee growth for.
     * @return feeGrowthOutside0X128 fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
     * @return feeGrowthOutside1X128 fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
     */
    function getTickFeeGrowthOutside(IPoolManager manager, PoolId poolId, int24 tick)
        internal
        view
        returns (uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)
    {
        bytes32 slot = _getTickInfoSlot(poolId, tick);

        // offset by 1 word, since the first word is liquidityGross + liquidityNet
        bytes32[] memory data = manager.extsload(bytes32(uint256(slot) + 1), 2);
        assembly ("memory-safe") {
            feeGrowthOutside0X128 := mload(add(data, 32))
            feeGrowthOutside1X128 := mload(add(data, 64))
        }
    }

    /**
     * @notice Retrieves the global fee growth of a pool.
     * @dev Corresponds to pools[poolId].feeGrowthGlobal0X128 and pools[poolId].feeGrowthGlobal1X128
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @return feeGrowthGlobal0 The global fee growth for token0.
     * @return feeGrowthGlobal1 The global fee growth for token1.
     * @dev Note that feeGrowthGlobal can be artificially inflated
     * For pools with a single liquidity position, actors can donate to themselves to freely inflate feeGrowthGlobal
     * atomically donating and collecting fees in the same unlockCallback may make the inflated value more extreme
     */
    function getFeeGrowthGlobals(IPoolManager manager, PoolId poolId)
        internal
        view
        returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)
    {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        // Pool.State, `uint256 feeGrowthGlobal0X128`
        bytes32 slot_feeGrowthGlobal0X128 = bytes32(uint256(stateSlot) + FEE_GROWTH_GLOBAL0_OFFSET);

        // read the 2 words of feeGrowthGlobal
        bytes32[] memory data = manager.extsload(slot_feeGrowthGlobal0X128, 2);
        assembly ("memory-safe") {
            feeGrowthGlobal0 := mload(add(data, 32))
            feeGrowthGlobal1 := mload(add(data, 64))
        }
    }

    /**
     * @notice Retrieves total the liquidity of a pool.
     * @dev Corresponds to pools[poolId].liquidity
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @return liquidity The liquidity of the pool.
     */
    function getLiquidity(IPoolManager manager, PoolId poolId) internal view returns (uint128 liquidity) {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        // Pool.State: `uint128 liquidity`
        bytes32 slot = bytes32(uint256(stateSlot) + LIQUIDITY_OFFSET);

        liquidity = uint128(uint256(manager.extsload(slot)));
    }

    /**
     * @notice Retrieves the tick bitmap of a pool at a specific tick.
     * @dev Corresponds to pools[poolId].tickBitmap[tick]
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param tick The tick to retrieve the bitmap for.
     * @return tickBitmap The bitmap of the tick.
     */
    function getTickBitmap(IPoolManager manager, PoolId poolId, int16 tick)
        internal
        view
        returns (uint256 tickBitmap)
    {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        // Pool.State: `mapping(int16 => uint256) tickBitmap;`
        bytes32 tickBitmapMapping = bytes32(uint256(stateSlot) + TICK_BITMAP_OFFSET);

        // slot id of the mapping key: `pools[poolId].tickBitmap[tick]
        bytes32 slot = keccak256(abi.encodePacked(int256(tick), tickBitmapMapping));

        tickBitmap = uint256(manager.extsload(slot));
    }

    /**
     * @notice Retrieves the position information of a pool without needing to calculate the `positionId`.
     * @dev Corresponds to pools[poolId].positions[positionId]
     * @param poolId The ID of the pool.
     * @param owner The owner of the liquidity position.
     * @param tickLower The lower tick of the liquidity range.
     * @param tickUpper The upper tick of the liquidity range.
     * @param salt The bytes32 randomness to further distinguish position state.
     * @return liquidity The liquidity of the position.
     * @return feeGrowthInside0LastX128 The fee growth inside the position for token0.
     * @return feeGrowthInside1LastX128 The fee growth inside the position for token1.
     */
    function getPositionInfo(
        IPoolManager manager,
        PoolId poolId,
        address owner,
        int24 tickLower,
        int24 tickUpper,
        bytes32 salt
    ) internal view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128) {
        // positionKey = keccak256(abi.encodePacked(owner, tickLower, tickUpper, salt))
        bytes32 positionKey = Position.calculatePositionKey(owner, tickLower, tickUpper, salt);

        (liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128) = getPositionInfo(manager, poolId, positionKey);
    }

    /**
     * @notice Retrieves the position information of a pool at a specific position ID.
     * @dev Corresponds to pools[poolId].positions[positionId]
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param positionId The ID of the position.
     * @return liquidity The liquidity of the position.
     * @return feeGrowthInside0LastX128 The fee growth inside the position for token0.
     * @return feeGrowthInside1LastX128 The fee growth inside the position for token1.
     */
    function getPositionInfo(IPoolManager manager, PoolId poolId, bytes32 positionId)
        internal
        view
        returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)
    {
        bytes32 slot = _getPositionInfoSlot(poolId, positionId);

        // read all 3 words of the Position.State struct
        bytes32[] memory data = manager.extsload(slot, 3);

        assembly ("memory-safe") {
            liquidity := mload(add(data, 32))
            feeGrowthInside0LastX128 := mload(add(data, 64))
            feeGrowthInside1LastX128 := mload(add(data, 96))
        }
    }

    /**
     * @notice Retrieves the liquidity of a position.
     * @dev Corresponds to pools[poolId].positions[positionId].liquidity. More gas efficient for just retrieiving liquidity as compared to getPositionInfo
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param positionId The ID of the position.
     * @return liquidity The liquidity of the position.
     */
    function getPositionLiquidity(IPoolManager manager, PoolId poolId, bytes32 positionId)
        internal
        view
        returns (uint128 liquidity)
    {
        bytes32 slot = _getPositionInfoSlot(poolId, positionId);
        liquidity = uint128(uint256(manager.extsload(slot)));
    }

    /**
     * @notice Calculate the fee growth inside a tick range of a pool
     * @dev pools[poolId].feeGrowthInside0LastX128 in Position.State is cached and can become stale. This function will calculate the up to date feeGrowthInside
     * @param manager The pool manager contract.
     * @param poolId The ID of the pool.
     * @param tickLower The lower tick of the range.
     * @param tickUpper The upper tick of the range.
     * @return feeGrowthInside0X128 The fee growth inside the tick range for token0.
     * @return feeGrowthInside1X128 The fee growth inside the tick range for token1.
     */
    function getFeeGrowthInside(IPoolManager manager, PoolId poolId, int24 tickLower, int24 tickUpper)
        internal
        view
        returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)
    {
        (uint256 feeGrowthGlobal0X128, uint256 feeGrowthGlobal1X128) = getFeeGrowthGlobals(manager, poolId);

        (uint256 lowerFeeGrowthOutside0X128, uint256 lowerFeeGrowthOutside1X128) =
            getTickFeeGrowthOutside(manager, poolId, tickLower);
        (uint256 upperFeeGrowthOutside0X128, uint256 upperFeeGrowthOutside1X128) =
            getTickFeeGrowthOutside(manager, poolId, tickUpper);
        (, int24 tickCurrent,,) = getSlot0(manager, poolId);
        unchecked {
            if (tickCurrent < tickLower) {
                feeGrowthInside0X128 = lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
                feeGrowthInside1X128 = lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
            } else if (tickCurrent >= tickUpper) {
                feeGrowthInside0X128 = upperFeeGrowthOutside0X128 - lowerFeeGrowthOutside0X128;
                feeGrowthInside1X128 = upperFeeGrowthOutside1X128 - lowerFeeGrowthOutside1X128;
            } else {
                feeGrowthInside0X128 = feeGrowthGlobal0X128 - lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
                feeGrowthInside1X128 = feeGrowthGlobal1X128 - lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
            }
        }
    }

    function _getPoolStateSlot(PoolId poolId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
    }

    function _getTickInfoSlot(PoolId poolId, int24 tick) internal pure returns (bytes32) {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        // Pool.State: `mapping(int24 => TickInfo) ticks`
        bytes32 ticksMappingSlot = bytes32(uint256(stateSlot) + TICKS_OFFSET);

        // slot key of the tick key: `pools[poolId].ticks[tick]
        return keccak256(abi.encodePacked(int256(tick), ticksMappingSlot));
    }

    function _getPositionInfoSlot(PoolId poolId, bytes32 positionId) internal pure returns (bytes32) {
        // slot key of Pool.State value: `pools[poolId]`
        bytes32 stateSlot = _getPoolStateSlot(poolId);

        // Pool.State: `mapping(bytes32 => Position.State) positions;`
        bytes32 positionMapping = bytes32(uint256(stateSlot) + POSITIONS_OFFSET);

        // slot of the mapping key: `pools[poolId].positions[positionId]
        return keccak256(abi.encodePacked(positionId, positionMapping));
    }
}

// src/arcflow/v2/ArcFlowBase.sol

/// @title ArcFlowBase
/// @notice Shared plumbing for the ArcFlow v2 contracts: the guarded PoolManager unlock, ERC20
///         settlement, in-pool swaps with a price limit, and the maths that turns a set of weighted
///         tick ranges ("legs") plus a token budget into concrete liquidity per leg.
abstract contract ArcFlowBase is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    error NotPoolManager();
    error NotUnlocking();
    error NativeNotSupported();
    error PoolNotInitialized();
    error ZeroAmount();
    error InsufficientInput();

    /// @dev One weighted tick range. A shape is a list of these; liquidity per leg is proportional to `weight`.
    struct LegSpec {
        int24 tickLower;
        int24 tickUpper;
        uint32 weight;
    }

    /// @dev Liquidity used when pricing "one unit" of a shape. Large enough that rounding is negligible.
    uint256 internal constant UNIT = 1e12;
    uint256 internal constant WAD = 1e18;

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;

    /// Set only for the duration of our own unlock() calls so nobody else can drive the callback.
    bool private unlocking;

    constructor(IPoolManager _poolManager, IERC20 _usdc) {
        poolManager = _poolManager;
        usdc = _usdc;
    }

    // ---------- unlock plumbing ----------

    function _unlock(bytes memory data) internal returns (bytes memory out) {
        unlocking = true;
        out = poolManager.unlock(data);
        unlocking = false;
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!unlocking) revert NotUnlocking();
        return _onUnlock(data);
    }

    function _onUnlock(bytes calldata data) internal virtual returns (bytes memory);

    // ---------- settlement ----------

    function _pay(Currency c, uint256 amount) internal {
        if (amount == 0) return;
        poolManager.sync(c);
        IERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }

    function _take(Currency c, uint256 amount) internal {
        if (amount > 0) poolManager.take(c, address(this), amount);
    }

    function _payout(Currency c, address to, uint256 amount) internal {
        if (amount > 0) IERC20(Currency.unwrap(c)).safeTransfer(to, amount);
    }

    // ---------- swaps ----------

    /// @dev Exact-input swap in the pool with a price limit `slippageBps` away from the current price. Pays the
    ///      consumed input from this contract's balance and takes the output here. The fill can be partial.
    function _swapExactIn(PoolKey memory key, bool zeroForOne, uint256 amountIn, uint256 slippageBps)
        internal
        returns (uint256 paid, uint256 amountOut)
    {
        if (amountIn == 0) return (0, 0);
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        return _swapToLimit(key, zeroForOne, amountIn, _priceLimit(sqrtP, zeroForOne, slippageBps));
    }

    function _priceLimit(uint160 sqrtP, bool zeroForOne, uint256 slippageBps) internal pure returns (uint160) {
        if (slippageBps >= 10_000) return zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        // sqrt(1 ± s) ~= 1 ± s/2 for the small tolerances used here
        uint256 delta = (uint256(sqrtP) * slippageBps) / 20_000;
        if (zeroForOne) {
            uint256 lim = uint256(sqrtP) - delta;
            return lim <= TickMath.MIN_SQRT_PRICE ? TickMath.MIN_SQRT_PRICE + 1 : uint160(lim);
        }
        uint256 lim2 = uint256(sqrtP) + delta;
        return lim2 >= TickMath.MAX_SQRT_PRICE ? TickMath.MAX_SQRT_PRICE - 1 : uint160(lim2);
    }

    // ---------- range maths ----------

    /// @dev Token amounts held by `liquidity` in [lower, upper) at price `sqrtP`.
    function _amountsFor(uint160 sqrtP, int24 lower, int24 upper, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256 a0, uint256 a1)
    {
        if (liquidity == 0) return (0, 0);
        uint160 lo = TickMath.getSqrtPriceAtTick(lower);
        uint160 hi = TickMath.getSqrtPriceAtTick(upper);
        if (sqrtP <= lo) {
            a0 = SqrtPriceMath.getAmount0Delta(lo, hi, liquidity, roundUp);
        } else if (sqrtP < hi) {
            a0 = SqrtPriceMath.getAmount0Delta(sqrtP, hi, liquidity, roundUp);
            a1 = SqrtPriceMath.getAmount1Delta(lo, sqrtP, liquidity, roundUp);
        } else {
            a1 = SqrtPriceMath.getAmount1Delta(lo, hi, liquidity, roundUp);
        }
    }

    /// @dev Amounts needed to mint one UNIT of the shape (each leg gets weight * UNIT liquidity).
    function _unitNeeds(uint160 sqrtP, LegSpec[] memory legs) internal pure returns (uint256 need0, uint256 need1) {
        for (uint256 i = 0; i < legs.length; i++) {
            (uint256 a0, uint256 a1) =
                _amountsFor(sqrtP, legs[i].tickLower, legs[i].tickUpper, uint128(uint256(legs[i].weight) * UNIT), true);
            need0 += a0;
            need1 += a1;
        }
    }

    /// @dev Largest scale factor (WAD) such that scale * unit shape fits inside (bal0, bal1), with a hair of
    ///      margin for the PoolManager rounding each leg up.
    function _scaleFor(uint256 need0, uint256 need1, uint256 bal0, uint256 bal1) internal pure returns (uint256 f) {
        if (need0 == 0 && need1 == 0) return 0;
        uint256 f0 = need0 == 0 ? type(uint256).max : FullMath.mulDiv(bal0, WAD, need0);
        uint256 f1 = need1 == 0 ? type(uint256).max : FullMath.mulDiv(bal1, WAD, need1);
        f = f0 < f1 ? f0 : f1;
        f = (f * 999_999) / 1_000_000;
    }

    function _legLiquidity(uint32 weight, uint256 scaleWad) internal pure returns (uint128) {
        uint256 l = FullMath.mulDiv(uint256(weight) * UNIT, scaleWad, WAD);
        if (l > type(uint128).max) revert InsufficientInput();
        return uint128(l);
    }

    /// @dev value of `amount0` expressed in currency1 at price sqrtP (two mulDiv steps keep it inside 256 bits).
    function _value0In1(uint256 amount0, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount0, sqrtP, FixedPoint96.Q96), sqrtP, FixedPoint96.Q96);
    }

    function _value1In0(uint256 amount1, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount1, FixedPoint96.Q96, sqrtP), FixedPoint96.Q96, sqrtP);
    }

    /// @dev Single-asset entry: turn `usdcAmount` held by this contract into the token mix the shape needs.
    function _zapUsdc(PoolKey memory key, bool usdcIs0, LegSpec[] memory legs, uint256 usdcAmount, uint256 slippageBps)
        internal
        returns (uint256 bal0, uint256 bal1)
    {
        (bal0, bal1) = usdcIs0 ? (usdcAmount, uint256(0)) : (uint256(0), usdcAmount);
        return _swapTowardShape(key, legs, bal0, bal1, slippageBps);
    }

    /// @dev Swap whichever side is in excess so (h0, h1) matches the shape's value split at the pool price.
    ///      A swap moves the price, and with it the split the ranges want, so one pass overshoots in a thin
    ///      pool. A second, much smaller pass corrects it. Both passes share one absolute price limit taken
    ///      from the price before the first swap, so the caller's slippage bound holds for the whole operation.
    function _swapTowardShape(PoolKey memory key, LegSpec[] memory legs, uint256 h0, uint256 h1, uint256 slippageBps)
        internal
        returns (uint256, uint256)
    {
        (uint160 refSqrtP,,,) = poolManager.getSlot0(key.toId());
        (h0, h1) = _swapPass(key, legs, h0, h1, refSqrtP, slippageBps);
        return _swapPass(key, legs, h0, h1, refSqrtP, slippageBps);
    }

    function _swapPass(PoolKey memory key, LegSpec[] memory legs, uint256 h0, uint256 h1, uint160 refSqrtP, uint256 slippageBps)
        internal
        returns (uint256, uint256)
    {
        (bool sell0, uint256 amountIn, uint160 sqrtP) = _excess(key.toId(), legs, h0, h1);
        if (amountIn == 0) return (h0, h1);
        uint160 limit = _priceLimit(refSqrtP, sell0, slippageBps);
        // already at or past the bound in this direction: nothing more can be done safely
        if (sell0 ? sqrtP <= limit : sqrtP >= limit) return (h0, h1);
        (uint256 paid, uint256 got) = _swapToLimit(key, sell0, amountIn, limit);
        return sell0 ? (h0 - paid, h1 + got) : (h0 + got, h1 - paid);
    }

    /// @dev Which side is over-represented against the shape's split, and by how much (in that side's units).
    ///      Differences under 0.2 % of the total are left alone.
    function _excess(PoolId id, LegSpec[] memory legs, uint256 h0, uint256 h1)
        internal
        view
        returns (bool sell0, uint256 amountIn, uint160 sqrtP)
    {
        (sqrtP,,,) = poolManager.getSlot0(id);
        uint256 have0 = _value0In1(h0, sqrtP);
        uint256 total = have0 + h1;
        if (total == 0) return (false, 0, sqrtP);
        (uint256 need0, uint256 need1) = _unitNeeds(sqrtP, legs);
        uint256 v0 = _value0In1(need0, sqrtP);
        if (v0 + need1 == 0) revert ZeroAmount();
        uint256 target0 = FullMath.mulDiv(total, v0, v0 + need1);
        if (have0 > target0) {
            if ((have0 - target0) * 500 < total) return (true, 0, sqrtP);
            return (true, FullMath.mulDiv(h0, have0 - target0, have0), sqrtP);
        }
        uint256 short1 = target0 - have0; // currency1 to spend buying currency0
        if (short1 * 500 < total) return (false, 0, sqrtP);
        return (false, short1 > h1 ? h1 : short1, sqrtP);
    }

    function _swapToLimit(PoolKey memory key, bool zeroForOne, uint256 amountIn, uint160 sqrtLimit)
        internal
        returns (uint256 paid, uint256 amountOut)
    {
        BalanceDelta d = poolManager.swap(key, IPoolManager.SwapParams(zeroForOne, -int256(amountIn), sqrtLimit), "");
        int128 dIn = zeroForOne ? d.amount0() : d.amount1();
        int128 dOut = zeroForOne ? d.amount1() : d.amount0();
        paid = dIn < 0 ? uint256(uint128(-dIn)) : 0;
        amountOut = dOut > 0 ? uint256(uint128(dOut)) : 0;
        _pay(zeroForOne ? key.currency0 : key.currency1, paid);
        _take(zeroForOne ? key.currency1 : key.currency0, amountOut);
    }

    function _checkKey(PoolKey memory key) internal view returns (PoolId id, uint160 sqrtP, int24 tick) {
        if (key.currency0.isAddressZero()) revert NativeNotSupported();
        id = key.toId();
        (sqrtP, tick,,) = poolManager.getSlot0(id);
        if (sqrtP == 0) revert PoolNotInitialized();
    }

    /// @dev floor division of a tick to its spacing (ticks can be negative).
    function _floorTick(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 c = (tick / spacing) * spacing;
        if (tick < 0 && tick % spacing != 0) c -= spacing;
        return c;
    }

    function _clampTick(int24 t, int24 spacing) internal pure returns (int24) {
        int24 minT = (TickMath.MIN_TICK / spacing) * spacing;
        int24 maxT = (TickMath.MAX_TICK / spacing) * spacing;
        return t < minT ? minT : t > maxT ? maxT : t;
    }
}

// src/arcflow/v2/ArcFlowVaultV2.sol

/// @title ArcFlowVaultV2 ("Stakes v2")
/// @notice Deposit USDC, earn a pool's swap fees, streamed. Unlike v1 (full range), each strategy keeps its
///         liquidity in a band around the price, so every dollar earns several times more fees.
///
///  - A strategy is (pool, width). Three widths: Tight (~±10 %), Medium (~±25 %), Wide (~±49 %).
///  - Every stake, unstake, claim-and-compound or harvest realises the position's fees: the non-USDC half is
///    swapped to USDC in the pool, a protocol cut goes to the treasury, the rest streams to stakers over
///    seven days. Calling `harvest` directly earns the caller a small bounty, so quiet pools keep flowing.
///  - When the price leaves the band the position stops earning. Anyone may `poke` to record that, and after
///    a delay anyone may `rebalance`, which recentres the band. The delay plus a drift limit means a price
///    pushed out of range for one block cannot trigger a rebalance at a manipulated price. A rebalance never
///    moves the pool price by more than 1 %. In a thin pool that means it may only partly fill: the rest waits
///    as an idle balance (still owned pro-rata by holders) and `deployIdle` works it in, 1 % at a time.
///  - Shares are a pro-rata claim on the strategy's liquidity and any idle balance left by a rebalance.
///    New shares are minted by value, so a newcomer pays for that idle balance like everything else.
///  - Fees realised by a stake are streamed from that moment to all holders including the newcomer. Because
///    every stake, unstake and harvest realises fees, the amount exposed to that dilution is only what accrued
///    since the last interaction.
///
/// Beta safety: a per-strategy USDC cap and a withdraw-only switch. Unstake and claim can never be paused.
contract ArcFlowVaultV2 is ArcFlowBase, ReentrancyGuard, Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    // ---------- Errors ----------

    error PoolMustContainUsdc();
    error BadWidth();
    error StrategyNotFound();
    error DepositsPaused();
    error CapExceeded(uint256 cap);
    error InsufficientSharesOut(uint256 got, uint256 min);
    error InsufficientShares();
    error InsufficientOutput();
    error NothingToClaim();
    error StillInRange();
    error NotPoked();
    error PokeTooFresh(uint256 readyAt);
    error PokeExpired();
    error PokeStillValid();
    error PriceDrifted(int24 pokedTick, int24 tickNow);
    error CooldownActive(uint256 readyAt);
    error SlippageTooHigh();
    error RebalanceIncomplete();
    error NothingIdle();
    error FeeTooHigh();
    error ZeroAddress();

    // ---------- Constants ----------

    uint256 public constant STREAM_DURATION = 7 days;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 2_000;
    uint256 public constant MAX_BOUNTY_BPS = 500;
    uint256 public constant REBALANCE_DELAY = 10 minutes;
    uint256 public constant POKE_TTL = 2 hours;
    uint256 public constant REBALANCE_COOLDOWN = 1 hours;
    uint256 public constant MAX_REBALANCE_SLIPPAGE_BPS = 100; // the vault never moves a pool's price by more than 1 % per call
    uint256 public constant IDLE_DEPLOY_INTERVAL = 10 minutes;
    int24 public constant MAX_DRIFT_TICKS = 300; // ~3 % between poke and rebalance
    uint256 public constant MIN_NOTIFY_INTERVAL = 1 hours;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant YEAR = 365 days;

    // ---------- Admin state ----------

    address public treasury;
    uint256 public protocolFeeBps = 100; // 1 % of harvested fees
    uint256 public bountyBps = 50; // 0.5 % of harvested fees to whoever calls harvest()
    uint256 public capUsdc = 25_000e6; // per strategy, 0 = no cap
    bool public depositsPaused;

    // ---------- Strategy state ----------

    struct Strategy {
        PoolKey key;
        bool exists;
        bool usdcIs0;
        uint8 width; // 0 tight, 1 medium, 2 wide
        int24 halfWidth; // ticks, a multiple of the pool's spacing
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 totalShares;
        uint256 idle0;
        uint256 idle1;
        // streaming rewards (scaled by PRECISION)
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdate;
        uint256 lastNotify;
        uint256 rewardPerShareStored;
        uint256 undistributed;
        // stats
        uint256 totalFeesUsdc;
        uint256 totalProtocolUsdc;
        uint256 netDepositedUsdc;
        uint64 lastRebalance;
        uint64 lastIdleDeploy;
        uint64 pokedAt;
        int24 pokedTick;
        uint32 rebalances;
    }

    mapping(bytes32 => Strategy) internal strategies;
    bytes32[] public strategyList;
    mapping(bytes32 => mapping(address => uint256)) public shares;
    mapping(bytes32 => mapping(address => uint256)) public userRewardPerSharePaid;
    mapping(bytes32 => mapping(address => uint256)) public rewards;
    mapping(address => bytes32[]) internal userStrategies;
    mapping(bytes32 => mapping(address => bool)) internal userSeen;

    // ---------- Events ----------

    event StrategyAdded(bytes32 indexed strategyId, PoolId indexed poolId, uint8 width, int24 tickLower, int24 tickUpper);
    event Staked(bytes32 indexed strategyId, address indexed user, uint256 usdcIn, uint256 sharesOut, uint128 liquidity);
    event Unstaked(bytes32 indexed strategyId, address indexed user, uint256 sharesIn, uint256 amount0, uint256 amount1);
    event Harvested(bytes32 indexed strategyId, address indexed caller, uint256 feesUsdc, uint256 streamed, uint256 protocolCut, uint256 bounty);
    event Claimed(bytes32 indexed strategyId, address indexed user, uint256 usdc);
    event Poked(bytes32 indexed strategyId, int24 tick);
    event Rebalanced(bytes32 indexed strategyId, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 idle0, uint256 idle1);
    event IdleDeployed(bytes32 indexed strategyId, uint128 liquidity, uint256 idle0, uint256 idle1);
    event ParamsUpdated(uint256 protocolFeeBps, uint256 bountyBps, uint256 capUsdc, bool depositsPaused);
    event TreasuryUpdated(address treasury);

    constructor(IPoolManager _poolManager, IERC20 _usdc, address _treasury) ArcFlowBase(_poolManager, _usdc) Ownable(msg.sender) {
        treasury = _treasury == address(0) ? msg.sender : _treasury;
    }

    // ============================================================
    //                        USER ACTIONS
    // ============================================================

    /// @notice Stake USDC into (pool, width). Creates the strategy on first use.
    function stake(PoolKey calldata key, uint8 width, uint256 usdcAmount, uint256 slippageBps, uint256 minShares)
        external
        nonReentrant
        returns (uint256 sharesOut)
    {
        if (usdcAmount == 0) revert ZeroAmount();
        bytes32 sid = _ensureStrategy(key, width);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        sharesOut = _stake(sid, msg.sender, usdcAmount, slippageBps, minShares);
    }

    /// @notice Burn shares for the underlying tokens (or USDC only). Never pausable.
    function unstake(bytes32 sid, uint256 shareAmount, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1)
        external
        nonReentrant
        returns (uint256 out0, uint256 out1)
    {
        Strategy storage s = _get(sid);
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[sid][msg.sender] < shareAmount) revert InsufficientShares();
        _updateReward(sid, msg.sender);
        (out0, out1) = abi.decode(
            _unlock(abi.encode(Action.Unstake, sid, msg.sender, abi.encode(shareAmount, toUsdc, slippageBps))), (uint256, uint256)
        );
        s.netDepositedUsdc -= FullMath.mulDiv(s.netDepositedUsdc, shareAmount, s.totalShares);
        shares[sid][msg.sender] -= shareAmount;
        s.totalShares -= shareAmount;
        if (out0 < minOut0 || out1 < minOut1) revert InsufficientOutput();
        _payout(s.key.currency0, msg.sender, out0);
        _payout(s.key.currency1, msg.sender, out1);
        emit Unstaked(sid, msg.sender, shareAmount, out0, out1);
    }

    /// @notice Realise the strategy's fees and stream them. The caller earns `bountyBps` of what was harvested.
    function harvest(bytes32 sid) external nonReentrant returns (uint256 feesUsdc) {
        _get(sid);
        _updateReward(sid, address(0));
        feesUsdc = abi.decode(_unlock(abi.encode(Action.Harvest, sid, msg.sender, bytes(""))), (uint256));
    }

    function claim(bytes32 sid) external nonReentrant returns (uint256 amount) {
        _updateReward(sid, msg.sender);
        amount = rewards[sid][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[sid][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(sid, msg.sender, amount);
    }

    /// @notice Claim streamed USDC and stake it straight back.
    function compound(bytes32 sid, uint256 slippageBps, uint256 minShares) external nonReentrant returns (uint256 sharesOut) {
        _get(sid);
        _updateReward(sid, msg.sender);
        uint256 amount = rewards[sid][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[sid][msg.sender] = 0;
        emit Claimed(sid, msg.sender, amount);
        sharesOut = _stake(sid, msg.sender, amount, slippageBps, minShares);
    }

    // ============================================================
    //                     POKE / REBALANCE
    // ============================================================

    /// @notice Record that the price is outside the band. Starts the rebalance delay.
    function poke(bytes32 sid) external {
        Strategy storage s = _get(sid);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (_inRange(s, tick)) revert StillInRange();
        if (s.pokedAt != 0 && block.timestamp <= s.pokedAt + POKE_TTL) revert PokeStillValid();
        s.pokedAt = uint64(block.timestamp);
        s.pokedTick = tick;
        emit Poked(sid, tick);
    }

    /// @notice Recentre the band around the current price. Anyone may call once a poke has aged
    ///         `REBALANCE_DELAY`, the price is still out of range and has not drifted far from the poke.
    function rebalance(bytes32 sid, uint256 slippageBps) external nonReentrant {
        Strategy storage s = _get(sid);
        if (depositsPaused) revert DepositsPaused();
        if (slippageBps > MAX_REBALANCE_SLIPPAGE_BPS) revert SlippageTooHigh();
        if (s.pokedAt == 0) revert NotPoked();
        if (block.timestamp < s.pokedAt + REBALANCE_DELAY) revert PokeTooFresh(s.pokedAt + REBALANCE_DELAY);
        if (block.timestamp > s.pokedAt + POKE_TTL) revert PokeExpired();
        if (block.timestamp < uint256(s.lastRebalance) + REBALANCE_COOLDOWN) revert CooldownActive(uint256(s.lastRebalance) + REBALANCE_COOLDOWN);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (_inRange(s, tick)) revert StillInRange();
        int24 drift = tick > s.pokedTick ? tick - s.pokedTick : s.pokedTick - tick;
        if (drift > MAX_DRIFT_TICKS) revert PriceDrifted(s.pokedTick, tick);

        _updateReward(sid, address(0));
        _unlock(abi.encode(Action.Rebalance, sid, msg.sender, abi.encode(slippageBps)));
        s.pokedAt = 0;
        s.lastRebalance = uint64(block.timestamp);
        s.lastIdleDeploy = uint64(block.timestamp);
        s.rebalances += 1;
        emit Rebalanced(sid, s.tickLower, s.tickUpper, s.liquidity, s.idle0, s.idle1);
    }

    /// @notice Work a strategy's idle balance (left by a partly filled rebalance) back into the band.
    ///         Anyone may call, at most once per IDLE_DEPLOY_INTERVAL, while the price is inside the band.
    function deployIdle(bytes32 sid, uint256 slippageBps) external nonReentrant {
        Strategy storage s = _get(sid);
        if (depositsPaused) revert DepositsPaused();
        if (slippageBps > MAX_REBALANCE_SLIPPAGE_BPS) revert SlippageTooHigh();
        if (s.idle0 == 0 && s.idle1 == 0) revert NothingIdle();
        if (block.timestamp < uint256(s.lastIdleDeploy) + IDLE_DEPLOY_INTERVAL) revert CooldownActive(uint256(s.lastIdleDeploy) + IDLE_DEPLOY_INTERVAL);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (!_inRange(s, tick)) revert NotPoked(); // out of range: poke and rebalance instead
        _updateReward(sid, address(0));
        _unlock(abi.encode(Action.DeployIdle, sid, msg.sender, abi.encode(slippageBps)));
        s.lastIdleDeploy = uint64(block.timestamp);
        emit IdleDeployed(sid, s.liquidity, s.idle0, s.idle1);
    }

    // ============================================================
    //                            VIEWS
    // ============================================================

    function strategyIdFor(PoolKey calldata key, uint8 width) external pure returns (bytes32) {
        return _sid(key.toId(), width);
    }

    function strategyInfo(bytes32 sid) external view returns (Strategy memory) {
        return strategies[sid];
    }

    function strategyCount() external view returns (uint256) {
        return strategyList.length;
    }

    function strategiesOf(address user) external view returns (bytes32[] memory) {
        return userStrategies[user];
    }

    /// @notice Live state for the UI: in range?, current tick, TVL in USDC at spot, APR in bps from the running stream.
    function strategyState(bytes32 sid) external view returns (bool inRange, int24 tick, uint256 tvlUsdc, uint256 aprBps, uint256 streamRemainingUsdc) {
        Strategy storage s = strategies[sid];
        if (!s.exists) return (false, 0, 0, 0, 0);
        uint160 sqrtP;
        (sqrtP, tick,,) = poolManager.getSlot0(s.key.toId());
        inRange = _inRange(s, tick);
        (uint256 a0, uint256 a1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, s.liquidity, false);
        tvlUsdc = _usdcValue(s, a0 + s.idle0, a1 + s.idle1, sqrtP);
        if (block.timestamp < s.periodFinish) {
            streamRemainingUsdc = ((s.periodFinish - block.timestamp) * s.rewardRate) / PRECISION;
            if (tvlUsdc > 0) aprBps = FullMath.mulDiv((s.rewardRate * YEAR) / PRECISION, 10_000, tvlUsdc);
        }
    }

    /// @notice A user's shares, their value in both tokens and in USDC at spot, and USDC claimable now.
    function userState(bytes32 sid, address user)
        external
        view
        returns (uint256 userShares, uint256 amount0, uint256 amount1, uint256 valueUsdc, uint256 pending)
    {
        Strategy storage s = strategies[sid];
        userShares = shares[sid][user];
        pending = rewards[sid][user] + (userShares * (_rewardPerShare(sid) - userRewardPerSharePaid[sid][user])) / PRECISION;
        if (userShares == 0 || s.totalShares == 0) return (userShares, 0, 0, 0, pending);
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        uint128 liq = uint128(FullMath.mulDiv(s.liquidity, userShares, s.totalShares));
        (amount0, amount1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, liq, false);
        amount0 += FullMath.mulDiv(s.idle0, userShares, s.totalShares);
        amount1 += FullMath.mulDiv(s.idle1, userShares, s.totalShares);
        valueUsdc = _usdcValue(s, amount0, amount1, sqrtP);
    }

    /// @notice The band a width would get right now (before the strategy exists) or the live band.
    function bandFor(PoolKey calldata key, uint8 width) external view returns (int24 tickLower, int24 tickUpper, bool exists) {
        bytes32 sid = _sid(key.toId(), width);
        Strategy storage s = strategies[sid];
        if (s.exists) return (s.tickLower, s.tickUpper, true);
        (,, int24 tick) = _checkKey(key);
        (tickLower, tickUpper) = _band(tick, key.tickSpacing, _halfWidth(width, key.tickSpacing));
    }

    // ============================================================
    //                            ADMIN
    // ============================================================

    function setParams(uint256 _protocolFeeBps, uint256 _bountyBps, uint256 _capUsdc, bool _depositsPaused) external onlyOwner {
        if (_protocolFeeBps > MAX_PROTOCOL_FEE_BPS || _bountyBps > MAX_BOUNTY_BPS) revert FeeTooHigh();
        protocolFeeBps = _protocolFeeBps;
        bountyBps = _bountyBps;
        capUsdc = _capUsdc;
        depositsPaused = _depositsPaused;
        emit ParamsUpdated(_protocolFeeBps, _bountyBps, _capUsdc, _depositsPaused);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    // ============================================================
    //                    POOL MANAGER CALLBACK
    // ============================================================

    enum Action {
        Stake,
        Unstake,
        Harvest,
        Rebalance,
        DeployIdle
    }

    function _onUnlock(bytes calldata data) internal override returns (bytes memory) {
        (Action action, bytes32 sid, address user, bytes memory args) = abi.decode(data, (Action, bytes32, address, bytes));
        Strategy storage s = strategies[sid];
        if (action == Action.Stake) return _cbStake(s, sid, user, args);
        if (action == Action.Unstake) return _cbUnstake(s, sid, user, args);
        if (action == Action.Harvest) {
            if (s.liquidity == 0) return abi.encode(uint256(0));
            (,, uint256 feesUsdc) = _modify(s, sid, user, 0, true);
            return abi.encode(feesUsdc);
        }
        if (action == Action.DeployIdle) {
            (uint256 i0, uint256 i1) = _swapTowardShape(s.key, _legs(s), s.idle0, s.idle1, abi.decode(args, (uint256)));
            uint128 add = _liqFor(s, i0, i1);
            if (add == 0) revert RebalanceIncomplete();
            (s.idle0, s.idle1) = _addLiquidity(s, sid, user, add, i0, i1);
            return bytes("");
        }
        return _cbRebalance(s, sid, user, args);
    }

    function _cbStake(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        (uint256 usdcAmount, uint256 slippageBps) = abi.decode(args, (uint256, uint256));
        _deployIdle(s, sid, user);
        (uint256 bal0, uint256 bal1) = _zapUsdc(s.key, s.usdcIs0, _legs(s), usdcAmount, slippageBps);
        uint128 liq = _liqFor(s, bal0, bal1);
        if (liq == 0) revert ZeroAmount();
        // everything existing holders own, and what the newcomer adds, priced at the same spot
        (uint256 valueBefore, uint256 valueAdded) = _stakeValues(s, liq);
        // refunded USDC does not count toward the cap
        return abi.encode(liq, valueBefore, valueAdded, usdcAmount - _addAndRefund(s, sid, user, liq, bal0, bal1));
    }

    /// @dev Add the liquidity, send whatever did not fit back to the user, and report the USDC part of that refund.
    function _addAndRefund(Strategy storage s, bytes32 sid, address user, uint128 liq, uint256 bal0, uint256 bal1)
        internal
        returns (uint256 usdcRefund)
    {
        (uint256 left0, uint256 left1) = _addLiquidity(s, sid, user, liq, bal0, bal1);
        _payout(s.key.currency0, user, left0);
        _payout(s.key.currency1, user, left1);
        return s.usdcIs0 ? left0 : left1;
    }

    /// @dev (value of the strategy before this stake, value of `liq` being added), both in currency1 at spot.
    function _stakeValues(Strategy storage s, uint128 liq) internal view returns (uint256 valueBefore, uint256 valueAdded) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        (uint256 b0, uint256 b1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, s.liquidity, false);
        valueBefore = _value0In1(b0 + s.idle0, sqrtP) + b1 + s.idle1;
        (uint256 a0, uint256 a1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, liq, false);
        valueAdded = _value0In1(a0, sqrtP) + a1;
    }

    function _cbUnstake(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        (uint256 shareAmount, bool toUsdc, uint256 slippageBps) = abi.decode(args, (uint256, bool, uint256));
        (uint256 out0, uint256 out1) = _withdrawShare(s, sid, user, shareAmount);
        if (toUsdc) (out0, out1) = _toUsdc(s, out0, out1, slippageBps);
        return abi.encode(out0, out1);
    }

    /// @dev A holder's pro-rata slice of the band's liquidity plus the idle balances.
    function _withdrawShare(Strategy storage s, bytes32 sid, address user, uint256 shareAmount) internal returns (uint256 out0, uint256 out1) {
        uint256 total = s.totalShares;
        uint256 i0 = FullMath.mulDiv(s.idle0, shareAmount, total);
        uint256 i1 = FullMath.mulDiv(s.idle1, shareAmount, total);
        s.idle0 -= i0;
        s.idle1 -= i1;
        (out0, out1) = _removeLiquidity(s, sid, user, uint128(FullMath.mulDiv(s.liquidity, shareAmount, total)));
        out0 += i0;
        out1 += i1;
    }

    function _cbRebalance(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        uint256 slippageBps = abi.decode(args, (uint256));
        // 1. pull everything out (fees are streamed on the way)
        (uint256 h0, uint256 h1) = _removeLiquidity(s, sid, user, s.liquidity);
        h0 += s.idle0;
        h1 += s.idle1;
        // 2. new band around the current price
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        (s.tickLower, s.tickUpper) = _band(tick, s.key.tickSpacing, s.halfWidth);
        // 3. swap toward the band's token ratio (two passes, one 1 % price bound), 4. mint what fits.
        //    Anything left waits in idle0/idle1, owned pro-rata by holders, for deployIdle().
        (h0, h1) = _swapTowardShape(s.key, _legs(s), h0, h1, slippageBps);
        uint128 liq = _liqFor(s, h0, h1);
        if (liq == 0) revert RebalanceIncomplete();
        (s.idle0, s.idle1) = _addLiquidity(s, sid, user, liq, h0, h1);
        return bytes("");
    }

    /// @dev Put idle dust back to work. No shares are minted: it already belongs to every holder.
    function _deployIdle(Strategy storage s, bytes32 sid, address user) internal {
        if ((s.idle0 == 0 && s.idle1 == 0) || s.totalShares == 0) return;
        uint128 liq = _liqFor(s, s.idle0, s.idle1);
        if (liq == 0) return;
        (s.idle0, s.idle1) = _addLiquidity(s, sid, user, liq, s.idle0, s.idle1);
    }

    // ---------- small helpers shared by the callbacks ----------

    function _legs(Strategy storage s) internal view returns (LegSpec[] memory legs) {
        legs = new LegSpec[](1);
        legs[0] = LegSpec(s.tickLower, s.tickUpper, 1);
    }

    /// @dev Liquidity the band can take from (bal0, bal1) at the current price.
    function _liqFor(Strategy storage s, uint256 bal0, uint256 bal1) internal view returns (uint128) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        (uint256 need0, uint256 need1) = _unitNeeds(sqrtP, _legs(s));
        return _legLiquidity(1, _scaleFor(need0, need1, bal0, bal1));
    }

    /// @dev Add `liq` to the band, paying from (avail0, avail1) held by this contract. Returns what is left.
    function _addLiquidity(Strategy storage s, bytes32 sid, address user, uint128 liq, uint256 avail0, uint256 avail1)
        internal
        returns (uint256 left0, uint256 left1)
    {
        (int256 d0, int256 d1,) = _modify(s, sid, user, int256(uint256(liq)), false);
        uint256 used0 = d0 < 0 ? uint256(-d0) : 0;
        uint256 used1 = d1 < 0 ? uint256(-d1) : 0;
        if (used0 > avail0 || used1 > avail1) revert InsufficientInput();
        _pay(s.key.currency0, used0);
        _pay(s.key.currency1, used1);
        return (avail0 - used0, avail1 - used1);
    }

    /// @dev Remove `liq` from the band and take the principal into this contract.
    function _removeLiquidity(Strategy storage s, bytes32 sid, address user, uint128 liq) internal returns (uint256 p0, uint256 p1) {
        if (liq == 0) return (0, 0);
        (int256 d0, int256 d1,) = _modify(s, sid, user, -int256(uint256(liq)), false);
        p0 = d0 > 0 ? uint256(d0) : 0;
        p1 = d1 > 0 ? uint256(d1) : 0;
        _take(s.key.currency0, p0);
        _take(s.key.currency1, p1);
    }

    function _toUsdc(Strategy storage s, uint256 out0, uint256 out1, uint256 slippageBps) internal returns (uint256, uint256) {
        if (s.usdcIs0 && out1 > 0) {
            (uint256 paid, uint256 got) = _swapExactIn(s.key, false, out1, slippageBps);
            return (out0 + got, out1 - paid);
        }
        if (!s.usdcIs0 && out0 > 0) {
            (uint256 paid, uint256 got) = _swapExactIn(s.key, true, out0, slippageBps);
            return (out0 - paid, out1 + got);
        }
        return (out0, out1);
    }

    /// @dev modifyLiquidity on the strategy's band. Streams realised fees and returns principal deltas only
    ///      (negative = we owe the pool). Keeps `s.liquidity` in step.
    function _modify(Strategy storage s, bytes32 sid, address caller, int256 liquidityDelta, bool payBounty)
        internal
        returns (int256 d0, int256 d1, uint256 feesUsdc)
    {
        (BalanceDelta callerDelta, BalanceDelta feesAccrued) = poolManager.modifyLiquidity(
            s.key, IPoolManager.ModifyLiquidityParams(s.tickLower, s.tickUpper, liquidityDelta, sid), ""
        );
        if (liquidityDelta > 0) s.liquidity += uint128(uint256(liquidityDelta));
        else if (liquidityDelta < 0) s.liquidity -= uint128(uint256(-liquidityDelta));
        feesUsdc = _streamFees(s, sid, caller, feesAccrued, payBounty);
        d0 = int256(callerDelta.amount0()) - int256(feesAccrued.amount0());
        d1 = int256(callerDelta.amount1()) - int256(feesAccrued.amount1());
    }

    function _streamFees(Strategy storage s, bytes32 sid, address caller, BalanceDelta feesAccrued, bool payBounty)
        internal
        returns (uint256 usdcTotal)
    {
        uint256 f0 = feesAccrued.amount0() > 0 ? uint256(uint128(feesAccrued.amount0())) : 0;
        uint256 f1 = feesAccrued.amount1() > 0 ? uint256(uint128(feesAccrued.amount1())) : 0;
        if (f0 == 0 && f1 == 0) return 0;
        _take(s.key.currency0, f0);
        _take(s.key.currency1, f1);
        // fee amounts are small next to pool depth: swap without a price limit so nothing is left unfilled
        if (s.usdcIs0) {
            uint256 got;
            if (f1 > 0) (, got) = _swapExactIn(s.key, false, f1, 10_000);
            usdcTotal = f0 + got;
        } else {
            uint256 got;
            if (f0 > 0) (, got) = _swapExactIn(s.key, true, f0, 10_000);
            usdcTotal = f1 + got;
        }
        if (usdcTotal == 0) return 0;

        uint256 cut = (usdcTotal * protocolFeeBps) / 10_000;
        uint256 bounty = payBounty ? (usdcTotal * bountyBps) / 10_000 : 0;
        if (cut > 0) usdc.safeTransfer(treasury, cut);
        if (bounty > 0) usdc.safeTransfer(caller, bounty);
        uint256 net = usdcTotal - cut - bounty;
        s.totalFeesUsdc += usdcTotal;
        s.totalProtocolUsdc += cut;
        _notifyReward(s, net);
        emit Harvested(sid, caller, usdcTotal, net, cut, bounty);
    }

    // ============================================================
    //                          INTERNALS
    // ============================================================

    function _stake(bytes32 sid, address user, uint256 usdcAmount, uint256 slippageBps, uint256 minShares) internal returns (uint256 sharesOut) {
        Strategy storage s = strategies[sid];
        if (depositsPaused) revert DepositsPaused();
        _updateReward(sid, user);
        (uint128 liq, uint256 valueBefore, uint256 valueAdded, uint256 usdcUsed) = abi.decode(
            _unlock(abi.encode(Action.Stake, sid, user, abi.encode(usdcAmount, slippageBps))), (uint128, uint256, uint256, uint256)
        );
        // first staker: shares == liquidity. After that: pro-rata to value, so idle balances are paid for too.
        sharesOut = s.totalShares == 0 || valueBefore == 0 ? uint256(liq) : FullMath.mulDiv(valueAdded, s.totalShares, valueBefore);
        if (sharesOut == 0) revert ZeroAmount();
        if (sharesOut < minShares) revert InsufficientSharesOut(sharesOut, minShares);
        s.netDepositedUsdc += usdcUsed;
        if (capUsdc != 0 && s.netDepositedUsdc > capUsdc) revert CapExceeded(capUsdc);
        shares[sid][user] += sharesOut;
        s.totalShares += sharesOut;
        if (!userSeen[sid][user]) {
            userSeen[sid][user] = true;
            userStrategies[user].push(sid);
        }
        emit Staked(sid, user, usdcUsed, sharesOut, liq);
    }

    function _ensureStrategy(PoolKey calldata key, uint8 width) internal returns (bytes32 sid) {
        PoolId id = key.toId();
        sid = _sid(id, width);
        Strategy storage s = strategies[sid];
        if (s.exists) return sid;
        bool is0 = Currency.unwrap(key.currency0) == address(usdc);
        if (!is0 && Currency.unwrap(key.currency1) != address(usdc)) revert PoolMustContainUsdc();
        (,, int24 tick) = _checkKey(key);
        s.key = key;
        s.exists = true;
        s.usdcIs0 = is0;
        s.width = width;
        s.halfWidth = _halfWidth(width, key.tickSpacing);
        (s.tickLower, s.tickUpper) = _band(tick, key.tickSpacing, s.halfWidth);
        s.lastUpdate = block.timestamp;
        strategyList.push(sid);
        emit StrategyAdded(sid, id, width, s.tickLower, s.tickUpper);
    }

    function _get(bytes32 sid) internal view returns (Strategy storage s) {
        s = strategies[sid];
        if (!s.exists) revert StrategyNotFound();
    }

    function _sid(PoolId id, uint8 width) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, width));
    }

    function _halfWidth(uint8 width, int24 spacing) internal pure returns (int24 h) {
        if (width > 2) revert BadWidth();
        int24 raw = width == 0 ? int24(1000) : width == 1 ? int24(2200) : int24(4000);
        h = (raw / spacing) * spacing;
        if (raw % spacing != 0) h += spacing;
    }

    function _band(int24 tick, int24 spacing, int24 halfWidth) internal pure returns (int24 lower, int24 upper) {
        int24 c = _floorTick(tick, spacing);
        lower = _clampTick(c - halfWidth, spacing);
        upper = _clampTick(c + spacing + halfWidth, spacing);
    }

    function _inRange(Strategy storage s, int24 tick) internal view returns (bool) {
        return tick >= s.tickLower && tick < s.tickUpper;
    }

    function _usdcValue(Strategy storage s, uint256 a0, uint256 a1, uint160 sqrtP) internal view returns (uint256) {
        return s.usdcIs0 ? a0 + _value1In0(a1, sqrtP) : a1 + _value0In1(a0, sqrtP);
    }

    // ---------- reward accounting (Synthetix StakingRewards, per strategy) ----------

    function _lastTimeApplicable(Strategy storage s) internal view returns (uint256) {
        return block.timestamp < s.periodFinish ? block.timestamp : s.periodFinish;
    }

    function _rewardPerShare(bytes32 sid) internal view returns (uint256) {
        Strategy storage s = strategies[sid];
        if (s.totalShares == 0) return s.rewardPerShareStored;
        return s.rewardPerShareStored + ((_lastTimeApplicable(s) - s.lastUpdate) * s.rewardRate) / s.totalShares;
    }

    function _updateReward(bytes32 sid, address user) internal {
        Strategy storage s = strategies[sid];
        if (!s.exists) return;
        uint256 applicable = _lastTimeApplicable(s);
        if (s.totalShares == 0) {
            if (applicable > s.lastUpdate) s.undistributed += ((applicable - s.lastUpdate) * s.rewardRate) / PRECISION;
        } else {
            s.rewardPerShareStored = _rewardPerShare(sid);
        }
        s.lastUpdate = applicable;
        if (user != address(0)) {
            rewards[sid][user] += (shares[sid][user] * (s.rewardPerShareStored - userRewardPerSharePaid[sid][user])) / PRECISION;
            userRewardPerSharePaid[sid][user] = s.rewardPerShareStored;
        }
    }

    /// @dev Start or extend the 7-day stream. Re-notifying resets the clock, so tiny, frequent harvests would
    ///      keep stretching the stream; amounts arriving within MIN_NOTIFY_INTERVAL of the last notify are
    ///      parked and ride along with the next one instead.
    function _notifyReward(Strategy storage s, uint256 usdcAmount) internal {
        if (s.lastNotify != 0 && block.timestamp < s.lastNotify + MIN_NOTIFY_INTERVAL && block.timestamp < s.periodFinish) {
            s.undistributed += usdcAmount;
            return;
        }
        uint256 amount = usdcAmount + s.undistributed;
        s.undistributed = 0;
        if (block.timestamp >= s.periodFinish) {
            s.rewardRate = (amount * PRECISION) / STREAM_DURATION;
        } else {
            uint256 remaining = ((s.periodFinish - block.timestamp) * s.rewardRate) / PRECISION;
            s.rewardRate = ((amount + remaining) * PRECISION) / STREAM_DURATION;
        }
        s.lastUpdate = block.timestamp;
        s.lastNotify = block.timestamp;
        s.periodFinish = block.timestamp + STREAM_DURATION;
    }
}
