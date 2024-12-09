// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./helpers/AbstractValueDistributor.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/gov/proposals/IStakingProposal.sol";
import "../../core/Globals.sol";

contract StakingProposal is IStakingProposal, Initializable, AbstractValueDistributor {
    using EnumerableSet for *;
    using SafeERC20 for IERC20;

    uint256 constant MAX_TIERS_AMOUNT = 10;

    address public govPoolAddress;
    address public userKeeperAddress;

    mapping(uint256 => StakingInfo) internal stakingInfos;
    mapping(address => EnumerableSet.UintSet) internal _userClaimableTiers;
    EnumerableSet.UintSet internal _activeTiers;

    uint256 public stakingsCount;

    event StakingCreated(
        address rewardToken,
        uint256 totalRewardsAmount,
        uint256 startedAt,
        uint256 deadline,
        string metadata
    );
    event StakeAdded(uint256 id, address user, uint256 amount);
    event RewardClaimed(uint256 id, address user, address rewardToken, uint256 rewardsAmount); // Add govpool

    modifier onlyGov() {
        require(msg.sender == govPoolAddress, "SP: not a Gov contract");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == userKeeperAddress, "SP: not a Keeper contract");
        _;
    }

    function __StakingProposal_init(address _govPoolAddress) external initializer {
        require(_govPoolAddress != address(0), "SP: Gov is zero");

        govPoolAddress = _govPoolAddress;
        userKeeperAddress = msg.sender;
    }

    function createStaking(
        address rewardToken,
        uint256 rewardAmount,
        uint256 startedAt,
        uint256 deadline,
        string calldata metadata
    ) external onlyGov {
        require(
            startedAt < deadline && rewardToken != address(0) && rewardAmount > 0,
            "SP: Invalid settings"
        );
        require(
            _recalculateActiveTiers(_activeTiers).length() < MAX_TIERS_AMOUNT,
            "SP: Max tiers reached"
        );

        if (deadline < block.timestamp) {
            IERC20(rewardToken).safeTransferFrom(govPoolAddress, address(this), rewardAmount);
            IERC20(rewardToken).safeTransfer(govPoolAddress, rewardAmount);
            return;
        }

        uint256 id = ++stakingsCount;
        StakingInfo storage info = stakingInfos[id];

        info.rewardToken = rewardToken;
        info.totalRewardsAmount = rewardAmount;
        info.startedAt = startedAt;
        info.deadline = deadline;
        info.metadata = metadata;

        _activeTiers.add(id);

        _updatedAt[id] = startedAt;

        IERC20(rewardToken).safeTransferFrom(govPoolAddress, address(this), rewardAmount);

        emit StakingCreated(rewardToken, rewardAmount, startedAt, deadline, metadata);
    }

    function stake(address user, uint256 amount, uint256 id) external onlyKeeper {
        require(isActiveTier(id), "SP: Not Active");

        _userClaimableTiers[user].add(id);

        _addShares(id, user, amount);

        emit StakeAdded(id, user, amount);
    }

    function claim(uint256 id) external {
        _couldClaim(id);
        _claim(id);
    }

    function claimAll() external {
        EnumerableSet.UintSet storage claimableTiersList = _userClaimableTiers[msg.sender];
        uint256 length = claimableTiersList.length();
        for (uint i = length; i > 0; i--) {
            uint256 id = claimableTiersList.at(i - 1);
            uint256 deadline = stakingInfos[id].deadline;
            if (block.timestamp <= deadline) continue;
            _claim(id);
        }
    }

    function reclaim(uint256 id) external {
        _couldClaim(id);
        _reclaim(id);
    }

    function getTotalStakes(address user) external view returns (uint256 totalStakes) {
        uint256[] memory userActiveTiers = _activeTiers.length() <
            _userClaimableTiers[user].length()
            ? _activeTiers.values()
            : _userClaimableTiers[user].values();

        uint256 length = userActiveTiers.length;
        for (uint256 i = 0; i < length; i++) {
            uint256 id = userActiveTiers[i];
            if (isActiveTier(id)) {
                totalStakes += _userDistributions[id][user].shares;
            }
        }
    }

    function isActiveTier(uint256 id) public view returns (bool) {
        uint256 startedAt = stakingInfos[id].startedAt;
        uint256 deadline = stakingInfos[id].deadline;
        if (deadline == 0) return false;
        return deadline >= block.timestamp && block.timestamp >= startedAt;
    }

    function getOwedValue(uint256 id, address user_) public view returns (uint256) {
        UserDistribution storage userDist = _userDistributions[id][user_];

        uint256 startedAt = stakingInfos[id].startedAt;
        uint256 deadline = stakingInfos[id].deadline;

        if (deadline == 0 || block.timestamp < startedAt) return 0;

        uint256 time = block.timestamp > deadline ? deadline : block.timestamp;

        return
            (userDist.shares * (_getFutureCumulativeSum(id, time) - userDist.cumulativeSum)) /
            PRECISION +
            userDist.owedValue;
    }

    function getUserInfo(
        address user
    ) external view returns (TierUserInfo[] memory tiersUserInfo) {
        EnumerableSet.UintSet storage claimableTiers = _userClaimableTiers[user];

        uint256 length = claimableTiers.length();
        tiersUserInfo = new TierUserInfo[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 id = claimableTiers.at(i);

            StakingInfo storage info = stakingInfos[id];

            tiersUserInfo[i].tierId = id;
            tiersUserInfo[i].isActive = isActiveTier(id);
            tiersUserInfo[i].rewardToken = info.rewardToken;
            tiersUserInfo[i].startedAt = info.startedAt;
            tiersUserInfo[i].deadline = info.deadline;
            tiersUserInfo[i].currentStake = _userDistributions[id][user].shares;
            tiersUserInfo[i].currentRewards = getOwedValue(id, user);
            tiersUserInfo[i].tierCurrentStakes = _totalShares[id];
        }
    }

    function getStakingInfo(
        uint256[] calldata ids
    ) external view returns (StakingInfoView[] memory stakingInfo) {
        stakingInfo = new StakingInfoView[](ids.length);
        for (uint i = 0; i < ids.length; i++) {
            StakingInfoView memory info = stakingInfo[i];

            uint256 id = ids[i];
            StakingInfo storage tierInfo = stakingInfos[id];

            info.metadata = tierInfo.metadata;
            info.rewardToken = tierInfo.rewardToken;
            info.totalRewardsAmount = tierInfo.totalRewardsAmount;
            info.startedAt = tierInfo.startedAt;
            info.deadline = tierInfo.deadline;
            info.isActive = info.startedAt <= block.timestamp && block.timestamp <= info.deadline;
            info.totalStaked = _totalShares[id];
            info.owedToProtocol = _owedToProtocol[id];
        }
    }

    function _recalculateActiveTiers(
        EnumerableSet.UintSet storage _tiers
    ) internal returns (EnumerableSet.UintSet storage) {
        uint256 length = _tiers.length();
        for (uint256 i = length; i > 0; i--) {
            uint256 id = _tiers.at(i - 1);

            if (!isActiveTier(id)) {
                _tiers.remove(id);
            }
        }
        return _tiers;
    }

    function _couldClaim(uint256 id) internal view {
        StakingInfo storage info = stakingInfos[id];
        uint256 deadline = info.deadline;
        require(deadline != 0, "SP: invalid id");
        require(deadline < block.timestamp, "SP: Still active");
    }

    function _claim(uint256 id) internal {
        StakingInfo storage info = stakingInfos[id];
        uint256 deadline = info.deadline;

        address rewardToken = info.rewardToken;
        address user = msg.sender;

        _userClaimableTiers[user].remove(id);

        _updateOnTime(id, user, deadline);
        uint256 amountToPay = _userDistributions[id][user].owedValue;
        if (amountToPay != 0) {
            _userDistributions[id][user].owedValue = 0;
            IERC20(rewardToken).safeTransfer(user, amountToPay);
        }
        emit RewardClaimed(id, user, rewardToken, amountToPay);
    }

    function _reclaim(uint256 id) internal {
        StakingInfo storage info = stakingInfos[id];
        uint256 deadline = info.deadline;

        _updateFromProtocol(id, deadline);
        uint256 amountToPay = _owedToProtocol[id];
        if (amountToPay != 0) {
            _owedToProtocol[id] = 0;
            IERC20(info.rewardToken).safeTransfer(govPoolAddress, amountToPay);
        }
    }

    function _getValueToDistribute(
        uint256 id,
        uint256 timeUpTo_,
        uint256 timeLastUpdate_
    ) internal view virtual override returns (uint256) {
        StakingInfo storage info = stakingInfos[id];
        return
            (info.totalRewardsAmount * (timeUpTo_ - timeLastUpdate_)) /
            (info.deadline - info.startedAt);
    }
}
