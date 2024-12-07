// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PRECISION} from "../../../core/Globals.sol";

abstract contract AbstractValueDistributor {
    struct UserDistribution {
        uint256 shares;
        uint256 cumulativeSum;
        uint256 owedValue;
    }

    mapping(uint256 => uint256) private _totalShares; // id => totalShares
    mapping(uint256 => uint256) private _cumulativeSum; // id => cumulativeSum
    mapping(uint256 => uint256) internal _updatedAt; // id => updatedAt
    mapping(uint256 => uint256) internal _owedToProtocol; // id => owedToProtocol

    mapping(uint256 => mapping(address => UserDistribution)) internal _userDistributions; // id => user => UserDistributions

    event StakeAdded(uint256 id, address user, uint256 amount);

    function _addShares(uint256 id, address user_, uint256 amount_) internal virtual {
        require(amount_ > 0, "ValueDistributor: amount has to be more than 0");

        _update(id, user_);

        _totalShares[id] += amount_;
        _userDistributions[id][user_].shares += amount_;

        emit StakeAdded(id, user_, amount_);
    }

    function _update(uint256 id, address user_) internal {
        _updateOnTime(id, user_, block.timestamp);
    }

    function _updateOnTime(uint256 id, address user_, uint256 time) internal {
        uint256 lastTime = _updatedAt[id];
        uint256 newCumulativeSum = _getFutureCumulativeSum(id, time);

        if (_cumulativeSum[id] == newCumulativeSum && time > lastTime) {
            _owedToProtocol[id] += _getValueToDistribute(id, time, lastTime);
        }
        _cumulativeSum[id] = newCumulativeSum;
        _updatedAt[id] = time;

        UserDistribution storage _userDist = _userDistributions[id][user_];

        _userDist.owedValue +=
            (_userDist.shares * (_cumulativeSum[id] - _userDist.cumulativeSum)) /
            PRECISION;
        _userDist.cumulativeSum = _cumulativeSum[id];
    }

    function _updateFromProtocol(uint256 id, uint256 deadline) internal {
        uint256 lastTime = _updatedAt[id];
        uint256 newCumulativeSum = _getFutureCumulativeSum(id, deadline);

        if (_cumulativeSum[id] == newCumulativeSum && deadline > lastTime) {
            _owedToProtocol[id] += _getValueToDistribute(id, deadline, lastTime);
        }
        _cumulativeSum[id] = newCumulativeSum;
        _updatedAt[id] = deadline;
    }

    function _getValueToDistribute(
        uint256 id,
        uint256 timeUpTo_,
        uint256 timeLastUpdate_
    ) internal view virtual returns (uint256);

    function _getFutureCumulativeSum(
        uint256 id,
        uint256 timeUpTo_
    ) internal view returns (uint256) {
        if (_totalShares[id] == 0) {
            return _cumulativeSum[id];
        }

        uint256 value_ = _getValueToDistribute(id, timeUpTo_, _updatedAt[id]);

        return _cumulativeSum[id] + (value_ * PRECISION) / _totalShares[id];
    }
}
