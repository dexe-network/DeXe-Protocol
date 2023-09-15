// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/data-structures/memory/Vector.sol";

import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/voting/IVotePower.sol";

import "../../math/MathHelper.sol";

import "../../../gov/ERC721/ERC721Power.sol";
import "../../../gov/user-keeper/GovUserKeeper.sol";

library GovUserKeeperView {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Vector for Vector.UintVector;
    using MathHelper for uint256;
    using Math for uint256;

    function votingPower(
        address[] calldata users,
        IGovPool.VoteType[] calldata voteTypes,
        bool perNftPowerArray
    ) public view returns (IGovUserKeeper.VotingPowerView[] memory votingPowers) {
        GovUserKeeper userKeeper = GovUserKeeper(address(this));
        votingPowers = new IGovUserKeeper.VotingPowerView[](users.length);

        bool tokenAddressExists = userKeeper.tokenAddress() != address(0);
        bool nftAddressExists = userKeeper.nftAddress() != address(0);

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
                (power.nftPower, power.perNftPower) = nftVotingPower(nftIds, perNftPowerArray);

                assembly {
                    mstore(nftIds, sub(mload(nftIds), length))
                }

                (power.rawNftPower, ) = nftVotingPower(nftIds, perNftPowerArray);

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
        address[] calldata users,
        IGovPool.VoteType[] calldata voteTypes,
        bool perNftPowerArray
    ) external view returns (IGovUserKeeper.VotingPowerView[] memory votingPowers) {
        address govPool = GovUserKeeper(address(this)).owner();

        (, , , , address votePowerAddress) = IGovPool(govPool).getHelperContracts();
        IVotePower votePower = IVotePower(votePowerAddress);

        votingPowers = votingPower(users, voteTypes, perNftPowerArray);

        for (uint256 i = 0; i < votingPowers.length; i++) {
            IGovUserKeeper.VotingPowerView memory power = votingPowers[i];
            address user = users[i];

            power.power = votePower.transformVotes(user, power.power);
            power.rawPower = votePower.transformVotes(user, power.rawPower);
            power.nftPower = votePower.transformVotes(user, power.nftPower);
            power.rawNftPower = votePower.transformVotes(user, power.rawNftPower);
            power.ownedBalance = votePower.transformVotes(user, power.ownedBalance);

            for (uint256 j = 0; j < power.perNftPower.length; j++) {
                power.perNftPower[j] = votePower.transformVotes(user, power.perNftPower[j]);
            }
        }
    }

    function nftVotingPower(
        uint256[] memory nftIds,
        bool perNftPowerArray
    ) public view returns (uint256 nftPower, uint256[] memory perNftPower) {
        GovUserKeeper userKeeper = GovUserKeeper(address(this));

        if (userKeeper.nftAddress() == address(0)) {
            return (nftPower, perNftPower);
        }

        ERC721Power nftContract = ERC721Power(userKeeper.nftAddress());
        IGovUserKeeper.NFTInfo memory nftInfo = userKeeper.getNftInfo();

        if (perNftPowerArray) {
            perNftPower = new uint256[](nftIds.length);
        }

        if (!nftInfo.isSupportPower) {
            uint256 totalSupply = nftInfo.totalSupply == 0
                ? nftContract.totalSupply()
                : nftInfo.totalSupply;

            if (totalSupply > 0) {
                uint256 totalPower = nftInfo.totalPowerInTokens;

                if (perNftPowerArray) {
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

                    if (perNftPowerArray) {
                        perNftPower[i] = currentNftPower;
                    }
                }
            }
        }
    }

    function delegations(
        IGovUserKeeper.UserInfo storage userInfo,
        bool perNftPowerArray
    )
        external
        view
        returns (uint256 power, IGovUserKeeper.DelegationInfoView[] memory delegationsInfo)
    {
        delegationsInfo = new IGovUserKeeper.DelegationInfoView[](userInfo.delegatees.length());

        for (uint256 i; i < delegationsInfo.length; i++) {
            IGovUserKeeper.DelegationInfoView memory delegation = delegationsInfo[i];
            address delegatee = userInfo.delegatees.at(i);

            delegation.delegatee = delegatee;
            delegation.delegatedTokens = userInfo.delegatedTokens[delegatee];
            delegation.delegatedNfts = userInfo.delegatedNfts[delegatee].values();

            (delegation.nftPower, delegation.perNftPower) = nftVotingPower(
                delegation.delegatedNfts,
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
        IGovUserKeeper.BalanceInfo storage balanceInfo = userInfo.balanceInfo;

        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(userInfo.lockedInProposals[lockedProposals[i]]);
        }

        withdrawableTokens = balanceInfo.tokenBalance.max(newLockedAmount) - newLockedAmount;

        Vector.UintVector memory nfts = Vector.newUint();
        uint256 nftsLength = balanceInfo.nftBalance.length();

        for (uint256 i; i < nftsLength; i++) {
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
                nfts.push(nftId);
            }
        }

        withdrawableNfts = nfts.toArray();
    }
}
