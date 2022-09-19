// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/proposals/IDistributionProposal.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract DistributionProposal is IDistributionProposal, Initializable {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using TokenBalance for address;

    address public govAddress;

    mapping(uint256 => IDistributionProposal.DistributionProposalStruct) public proposals;

    event DistributionProposalClaimed(uint256 id, address sender, uint256 amount);

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
        require(proposals[proposalId].rewardAddress == address(0), "DP: proposal already exist");
        require(token != address(0), "DP: zero address");
        require(amount > 0, "DP: zero amount");

        proposals[proposalId].rewardAddress = token;
        proposals[proposalId].rewardAmount = amount;
    }

    function claim(address voter, uint256[] calldata proposalIds) external override {
        require(proposalIds.length > 0, "DP: zero array length");
        require(voter != address(0), "DP: zero address");

        for (uint256 i; i < proposalIds.length; i++) {
            DistributionProposalStruct storage dpInfo = proposals[proposalIds[i]];
            IERC20 rewardToken = IERC20(dpInfo.rewardAddress);

            require(address(rewardToken) != address(0), "DP: zero address");
            require(!dpInfo.claimed[voter], "DP: already claimed");

            uint256 reward = getPotentialReward(proposalIds[i], voter, dpInfo.rewardAmount);
            uint256 balance = address(rewardToken).thisBalance();

            dpInfo.claimed[voter] = true;

            if (address(rewardToken) == ETHEREUM_ADDRESS) {
                (bool status, ) = payable(voter).call{value: reward}("");
                require(status, "DP: failed to send eth");
            } else {
                if (balance < reward) {
                    rewardToken.safeTransferFrom(govAddress, address(this), reward - balance);
                }

                rewardToken.safeTransfer(voter, reward);
            }
        }
    }

    receive() external payable {}

    function getPotentialReward(
        uint256 proposalId,
        address voter,
        uint256 rewardAmount
    ) public view override returns (uint256) {
        (uint256 totalVoteWeight, uint256 voteWeight) = IGovPool(govAddress).getTotalVotes(
            proposalId,
            voter,
            false
        );

        return totalVoteWeight == 0 ? 0 : rewardAmount.ratio(voteWeight, totalVoteWeight);
    }
}
