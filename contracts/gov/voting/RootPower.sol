// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/voting/IVotePower.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/math/LogExpMath.sol";

import "../../core/Globals.sol";

contract RootPower is IVotePower, OwnableUpgradeable {
    using MathHelper for uint256;
    using LogExpMath for uint256;

    uint256 internal _regularVoteModifier;
    uint256 internal _expertVoteModifier;

    function __RootPower_init(
        uint256 regularVoteModifier,
        uint256 expertVoteModifier
    ) external initializer {
        __Ownable_init();

        _regularVoteModifier = regularVoteModifier;
        _expertVoteModifier = expertVoteModifier;
    }

    function transformVotes(
        address voter,
        uint256 votes
    ) external view override returns (uint256) {
        IGovPool govPool = IGovPool(owner());
        bool expertStatus = govPool.getExpertStatus(voter);
        uint256 coefficient = expertStatus ? _expertVoteModifier : _regularVoteModifier;

        if (expertStatus) {
            uint256 treasuryVoteCoefficient = _treasuryVoteCoefficient(voter);

            // @dev Assuming treasury vote coefficient is always <= 1
            coefficient -= treasuryVoteCoefficient;
        }

        if (coefficient <= PRECISION) {
            return votes;
        }

        return votes.pow(PRECISION.ratio(DECIMALS, coefficient));
    }

    function getVoteModifiers() external view returns (uint256 regular, uint256 expert) {
        return (_regularVoteModifier, _expertVoteModifier);
    }

    function _treasuryVoteCoefficient(address voter) internal view returns (uint256) {
        (, address userKeeperAddress, , , ) = IGovPool(payable(owner())).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        (uint256 power, ) = userKeeper.tokenBalance(voter, IGovPool.VoteType.TreasuryVote);

        (uint256[] memory nfts, ) = userKeeper.nftExactBalance(
            voter,
            IGovPool.VoteType.TreasuryVote
        );
        (uint256 nftPower, ) = userKeeper.nftVotingPower(nfts);

        power += nftPower;

        return power.ratio(PRECISION, userKeeper.getTotalVoteWeight()) / 10;
    }
}
