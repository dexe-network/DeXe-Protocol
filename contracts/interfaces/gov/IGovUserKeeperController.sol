// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../libs/ShrinkableArray.sol";

interface IGovUserKeeperController {
    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external;

    function getWithdrawableAssets(address user)
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts);

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

    function getUndelegateableAssets(address delegator, address delegatee)
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts);

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
