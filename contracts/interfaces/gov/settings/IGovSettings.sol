// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract that stores proposal settings that will be used by the governance pool
 */
interface IGovSettings {
    struct ProposalSettings {
        bool earlyCompletion;
        uint64 duration;
        uint64 durationValidators;
        uint128 quorum;
        uint128 quorumValidators;
        uint256 minTokenBalance;
        uint256 minNftBalance;
    }

    /// @notice Add new types to contract
    /// @param _settings New settings
    function addSettings(ProposalSettings[] calldata _settings) external;

    /// @notice Edit existed type
    /// @param settingsIds Existed settings IDs
    /// @param _settings New settings
    function editSettings(uint256[] calldata settingsIds, ProposalSettings[] calldata _settings)
        external;

    /// @notice Change executors association
    /// @param executors Addresses
    /// @param settingsIds New types
    function changeExecutors(address[] calldata executors, uint256[] calldata settingsIds)
        external;

    /// @param executor Executor address
    /// @return settings ID for `executor`
    /// @return `true` if `executor` is current address
    /// @return `true` if `executor` has valid `ProposalSettings`
    function executorInfo(address executor)
        external
        view
        returns (
            uint256,
            bool,
            bool
        );

    /// @param executor Executor address
    /// @return `ProposalSettings` by `executor` address
    function getSettings(address executor) external view returns (ProposalSettings memory);
}
