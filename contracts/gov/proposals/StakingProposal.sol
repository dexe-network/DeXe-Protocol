// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./helpers/AbstractValueDistributor.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/gov/proposals/IStakingProposal.sol";
import "../../core/Globals.sol";

contract StakingProposal is IStakingProposal, Initializable, AbstractValueDistributor {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;

    struct UserStakes {
        EnumerableSet.UintSet activeTiersList;
        EnumerableSet.UintSet claimTiersList;
    }

    uint256 constant MAX_TIERS_AMOUNT = 10;

    address public govPoolAddress;
    address public userKeeperAddress;

    mapping(uint256 => StakingInfo) public stakingInfos;
    mapping(address => UserStakes) internal _userInfos;
    EnumerableSet.UintSet internal _activeTiers;

    uint256 public stakingsCount;

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
        uint256 duration
    ) external onlyGov {
        require(
            duration > 0 && rewardToken != address(0) && rewardAmount > 0,
            "SP: Invalid settings"
        );
        require(
            _recalculateActiveTiers(_activeTiers).length() < MAX_TIERS_AMOUNT,
            "SP: Max tiers reached"
        );

        uint256 id = ++stakingsCount;
        StakingInfo storage info = stakingInfos[id];

        info.rewardToken = rewardToken;
        info.totalRewardsAmount = rewardAmount;
        info.startedAt = block.timestamp;
        info.deadline = block.timestamp + duration;

        _activeTiers.add(id);

        _updatedAt[id] = block.timestamp;

        IERC20(rewardToken).safeTransferFrom(govPoolAddress, address(this), rewardAmount);
    }

    function stake(address user, uint256 amount, uint256 id) external onlyKeeper {
        require(isActiveTier(id), "SP: Not Active");

        UserStakes storage info = _userInfos[user];
        info.activeTiersList.add(id);

        _addShares(id, user, amount);
    }

    function claim(uint256 id) external {
        _couldClaim(id);
        _claim(id);
        _userInfos[msg.sender].activeTiersList.remove(id);
        _userInfos[msg.sender].claimTiersList.remove(id);
    }

    function claimAll() external {
        UserStakes storage userStake = _userInfos[msg.sender];
        _recalculateActiveTiers(userStake);

        EnumerableSet.UintSet storage claimTiersList = userStake.claimTiersList;
        uint256 length = claimTiersList.length();
        for (uint i = length; i > 0; i--) {
            uint256 id = claimTiersList.at(i - 1);
            _claim(id);
            claimTiersList.remove(id);
        }
    }

    function reclaim(uint256 id) external {
        _couldClaim(id);
        _reclaim(id);
    }

    function calculateTotalStakes(address user) external returns (uint256 totalStakes) {
        _recalculateActiveTiers(_userInfos[user]);
        EnumerableSet.UintSet storage activeTiers = _userInfos[user].activeTiersList;

        uint256 length = activeTiers.length();
        for (uint i = 0; i < length; i++) {
            totalStakes += _userDistributions[activeTiers.at(i)][user].shares;
        }
    }

    function isActiveTier(uint256 id) public view returns (bool) {
        uint256 deadline = stakingInfos[id].deadline;
        if (deadline == 0) return false;
        return deadline >= block.timestamp;
    }

    function getOwedValue(uint256 id, address user_) public view returns (uint256) {
        UserDistribution storage userDist = _userDistributions[id][user_];

        uint256 deadline = stakingInfos[id].deadline;

        if (deadline == 0) return 0;

        uint256 time = block.timestamp > deadline ? deadline : block.timestamp;

        return
            (userDist.shares * (_getFutureCumulativeSum(id, time) - userDist.cumulativeSum)) /
            PRECISION +
            userDist.owedValue;
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

    function _recalculateActiveTiers(UserStakes storage userStake) internal {
        EnumerableSet.UintSet storage activeTiersList = userStake.activeTiersList;
        EnumerableSet.UintSet storage claimTiersList = userStake.claimTiersList;
        uint256 length = activeTiersList.length();
        for (uint256 i = length; i > 0; i--) {
            uint256 id = activeTiersList.at(i - 1);

            if (!isActiveTier(id)) {
                activeTiersList.remove(id);
                claimTiersList.add(id);
            }
        }
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

        address user = msg.sender;
        _updateOnTime(id, user, deadline);
        uint256 amountToPay = _userDistributions[id][user].owedValue;
        if (amountToPay != 0) {
            IERC20(info.rewardToken).safeTransfer(user, amountToPay);
            _userDistributions[id][user].owedValue = 0;
        }
    }

    function _reclaim(uint256 id) internal {
        StakingInfo storage info = stakingInfos[id];
        uint256 deadline = info.deadline;

        _updateFromProtocol(id, deadline);
        uint256 amountToPay = _owedToProtocol[id];
        if (amountToPay != 0) {
            IERC20(info.rewardToken).safeTransfer(govPoolAddress, amountToPay);
            _owedToProtocol[id] = 0;
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
