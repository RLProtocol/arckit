// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TokenVesting
/// @notice Linear vesting schedules with an optional cliff for any standard ERC20.
///
/// A schedule holds `total` tokens for `beneficiary`. Nothing is claimable before
/// `cliff`. From `cliff` onward the vested amount is `total * (now - start) / (end - start)`,
/// so at the cliff a proportional chunk unlocks at once, then the rest streams
/// linearly until `end`, when everything is claimable.
///
/// Schedules are not revocable and their dates cannot be changed. That is the
/// point: a team publishing a vesting schedule is making a commitment. The only
/// mutable field is `beneficiary`, and only the current beneficiary can change it.
///
/// Trust assumptions:
///  - Amounts are recorded as received, so fee-on-transfer tokens work.
///    Rebasing tokens are NOT supported.
///  - The contract owner can only change the fee and fee receiver. It has no
///    path to vested tokens.
contract TokenVesting is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------- Types ----------

    struct Vesting {
        uint256 id;
        address token;
        address creator; // who funded the schedule (indexed for "my schedules")
        address beneficiary; // who can claim; can reassign this role
        uint256 total; // amount received by this contract
        uint256 released; // amount already claimed
        uint64 start; // vesting start
        uint64 cliff; // nothing claimable before this
        uint64 end; // fully vested at this timestamp
    }

    struct CreateParams {
        address beneficiary;
        uint256 amount;
        uint64 start;
        uint64 cliff;
        uint64 end;
    }

    // ---------- Errors ----------

    error ZeroAmount();
    error ZeroAddress();
    error BadSchedule();
    error WrongFee(uint256 sent, uint256 required);
    error NotBeneficiary();
    error NothingToClaim();
    error NothingReceived();
    error EmptyBatch();
    error NoFeesToClaim();
    error FeeTransferFailed();
    error NotFeeReceiver();

    // ---------- Storage ----------

    uint256 public nextVestingId = 1;

    /// vestingId => Vesting. A schedule with creator == address(0) does not exist.
    mapping(uint256 => Vesting) public vestings;

    mapping(address => uint256[]) private tokenVestings;
    mapping(address => uint256[]) private creatorVestings;
    mapping(address => uint256[]) private beneficiaryVestings;
    /// vestingId => (index in beneficiaryVestings[beneficiary]) + 1
    mapping(uint256 => uint256) private beneficiaryIndex;

    /// Flat native-coin fee per schedule created. Must be sent exactly (times the batch size).
    uint256 public fee = 10 ether;
    address public feeReceiver;
    uint256 public pendingFees;

    // ---------- Events ----------

    event VestingCreated(
        uint256 indexed vestingId,
        address indexed token,
        address indexed creator,
        address beneficiary,
        uint256 total,
        uint64 start,
        uint64 cliff,
        uint64 end
    );
    event TokensClaimed(uint256 indexed vestingId, address indexed beneficiary, uint256 amount);
    event BeneficiaryUpdated(uint256 indexed vestingId, address indexed oldBeneficiary, address indexed newBeneficiary);
    event FeeUpdated(uint256 newFee);
    event FeeReceiverUpdated(address indexed newReceiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    constructor(address _feeReceiver) Ownable(msg.sender) {
        feeReceiver = _feeReceiver == address(0) ? msg.sender : _feeReceiver;
    }

    // ---------- Create ----------

    /// @notice Create one vesting schedule. `msg.value` must equal `fee`.
    function createVesting(address token, CreateParams calldata p) external payable nonReentrant returns (uint256 id) {
        if (msg.value != fee) revert WrongFee(msg.value, fee);
        id = _create(token, p);
        if (msg.value > 0) pendingFees += msg.value;
    }

    /// @notice Create several schedules for the same token in one transaction
    ///         (team allocations, advisors, investors). `msg.value` must equal `fee * params.length`.
    function createVestingBatch(address token, CreateParams[] calldata params)
        external
        payable
        nonReentrant
        returns (uint256 firstId)
    {
        uint256 n = params.length;
        if (n == 0) revert EmptyBatch();
        uint256 required = fee * n;
        if (msg.value != required) revert WrongFee(msg.value, required);

        firstId = nextVestingId;
        for (uint256 i = 0; i < n; i++) {
            _create(token, params[i]);
        }
        if (msg.value > 0) pendingFees += msg.value;
    }

    function _create(address token, CreateParams calldata p) internal returns (uint256 id) {
        if (p.amount == 0) revert ZeroAmount();
        if (p.beneficiary == address(0)) revert ZeroAddress();
        // start may be in the past (schedule already running) but must be sane:
        // cliff >= start, end > start, cliff <= end, and end in the future.
        if (p.cliff < p.start || p.end <= p.start || p.cliff > p.end || p.end <= block.timestamp) revert BadSchedule();

        uint256 received = _pullTokens(token, p.amount);

        id = nextVestingId++;
        vestings[id] = Vesting({
            id: id,
            token: token,
            creator: msg.sender,
            beneficiary: p.beneficiary,
            total: received,
            released: 0,
            start: p.start,
            cliff: p.cliff,
            end: p.end
        });

        tokenVestings[token].push(id);
        creatorVestings[msg.sender].push(id);
        _addBeneficiary(p.beneficiary, id);

        emit VestingCreated(id, token, msg.sender, p.beneficiary, received, p.start, p.cliff, p.end);
    }

    // ---------- Claim ----------

    /// @notice Claim everything vested so far. Caller must be the beneficiary.
    function claim(uint256 vestingId) external nonReentrant returns (uint256 amount) {
        Vesting storage v = vestings[vestingId];
        if (v.beneficiary != msg.sender) revert NotBeneficiary();

        amount = _vested(v, block.timestamp) - v.released;
        if (amount == 0) revert NothingToClaim();

        v.released += amount;
        IERC20(v.token).safeTransfer(msg.sender, amount);

        emit TokensClaimed(vestingId, msg.sender, amount);
    }

    /// @notice Reassign who can claim. Only the current beneficiary may do this.
    function setBeneficiary(uint256 vestingId, address newBeneficiary) external {
        Vesting storage v = vestings[vestingId];
        if (v.beneficiary != msg.sender) revert NotBeneficiary();
        if (newBeneficiary == address(0)) revert ZeroAddress();

        address old = v.beneficiary;
        _removeBeneficiary(old, vestingId);
        v.beneficiary = newBeneficiary;
        _addBeneficiary(newBeneficiary, vestingId);

        emit BeneficiaryUpdated(vestingId, old, newBeneficiary);
    }

    // ---------- Views ----------

    function getVesting(uint256 vestingId) external view returns (Vesting memory) {
        return vestings[vestingId];
    }

    /// @notice Amount vested at `timestamp` (claimed or not).
    function vestedAmount(uint256 vestingId, uint256 timestamp) external view returns (uint256) {
        return _vested(vestings[vestingId], timestamp);
    }

    /// @notice Amount the beneficiary could claim right now.
    function claimable(uint256 vestingId) external view returns (uint256) {
        Vesting storage v = vestings[vestingId];
        return _vested(v, block.timestamp) - v.released;
    }

    function getVestingsForToken(address token) external view returns (uint256[] memory) {
        return tokenVestings[token];
    }

    function getVestingsForCreator(address creator) external view returns (uint256[] memory) {
        return creatorVestings[creator];
    }

    /// @notice Schedules where `who` is the current beneficiary. Exact across reassignments.
    function getVestingsForBeneficiary(address who) external view returns (uint256[] memory) {
        return beneficiaryVestings[who];
    }

    function getVestingsForTokenPaginated(address token, uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory)
    {
        return _slice(tokenVestings[token], start, count);
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

    function _vested(Vesting storage v, uint256 t) internal view returns (uint256) {
        if (v.creator == address(0)) return 0;
        if (t < v.cliff) return 0;
        if (t >= v.end) return v.total;
        // cliff >= start and t >= cliff here, so t > start is guaranteed when end > start.
        return (v.total * (t - v.start)) / (v.end - v.start);
    }

    function _pullTokens(address token, uint256 amount) internal returns (uint256 received) {
        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
    }

    function _addBeneficiary(address who, uint256 id) internal {
        beneficiaryVestings[who].push(id);
        beneficiaryIndex[id] = beneficiaryVestings[who].length;
    }

    function _removeBeneficiary(address who, uint256 id) internal {
        uint256[] storage list = beneficiaryVestings[who];
        uint256 idxPlusOne = beneficiaryIndex[id];
        if (idxPlusOne == 0) return;
        uint256 idx = idxPlusOne - 1;
        uint256 lastId = list[list.length - 1];
        if (lastId != id) {
            list[idx] = lastId;
            beneficiaryIndex[lastId] = idxPlusOne;
        }
        list.pop();
        delete beneficiaryIndex[id];
    }

    function _slice(uint256[] storage list, uint256 start, uint256 count) internal view returns (uint256[] memory page) {
        uint256 len = list.length;
        if (start >= len) return new uint256[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new uint256[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = list[i];
        }
    }
}
