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
}
