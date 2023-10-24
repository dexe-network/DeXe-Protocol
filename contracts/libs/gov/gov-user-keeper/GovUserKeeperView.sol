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
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
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
                uint256[] memory nftIds;
                uint256 length;

                if (perNftPowerArray) {
                    (nftIds, length) = userKeeper.nftExactBalance(users[i], voteTypes[i]);
                }

                (power.nftPower, power.perNftPower) = nftVotingPower(
                    usersInfo,
                    nftMinPower,
                    nftInfo,
                    nftIds,
                    voteTypes[i],
                    perNftPowerArray ? address(0) : users[i],
                    perNftPowerArray
                );

                assembly {
                    mstore(nftIds, sub(mload(nftIds), length))
                }

                (power.rawNftPower, ) = nftVotingPower(
                    usersInfo,
                    nftMinPower,
                    nftInfo,
                    nftIds,
                    voteTypes[i],
                    perNftPowerArray ? address(0) : users[i],
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
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
        mapping(uint256 => uint256) storage nftMinPower,
        address tokenAddress,
        IGovUserKeeper.NFTInfo memory nftInfo,
        address voter,
        uint256 amount,
        uint256[] calldata nftIds
    ) external view returns (uint256 personalPower, uint256 fullPower) {
        IGovUserKeeper.VotingPowerView[] memory votingPowers = votingPower(
            usersInfo,
            nftMinPower,
            tokenAddress,
            nftInfo,
            [voter, voter].asDynamic(),
            [IGovPool.VoteType.MicropoolVote, IGovPool.VoteType.TreasuryVote].asDynamic(),
            false
        );

        (uint256 nftPower, ) = nftVotingPower(
            usersInfo,
            nftMinPower,
            nftInfo,
            nftIds,
            IGovPool.VoteType.PersonalVote,
            address(0),
            false
        );

        (, , , , address votePower) = IGovPool(GovUserKeeper(address(this)).owner())
            .getHelperContracts();

        personalPower = amount + nftPower;
        fullPower = personalPower + votingPowers[0].rawPower + votingPowers[1].rawPower;

        personalPower = IVotePower(votePower).transformVotes(voter, personalPower);
        fullPower = IVotePower(votePower).transformVotes(voter, fullPower);
    }

    function nftVotingPower(
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
        mapping(uint256 => uint256) storage nftMinPower,
        IGovUserKeeper.NFTInfo memory nftInfo,
        uint256[] memory nftIds,
        IGovPool.VoteType voteType,
        address voter,
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
            usersInfo,
            nftMinPower,
            nftInfo,
            nftIds,
            voteType,
            voter,
            perNftPowerArray
        );

        nftPower = nftInfo.totalPowerInTokens.ratio(nftPower, totalPower);

        for (uint256 i = 0; i < perNftPower.length; i++) {
            perNftPower[i] = nftInfo.totalPowerInTokens.ratio(perNftPower[i], totalPower);
        }
    }

    function nftInitialPower(
        mapping(address => IGovUserKeeper.UserInfo) storage usersInfo,
        mapping(uint256 => uint256) storage nftMinPower,
        IGovUserKeeper.NFTInfo memory nftInfo,
        uint256[] memory nftIds,
        IGovPool.VoteType voteType,
        address user,
        bool perNftPowerArray
    ) public view returns (uint256 nftPower, uint256[] memory perNftPower) {
        bool isMinPower = voteType == IGovPool.VoteType.MicropoolVote ||
            voteType == IGovPool.VoteType.TreasuryVote;

        require(
            user == address(0) || (isMinPower && nftIds.length == 0 && !perNftPowerArray),
            "GovUK: invalid params"
        );

        if (nftInfo.nftAddress == address(0)) {
            return (nftPower, perNftPower);
        }

        if (user != address(0)) {
            return
                nftInfo.isSupportPower
                    ? (usersInfo[user].nftsPowers[voteType], perNftPower)
                    : (usersInfo[user].balances[voteType].nfts.length(), perNftPower);
        }

        if (perNftPowerArray) {
            perNftPower = new uint256[](nftIds.length);
        }

        if (!nftInfo.isSupportPower) {
            if (perNftPowerArray) {
                for (uint256 i = 0; i < perNftPower.length; i++) {
                    perNftPower[i] = 1;
                }
            }

            return (nftIds.length, perNftPower);
        }

        ERC721Power nftContract = ERC721Power(nftInfo.nftAddress);

        for (uint256 i = 0; i < nftIds.length; ++i) {
            uint256 currentNftPower = isMinPower
                ? nftMinPower[nftIds[i]]
                : nftContract.getNftPower(nftIds[i]);

            nftPower += currentNftPower;

            if (perNftPowerArray) {
                perNftPower[i] = currentNftPower;
            }
        }
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
                usersInfo,
                nftMinPower,
                nftInfo,
                delegation.delegatedNfts,
                IGovPool.VoteType.MicropoolVote,
                address(0),
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
