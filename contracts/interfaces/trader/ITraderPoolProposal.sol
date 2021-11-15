// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITraderPoolProposal {
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint8 baseTokenDecimals;
    }

    struct ProposalInfo {
        address token;
        uint8 tokenDecimals;
        uint256 timestampLimit;
        uint256 investBaseLimit;
        uint256 maxTokenPriceLimit;
        uint256 investedBase;
        uint256 balanceBase;
        uint256 balancePosition;
    }

    struct InvestmentInfo {
        uint256 investedLP;
        uint256 investedBase;
    }
}
