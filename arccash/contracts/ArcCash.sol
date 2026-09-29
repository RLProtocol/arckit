// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory, IHasher} from "./MerkleTreeWithHistory.sol";

interface IVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata input) external view returns (bool);
}

/// @title ArcCash
/// @notice A fixed-denomination privacy pool for Arc's native coin (USDC), in the Tornado Cash Classic design.
///         Deposit `denomination` with a commitment; later, withdraw to any address by proving in zero
///         knowledge that you know the secret behind one of the commitments in the tree, without revealing
///         which. A relayer can submit the withdrawal and take `fee`, so the recipient needs no gas.
///
///         EXPERIMENTAL. No owner, no upgrade, no pause. Intended for local chains and the Arc testnet.
contract ArcCash is MerkleTreeWithHistory {
    IVerifier public immutable verifier;
    uint256 public immutable denomination;

    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;

    // Guards against reentrancy without OpenZeppelin, to keep the pool dependency-free.
    uint256 private locked = 1;

    error WrongDenomination(uint256 sent, uint256 required);
    error CommitmentAlreadySubmitted();
    error NoteAlreadySpent();
    error UnknownRoot();
    error FeeExceedsDenomination();
    error InvalidProof();
    error RefundNotSupported();
    error Reentrancy();
    error TransferFailed();

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IVerifier _verifier, IHasher _hasher, uint256 _denomination, uint32 _merkleTreeHeight) MerkleTreeWithHistory(_merkleTreeHeight, _hasher) {
        require(_denomination > 0, "denomination must be positive");
        verifier = _verifier;
        denomination = _denomination;
    }

    /// @notice Deposit exactly `denomination`. `commitment` = Pedersen(nullifier || secret), computed off-chain.
    function deposit(bytes32 _commitment) external payable nonReentrant {
        if (commitments[_commitment]) revert CommitmentAlreadySubmitted();
        if (msg.value != denomination) revert WrongDenomination(msg.value, denomination);
        uint32 insertedIndex = _insert(_commitment);
        commitments[_commitment] = true;
        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    /// @notice Withdraw a deposit to `_recipient`. `_fee` goes to `_relayer` (may be zero / address(0)).
    ///         `_refund` exists for ERC20 pools in the original design and must be zero here.
    function withdraw(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        bytes32 _root,
        bytes32 _nullifierHash,
        address payable _recipient,
        address payable _relayer,
        uint256 _fee,
        uint256 _refund
    ) external payable nonReentrant {
        if (_fee > denomination) revert FeeExceedsDenomination();
        if (nullifierHashes[_nullifierHash]) revert NoteAlreadySpent();
        if (!isKnownRoot(_root)) revert UnknownRoot();
        if (_refund != 0 || msg.value != 0) revert RefundNotSupported();
        if (
            !verifier.verifyProof(
                _pA,
                _pB,
                _pC,
                [uint256(_root), uint256(_nullifierHash), uint256(uint160(address(_recipient))), uint256(uint160(address(_relayer))), _fee, _refund]
            )
        ) revert InvalidProof();

        nullifierHashes[_nullifierHash] = true;
        _pay(_recipient, denomination - _fee);
        if (_fee > 0) _pay(_relayer, _fee);
        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    function isSpent(bytes32 _nullifierHash) external view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }

    function isSpentArray(bytes32[] calldata _nullifierHashes) external view returns (bool[] memory spent) {
        spent = new bool[](_nullifierHashes.length);
        for (uint256 i = 0; i < _nullifierHashes.length; i++) spent[i] = nullifierHashes[_nullifierHashes[i]];
    }

    function _pay(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
