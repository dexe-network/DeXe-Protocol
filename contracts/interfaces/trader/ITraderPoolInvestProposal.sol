// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolProposal.sol";

interface ITraderPoolInvestProposal is ITraderPoolProposal {
    struct ProposalLimits {
        uint256 timestampLimit;
        uint256 investLPLimit;
    }

    struct ProposalInfo {
        ProposalLimits proposalLimits;
        uint256 cumulativeSum; // with PRECISION
        uint256 investedLP;
        uint256 investedBase;
        uint256 newInvestedBase;
    }

    struct RewardInfo {
        uint256 rewardStored;
        uint256 cumulativeSumStored; // with PRECISION
    }

    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lp2Balance;
        uint256 lpInvested;
        uint256 reward;
    }

    struct Receptions {
        uint256 baseAmount;
        uint256[] receivedBaseAmounts; // should be used as minAmountOut
    }

    function __TraderPoolInvestProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external;

    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external;

    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalInfo[] memory proposals);

    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments);

    function create(
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external;

    function getRewards(uint256[] calldata proposalIds, address user)
        external
        view
        returns (Receptions memory receptions);

    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external;

    function divest(uint256 proposalId, address user) external returns (uint256);

    function divestAll(address user) external returns (uint256);

    function claim(uint256 proposalId) external;

    function claimAll() external;

    function withdraw(uint256 proposalId, uint256 amount) external;

    function convertToDividends(uint256 proposalId) external;

    function supply(uint256 proposalId, uint256 amount) external;
}
