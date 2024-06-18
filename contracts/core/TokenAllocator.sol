// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract TokenAllocator {
    using MerkleProof for *;
    using SafeERC20 for IERC20;

    struct AllocationData {
        bool initialized;
        uint256 balance;
        mapping(address => bool) isClaimed;
    }

    mapping(address => mapping(address => bytes32)) public merkleRoots;
    mapping(address => mapping(address => mapping(bytes32 => AllocationData)))
        internal _allocationInfos;

    event AllocationCreated(address allocator, address token, uint256 amount, bytes32 merkleRoot);
    event TokenClaimed(
        address allocator,
        address token,
        bytes32 merkleRoot,
        address user,
        uint256 amount
    );

    function createAllocation(address token, uint256 amount, bytes32 merkleRoot) external {
        address allocator = msg.sender;

        require(
            !_allocationInfos[allocator][token][merkleRoot].initialized,
            "TA: Merkle root was already used for this token"
        );

        merkleRoots[allocator][token] = merkleRoot;
        _allocationInfos[allocator][token][merkleRoot].initialized = true;
        _allocationInfos[allocator][token][merkleRoot].balance = amount;

        IERC20(token).safeTransferFrom(allocator, address(this), amount);

        emit AllocationCreated(allocator, token, amount, merkleRoot);
    }

    function claim(
        address allocator,
        address token,
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        bytes32 root = merkleRoots[allocator][token];
        require(root != bytes32(0), "TA: Allocation doesn't exist");

        AllocationData storage allocation = _allocationInfos[allocator][token][root];
        require(allocation.balance >= amount, "TA: allocation balance is low");
        allocation.balance -= amount;

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(proof.verifyCalldata(root, leaf), "TA: Invalid proof");

        IERC20(token).safeTransfer(msg.sender, amount);

        emit TokenClaimed(allocator, token, root, msg.sender, amount);
    }
}
