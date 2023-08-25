// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/voting/IVotePower.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/math/LogExpMath.sol";

import "../../core/Globals.sol";

contract PolynomialPower is IVotePower, OwnableUpgradeable {
    using MathHelper for uint256;
    using MathHelper for int256;
    using LogExpMath for uint256;

    int256 private constant HOLDER_A = 1041 * (10 ** 22);
    int256 private constant HOLDER_B = -7211 * (10 ** 19);
    int256 private constant HOLDER_C = 1994 * (10 ** 17);

    uint256 private constant HOLDER_TRESHOLD = 7 * (10 ** 23);

    int256 private constant EXPERT_A = 883755895036092 * (10 ** 11);
    int256 private constant EXPERT_B = 113 * (10 ** 23);
    int256 private constant EXPERT_C = -6086 * (10 ** 19);
    int256 private constant EXPERT_D = 4147 * (10 ** 17);
    int256 private constant EXPERT_E = -148 * (10 ** 16);
    int256 private constant EXPERT_BEFORE_TRESHOLD_A = 1801894 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_TRESHOLD_B = -169889 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_TRESHOLD_C = 23761 * (10 ** 19);
    int256 private constant EXPERT_BEFORE_TRESHOLD_D = -1328 * (10 ** 19);

    uint256 private constant EXPERT_TRESHOLD = 663 * (10 ** 21);

    uint256 internal _k1;
    uint256 internal _k2;
    uint256 internal _k3;

    function __PolynomialPower_init(uint256 k1, uint256 k2, uint256 k3) external initializer {
        __Ownable_init();

        _k1 = k1;
        _k2 = k2;
        _k3 = k3;
    }

    function transformVotes(
        address voter,
        uint256 votes
    ) external view override returns (uint256) {
        IGovPool govPool = IGovPool(owner());
        bool expertStatus = govPool.getExpertStatus(voter);
        (uint256 treasuryRatio, uint256 totalSupply) = _calculateParameters(voter);

        if (!expertStatus) {
            return _forHolders(votes, totalSupply);
        } else {
            return
                _forExperts(votes, totalSupply, false).ratio(
                    PRECISION - treasuryRatio,
                    PRECISION
                ) + _forExperts(votes, totalSupply, true).ratio(treasuryRatio, PRECISION);
        }
    }

    function getVoteCoefficients() external view returns (uint256, uint256, uint256) {
        return (_k1, _k2, _k3);
    }

    function _calculateParameters(
        address voter
    ) internal view returns (uint256 treasuryRatio, uint totalSupply) {
        (, address userKeeperAddress, , , ) = IGovPool(payable(owner())).getHelperContracts();
        IGovUserKeeper userKeeper = IGovUserKeeper(userKeeperAddress);

        uint256 treasuryPower = userKeeper.getUserPowerForVoteType(
            voter,
            IGovPool.VoteType.TreasuryVote
        );
        uint256 fullPower = userKeeper.getFullUserPower(voter);

        treasuryRatio = fullPower == 0 ? 0 : treasuryPower.ratio(PRECISION, fullPower);
        totalSupply = userKeeper.getTotalVoteWeight();
    }

    function _forHolders(uint256 x, uint256 totalSupply) internal view returns (uint256) {
        uint256 treshold = totalSupply.ratio(HOLDER_TRESHOLD, PRECISION);

        if (x < treshold) {
            return x;
        }

        int256 t = int256(((100 * x * PRECISION) / totalSupply) - 7 * PRECISION);
        int256 polynom = _calculatePolynomial(0, HOLDER_A, HOLDER_B, HOLDER_C, 0, t);
        return
            treshold + _k3.ratio(uint256(polynom), PRECISION).ratio(totalSupply, 100 * PRECISION);
    }

    function _forExperts(
        uint256 x,
        uint256 totalSupply,
        bool isDao
    ) internal view returns (uint256) {
        uint256 treshold = totalSupply.ratio(EXPERT_TRESHOLD, PRECISION);
        uint256 _k = isDao ? _k1 : _k2;

        if (x < treshold) {
            int256 t = int256((100 * x * PRECISION) / totalSupply);
            int256 polynom = _calculatePolynomial(
                0,
                EXPERT_BEFORE_TRESHOLD_A,
                EXPERT_BEFORE_TRESHOLD_B,
                EXPERT_BEFORE_TRESHOLD_C,
                EXPERT_BEFORE_TRESHOLD_D,
                t
            );
            return uint256(polynom).ratio(totalSupply, 100 * PRECISION).ratio(_k, PRECISION);
        } else {
            int256 t = int256(((100 * x * PRECISION) / totalSupply) - PRECISION.ratio(663, 100));
            int256 polynom = _calculatePolynomial(
                EXPERT_A,
                EXPERT_B,
                EXPERT_C,
                EXPERT_D,
                EXPERT_E,
                t
            );
            return uint256(polynom).ratio(totalSupply, 100 * PRECISION).ratio(_k, PRECISION);
        }
    }

    function _calculatePolynomial(
        int256 a0, // free coefficient with precision
        int256 a1, // power1 coefficient with precision
        int256 a2, // power2 coefficient with precision
        int256 a3, // power3 coefficient with precision
        int256 a4, // power4 coefficient with precision
        int256 x // variable with precision
    ) internal pure returns (int256 result) {
        int256 p = int256(PRECISION);
        result = a0;
        result += a1.signedRatio(x, p);
        result += a2.signedRatio(x, p).signedRatio(x, p);
        result += a3.signedRatio(x, p).signedRatio(x, p).signedRatio(x, p);
        result += a4.signedRatio(x, p).signedRatio(x, p).signedRatio(x, p).signedRatio(x, p);
    }
}
