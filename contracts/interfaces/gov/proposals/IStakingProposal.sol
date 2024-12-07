// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
// import "./helpers/AbstractValueDistributor.sol";

// import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "../../core/Globals.sol";

interface IStakingProposal {
    struct StakingInfo {
        address rewardToken;
        uint256 totalRewardsAmount;
        uint256 startedAt;
        uint256 deadline;
    }

    function __StakingProposal_init(address _govPoolAddress) external;

    function createStaking(address rewardToken, uint256 rewardAmount, uint256 duration) external;

    function stake(address user, uint256 amount, uint256 id) external;

    function claim(uint256 id) external;

    function claimAll() external;

    function reclaim(uint256 id) external;

    function getOwedValue(uint256 id, address user_) external view returns (uint256);

    function calculateTotalStakes(address user) external returns (uint256 totalStakes);

    function isActiveTier(uint256 id) external view returns (bool);

    function stakingInfos(
        uint256 id
    )
        external
        view
        returns (
            address rewardToken,
            uint256 totalRewardsAmount,
            uint256 startedAt,
            uint256 deadline
        );

    function stakingsCount() external view returns (uint256);
}
