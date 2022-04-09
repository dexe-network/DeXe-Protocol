// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ITraderPoolProposal.sol";

/**
 * This is the proposal the trader is able to create for the BasicTraderPool. This proposal is basically a simplified
 * version of a BasicTraderPool where a trader is only able to trade to a predefined token. The proposal itself incapsulates
 * investors and shares the profit only with the ones who invested into it
 */
interface ITraderPoolRiskyProposal is ITraderPoolProposal {
    /// @notice The struct that stores certain proposal limits
    /// @param timestampLimit the timestamp after which the investment into this proposal closes
    /// @param investLPLimit the maximal number of invested LP tokens after which the investment into the proposal closes
    /// @param maxTokenPriceLimit the maximal price of the proposal token to a base token after which the investment into the proposal closes
    struct ProposalLimits {
        uint256 timestampLimit;
        uint256 investLPLimit;
        uint256 maxTokenPriceLimit;
    }

    /// @notice The struct that holds the information of this proposal
    /// @param token the address of the proposal token
    /// @param tokenDecimals the decimals of the proposal token
    /// @param proposalLimits the investment limits of this proposal
    /// @param lpLocked the amount of LP tokens that are locked in this proposal
    /// @param balanceBase the base token balance of this proposal (normalized)
    /// @param balancePosition the position token balance of this propoasl (normalized)
    struct ProposalInfo {
        address token;
        uint256 tokenDecimals;
        ProposalLimits proposalLimits;
        uint256 lpLocked;
        uint256 balanceBase;
        uint256 balancePosition;
    }

    /// @notice The struct that holds extra information about this proposal
    /// @param proposalInfo the information about this proposal
    /// @param totalProposalUSD the equivalent USD TVL in this proposal
    /// @param totalProposalBase the equivalent base TVL in this proposal
    struct ProposalInfoExtended {
        ProposalInfo proposalInfo;
        uint256 totalProposalUSD;
        uint256 totalProposalBase;
        uint256 lp2Supply;
    }

    /// @notice The struct that is used in the "TraderPoolRiskyProposalView" contract and stores information about the investor's
    /// active investments
    /// @param proposalId the id of the proposal
    /// @param lp2Balance the investor's balance of proposal's LP tokens
    /// @param lpLocked the investor's amount of locked LP tokens
    /// @param baseShare the amount of investor's base token in this proposal
    /// @param positionShare the amount of investor's position token in this proposal
    struct ActiveInvestmentInfo {
        uint256 proposalId;
        uint256 lp2Balance;
        uint256 lpLocked;
        uint256 baseShare;
        uint256 positionShare;
    }

    /// @notice The struct that is used in the "TraderPoolRiskyProposalView" contract and stores information about the funds
    /// received on the divest action
    /// @param baseAmount the total amount of base tokens received
    /// @param positions the divested positions addresses
    /// @param givenAmounts the given amounts of tokens (in position tokens)
    /// @param receivedAmounts the received amounts of tokens (in base tokens)
    struct Receptions {
        uint256 baseAmount;
        address[] positions;
        uint256[] givenAmounts;
        uint256[] receivedAmounts; // should be used as minAmountOut
    }

    /// @notice The function to change the proposal investment restrictions
    /// @param proposalId the id of the proposal to change the restriction for
    /// @param proposalLimits the new limits for the proposal
    function changeProposalRestrictions(uint256 proposalId, ProposalLimits calldata proposalLimits)
        external;

    /// @notice The function to get the information about the proposals
    /// @param offset the starting index of the proposals array
    /// @param limit the number of proposals to observe
    /// @return proposals the information about the proposals
    function getProposalInfos(uint256 offset, uint256 limit)
        external
        view
        returns (ProposalInfoExtended[] memory proposals);

    /// @notice The function to get the information about the active proposals of this user
    /// @param user the user to observe
    /// @param offset the starting index of the users array
    /// @param limit the number of users to observe
    /// @return investments the information about the currently active investments
    function getActiveInvestmentsInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (ActiveInvestmentInfo[] memory investments);

    /// @notice The function to get the amount of position token on proposal creation
    /// @param token the proposal token
    /// @param baseInvestment the amount of base tokens invested rightaway
    /// @param instantTradePercentage the percentage of tokens that will be traded instantly to a "token"
    /// @param optionalPath the optional path between base token and position token that will be used by the pathfinder
    function getCreationTokens(
        address token,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        address[] calldata optionalPath
    ) external view returns (uint256);

    /// @notice The function to create a proposal
    /// @param token the proposal token (the one that the trades are only allowed to)
    /// @param proposalLimits the investment limits for this proposal
    /// @param lpInvestment the amount of LP tokens invested rightaway
    /// @param baseInvestment the equivalent amount of baseToken invested rightaway
    /// @param instantTradePercentage the percentage of tokens that will be traded instantly to a "token"
    /// @param minPositionOut the minimal amount of position tokens received (call getCreationTokens())
    /// @param optionalPath the optional path between base token and position token that will be used by the pathfinder
    /// @return proposalId the id of the created proposal
    function create(
        address token,
        ProposalLimits calldata proposalLimits,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 instantTradePercentage,
        uint256 minPositionOut,
        address[] calldata optionalPath
    ) external returns (uint256 proposalId);

    /// @notice The function to get the amount of base tokens and position tokens received on this proposal investment
    /// @param proposalId the id of the propoasl to invest in
    /// @param baseInvestment the amount of base tokens to be invested (normalized)
    /// @return baseAmount the received amount of base tokens (normalized)
    /// @return positionAmount the received amount of position tokens (normalized)
    function getInvestTokens(uint256 proposalId, uint256 baseInvestment)
        external
        view
        returns (
            uint256 baseAmount,
            uint256 positionAmount,
            uint256 lp2Amount
        );

    /// @notice The function to invest into the proposal
    /// @param proposalId the id of the proposal to invest in
    /// @param user the investor
    /// @param lpInvestment the amount of LP tokens invested into the proposal
    /// @param baseInvestment the equivalent amount of baseToken invested into the proposal
    /// @param minPositionOut the minimal amount of position tokens received on proposal investment (call getInvestTokens())
    function invest(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment,
        uint256 minPositionOut
    ) external;

    /// @notice The function to get the received tokens on divest
    /// @param proposalIds the ids of the proposals to divest from
    /// @param lp2s the amounts of proposals LPs to be divested
    /// @return receptions the information about the received tokens
    function getDivestAmounts(uint256[] calldata proposalIds, uint256[] calldata lp2s)
        external
        view
        returns (Receptions memory receptions);

    /// @notice The function to divest (reinvest) from a proposal
    /// @param proposalId the id of the proposal to divest from
    /// @param user the investor (or trader) who is divesting
    /// @param lp2 the amount of proposal LPs to divest
    /// @param minPositionOut the minimal amount of base tokens received from the position (call getDivestAmounts())
    /// @return received amount of base tokens
    function divest(
        uint256 proposalId,
        address user,
        uint256 lp2,
        uint256 minPositionOut
    ) external returns (uint256);

    /// @notice The function to divest (reinvest) tokens from all the active proposals
    /// @param user the investor (or trader) who is divesting
    /// @param minPositionsOut the minimal amounts of base tokens received from the proposals (call getDivestAmounts())
    /// @return received amount of base tokens
    function divestAll(address user, uint256[] calldata minPositionsOut)
        external
        returns (uint256);

    /// @notice The function to get the amount of to tokens received after the swap
    /// @param proposalId the id of the proposal where the swap will be executed
    /// @param from the token to exchange from
    /// @param amountIn the amount of from tokens to be exchanged
    /// @param optionalPath optional path between from and to tokens used by the pathfinder
    /// @return minAmountOut the amount of to tokens received after the swap
    function getExchangeFromExactAmount(
        uint256 proposalId,
        address from,
        uint256 amountIn,
        address[] calldata optionalPath
    ) external view returns (uint256 minAmountOut);

    /// @notice The function to exchange exact amount of from tokens to the to tokens (aka swapExactTokensForTokens)
    /// @param proposalId the id of the proposal where the swap will be executed
    /// @param from the tokens to exchange from
    /// @param amountIn the amount of from tokens to exchange (normalized)
    /// @param minAmountOut the minimal amount of to tokens received after the swap
    /// @param optionalPath the optional path between from and to tokens used by the pathfinder
    function exchangeFromExact(
        uint256 proposalId,
        address from,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) external;

    /// @notice The function to get the amount of from tokens required for the swap
    /// @param proposalId the id of the proposal where the swap will be executed
    /// @param from the token to exchange from
    /// @param amountOut the amount of to tokens to be received
    /// @param optionalPath optional path between from and to tokens used by the pathfinder
    /// @return maxAmountIn the amount of from tokens required for the swap
    function getExchangeToExactAmount(
        uint256 proposalId,
        address from,
        uint256 amountOut,
        address[] calldata optionalPath
    ) external view returns (uint256 maxAmountIn);

    /// @notice The function to exchange from tokens to the exact amount of to tokens (aka swapTokensForExactTokens)
    /// @param proposalId the id of the proposal where the swap will be executed
    /// @param from the tokens to exchange from
    /// @param amountOut the amount of to tokens received after the swap (normalized)
    /// @param maxAmountIn the maximal amount of from tokens needed for the swap
    /// @param optionalPath the optional path between from and to tokens used by the pathfinder
    function exchangeToExact(
        uint256 proposalId,
        address from,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) external;
}
