// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface ITokenAllocator {
    struct AllocationData {
        bool isClosed;
        address allocator;
        address token;
        uint256 amountToAllocate;
        bytes32 merkleRoot;
        EnumerableSet.AddressSet claimed;
    }

    struct AllocationInfoView {
        uint256 id;
        bool isClosed;
        address allocator;
        address token;
        uint256 currentBalance;
        bytes32 merkleRoot;
    }

    function lastAllocationId() external returns (uint256);

    function setDependencies(address contractsRegistry, bytes memory data_) external;

    function createAllocation(address token, uint256 amount, bytes32 merkleRoot) external;

    function closeAllocation(uint256 id) external;

    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external;

    function getAllocationInfo(
        uint256 id
    ) external returns (AllocationInfoView memory allocationInfo);
}
