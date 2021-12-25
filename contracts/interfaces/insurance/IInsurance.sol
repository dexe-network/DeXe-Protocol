// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IInsurance {
    enum ClaimStatus {
        NULL,
        ACCEPTED,
        REJECTED
    }

    struct FinishedClaims {
        address[] claimers;
        uint256[] amounts;
        ClaimStatus status;
    }

    function receiveDexeFromPools(uint256 amount) external;

    function buyInsurance(uint256 insuranceAmount) external;

    function withdraw(uint256 amountToWithdraw) external;

    function proposeClaim(string calldata url) external;

    function listOngoingClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls);

    function listFinishedClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls, FinishedClaims[] memory info);

    function getInsurance(address user) external view returns (uint256, uint256);
}
