// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovVote.sol";
import "../../interfaces/gov/proposals/IDistributionProposal.sol";

import "../../libs/MathHelper.sol";

contract DistributionProposal is IDistributionProposal, Ownable {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;

    address public govAddress;
    uint256 public proposalId;

    address public rewardAddress;
    uint256 public rewardAmount;

    bool public distributionStarted;

    /// @dev If claimed, return `true`
    mapping(address => bool) public claimed;

    modifier onlyGov() {
        require(msg.sender == govAddress, "DP: not a `Gov` contract");
        _;
    }

    constructor(
        address _govAddress,
        address _rewardAddress,
        uint256 _rewardAmount
    ) {
        require(_govAddress != address(0), "DP: `_govAddress` is zero");
        require(_rewardAddress != address(0), "DP: `_rewardAddress` is zero");
        require(_rewardAmount != 0, "DP: `_rewardAmount` is zero");

        govAddress = _govAddress;
        rewardAddress = _rewardAddress;
        rewardAmount = _rewardAmount;
    }

    function setProposalId(uint256 _proposalId) external override onlyOwner {
        require(proposalId == 0, "DP: already set up");
        require(_proposalId != 0, "DP: `_proposalId` is zero");

        proposalId = _proposalId;
    }

    function execute() external override onlyGov {
        require(proposalId != 0, "DP: proposal ID isn't set");

        distributionStarted = true;
    }

    function claim(address voter) external override {
        require(distributionStarted, "DP: distribution hasn't started yet");
        require(!claimed[voter], "DP: already claimed");

        uint256 reward = getPotentialReward(voter);

        require(reward != 0, "DP: nothing to claim");

        claimed[voter] = true;

        IERC20(rewardAddress).safeTransfer(voter, reward.from18(ERC20(rewardAddress).decimals()));
    }

    function getPotentialReward(address voter) public view override returns (uint256) {
        (uint256 totalVoteWeight, uint256 voteWeight) = IGovVote(govAddress).getTotalVotes(
            proposalId,
            voter
        );

        return totalVoteWeight == 0 ? 0 : rewardAmount.ratio(voteWeight, totalVoteWeight);
    }
}
