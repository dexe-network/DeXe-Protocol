// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@solarity/solidity-lib/access-control/MultiOwnable.sol";

import "../interfaces/core/ITokenAllocator.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/factory/IPoolFactory.sol";

import "@solarity/solidity-lib/contracts-registry/AbstractDependant.sol";

contract TokenAllocator is ITokenAllocator, AbstractDependant, MultiOwnable, UUPSUpgradeable {
    using MerkleProof for *;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public lastAllocationId;
    mapping(uint256 => AllocationData) internal _allocationInfos;

    IPoolFactory internal _poolFactory;

    event AllocationCreated(
        uint256 id,
        address allocator,
        address token,
        uint256 amount,
        bytes32 merkleRoot
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
    ) public override(AbstractDependant, ITokenAllocator) {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _poolFactory = IPoolFactory(registry.getPoolRegistryContract());
    }

    function createAllocation(address token, uint256 amount, bytes32 merkleRoot) external {
        lastAllocationId++;
        uint256 id = lastAllocationId;

        AllocationData storage allocationInfo = _allocationInfos[id];

        require(token != address(0), "TA: Zero token address");
        allocationInfo.token = token;

        require(amount > 0, "TA: Zero ammount to allocate");
        allocationInfo.amountToAllocate = amount;

        require(merkleRoot != bytes32(0), "TA: Zero Merkle root");
        allocationInfo.merkleRoot = merkleRoot;

        address allocator = msg.sender;
        allocationInfo.allocator = allocator;

        IERC20(token).safeTransferFrom(allocator, address(this), amount);

        emit AllocationCreated(id, allocator, token, amount, merkleRoot);
    }

    function closeAllocation(uint256 id) external withCorrectId(id) {
        AllocationData storage allocation = _allocationInfos[id];

        address allocator = allocation.allocator;
        require(allocator == msg.sender, "TA: wrong allocator");
        require(!allocation.isClosed, "TA: already closed");

        allocation.isClosed = true;

        address token = allocation.token;
        uint256 balance = allocation.amountToAllocate;
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

        require(allocationInfo.amountToAllocate >= amount, "TA: insufficient funds");
        allocationInfo.amountToAllocate -= amount;

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(user, amount))));
        bytes32 merkleRoot = allocationInfo.merkleRoot;
        require(proof.verifyCalldata(merkleRoot, leaf), "TA: Invalid proof");

        address token = allocationInfo.token;
        IERC20(token).safeTransfer(user, amount);

        emit TokenClaimed(allocationInfo.allocator, token, merkleRoot, user, amount);
    }

    function getAllocationInfo(
        uint256 id
    ) external view withCorrectId(id) returns (AllocationInfoView memory allocationInfo) {
        AllocationData storage allocation = _allocationInfos[id];

        allocationInfo = AllocationInfoView(
            id,
            allocation.isClosed,
            allocation.allocator,
            allocation.token,
            allocation.amountToAllocate,
            allocation.merkleRoot
        );
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
