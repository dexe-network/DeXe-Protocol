// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/data-structures/memory/Vector.sol";
import "@solarity/solidity-lib/libs/utils/TypeCaster.sol";

import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/voting/IVotePower.sol";

import "../../math/MathHelper.sol";
import "../../utils/TypeHelper.sol";

import "../../../gov/ERC721/ERC721Power.sol";
import "../../../gov/user-keeper/GovUserKeeper.sol";

library GovUserKeeperView {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Vector for Vector.UintVector;
    using MathHelper for uint256;
    using Math for uint256;
    using TypeCaster for *;
    using TypeHelper for *;

    function votingPower(
        mapping(uint256 => uint256) storage nftMinPower,
        address tokenAddress,
        IGovUserKeeper.NFTInfo memory nftInfo,
        address[] memory users,
        IGovPool.VoteType[] memory voteTypes,
        bool perNftPowerArray
    ) public view returns (IGovUserKeeper.VotingPowerView[] memory votingPowers) {
        GovUserKeeper userKeeper = GovUserKeeper(address(this));
        votingPowers = new IGovUserKeeper.VotingPowerView[](users.length);

        bool tokenAddressExists = tokenAddress != address(0);
        bool nftAddressExists = nftInfo.nftAddress != address(0);

        for (uint256 i = 0; i < users.length; i++) {
            IGovUserKeeper.VotingPowerView memory power = votingPowers[i];

            if (tokenAddressExists) {
                (power.power, power.ownedBalance) = userKeeper.tokenBalance(
                    users[i],
                    voteTypes[i]
                );

                power.rawPower = power.power - power.ownedBalance;
            }

            if (nftAddressExists) {
                (uint256[] memory nftIds, uint256 length) = userKeeper.nftExactBalance(
                    users[i],
                    voteTypes[i]
                );
                (power.nftPower, power.perNftPower) = nftVotingPower(
                    nftMinPower,
                    nftInfo,
                    nftIds,
                    voteTypes[i],
                    perNftPowerArray
                );

                assembly {
                    mstore(nftIds, sub(mload(nftIds), length))
                }

                (power.rawNftPower, ) = nftVotingPower(
                    nftMinPower,
                    nftInfo,
                    nftIds,
                    voteTypes[i],
                    perNftPowerArray
                );

                assembly {
                    mstore(nftIds, add(mload(nftIds), length))
                }

                power.nftIds = nftIds;
                power.ownedLength = length;

                power.power += power.nftPower;
                power.rawPower += power.rawNftPower;
            }
        }
    }

    function transformedVotingPower(
        mapping(uint256 => uint256) storage nftMinPower,
        address tokenAddress,
        IGovUserKeeper.NFTInfo memory nftInfo,
        address voter,
        uint256 amount,
        uint256[] calldata nftIds
    ) external view returns (uint256 personalPower, uint256 fullPower) {
        (, , , , address votePower) = IGovPool(GovUserKeeper(address(this)).owner())
            .getHelperContracts();

        (uint256 nftPower, ) = nftVotingPower(
            nftMinPower,
            nftInfo,
            nftIds,
            IGovPool.VoteType.PersonalVote,
            false
        );

        IGovUserKeeper.VotingPowerView[] memory votingPowers = votingPower(
            nftMinPower,
            tokenAddress,
            nftInfo,
            [voter, voter].asDynamic(),
            [IGovPool.VoteType.MicropoolVote, IGovPool.VoteType.TreasuryVote].asDynamic(),
            false
        );

        personalPower = amount + nftPower;
        fullPower = personalPower + votingPowers[0].rawPower + votingPowers[1].rawPower;

        personalPower = IVotePower(votePower).transformVotes(voter, personalPower);
        fullPower = IVotePower(votePower).transformVotes(voter, fullPower);
    }

    function nftVotingPower(
        mapping(uint256 => uint256) storage nftMinPower,
        IGovUserKeeper.NFTInfo memory nftInfo,
        uint256[] memory nftIds,
        IGovPool.VoteType voteType,
        bool perNftPowerArray
    ) public view returns (uint256 nftPower, uint256[] memory perNftPower) {
        if (nftInfo.nftAddress == address(0)) {
            return (nftPower, perNftPower);
        }

        uint256 totalPower;

        if (nftInfo.isSupportPower) {
            totalPower = ERC721Power(nftInfo.nftAddress).totalPower();
        } else if (nftInfo.totalSupply == 0) {
            totalPower = ERC721Power(nftInfo.nftAddress).totalSupply();
        } else {
            totalPower = nftInfo.totalSupply;
        }

        (nftPower, perNftPower) = nftInitialPower(
            nftMinPower,
            nftInfo,
            nftIds,
            voteType,
            perNftPowerArray
        );

        nftPower = nftInfo.totalPowerInTokens.ratio(nftPower, totalPower);

        for (uint256 i = 0; i < perNftPower.length; i++) {
            perNftPower[i] = nftInfo.totalPowerInTokens.ratio(perNftPower[i], totalPower);
        }
    }

    function nftInitialPower(
        mapping(uint256 => uint256) storage nftMinPower,
        IGovUserKeeper.NFTInfo memory nftInfo,
        uint256[] memory nftIds,
        IGovPool.VoteType voteType,
        bool perNftPowerArray
    ) public view returns (uint256 nftPower, uint256[] memory perNftPower) {
        if (nftInfo.nftAddress == address(0)) {
            return (nftPower, perNftPower);
        }

        ERC721Power nftContract = ERC721Power(nftInfo.nftAddress);

        if (perNftPowerArray) {
            perNftPower = new uint256[](nftIds.length);
        }

        for (uint256 i = 0; i < nftIds.length; ++i) {
            uint256 currentNftPower;

            if (!nftInfo.isSupportPower) {
                currentNftPower = 1;
            } else if (
                voteType == IGovPool.VoteType.PersonalVote ||
                voteType == IGovPool.VoteType.DelegatedVote
            ) {
                currentNftPower = nftContract.getNftPower(nftIds[i]);
            } else {
                currentNftPower = nftMinPower[nftIds[i]];
            }

            nftPower += currentNftPower;

            if (perNftPowerArray) {
                perNftPower[i] = currentNftPower;
            }
        }
    }

    function nftInitialPower(
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
        IGovUserKeeper.NFTInfo memory nftInfo,
        address user,
        IGovPool.VoteType voteType
    ) external view returns (uint256 nftPower) {
        if (
            nftInfo.nftAddress == address(0) ||
            voteType == IGovPool.VoteType.PersonalVote ||
            voteType == IGovPool.VoteType.DelegatedVote
        ) {
            return 0;
        }

        if (nftInfo.isSupportPower) {
            return usersInfo[user].nftsPowers[voteType];
        }

        return usersInfo[user].balances[voteType].nfts.length();
    }

    function delegations(
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
        mapping(uint256 => uint256) storage nftMinPower,
        IGovUserKeeper.NFTInfo memory nftInfo,
        address user,
        bool perNftPowerArray
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

            IGovUserKeeper.BalanceInfo storage delegatedBalance = userInfo.delegatedBalances[
                delegatee
            ];

            delegation.delegatee = delegatee;
            delegation.delegatedTokens = delegatedBalance.tokens;
            delegation.delegatedNfts = delegatedBalance.nfts.values();

            (delegation.nftPower, delegation.perNftPower) = nftVotingPower(
                nftMinPower,
                nftInfo,
                delegation.delegatedNfts,
                IGovPool.VoteType.MicropoolVote,
                perNftPowerArray
            );

            power += delegation.delegatedTokens + delegation.nftPower;
        }
    }

    function getWithdrawableAssets(
        uint256[] calldata lockedProposals,
        uint256[] calldata unlockedNfts,
        IGovUserKeeper.UserInfo storage userInfo,
        mapping(uint256 => uint256) storage nftLockedNums
    ) external view returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts) {
        IGovUserKeeper.BalanceInfo storage balanceInfo = userInfo.balances[
            IGovPool.VoteType.PersonalVote
        ];

        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(userInfo.lockedInProposals[lockedProposals[i]]);
        }

        withdrawableTokens = balanceInfo.tokens.max(newLockedAmount) - newLockedAmount;

        Vector.UintVector memory nfts = Vector.newUint();
        uint256 nftsLength = balanceInfo.nfts.length();

        for (uint256 i; i < nftsLength; i++) {
            uint256 nftId = balanceInfo.nfts.at(i);
            uint256 nftLockAmount = nftLockedNums[nftId];

            if (nftLockAmount != 0) {
                for (uint256 j = 0; j < unlockedNfts.length; j++) {
                    if (unlockedNfts[j] == nftId) {
                        nftLockAmount--;
                    }
                }
            }

            if (nftLockAmount == 0) {
                nfts.push(nftId);
            }
        }

        withdrawableNfts = nfts.toArray();
    }
}
