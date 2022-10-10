// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is the native DEXE insurance contract. Users can come and insure their invested funds by putting
 * DEXE tokens here. If the accident happens, the claim proposal has to be made for further investigation by the
 * DAO. The insurance is paid in DEXE tokens to all the provided addresses and backed by the commissions the protocol receives
 */
interface IInsurance {
    /// @notice Possible statuses of the proposed claim
    /// @param NULL the claim is either not created or pending
    /// @param ACCEPTED the claim is accepted and paid
    /// @param REJECTED the claim is rejected
    enum ClaimStatus {
        NULL,
        ACCEPTED,
        REJECTED
    }

    /// @notice The struct that holds finished claims info
    /// @param claimers the addresses that received the payout
    /// @param amounts the amounts in DEXE tokens paid to the claimers
    /// @param status the final status of the claim
    struct FinishedClaims {
        address[] claimers;
        uint256[] amounts;
        ClaimStatus status;
    }

    /// @notice The struct that holds information about the user
    /// @param stake the amount of tokens the user staked (bought the insurance for)
    /// @param lastDepositTimestamp the timestamp of user's last deposit
    /// @param lastProposalTimestamp the timestamp of user's last proposal creation
    struct UserInfo {
        uint256 stake;
        uint256 lastDepositTimestamp;
        uint256 lastProposalTimestamp;
    }

    /// @notice The function to buy an insurance for the deposited DEXE tokens. Minimal insurance is specified by the DAO
    /// @param deposit the amount of DEXE tokens to be deposited
    function buyInsurance(uint256 deposit) external;

    /// @notice The function that calculates received insurance from the deposited tokens
    /// @param deposit the amount of tokens to be deposited
    /// @return the received insurance tokens
    function getReceivedInsurance(uint256 deposit) external view returns (uint256);

    /// @notice The function to withdraw deposited DEXE tokens back (the insurance will cover less tokens as well)
    /// @param amountToWithdraw the amount of DEXE tokens to withdraw
    function withdraw(uint256 amountToWithdraw) external;

    /// @notice The function to propose the claim for the DAO review. Only the insurance holder can do that
    /// @param url the IPFS url to the claim evidence. Used as a claim key
    function proposeClaim(string calldata url) external;

    /// @notice The function to get the total count of ongoing claims
    /// @return the number of currently ongoing claims
    function ongoingClaimsCount() external view returns (uint256);

    /// @notice The paginated function to fetch currently going claims
    /// @param offset the starting index of the array
    /// @param limit the length of the observed window
    /// @return urls the IPFS URLs of the claims' evidence
    function listOngoingClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls);

    /// @notice The function to get the total number of finished claims
    /// @return the number of finished claims
    function finishedClaimsCount() external view returns (uint256);

    /// @notice The paginated function to list finished claims
    /// @param offset the starting index of the array
    /// @param limit the length of the observed window
    /// @return urls the IPFS URLs of the claims' evidence
    /// @return info the extended info of the claims
    function listFinishedClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls, FinishedClaims[] memory info);

    /// @notice The function called by the DAO to accept the claim
    /// @param url the IPFS URL of the claim to accept
    /// @param users the receivers of the claim
    /// @param amounts the amounts in DEXE tokens to be paid to the receivers (the contract will validate the payout amounts)
    function acceptClaim(
        string calldata url,
        address[] calldata users,
        uint256[] memory amounts
    ) external;

    /// @notice The function to reject the provided claim
    /// @param url the IPFS URL of the claim to be rejected
    function rejectClaim(string calldata url) external;

    /// @notice The function to get the maximum insurance payout
    /// @return the maximum insurance payout in dexe
    function getMaxTreasuryPayout() external view returns (uint256);

    /// @notice The function to get user's insurance info
    /// @param user the user to get info about
    /// @return deposit the total DEXE deposit of the provided user
    /// @return insurance the total insurance of the provided user
    function getInsurance(address user) external view returns (uint256 deposit, uint256 insurance);
}
