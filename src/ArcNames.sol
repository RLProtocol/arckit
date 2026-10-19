// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title ArcNames: .arc names on Arc
/// @notice Human-readable names for Arc addresses, rented yearly in native USDC and held as ERC-721 tokens.
///         Each name resolves to an address, a website (IPFS content hash) and text records, and an address can
///         pick one of its names as its primary name. Everything is readable through views; no indexer needed.
/// @dev    Names are lowercase a-z, 0-9 and hyphen, 3-32 characters, not starting or ending with a hyphen.
///         tokenId = uint256(keccak256(label)). After expiry the holder has GRACE to renew; after that anyone can
///         register the name again, the old token is burned and records start empty (records live under a
///         per-registration generation, so nothing from a previous owner carries over).
contract ArcNames is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    uint256 public constant MIN_LENGTH = 3;
    uint256 public constant MAX_LENGTH = 32;
    uint256 public constant MAX_YEARS = 10;
    uint256 public constant YEAR = 365 days;
    uint256 public constant GRACE = 30 days;

    struct Name {
        string label;
        uint64 expires;
        uint64 gen;
    }

    /// @notice Yearly price in native USDC (18 decimals) for 3-, 4- and 5+-character names.
    uint256[3] public yearlyPrice;
    address public feeReceiver;
    uint256 public pendingFees;

    mapping(uint256 id => Name) private _names;
    mapping(uint256 id => mapping(uint64 gen => address)) private _addr;
    mapping(uint256 id => mapping(uint64 gen => string)) private _contenthash;
    mapping(uint256 id => mapping(uint64 gen => mapping(string key => string))) private _text;
    mapping(address account => uint256 id) private _primary;
    mapping(uint256 id => bool) public reserved;

    event NameRegistered(uint256 indexed id, string label, address indexed owner, uint64 expires, uint256 cost);
    event NameRenewed(uint256 indexed id, string label, uint64 expires, uint256 cost);
    event AddrChanged(uint256 indexed id, address addr);
    event ContenthashChanged(uint256 indexed id, string contenthash);
    event TextChanged(uint256 indexed id, string key, string value);
    event PrimaryNameSet(address indexed account, uint256 indexed id);
    event ReservedSet(uint256 indexed id, string label, bool reserved);
    event PricesUpdated(uint256 price3, uint256 price4, uint256 price5);
    event FeeReceiverUpdated(address indexed receiver);
    event FeesClaimed(address indexed receiver, uint256 amount);

    error InvalidName();
    error InvalidYears();
    error NotAvailable();
    error IsReserved();
    error NotRegistered();
    error Expired();
    error NotAuthorized();
    error NotResolved();
    error InsufficientPayment(uint256 sent, uint256 required);
    error NothingToClaim();
    error NotFeeReceiver();
    error TransferFailed();
    error ZeroAddress();
    error LengthMismatch();

    constructor(address owner_, address feeReceiver_, uint256[3] memory prices_) ERC721("Arc Names", "ARCNAME") Ownable(owner_) {
        if (feeReceiver_ == address(0)) revert ZeroAddress();
        feeReceiver = feeReceiver_;
        yearlyPrice = prices_;
        emit PricesUpdated(prices_[0], prices_[1], prices_[2]);
    }

    // ------------------------------------------------------------------ names

    /// @notice True when `label` follows the naming rules (says nothing about availability).
    function isValid(string memory label) public pure returns (bool) {
        bytes memory b = bytes(label);
        if (b.length < MIN_LENGTH || b.length > MAX_LENGTH) return false;
        if (b[0] == "-" || b[b.length - 1] == "-") return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-")) return false;
        }
        return true;
    }

    function idOf(string memory label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// @notice Price for `numYears` of `label`, in native USDC.
    function priceOf(string memory label, uint256 numYears) public view returns (uint256) {
        uint256 len = bytes(label).length;
        uint256 tier = len <= 3 ? 0 : len == 4 ? 1 : 2;
        return yearlyPrice[tier] * numYears;
    }

    /// @notice True when `label` is valid, not reserved and free (never registered, or past expiry + grace).
    function available(string memory label) public view returns (bool) {
        if (!isValid(label)) return false;
        uint256 id = idOf(label);
        if (reserved[id]) return false;
        uint64 exp = _names[id].expires;
        return exp == 0 || block.timestamp > uint256(exp) + GRACE;
    }

    /// @notice Registers `label` for `numYears` (1-10) to `to`. Pays priceOf in native USDC; any excess is refunded.
    function register(string calldata label, uint256 numYears, address to) external payable nonReentrant returns (uint256 id) {
        if (reserved[idOf(label)]) revert IsReserved();
        uint256 cost = priceOf(label, numYears);
        if (msg.value < cost) revert InsufficientPayment(msg.value, cost);
        id = _register(label, numYears, to, cost);
        pendingFees += cost;
        _refund(msg.value - cost);
    }

    /// @notice Owner assigns a reserved (or any free) name without payment.
    function registerReserved(string calldata label, uint256 numYears, address to) external onlyOwner returns (uint256 id) {
        id = _register(label, numYears, to, 0);
    }

    function _register(string calldata label, uint256 numYears, address to, uint256 cost) private returns (uint256 id) {
        if (!isValid(label)) revert InvalidName();
        if (numYears == 0 || numYears > MAX_YEARS) revert InvalidYears();
        if (to == address(0)) revert ZeroAddress();
        id = idOf(label);
        Name storage n = _names[id];
        if (n.expires != 0 && block.timestamp <= uint256(n.expires) + GRACE) revert NotAvailable();
        if (_ownerOf(id) != address(0)) _burn(id); // an expired registration: start over
        n.label = label;
        n.gen += 1;
        n.expires = uint64(block.timestamp + numYears * YEAR);
        _addr[id][n.gen] = to;
        _safeMint(to, id);
        emit NameRegistered(id, label, to, n.expires, cost);
        emit AddrChanged(id, to);
    }

    /// @notice Extends `label` by `numYears`. Anyone can pay; works until the grace period ends.
    function renew(string calldata label, uint256 numYears) external payable nonReentrant {
        uint256 id = idOf(label);
        Name storage n = _names[id];
        if (n.expires == 0 || _ownerOf(id) == address(0)) revert NotRegistered();
        if (block.timestamp > uint256(n.expires) + GRACE) revert NotAvailable();
        if (numYears == 0 || numYears > MAX_YEARS) revert InvalidYears();
        uint256 cost = reserved[id] ? 0 : priceOf(label, numYears);
        if (msg.value < cost) revert InsufficientPayment(msg.value, cost);
        n.expires = uint64(uint256(n.expires) + numYears * YEAR);
        pendingFees += cost;
        emit NameRenewed(id, label, n.expires, cost);
        _refund(msg.value - cost);
    }

    // ------------------------------------------------------------------ records

    modifier onlyManager(string calldata label) {
        uint256 id = idOf(label);
        address holder = _ownerOf(id);
        if (holder == address(0)) revert NotRegistered();
        if (block.timestamp > _names[id].expires) revert Expired();
        if (msg.sender != holder && !isApprovedForAll(holder, msg.sender) && getApproved(id) != msg.sender) revert NotAuthorized();
        _;
    }

    function setAddr(string calldata label, address a) external onlyManager(label) {
        uint256 id = idOf(label);
        _addr[id][_names[id].gen] = a;
        emit AddrChanged(id, a);
    }

    /// @notice Website for the name, e.g. "ipfs://bafy...". Empty clears it.
    function setContenthash(string calldata label, string calldata hash) external onlyManager(label) {
        uint256 id = idOf(label);
        _contenthash[id][_names[id].gen] = hash;
        emit ContenthashChanged(id, hash);
    }

    function setText(string calldata label, string calldata key, string calldata value) external onlyManager(label) {
        uint256 id = idOf(label);
        _text[id][_names[id].gen][key] = value;
        emit TextChanged(id, key, value);
    }

    /// @notice Several text records in one transaction.
    function setTexts(string calldata label, string[] calldata keys, string[] calldata values) external onlyManager(label) {
        if (keys.length != values.length) revert LengthMismatch();
        uint256 id = idOf(label);
        uint64 gen = _names[id].gen;
        for (uint256 i; i < keys.length; ++i) {
            _text[id][gen][keys[i]] = values[i];
            emit TextChanged(id, keys[i], values[i]);
        }
    }

    /// @notice Shows `label` as the caller's name. The name must resolve to the caller.
    function setPrimaryName(string calldata label) external {
        uint256 id = idOf(label);
        if (resolve(label) != msg.sender) revert NotResolved();
        _primary[msg.sender] = id;
        emit PrimaryNameSet(msg.sender, id);
    }

    function clearPrimaryName() external {
        delete _primary[msg.sender];
        emit PrimaryNameSet(msg.sender, 0);
    }

    // ------------------------------------------------------------------ views

    function _active(uint256 id) private view returns (bool) {
        return _ownerOf(id) != address(0) && block.timestamp <= _names[id].expires;
    }

    /// @notice The address `label` points to, or zero when unregistered or expired.
    function resolve(string memory label) public view returns (address) {
        uint256 id = idOf(label);
        return _active(id) ? _addr[id][_names[id].gen] : address(0);
    }

    /// @notice The primary name of `account` (without ".arc"), or "" if none or if it no longer points back.
    function primaryName(address account) public view returns (string memory) {
        uint256 id = _primary[account];
        if (id == 0 || !_active(id) || _addr[id][_names[id].gen] != account) return "";
        return _names[id].label;
    }

    function contenthash(string calldata label) external view returns (string memory) {
        uint256 id = idOf(label);
        return _active(id) ? _contenthash[id][_names[id].gen] : "";
    }

    function text(string calldata label, string calldata key) external view returns (string memory) {
        uint256 id = idOf(label);
        return _active(id) ? _text[id][_names[id].gen][key] : "";
    }

    struct Info {
        string label;
        address owner;
        uint64 expires;
        address addr;
        string contenthash;
        bool available;
        bool isReserved;
        uint256 yearlyPrice;
    }

    /// @notice Everything the app shows for one name in a single call.
    function info(string calldata label) external view returns (Info memory r) {
        uint256 id = idOf(label);
        Name storage n = _names[id];
        r.label = label;
        r.owner = _ownerOf(id);
        r.expires = n.expires;
        bool active = _active(id);
        r.addr = active ? _addr[id][n.gen] : address(0);
        r.contenthash = active ? _contenthash[id][n.gen] : "";
        r.available = available(label);
        r.isReserved = reserved[id];
        r.yearlyPrice = priceOf(label, 1);
    }

    function labelOf(uint256 id) external view returns (string memory) {
        return _names[id].label;
    }

    /// @notice Labels of every name `owner` holds (including expired ones still in grace).
    function namesOf(address owner) external view returns (string[] memory labels, uint64[] memory expires) {
        uint256 count = balanceOf(owner);
        labels = new string[](count);
        expires = new uint64[](count);
        for (uint256 i; i < count; ++i) {
            uint256 id = tokenOfOwnerByIndex(owner, i);
            labels[i] = _names[id].label;
            expires[i] = _names[id].expires;
        }
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        string memory label = _names[id].label;
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1d36"/><stop offset="1" stop-color="#0f5c6b"/></linearGradient></defs>',
            '<rect width="500" height="500" rx="36" fill="url(#g)"/><circle cx="430" cy="70" r="160" fill="none" stroke="#5fe3c9" stroke-opacity=".25" stroke-width="2"/>',
            '<text x="40" y="80" fill="#8fb3ff" font-family="monospace" font-size="22" letter-spacing="4">ARC NAME</text>',
            '<text x="40" y="440" fill="#eef4ff" font-family="sans-serif" font-size="', bytes(label).length > 14 ? "34" : "52", '" font-weight="600">', label, '.arc</text></svg>'
        );
        string memory json = string.concat(
            '{"name":"', label, '.arc","description":"', label, '.arc on Arc. Manage it at usearckit.online/names.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)), '","attributes":[{"trait_type":"Length","value":', _toString(bytes(label).length), '},{"display_type":"date","trait_type":"Expires","value":', _toString(_names[id].expires), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ------------------------------------------------------------------ transfers

    /// @dev Expired names cannot move (only renew or lapse); a transfer points the name at its new holder so funds
    ///      sent to the name never go to the previous one.
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (from != address(0) && to != address(0)) {
            if (block.timestamp > _names[id].expires) revert Expired();
            _addr[id][_names[id].gen] = to;
            emit AddrChanged(id, to);
        }
    }

    // ------------------------------------------------------------------ admin

    function setReserved(string[] calldata labels, bool isReserved_) external onlyOwner {
        for (uint256 i; i < labels.length; ++i) {
            uint256 id = idOf(labels[i]);
            reserved[id] = isReserved_;
            emit ReservedSet(id, labels[i], isReserved_);
        }
    }

    function setPrices(uint256[3] calldata prices_) external onlyOwner {
        yearlyPrice = prices_;
        emit PricesUpdated(prices_[0], prices_[1], prices_[2]);
    }

    function setFeeReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        feeReceiver = receiver;
        emit FeeReceiverUpdated(receiver);
    }

    function claimFees() external nonReentrant {
        if (msg.sender != feeReceiver) revert NotFeeReceiver();
        uint256 amount = pendingFees;
        if (amount == 0) revert NothingToClaim();
        pendingFees = 0;
        (bool ok,) = feeReceiver.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FeesClaimed(feeReceiver, amount);
    }

    // ------------------------------------------------------------------ internals

    function _refund(uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _toString(uint256 v) private pure returns (string memory s) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) ++len;
        bytes memory b = new bytes(len);
        for (; v != 0; v /= 10) b[--len] = bytes1(uint8(48 + v % 10));
        s = string(b);
    }
}
