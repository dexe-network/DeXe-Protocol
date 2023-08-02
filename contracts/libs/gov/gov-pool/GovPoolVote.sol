// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../gov/GovPool.sol";

import "../../utils/DataHelper.sol";

import "../../math/MathHelper.sol";
import "../../math/LogExpMath.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using MathHelper for uint256;
    using LogExpMath for uint256;
    using DecimalsConverter for uint256;
    using DataHelper for bytes;

    event Voted(
        uint256 proposalId,
        address sender,
        uint256 personalVote,
        uint256 delegatedVote,
        bool isVoteFor
    );

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        _checkVoterRestrictions(proposals[proposalId]);

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][false];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][false];

        bool useDelegated = !core.settings.delegatedVotingAllowed;

        return
            _vote(
                core,
                votes,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                false,
                useDelegated,
                isVoteFor
            );
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        _checkVoterRestrictions(proposals[proposalId]);

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][true];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][true];

        return
            _vote(
                core,
                votes,
                voteInfo,
                proposalId,
                voteAmount,
                voteNftIds,
                true,
                false,
                isVoteFor
            );
    }

    function voteTreasury(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(bool => EnumerableSet.UintSet)) storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(bool => IGovPool.VoteInfo)))
            storage voteInfos,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        _checkVoterRestrictions(proposals[proposalId]);

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(core.settings.delegatedVotingAllowed, "Gov: delegated voting is off");

        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][true];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][true];

        GovPool govPool = GovPool(payable(address(this)));
        (, address userKeeperAddress, , ) = govPool.getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            userKeeper.canVoteTreasury(
                msg.sender,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );

        votes.add(proposalId);

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        if (voteAmount > 0) {
            userKeeper.lockTokensTreasury(proposalId, msg.sender, voteAmount);
            uint256 tokenBalance = userKeeper.tokenBalanceTreasury(msg.sender);

            require(
                voteAmount <= tokenBalance - voteInfo.tokensVotedFor - voteInfo.tokensVotedAgainst,
                "Gov: wrong vote amount"
            );

            if (isVoteFor) {
                voteInfo.tokensVotedFor += voteAmount;
            } else {
                voteInfo.tokensVotedAgainst += voteAmount;
            }
        }

        if (voteNftIds.length > 0) {
            EnumerableSet.UintSet storage votedNfts = _votedNfts(voteInfo, isVoteFor);

            for (uint256 i; i < voteNftIds.length; i++) {
                require(votedNfts.add(voteNftIds[i]), "Gov: NFT already voted");
            }

            userKeeper.lockNftsTreasury(msg.sender, voteNftIds);

            userKeeper.updateNftPowers(voteNftIds);

            voteAmount += userKeeper.getNftsPowerInTokensBySnapshot(
                voteNftIds,
                core.nftPowerSnapshotId
            );
        }

        uint256 rootPower = govPool.getVoteModifierForUser(msg.sender);

        voteAmount = _calculateVotes(voteAmount, rootPower, _treasuryVoteCoefficient());

        require(voteAmount >= core.settings.minVotesForVoting, "Gov: low current vote power");

        if (isVoteFor) {
            core.votesFor += voteAmount;
            voteInfo.totalVotedFor += voteAmount;
        } else {
            core.votesAgainst += voteAmount;
            voteInfo.totalVotedAgainst += voteAmount;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        emit Voted(proposalId, msg.sender, 0, voteAmount, isVoteFor);

        return voteAmount;
    }

    function _treasuryVoteCoefficient() internal pure returns (uint256) {
        return 1;
    }

    function _quorumReached(IGovPool.ProposalCore storage core) internal view returns (bool) {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        return
            PERCENTAGE_100.ratio(
                core.votesFor + core.votesAgainst,
                IGovUserKeeper(userKeeperAddress).getTotalVoteWeight()
            ) >= core.settings.quorum;
    }

    function _votesForMoreThanAgainst(
        IGovPool.ProposalCore storage core
    ) internal view returns (bool) {
        return core.votesFor > core.votesAgainst;
    }

    function _proposalStateBasedOnVoteResultsAndLock(
        IGovPool.ProposalCore storage core
    ) internal view returns (IGovPool.ProposalState) {
        if (block.timestamp <= core.executeAfter) {
            return IGovPool.ProposalState.Locked;
        }

        return _proposalStateBasedOnVoteResults(core);
    }

    function _proposalStateBasedOnVoteResults(
        IGovPool.ProposalCore storage core
    ) internal view returns (IGovPool.ProposalState) {
        return
            _votesForMoreThanAgainst(core)
                ? IGovPool.ProposalState.SucceededFor
                : IGovPool.ProposalState.SucceededAgainst;
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor
    ) internal returns (uint256) {
        _canVote(core, proposalId, isMicropool, useDelegated);

        votes.add(proposalId);

        GovPool govPool = GovPool(payable(address(this)));

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        if (voteAmount > 0) {
            _voteTokens(voteInfo, proposalId, voteAmount, isMicropool, useDelegated, isVoteFor);
        }

        if (voteNftIds.length > 0) {
            voteAmount += _voteNfts(
                core,
                voteInfo,
                voteNftIds,
                isMicropool,
                useDelegated,
                isVoteFor
            );
        }

        uint256 rootPower = govPool.getVoteModifierForUser(msg.sender);
        voteAmount = _calculateVotes(voteAmount, rootPower, 1);

        require(voteAmount >= core.settings.minVotesForVoting, "Gov: low current vote power");

        if (isVoteFor) {
            core.votesFor += voteAmount;
            voteInfo.totalVotedFor += voteAmount;
        } else {
            core.votesAgainst += voteAmount;
            voteInfo.totalVotedAgainst += voteAmount;
        }

        if (core.executeAfter == 0 && _quorumReached(core)) {
            core.executeAfter =
                core.settings.executionDelay +
                (core.settings.earlyCompletion ? uint64(block.timestamp) : core.voteEnd);
        }

        emit Voted(
            proposalId,
            msg.sender,
            isMicropool ? 0 : voteAmount,
            isMicropool ? voteAmount : 0,
            isVoteFor
        );

        return voteAmount;
    }

    function _canVote(
        IGovPool.ProposalCore storage core,
        uint256 proposalId,
        bool isMicropool,
        bool useDelegated
    ) internal view {
        IGovPool govPool = IGovPool(address(this));
        (, address userKeeper, , ) = govPool.getHelperContracts();

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );
        require(
            IGovUserKeeper(userKeeper).canVote(
                msg.sender,
                isMicropool,
                useDelegated,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );
    }

    function _voteTokens(
        IGovPool.VoteInfo storage voteInfo,
        uint256 proposalId,
        uint256 amount,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor
    ) internal {
        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amount);
        (uint256 tokenBalance, uint256 ownedBalance) = userKeeper.tokenBalance(
            msg.sender,
            isMicropool,
            useDelegated
        );

        require(
            amount <=
                tokenBalance -
                    ownedBalance -
                    voteInfo.tokensVotedFor -
                    voteInfo.tokensVotedAgainst,
            "Gov: wrong vote amount"
        );

        if (isVoteFor) {
            voteInfo.tokensVotedFor += amount;
        } else {
            voteInfo.tokensVotedAgainst += amount;
        }
    }

    function _voteNfts(
        IGovPool.ProposalCore storage core,
        IGovPool.VoteInfo storage voteInfo,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated,
        bool isVoteFor
    ) internal returns (uint256 voteAmount) {
        EnumerableSet.UintSet storage votedNfts = _votedNfts(voteInfo, isVoteFor);

        for (uint256 i; i < nftIds.length; i++) {
            require(votedNfts.add(nftIds[i]), "Gov: NFT already voted");
        }

        (, address userKeeperAddress, , ) = IGovPool(address(this)).getHelperContracts();

        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIds);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);
    }

    function _checkVoterRestrictions(IGovPool.Proposal storage proposal) internal view {
        for (uint256 i; i < proposal.actionsOnFor.length; i++) {
            (bytes4 selector, address user) = proposal
                .actionsOnFor[i]
                .data
                .decodeTreasuryFunction();

            if (selector == IGovPool.undelegateTreasury.selector) {
                require(user != msg.sender, "Gov: voter is not allowed");
            }
        }

        for (uint256 i; i < proposal.actionsOnAgainst.length; i++) {
            (bytes4 selector, address user) = proposal
                .actionsOnAgainst[i]
                .data
                .decodeTreasuryFunction();

            if (selector == IGovPool.undelegateTreasury.selector) {
                require(user != msg.sender, "Gov: voter is not allowed");
            }
        }
    }

    function _votedNfts(
        IGovPool.VoteInfo storage voteInfo,
        bool isVoteFor
    ) internal view returns (EnumerableSet.UintSet storage) {
        return isVoteFor ? voteInfo.nftsVotedFor : voteInfo.nftsVotedAgainst;
    }

    function _calculateVotes(
        uint256 tokenAmount,
        uint256 rootPower,
        uint256 coefficient
    ) private pure returns (uint256) {
        return tokenAmount.pow(rootPower) / coefficient;
    }
}
