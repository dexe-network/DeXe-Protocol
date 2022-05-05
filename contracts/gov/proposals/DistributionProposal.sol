// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../../interfaces/gov/IGovVote.sol";
import "../../interfaces/gov/proposals/IDistributionProposal.sol";

contract DistributionProposal is IDistributionProposal, Ownable {
    using SafeERC20 for IERC20;

    address public govAddress;
    uint256 public proposalId;

    address public rewardAddress;
    uint256 public rewardAmount;

    /// @dev Started whe proposal is executed, open `claim` process
    bool public distributionStarted;

    /// @dev If address claimed, return `true`
    mapping(address => bool) public isAddressClaimed;

    event DistributionStarted(bool status);
    event Claimed(address voter, uint256 amount);

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

        emit DistributionStarted(true);
    }

    function claim(address voter) external override {
        require(distributionStarted, "DP: distribution isn't start yet");
        require(!isAddressClaimed[voter], "DP: already claimed");

        uint256 reward = getPotentialReward(voter);

        require(reward != 0, "DP: nothing to claim");

        isAddressClaimed[voter] = true;

        IERC20(rewardAddress).safeTransfer(voter, reward);

        emit Claimed(voter, reward);
    }

    function getPotentialReward(address voter) public view override returns (uint256) {
        IGovVote gov = IGovVote(govAddress);
        (uint256 totalVoteWeight, uint256 voteWeight, ) = gov.getVotedAmount(proposalId, voter);

        if (totalVoteWeight == 0) {
            return 0;
        }

        return (rewardAmount * voteWeight) / totalVoteWeight;
    }
}
