// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@solarity/solidity-lib/libs/utils/TypeCaster.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/voting/IVotePower.sol";

import "../../libs/math/MathHelper.sol";

import "../../core/Globals.sol";

contract PolynomialPower is IVotePower, OwnableUpgradeable {
    using MathHelper for uint256;
    using MathHelper for int256;
    using TypeCaster for *;

    int256 private constant HOLDER_A = 1041 * (10 ** 22);
    int256 private constant HOLDER_B = -7211 * (10 ** 19);
    int256 private constant HOLDER_C = 1994 * (10 ** 17);

    uint256 private constant HOLDER_THRESHOLD = 7 * (10 ** 23);

    int256 private constant EXPERT_A = 883755895036092 * (10 ** 11);
    int256 private constant EXPERT_B = 113 * (10 ** 23);
    int256 private constant EXPERT_C = -6086 * (10 ** 19);
    int256 private constant EXPERT_D = 4147 * (10 ** 17);
    int256 private constant EXPERT_E = -148 * (10 ** 16);
    int256 private constant EXPERT_BEFORE_THRESHOLD_A = 1801894 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_THRESHOLD_B = -169889 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_THRESHOLD_C = 23761 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_THRESHOLD_D = -1328 * (10 ** 19);

    uint256 private constant EXPERT_THRESHOLD = 663 * (10 ** 21);

    uint256 internal _coefficient1;
    uint256 internal _coefficient2;
    uint256 internal _coefficient3;

    function __PolynomialPower_init(
        uint256 coefficient1,
        uint256 coefficient2,
        uint256 coefficient3
    ) external initializer {
        __Ownable_init();

        _coefficient1 = coefficient1;
        _coefficient2 = coefficient2;
        _coefficient3 = coefficient3;
    }

    function transformVotes(
        address voter,
        uint256 votes
    ) external view override returns (uint256) {
        (uint256 treasuryRatio, uint256 totalSupply) = _calculateParameters(voter);

        if (!IGovPool(owner()).getExpertStatus(voter)) {
            return _forHolders(votes, totalSupply);
        }

        return
            _forExperts(votes, totalSupply, false).ratio(PRECISION - treasuryRatio, PRECISION) +
            _forExperts(votes, totalSupply, true).ratio(treasuryRatio, PRECISION);
    }

    function getVoteCoefficients() external view returns (uint256, uint256, uint256) {
        return (_coefficient1, _coefficient2, _coefficient3);
    }

    function getTreasuryRatio(
        address voter
    ) external view override returns (uint256 treasuryRatio) {
        (treasuryRatio, ) = _calculateParameters(voter);
    }

    function _calculateParameters(
        address voter
    ) internal view returns (uint256 treasuryRatio, uint256 totalSupply) {
        uint256 fullPower;
        uint256 treasuryPower;

        (totalSupply, fullPower, treasuryPower) = _getPower(voter);

        treasuryRatio = fullPower == 0 ? 0 : treasuryPower.ratio(PRECISION, fullPower);
    }

    function _getPower(
        address user
    ) internal view returns (uint256 totalPower, uint256 fullPower, uint256 treasuryPower) {
        (, address userKeeperAddress, , , ) = IGovPool(payable(owner())).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        IGovPool.VoteType[] memory voteTypes = new IGovPool.VoteType[](3);

        voteTypes[0] = IGovPool.VoteType.PersonalVote;
        voteTypes[1] = IGovPool.VoteType.MicropoolVote;
        voteTypes[2] = IGovPool.VoteType.TreasuryVote;

        IGovUserKeeper.VotingPowerView[] memory votingPowers = userKeeper.votingPower(
            [user, user, user].asDynamic(),
            voteTypes,
            false
        );

        treasuryPower = votingPowers[2].rawPower;
        fullPower = votingPowers[0].rawPower + votingPowers[1].rawPower + treasuryPower;

        totalPower = userKeeper.getTotalVoteWeight();
    }

    function _forHolders(uint256 votes, uint256 totalSupply) internal view returns (uint256) {
        uint256 threshold = totalSupply.ratio(HOLDER_THRESHOLD, PRECISION);

        if (votes < threshold) {
            return votes;
        }

        int256 polynomial = _calculatePolynomial(
            0,
            HOLDER_A,
            HOLDER_B,
            HOLDER_C,
            0,
            int256(((100 * votes * PRECISION) / totalSupply) - 7 * PRECISION)
        );

        assert(polynomial >= 0);

        return
            threshold +
            _coefficient3.ratio(uint256(polynomial), PRECISION).ratio(
                totalSupply,
                100 * PRECISION
            );
    }

    function _forExperts(
        uint256 votes,
        uint256 totalSupply,
        bool isDao
    ) internal view returns (uint256) {
        uint256 threshold = totalSupply.ratio(EXPERT_THRESHOLD, PRECISION);
        int256 polynomial;

        if (votes < threshold) {
            polynomial = _calculatePolynomial(
                0,
                EXPERT_BEFORE_THRESHOLD_A,
                EXPERT_BEFORE_THRESHOLD_B,
                EXPERT_BEFORE_THRESHOLD_C,
                EXPERT_BEFORE_THRESHOLD_D,
                int256((100 * votes * PRECISION) / totalSupply)
            );
        } else {
            polynomial = _calculatePolynomial(
                EXPERT_A,
                EXPERT_B,
                EXPERT_C,
                EXPERT_D,
                EXPERT_E,
                int256(((100 * votes * PRECISION) / totalSupply) - PRECISION.ratio(663, 100))
            );
        }

        assert(polynomial >= 0);

        return
            uint256(polynomial).ratio(totalSupply, 100 * PRECISION).ratio(
                isDao ? _coefficient1 : _coefficient2,
                PRECISION
            );
    }

    function _calculatePolynomial(
        int256 freeCoefficient,
        int256 power1Coefficient,
        int256 power2Coefficient,
        int256 power3Coefficient,
        int256 power4Coefficient,
        int256 variable
    ) internal pure returns (int256 result) {
        int256 precision = int256(PRECISION);

        result = freeCoefficient;
        result += power1Coefficient.ratio(variable, precision);
        result += power2Coefficient.ratio(variable, precision).ratio(variable, precision);
        result += power3Coefficient.ratio(variable, precision).ratio(variable, precision).ratio(
            variable,
            precision
        );
        result += power4Coefficient
            .ratio(variable, precision)
            .ratio(variable, precision)
            .ratio(variable, precision)
            .ratio(variable, precision);
    }
}
