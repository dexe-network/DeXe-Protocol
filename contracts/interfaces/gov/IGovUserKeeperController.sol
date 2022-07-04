// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovUserKeeperController {
    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function unlock(address user, bool isMicropool) external;

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) external;
}
