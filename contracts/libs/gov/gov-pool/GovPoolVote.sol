// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

import "../../../gov/GovPool.sol";

import "../../math/MathHelper.sol";
import "../../math/LogExpMath.sol";

library GovPoolVote {
    using EnumerableSet for EnumerableSet.UintSet;
    using MathHelper for uint256;
    using LogExpMath for uint256;
    using DecimalsConverter for uint256;

    event Voted(
        uint256 proposalId,
        address sender,
        IGovPool.VoteType voteType,
        uint256 amount,
        bool isVoteFor
    );

    function vote(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][
            IGovPool.VoteType.PersonalVote
        ];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.PersonalVote
        ];

        IGovPool.VoteType voteType = core.settings.delegatedVotingAllowed
            ? IGovPool.VoteType.DelegatedVote
            : IGovPool.VoteType.PersonalVote;

        return
            _vote(
                core,
                votes,
                voteInfo,
                restrictedProposals[msg.sender],
                proposalId,
                voteAmount,
                voteNftIds,
                voteType,
                isVoteFor
            );
    }

    function voteDelegated(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(!core.settings.delegatedVotingAllowed, "Gov: micropool voting is off");

        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][
            IGovPool.VoteType.MicropoolVote
        ];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.MicropoolVote
        ];

        return
            _vote(
                core,
                votes,
                voteInfo,
                restrictedProposals[msg.sender],
                proposalId,
                voteAmount,
                voteNftIds,
                IGovPool.VoteType.MicropoolVote,
                isVoteFor
            );
    }

    function voteTreasury(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => mapping(IGovPool.VoteType => EnumerableSet.UintSet))
            storage votedInProposals,
        mapping(uint256 => mapping(address => mapping(IGovPool.VoteType => IGovPool.VoteInfo)))
            storage voteInfos,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external returns (uint256) {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");

        IGovPool.ProposalCore storage core = proposals[proposalId].core;

        require(!core.settings.delegatedVotingAllowed, "Gov: treasury voting is off");

        EnumerableSet.UintSet storage votes = votedInProposals[msg.sender][
            IGovPool.VoteType.TreasuryVote
        ];
        IGovPool.VoteInfo storage voteInfo = voteInfos[proposalId][msg.sender][
            IGovPool.VoteType.TreasuryVote
        ];

        return
            _vote(
                core,
                votes,
                voteInfo,
                restrictedProposals[msg.sender],
                proposalId,
                voteAmount,
                voteNftIds,
                IGovPool.VoteType.TreasuryVote,
                isVoteFor
            );
    }

    function _vote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage votes,
        IGovPool.VoteInfo storage voteInfo,
        EnumerableSet.UintSet storage restrictedUserProposals,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal returns (uint256) {
        _canVote(core, restrictedUserProposals, proposalId, voteType);

        votes.add(proposalId);

        GovPool govPool = GovPool(payable(address(this)));

        require(
            votes.length() <= govPool.coreProperties().getGovVotesLimit(),
            "Gov: vote limit reached"
        );

        (, address userKeeperAddress, , , ) = govPool.getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        if (voteAmount > 0) {
            if (voteType != IGovPool.VoteType.TreasuryVote) {
                userKeeper.lockTokens(proposalId, msg.sender, voteType, voteAmount);
            }

            _voteTokens(voteInfo, voteAmount, voteType, isVoteFor);
        }

        if (voteNftIds.length > 0) {
            if (voteType != IGovPool.VoteType.TreasuryVote) {
                userKeeper.lockNfts(msg.sender, voteType, voteNftIds);
            }

            voteAmount += _voteNfts(core, voteInfo, voteNftIds, isVoteFor);
        }

        voteAmount = _calculateVotes(voteAmount, voteType);

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

        emit Voted(proposalId, msg.sender, voteType, voteAmount, isVoteFor);

        return voteAmount;
    }

    function _voteTokens(
        IGovPool.VoteInfo storage voteInfo,
        uint256 amount,
        IGovPool.VoteType voteType,
        bool isVoteFor
    ) internal {
        (, address userKeeper, , , ) = IGovPool(address(this)).getHelperContracts();

        (uint256 tokenBalance, uint256 ownedBalance) = IGovUserKeeper(userKeeper).tokenBalance(
            msg.sender,
            voteType
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
        bool isVoteFor
    ) internal returns (uint256 voteAmount) {
        (
            EnumerableSet.UintSet storage votedNfts,
            EnumerableSet.UintSet storage votedOpposedNfts
        ) = _votedNfts(voteInfo, isVoteFor);

        for (uint256 i; i < nftIds.length; i++) {
            require(
                votedNfts.add(nftIds[i]) && !votedOpposedNfts.contains(nftIds[i]),
                "Gov: NFT already voted"
            );
        }

        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        userKeeper.updateNftPowers(nftIds);

        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);
    }

    function _canVote(
        IGovPool.ProposalCore storage core,
        EnumerableSet.UintSet storage restrictedUserProposals,
        uint256 proposalId,
        IGovPool.VoteType voteType
    ) internal view {
        IGovPool govPool = IGovPool(address(this));

        require(
            govPool.getProposalState(proposalId) == IGovPool.ProposalState.Voting,
            "Gov: vote unavailable"
        );

        require(
            !restrictedUserProposals.contains(proposalId),
            "Gov: user restricted from voting in this proposal"
        );

        (, address userKeeper, , , ) = govPool.getHelperContracts();

        require(
            IGovUserKeeper(userKeeper).canVote(
                msg.sender,
                voteType,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );
    }

    function _quorumReached(IGovPool.ProposalCore storage core) internal view returns (bool) {
        (, address userKeeperAddress, , , ) = IGovPool(address(this)).getHelperContracts();

        return
            PERCENTAGE_100.ratio(
                core.votesFor + core.votesAgainst,
                IGovUserKeeper(userKeeperAddress).getTotalVoteWeight()
            ) >= core.settings.quorum;
    }

    function _votedNfts(
        IGovPool.VoteInfo storage voteInfo,
        bool isVoteFor
    ) internal view returns (EnumerableSet.UintSet storage, EnumerableSet.UintSet storage) {
        return
            isVoteFor
                ? (voteInfo.nftsVotedFor, voteInfo.nftsVotedAgainst)
                : (voteInfo.nftsVotedAgainst, voteInfo.nftsVotedFor);
    }

    function _treasuryVoteCoefficient() internal view returns (uint256) {
        (, address userKeeperAddress, , , ) = GovPool(payable(address(this))).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        (uint256 power, ) = userKeeper.tokenBalance(msg.sender, IGovPool.VoteType.TreasuryVote);

        (uint256[] memory nfts, ) = userKeeper.nftExactBalance(
            msg.sender,
            IGovPool.VoteType.TreasuryVote
        );
        (uint256 nftPower, ) = userKeeper.nftVotingPower(nfts);

        power += nftPower;

        return power.ratio(PRECISION, userKeeper.getTotalVoteWeight()) / 10;
    }

    function _calculateVotes(
        uint256 voteAmount,
        IGovPool.VoteType voteType
    ) internal view returns (uint256) {
        uint256 coefficient = IGovPool(address(this)).getVoteModifierForUser(msg.sender);

        if (voteType == IGovPool.VoteType.TreasuryVote) {
            uint256 treasuryVoteCoefficient = _treasuryVoteCoefficient();

            // Assuming treasury vote coefficient is always <= 1
            coefficient -= treasuryVoteCoefficient;
        }

        if (coefficient <= PRECISION) {
            return voteAmount;
        }

        return voteAmount.pow(coefficient.ratio(DECIMALS, PRECISION));
    }
}
