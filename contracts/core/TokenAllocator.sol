// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract TokenAllocator {
    using MerkleProof for *;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct AllocationData {
        bool isClosed;
        address allocator;
        address token;
        uint256 amountToAllocate;
        bytes32 merkleRoot;
        EnumerableSet.AddressSet claimed;
    }

    uint256 public lastAllocationId;
    mapping(uint256 => AllocationData) internal _allocationInfos;

    event AllocationCreated(
        uint256 id,
        address allocator,
        address token,
        uint256 amount,
        bytes32 merkleRoot
    );
    event TokenClaimed(
        address allocator,
        address token,
        bytes32 merkleRoot,
        address user,
        uint256 amount
    );

    function createAllocation(address token, uint256 amount, bytes32 merkleRoot) external {
        uint256 id = lastAllocationId;
        lastAllocationId++;

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

    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external {
        require(id <= lastAllocationId, "TA: invalid allocation id");

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
}