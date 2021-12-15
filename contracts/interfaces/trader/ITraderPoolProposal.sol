// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/IPriceFeed.sol";

interface ITraderPoolProposal {
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint256 baseTokenDecimals;
    }

    function priceFeed() external view returns (IPriceFeed);

    function totalLockedLP() external view returns (uint256);

    function investedBase() external view returns (uint256);

    function totalLPBalances(address user) external view returns (uint256);

    function getInvestedBaseInUSD() external view returns (uint256);
}
