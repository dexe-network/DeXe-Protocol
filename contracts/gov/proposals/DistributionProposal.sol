// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/proposals/IDistributionProposal.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract DistributionProposal is IDistributionProposal, Initializable {
    using SafeERC20 for IERC20Metadata;
    using MathHelper for uint256;
    using DecimalsConverter for *;
    using TokenBalance for address;

    address public govAddress;

    mapping(uint256 => IDistributionProposal.DistributionProposalStruct) public proposals;

    event DistributionProposalClaimed(uint256 proposalId, address sender, uint256 amount);

    modifier onlyGov() {
        require(msg.sender == govAddress, "DP: not a Gov contract");
        _;
    }

    function __DistributionProposal_init(address _govAddress) external initializer {
        require(_govAddress != address(0), "DP: _govAddress is zero");

        govAddress = _govAddress;
    }

    function execute(
        uint256 proposalId,
        address token,
        uint256 amount
    ) external payable override onlyGov {
        IDistributionProposal.DistributionProposalStruct storage proposal = proposals[proposalId];

        require(proposal.rewardAddress == address(0), "DP: proposal already exists");
        require(token != address(0), "DP: zero address");
        require(amount > 0, "DP: zero amount");

        proposal.rewardAddress = token;
        proposal.rewardAmount = token == ETHEREUM_ADDRESS ? amount : amount.to18(token.decimals());
    }

    function claim(address voter, uint256[] calldata proposalIds) external override {
        require(proposalIds.length > 0, "DP: zero array length");
        require(voter != address(0), "DP: zero address");

        for (uint256 i; i < proposalIds.length; i++) {
            DistributionProposalStruct storage dpInfo = proposals[proposalIds[i]];
            address rewardToken = dpInfo.rewardAddress;

            require(rewardToken != address(0), "DP: zero address");
            require(!dpInfo.claimed[voter], "DP: already claimed");

            uint256 reward = getPotentialReward(proposalIds[i], voter);

            dpInfo.claimed[voter] = true;

            rewardToken.sendFunds(voter, reward);

            emit DistributionProposalClaimed(proposalIds[i], voter, reward);
        }
    }

    receive() external payable {}

    function getPotentialReward(
        uint256 proposalId,
        address voter
    ) public view override returns (uint256) {
        (
            uint256 totalVotesFor,
            uint256 totalVotesAgainst,
            uint256 voterVotes,
            bool isVoteFor
        ) = IGovPool(govAddress).getTotalVotes(proposalId, voter, IGovPool.VoteType.PersonalVote);

        if (totalVotesFor == 0 || !isVoteFor) {
            return 0;
        }

        return
            proposals[proposalId].rewardAmount.ratio(
                voterVotes,
                totalVotesFor + totalVotesAgainst
            );
    }
}
