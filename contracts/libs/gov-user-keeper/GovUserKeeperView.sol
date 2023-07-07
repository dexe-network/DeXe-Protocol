// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../libs/data-structures/ShrinkableArray.sol";
import "../../libs/math/MathHelper.sol";

import "../../gov/ERC721/ERC721Power.sol";
import "../../gov/user-keeper/GovUserKeeper.sol";

library GovUserKeeperView {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using MathHelper for uint256;
    using Math for uint256;

    function nftVotingPower(
        uint256[] memory nftIds,
        bool calculatePowerArray
    ) public view returns (uint256 nftPower, uint256[] memory perNftPower) {
        GovUserKeeper userKeeper = GovUserKeeper(address(this));

        if (userKeeper.nftAddress() == address(0)) {
            return (nftPower, perNftPower);
        }

        ERC721Power nftContract = ERC721Power(userKeeper.nftAddress());
        IGovUserKeeper.NFTInfo memory nftInfo = userKeeper.getNftInfo();

        if (calculatePowerArray) {
            perNftPower = new uint256[](nftIds.length);
        }

        if (!nftInfo.isSupportPower) {
            uint256 totalSupply = nftInfo.totalSupply == 0
                ? nftContract.totalSupply()
                : nftInfo.totalSupply;

            if (totalSupply > 0) {
                uint256 totalPower = nftInfo.totalPowerInTokens;

                if (calculatePowerArray) {
                    for (uint256 i; i < nftIds.length; i++) {
                        perNftPower[i] = totalPower / totalSupply;
                    }
                }

                nftPower = nftIds.length.ratio(totalPower, totalSupply);
            }
        } else {
            uint256 totalNftsPower = nftContract.totalPower();

            if (totalNftsPower > 0) {
                uint256 totalPowerInTokens = nftInfo.totalPowerInTokens;

                for (uint256 i; i < nftIds.length; i++) {
                    uint256 currentNftPower = totalPowerInTokens.ratio(
                        nftContract.getNftPower(nftIds[i]),
                        totalNftsPower
                    );

                    nftPower += currentNftPower;

                    if (calculatePowerArray) {
                        perNftPower[i] = currentNftPower;
                    }
                }
            }
        }
    }

    function votingPower(
        address[] calldata users,
        bool[] calldata isMicropools,
        bool[] calldata useDelegated
    ) external view returns (IGovUserKeeper.VotingPowerView[] memory votingPowers) {
        GovUserKeeper userKeeper = GovUserKeeper(address(this));
        votingPowers = new IGovUserKeeper.VotingPowerView[](users.length);

        bool tokenAddressExists = userKeeper.tokenAddress() != address(0);
        bool nftAddressExists = userKeeper.nftAddress() != address(0);

        for (uint256 i = 0; i < users.length; i++) {
            IGovUserKeeper.VotingPowerView memory power = votingPowers[i];

            if (tokenAddressExists) {
                (power.power, power.ownedBalance) = userKeeper.tokenBalance(
                    users[i],
                    isMicropools[i],
                    useDelegated[i]
                );
            }

            if (nftAddressExists) {
                (power.nftIds, power.ownedLength) = userKeeper.nftExactBalance(
                    users[i],
                    isMicropools[i],
                    useDelegated[i]
                );
                (power.nftPower, power.perNftPower) = nftVotingPower(power.nftIds, true);

                power.power += power.nftPower;
            }
        }
    }

    function delegations(
        address user,
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo
    )
        external
        view
        returns (uint256 power, IGovUserKeeper.DelegationInfoView[] memory delegationsInfo)
    {
        IGovUserKeeper.UserInfo storage userInfo = usersInfo[user];

        delegationsInfo = new IGovUserKeeper.DelegationInfoView[](userInfo.delegatees.length());

        for (uint256 i; i < delegationsInfo.length; i++) {
            IGovUserKeeper.DelegationInfoView memory delegation = delegationsInfo[i];
            address delegatee = userInfo.delegatees.at(i);

            delegation.delegatee = delegatee;
            delegation.delegatedTokens = userInfo.delegatedTokens[delegatee];
            delegation.delegatedNfts = userInfo.delegatedNfts[delegatee].values();
            (delegation.nftPower, delegation.perNftPower) = nftVotingPower(
                delegation.delegatedNfts,
                true
            );

            power += delegation.delegatedTokens + delegation.nftPower;
        }
    }

    function getUndelegateableAssets(
        address delegatee,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts,
        IGovUserKeeper.BalanceInfo storage balanceInfo,
        IGovUserKeeper.UserInfo storage delegatorInfo,
        mapping(uint256 => uint256) storage nftLockedNums
    )
        external
        view
        returns (uint256 undelegateableTokens, ShrinkableArray.UintArray memory undelegateableNfts)
    {
        (
            uint256 withdrawableTokens,
            ShrinkableArray.UintArray memory withdrawableNfts
        ) = _getFreeAssets(lockedProposals, unlockedNfts, balanceInfo, nftLockedNums);

        undelegateableTokens = delegatorInfo.delegatedTokens[delegatee].min(withdrawableTokens);
        EnumerableSet.UintSet storage delegatedNfts = delegatorInfo.delegatedNfts[delegatee];

        uint256[] memory nfts = new uint256[](withdrawableNfts.length);
        uint256 nftsLength;

        for (uint256 i; i < nfts.length; i++) {
            if (delegatedNfts.contains(withdrawableNfts.values[i])) {
                nfts[nftsLength++] = withdrawableNfts.values[i];
            }
        }

        undelegateableNfts = nfts.transform().crop(nftsLength);
    }

    function getWithdrawableAssets(
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts,
        IGovUserKeeper.BalanceInfo storage balanceInfo,
        mapping(uint256 => uint256) storage nftLockedNums
    )
        external
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        return _getFreeAssets(lockedProposals, unlockedNfts, balanceInfo, nftLockedNums);
    }

    function _getFreeAssets(
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts,
        IGovUserKeeper.BalanceInfo storage balanceInfo,
        mapping(uint256 => uint256) storage nftLockedNums
    )
        private
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(
                balanceInfo.lockedInProposals[lockedProposals.values[i]]
            );
        }

        withdrawableTokens = balanceInfo.tokenBalance - newLockedAmount;

        uint256[] memory nfts = new uint256[](balanceInfo.nftBalance.length());
        uint256 nftsLength;

        for (uint256 i; i < nfts.length; i++) {
            uint256 nftId = balanceInfo.nftBalance.at(i);
            uint256 nftLockAmount = nftLockedNums[nftId];

            if (nftLockAmount != 0) {
                for (uint256 j = 0; j < unlockedNfts.length; j++) {
                    if (unlockedNfts[j] == nftId) {
                        nftLockAmount--;
                    }
                }
            }

            if (nftLockAmount == 0) {
                nfts[nftsLength++] = nftId;
            }
        }

        withdrawableNfts = nfts.transform().crop(nftsLength);
    }
}
