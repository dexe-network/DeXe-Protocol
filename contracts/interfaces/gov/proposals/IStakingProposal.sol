// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface IStakingProposal {
    struct StakingInfo {
        address rewardToken;
        uint256 totalRewardsAmount;
        uint256 startedAt;
        uint256 deadline;
        string metadata;
    }

    struct StakingInfoView {
        string metadata;
        address rewardToken;
        uint256 totalRewardsAmount;
        uint256 startedAt;
        uint256 deadline;
        bool isActive;
        uint256 totalStaked;
        uint256 owedToProtocol;
    }

    struct TierUserInfo {
        uint256 tierId;
        bool isActive;
        address rewardToken;
        uint256 startedAt;
        uint256 deadline;
        uint256 currentStake;
        uint256 currentRewards;
        uint256 tierCurrentStakes;
    }

    function __StakingProposal_init(address _govPoolAddress) external;

    function createStaking(
        address rewardToken,
        uint256 rewardAmount,
        uint256 duration,
        string calldata metadata
    ) external;

    function stake(address user, uint256 amount, uint256 id) external;

    function claim(uint256 id) external;

    function claimAll() external;

    function reclaim(uint256 id) external;

    function getOwedValue(uint256 id, address user_) external view returns (uint256);

    function getTotalStakes(address user) external view returns (uint256 totalStakes);

    function isActiveTier(uint256 id) external view returns (bool);

    // function stakingInfos(
    //     uint256 id
    // )
    //     external
    //     view
    //     returns (
    //         address rewardToken,
    //         uint256 totalRewardsAmount,
    //         uint256 startedAt,
    //         uint256 deadline
    //     );

    function stakingsCount() external view returns (uint256);
}
