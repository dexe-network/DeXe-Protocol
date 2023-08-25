// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";

contract PolynomTesterMock {
    mapping(address => bool) internal _expertStatus;
    mapping(address => mapping(IGovPool.VoteType => uint256)) internal _votes;
    uint256 internal _totalVotes;

    function setExpertStatus(address user, bool isExpert) external {
        _expertStatus[user] = isExpert;
    }

    function setVotes(
        address user,
        uint256 personalVote,
        uint256 micropoolVote,
        uint256 treasuryVote
    ) external {
        _votes[user][IGovPool.VoteType.PersonalVote] = personalVote;
        _votes[user][IGovPool.VoteType.MicropoolVote] = micropoolVote;
        _votes[user][IGovPool.VoteType.TreasuryVote] = treasuryVote;
    }

    function setTotalVotes(uint256 votes) external {
        _totalVotes = votes;
    }

    function getHelperContracts()
        external
        view
        returns (
            address settings,
            address userKeeper,
            address validators,
            address poolRegistry,
            address votePower
        )
    {
        address zero = address(0);
        return (zero, address(this), zero, zero, zero);
    }

    function getExpertStatus(address user) external view returns (bool) {
        return _expertStatus[user];
    }

    function getUserPowerForVoteType(
        address user,
        IGovPool.VoteType voteType
    ) external view returns (uint256 power) {
        return _votes[user][voteType];
    }

    function getFullUserPower(address user) external view returns (uint256 power) {
        return
            _votes[user][IGovPool.VoteType.PersonalVote] +
            _votes[user][IGovPool.VoteType.MicropoolVote] +
            _votes[user][IGovPool.VoteType.TreasuryVote];
    }

    function getTotalVoteWeight() external view returns (uint256) {
        return _totalVotes;
    }
}
