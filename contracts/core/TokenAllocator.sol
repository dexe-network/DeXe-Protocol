// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@solarity/solidity-lib/contracts-registry/AbstractDependant.sol";
import "@solarity/solidity-lib/access-control/MultiOwnable.sol";

import "../interfaces/core/ITokenAllocator.sol";
import "../interfaces/core/IContractsRegistry.sol";

contract TokenAllocator is ITokenAllocator, AbstractDependant, MultiOwnable, UUPSUpgradeable {
    using MerkleProof for *;
    using SafeERC20 for IERC20;
    using EnumerableSet for *;

    uint256 public lastAllocationId;
    mapping(address => EnumerableSet.AddressSet) internal _tokensByAllocator;
    mapping(address => EnumerableSet.AddressSet) internal _allocatorsByToken;
    mapping(address => mapping(address => EnumerableSet.UintSet)) internal _allocations;
    mapping(uint256 => AllocationData) internal _allocationInfos;

    IPoolFactory internal _poolFactory;

    event AllocationCreated(
        uint256 id,
        address allocator,
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        string descriptionUrl
    );
    event AllocationClosed(uint256 id, address token, uint256 amountReturned);
    event TokenClaimed(
        address allocator,
        address token,
        bytes32 merkleRoot,
        address user,
        uint256 amount
    );

    modifier withCorrectId(uint256 id) {
        require(id <= lastAllocationId, "TA: invalid allocation id");
        _;
    }

    function __TokenAllocator_init() external initializer {
        __MultiOwnable_init();
    }

    function setDependencies(
        address contractsRegistry,
        bytes memory data_
    ) public override(AbstractDependant, ITokenAllocator) dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolFactory = IPoolFactory(registry.getPoolFactoryContract());
    }

    function createAllocation(
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        string calldata descriptionURL
    ) external {
        _createAllocation(msg.sender, token, amount, merkleRoot, descriptionURL);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    function allocateAndDeployGovPool(
        bytes32 merkleRoot,
        string calldata descriptionURL,
        IPoolFactory.GovPoolDeployParams calldata parameters
    ) external {
        (address allocator, address token, uint256 amount) = _retrieveAllocationData(parameters);

        _createAllocation(allocator, token, amount, merkleRoot, descriptionURL);

        _poolFactory.deployGovPool(parameters);
    }

    function closeAllocation(uint256 id) external withCorrectId(id) {
        AllocationData storage allocation = _allocationInfos[id];
        address allocator = allocation.allocator;

        require(allocator == msg.sender, "TA: wrong allocator");
        require(!allocation.isClosed, "TA: already closed");

        allocation.isClosed = true;

        address token = allocation.token;
        _allocations[allocator][token].remove(id);

        uint256 balance = allocation.balance;
        if (balance > 0) {
            IERC20(token).safeTransfer(allocator, balance);
        }

        emit AllocationClosed(id, token, balance);
    }

    function claim(
        uint256 id,
        uint256 amount,
        bytes32[] calldata proof
    ) external withCorrectId(id) {
        AllocationData storage allocationInfo = _allocationInfos[id];

        require(!allocationInfo.isClosed, "TA: allocation is closed");

        address user = msg.sender;
        require(allocationInfo.claimed.add(user), "TA: already claimed");

        require(allocationInfo.balance >= amount, "TA: insufficient funds");
        allocationInfo.balance -= amount;

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(user, amount))));
        bytes32 merkleRoot = allocationInfo.merkleRoot;
        require(proof.verifyCalldata(merkleRoot, leaf), "TA: Invalid proof");

        address token = allocationInfo.token;
        IERC20(token).safeTransfer(user, amount);

        emit TokenClaimed(allocationInfo.allocator, token, merkleRoot, user, amount);
    }

    function getAllocations(
        address allocator,
        address token
    ) public view returns (AllocationInfoView[] memory allocations) {
        uint256[] memory ids = _allocations[allocator][token].values();
        allocations = _idsToAllocationInfos(ids);
    }

    function getAllocationsByTokenOrAllocator(
        address key,
        bool byToken
    ) external view returns (AllocationInfoView[] memory allocations) {
        address token;
        address allocator;
        byToken ? token = key : allocator = key;

        address[] memory addresses = byToken
            ? _allocatorsByToken[token].values()
            : _tokensByAllocator[allocator].values();

        uint256 allocationsLength = 0;
        for (uint i = 0; i < addresses.length; i++) {
            byToken ? allocator = addresses[i] : token = addresses[i];
            allocationsLength += _allocations[allocator][token].length();
        }

        allocations = new AllocationInfoView[](allocationsLength);
        uint256 index;
        for (uint i = 0; i < addresses.length; i++) {
            byToken ? allocator = addresses[i] : token = addresses[i];

            _arraysCopy(getAllocations(allocator, token), allocations, index);
            index += _allocations[allocator][token].length();
        }
    }

    function getAllocationInfo(
        uint256 id
    ) public view withCorrectId(id) returns (AllocationInfoView memory allocationInfo) {
        AllocationData storage allocation = _allocationInfos[id];

        allocationInfo = AllocationInfoView(
            id,
            allocation.isClosed,
            allocation.allocator,
            allocation.token,
            allocation.balance,
            allocation.merkleRoot,
            allocation.descriptionURL
        );
    }

    function isClaimed(uint256 id, address user) external view withCorrectId(id) returns (bool) {
        AllocationData storage allocationInfo = _allocationInfos[id];

        return allocationInfo.claimed.contains(user);
    }

    function _createAllocation(
        address allocator,
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        string calldata descriptionURL
    ) internal {
        lastAllocationId++;
        uint256 id = lastAllocationId;

        require(token != address(0), "TA: Zero token address");
        require(amount > 0, "TA: Zero ammount to allocate");
        require(merkleRoot != bytes32(0), "TA: Zero Merkle root");

        AllocationData storage allocationInfo = _allocationInfos[id];

        allocationInfo.token = token;
        allocationInfo.balance = amount;
        allocationInfo.allocator = allocator;
        allocationInfo.merkleRoot = merkleRoot;
        allocationInfo.descriptionURL = descriptionURL;

        _updateGlobalInfo(allocator, token, id);

        emit AllocationCreated(id, allocator, token, amount, merkleRoot, descriptionURL);
    }

    function _updateGlobalInfo(address allocator, address token, uint256 id) internal {
        _tokensByAllocator[allocator].add(token);
        _allocatorsByToken[token].add(allocator);
        _allocations[allocator][token].add(id);
    }

    function _idsToAllocationInfos(
        uint256[] memory ids
    ) internal view returns (AllocationInfoView[] memory infos) {
        uint256 length = ids.length;
        infos = new AllocationInfoView[](length);

        for (uint256 i = 0; i < length; i++) {
            infos[i] = getAllocationInfo(ids[i]);
        }
    }

    function _arraysCopy(
        AllocationInfoView[] memory from,
        AllocationInfoView[] memory to,
        uint256 startingIndex
    ) internal pure {
        for (uint256 i = 0; i < from.length; i++) {
            to[startingIndex + i] = from[i];
        }
    }

    function _retrieveAllocationData(
        IPoolFactory.GovPoolDeployParams calldata parameters
    ) internal view returns (address allocator, address token, uint256 amount) {
        IPoolFactory.GovPoolPredictedAddresses memory predictedAddresses = _poolFactory
            .predictGovAddresses(tx.origin, parameters.name);
        allocator = predictedAddresses.govPool;

        token = parameters.userKeeperParams.tokenAddress;
        require(
            token == predictedAddresses.govToken,
            "TA: Could preallocate only the new GovToken"
        );

        IERC20Gov.ConstructorParams calldata tokenParams = parameters.tokenParams;
        address[] calldata users = tokenParams.users;

        for (uint i = 0; i < users.length; i++) {
            if (users[i] == address(this)) {
                require(amount == 0, "TA: multiple allocations in GovPool params");
                amount = tokenParams.amounts[i];
            }
        }

        require(amount != 0, "TA: no allocation in GovPool params");
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
