// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/factory/IPoolFactory.sol";

interface ITokenAllocator {
    /// @notice The struct that holds information about allocation
    /// @param isClosed the status of allocation
    /// @param allocator the owner of allocation
    /// @param token the address of token to allocate
    /// @param balance the current allocation balance, that could be claimed by users
    /// @param merkleRoot the Merkle root of tree with users and amounts to claim
    /// @param descriptionURL the ipfs of Merkle tree
    /// @param claimed the set of users, who already claimed in this allocation
    struct AllocationData {
        bool isClosed;
        address allocator;
        address token;
        uint256 balance;
        bytes32 merkleRoot;
        string descriptionURL;
        EnumerableSet.AddressSet claimed;
    }

    /// @notice The struct that returns public information about allocation
    /// @param id the allocation id
    /// @param isClosed the status of allocation
    /// @param allocator the owner of allocation
    /// @param token the address of token to allocate
    /// @param currentBalance the current allocation balance, that could be claimed by users
    /// @param merkleRoot the Merkle root of tree with users and amounts to claim
    /// @param descriptionURL the ipfs of Merkle tree
    struct AllocationInfoView {
        uint256 id;
        bool isClosed;
        address allocator;
        address token;
        uint256 currentBalance;
        bytes32 merkleRoot;
        string descriptionUrl;
    }

    /// @notice The function to get number of allocations (including closed)
    /// @return The id of the last allocation
    function lastAllocationId() external returns (uint256);

    /// @notice The function for injecting dependencies from the Contracts Registry
    /// @param contractsRegistry the address of Contracts Registry
    function setDependencies(address contractsRegistry, bytes memory data_) external;

    /// @notice The function to directly create an allocation
    /// @param token the address of the token to allocate
    /// @param amount the ammount of tokens to allocate
    /// @param merkleRoot the Merkle root of tree with users and amounts to claim
    /// @param descriptionURL the ipfs of Merkle tree
    function createAllocation(
        address token,
        uint256 amount,
        bytes32 merkleRoot,
        string calldata descriptionURL
    ) external;

    /// @notice The function to preallocate tokens and create GovPool
    /// @param merkleRoot the Merkle root of tree with users and amounts to claim
    /// @param descriptionURL the ipfs of Merkle tree
    /// @param parameters the pool deploy parameters
    function allocateAndDeployGovPool(
        bytes32 merkleRoot,
        string calldata descriptionURL,
        IPoolFactory.GovPoolDeployParams calldata parameters
    ) external;

    /// @notice The function to preallocate tokens by request from Pool Factory
    /// @param token the address of the token to allocate
    /// @param amount the ammount of tokens to allocate
    /// @param pool the address of the allocator pool
    /// @param merkleRoot the Merkle root of tree with users and amounts to claim
    /// @param descriptionURL the ipfs of Merkle tree
    function allocateFromFactory(
        address token,
        uint256 amount,
        address pool,
        bytes32 merkleRoot,
        string calldata descriptionURL
    ) external;

    /// @notice The function to close allocation and retrieve remaining balance
    /// @param id the allocation id
    function closeAllocation(uint256 id) external;

    /// @notice The function to claim assets from active allocation
    /// @param id the allocation id
    /// @param amount the exact amount to claim (the one from the Merkle tree)
    /// @param proof the Merkle proof for sender address and correspondent amount
    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external;

    /// @notice The function to get infromation about the allocation
    /// @param id the allocation id
    /// @return the info about allocation with requested id
    function getAllocationInfo(uint256 id) external view returns (AllocationInfoView memory);

    /// @notice The function to get active allocation infos with defined allocator and token
    /// @param allocator the allocator address
    /// @param token the token address
    /// @return the infos about all active allocations with this allocator and token
    function getAllocations(
        address allocator,
        address token
    ) external view returns (AllocationInfoView[] memory);

    /// @notice The function to get active allocation infos with defined allocator OR token
    /// @param key the token or allocator address (defined with byToken flag)
    /// @param byToken the flag to get info by token (true) or allocator (false)
    /// @return the infos about all active allocations with the desired parameter
    function getAllocationsByTokenOrAllocator(
        address key,
        bool byToken
    ) external view returns (AllocationInfoView[] memory);

    /// @notice The function to find if the user already claimed in the allocation. Doesn't checks closed status
    /// @param id the allocation id
    /// @param user the address of the claimer
    /// @return the claiming status (true if claimed)
    function isClaimed(uint256 id, address user) external view returns (bool);
}
