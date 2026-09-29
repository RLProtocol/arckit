// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHasher {
    function MiMCSponge(uint256 in_xL, uint256 in_xR, uint256 k) external pure returns (uint256 xL, uint256 xR);
}

/// @notice Incremental Merkle tree (MiMC sponge) that remembers the last ROOT_HISTORY_SIZE roots, so a
///         proof generated against a slightly stale root is still accepted. Same construction as Tornado Cash
///         Classic; the zero leaf is keccak256("arccash") mod p.
contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant ZERO_VALUE = 9797517519481385227547262016731974551529900186648242288733394065825204372759; // keccak256("arccash") % FIELD_SIZE
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    error LevelsOutOfRange();
    error TreeFull();

    constructor(uint32 _levels, IHasher _hasher) {
        if (_levels == 0 || _levels >= 32) revert LevelsOutOfRange();
        levels = _levels;
        hasher = _hasher;
        for (uint32 i = 0; i < _levels; i++) filledSubtrees[i] = zeros(i);
        roots[0] = zeros(_levels - 1);
    }

    function hashLeftRight(IHasher _hasher, bytes32 _left, bytes32 _right) public pure returns (bytes32) {
        require(uint256(_left) < FIELD_SIZE, "left out of field");
        require(uint256(_right) < FIELD_SIZE, "right out of field");
        uint256 r = uint256(_left);
        uint256 c = 0;
        (r, c) = _hasher.MiMCSponge(r, c, 0);
        r = addmod(r, uint256(_right), FIELD_SIZE);
        (r, c) = _hasher.MiMCSponge(r, c, 0);
        return bytes32(r);
    }

    function _insert(bytes32 _leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(2) ** levels) revert TreeFull();
        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = _leaf;
        bytes32 left;
        bytes32 right;
        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros(i);
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(hasher, left, right);
            currentIndex /= 2;
        }
        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice Whether the root is among the last ROOT_HISTORY_SIZE roots.
    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == 0) return false;
        uint32 i = currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    /// @dev Precomputed hashes of empty subtrees; filled in by scripts/zeros.mjs from the MiMC implementation.
    function zeros(uint256 i) public pure returns (bytes32) {
        if (i == 0) return bytes32(uint256(9797517519481385227547262016731974551529900186648242288733394065825204372759));
        else if (i == 1) return bytes32(uint256(15669629858801658028667162221229845199454362741971031925389778592735588312510));
        else if (i == 2) return bytes32(uint256(11392986962833192740220595426577339563939788092999141679772263214636131797423));
        else if (i == 3) return bytes32(uint256(18998854502639823007797120648438731701225005873296740001347038791239604015191));
        else if (i == 4) return bytes32(uint256(13461393718724042194867040197654991239934286272586330218855684441707404773670));
        else if (i == 5) return bytes32(uint256(10686444510744389658361967280624033421971622149477447204387915325513099473392));
        else if (i == 6) return bytes32(uint256(12265767101134083571569228824045034076146653004548288437595949047716124481597));
        else if (i == 7) return bytes32(uint256(18400880788231367182121863943383733513523930136654425538942982537607019837213));
        else if (i == 8) return bytes32(uint256(21088524698069771186573525984691790786786279310477884638074811653615571387809));
        else if (i == 9) return bytes32(uint256(1392235924987869426196090778180338300741379680253027577271522018407976265432));
        else if (i == 10) return bytes32(uint256(11271441948191003220818324202667066670620798252755903564539985180459333482396));
        else if (i == 11) return bytes32(uint256(10541427382299169544726463390699778964858189859688672444900152712483253365346));
        else if (i == 12) return bytes32(uint256(18463164672278429509300874530031135736655890790693819656792288978042642764346));
        else if (i == 13) return bytes32(uint256(3544782714464863810017245812944365363536380747061534222414691344753932565907));
        else if (i == 14) return bytes32(uint256(16246921489899277196768755557980549655909589498496882431645407066459595136630));
        else if (i == 15) return bytes32(uint256(1477136352195560866259048824748034747820172080477086515890119165678573740238));
        else if (i == 16) return bytes32(uint256(16215676310575841806552584314234745202894447960598976413454882488715175277512));
        else if (i == 17) return bytes32(uint256(2576604721354357857917688337427968022232949559591623483789445657591174805535));
        else if (i == 18) return bytes32(uint256(13317235287320946663902601396743744173639610164592378371569712041453555334905));
        else if (i == 19) return bytes32(uint256(9901406083220576021573926598640554233178892215324278966907404856686285707685));
        else if (i == 20) return bytes32(uint256(10775108615322742054003929830710962401086447772723602373726439956562997163052));
        else if (i == 21) return bytes32(uint256(11135624236472019381489352534268022552055150010155103916389732952855245777263));
        else if (i == 22) return bytes32(uint256(12380713804606665967355416335735197541997633302243960150512192590258879892214));
        else if (i == 23) return bytes32(uint256(21149578511294177053253658614442025278554282380146658438130727310566552755925));
        else if (i == 24) return bytes32(uint256(4408444811839880281330264904474262208582004819329062546284601460935456463816));
        else if (i == 25) return bytes32(uint256(11971664188169780181033541416163019901967076128589856376665514730509767222469));
        else if (i == 26) return bytes32(uint256(1705107465574061994545916174769127330851276742019475385953043656260612123474));
        else if (i == 27) return bytes32(uint256(14259277763066908567047861282006962731789454171668523488070780780106162552161));
        else if (i == 28) return bytes32(uint256(4401466883303716426311432332375144914161467334127768034934911355576272055064));
        else if (i == 29) return bytes32(uint256(10200120053149081178654659107004938440570008961848223824706607591950594550276));
        else if (i == 30) return bytes32(uint256(1342113317523919960546134258786414703703504810299077572659847718457700278225));
        else if (i == 31) return bytes32(uint256(3792775399435881894582473705680588630428330348278513158724312031196441327081));
        else revert("index out of bounds");
    }
}
