// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the contract that stores proposal settings that will be used by the governance pool
 */
interface IGovSettings {
    enum ExecutorType {
        DEFAULT,
        INTERNAL,
        DISTRIBUTION,
        VALIDATORS
    }

    struct ProposalSettings {
        bool earlyCompletion;
        bool delegatedVotingAllowed;
        bool validatorsVote;
        uint64 duration;
        uint64 durationValidators;
        uint128 quorum;
        uint128 quorumValidators;
        uint256 minVotesForVoting;
        uint256 minVotesForCreating;
        address rewardToken;
        uint256 creationReward;
        uint256 executionReward;
        uint256 voteRewardsCoefficient;
        string executorDescription;
    }

    /// @notice The function to get settings of this executor
    /// @param executor the executor
    /// @return setting id of the executor
    function executorToSettings(address executor) external view returns (uint256);

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

    /// @notice The function to get default settings
    /// @return default setting
    function getDefaultSettings() external view returns (ProposalSettings memory);

    /// @notice The function the get the settings of the executor
    /// @param executor Executor address
    /// @return `ProposalSettings` by `executor` address
    function getSettings(address executor) external view returns (ProposalSettings memory);
}
