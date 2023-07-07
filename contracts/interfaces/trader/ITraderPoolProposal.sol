// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/IPriceFeed.sol";

/**
 * This this the abstract TraderPoolProposal contract. This contract has 2 implementations:
 * TraderPoolRiskyProposal and TraderPoolInvestProposal. Each of these contracts goes as a supplementary contract
 * for TraderPool contracts. Traders are able to create special proposals that act as subpools where investors can invest to.
 * Each subpool has its own LP token that represents the pool's share
 */
interface ITraderPoolProposal {
    /// @notice The struct that stores information about the parent trader pool
    /// @param parentPoolAddress the address of the parent trader pool
    /// @param trader the address of the trader
    /// @param baseToken the address of the base tokens the parent trader pool has
    /// @param baseTokenDecimals the baseToken decimals
    struct ParentTraderPoolInfo {
        address parentPoolAddress;
        address trader;
        address baseToken;
        uint8 baseTokenDecimals;
    }

    /// @notice Emitted when proposal is changed
    /// @param proposalId ID of the proposal
    /// @param sender Address of the sender
    event ProposalRestrictionsChanged(uint256 proposalId, address sender);

    /// @notice Emitted when investor joins the proposal
    /// @param proposalId ID of the proposal
    /// @param investor Address of the investor
    event ProposalJoined(uint256 proposalId, address investor);

    /// @notice Emitted when investor leaves the proposal
    /// @param proposalId ID of the proposal
    /// @param investor Address of the investor
    event ProposalLeft(uint256 proposalId, address investor);

    /// @notice Emitted when proposal is invested
    /// @param proposalId ID of the proposal
    /// @param user Address of the user
    /// @param investedLP Amount of the LP tokens invested
    /// @param investedBase Amount of the base tokens invested
    /// @param receivedLP2 Amount of the LP2 tokens received
    event ProposalInvested(
        uint256 proposalId,
        address user,
        uint256 investedLP,
        uint256 investedBase,
        uint256 receivedLP2
    );

    /// @notice Emitted when proposal is divested
    /// @param proposalId ID of the proposal
    /// @param user Address of the user
    /// @param divestedLP2 Amount of the LP2 tokens divested
    /// @param receivedLP Amount of the LP tokens received
    /// @param receivedBase Amount of the base tokens received
    event ProposalDivested(
        uint256 proposalId,
        address user,
        uint256 divestedLP2,
        uint256 receivedLP,
        uint256 receivedBase
    );

    /// @notice The function to initialize the proposal
    /// @param parentTraderPoolInfo the parent trader pool information
    function __TraderPoolProposal_init(
        ParentTraderPoolInfo calldata parentTraderPoolInfo
    ) external;

    /// @notice The function that returns the PriceFeed this proposal uses
    /// @return the price feed address
    function priceFeed() external view returns (IPriceFeed);

    /// @notice The function that returns the total amount of proposals created
    /// @return the total amount of proposals
    function proposalsTotalNum() external view returns (uint256);

    /// @notice The function that returns the amount of currently locked LP tokens in all proposals
    /// @return the amount of locked LP tokens in all proposals
    function totalLockedLP() external view returns (uint256);

    /// @notice The function that returns the amount of currently invested base tokens into all proposals
    /// @return the amount of invested base tokens
    function investedBase() external view returns (uint256);

    /// @notice The function that returns total locked LP tokens amount of a specific user
    /// @param user the user to observe
    /// @return the total locked LP amount
    function totalLPBalances(address user) external view returns (uint256);

    /// @notice The function that returns base token address of the parent pool
    /// @return base token address
    function getBaseToken() external view returns (address);

    /// @notice The function that returns the amount of currently invested base tokens into all proposals in USD
    /// @return the amount of invested base tokens in USD equivalent
    function getInvestedBaseInUSD() external view returns (uint256);

    /// @notice The function to get the total amount of currently active investments of a specific user
    /// @param user the user to observe
    /// @return the amount of currently active investments of the user
    function getTotalActiveInvestments(address user) external view returns (uint256);
}
