// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/validators/IGovValidators.sol";

import "./GovValidatorsToken.sol";

import "../../libs/math/MathHelper.sol";
import "../../core/Globals.sol";

contract GovValidators is IGovValidators, OwnableUpgradeable {
    using Math for uint256;
    using MathHelper for uint256;

    GovValidatorsToken public govValidatorsToken;

    InternalProposalSettings public internalProposalSettings;

    uint256 internal _latestInternalProposalId;
    uint256 public validatorsCount;

    mapping(uint256 => InternalProposal) public internalProposals; // proposalId => info
    mapping(uint256 => ExternalProposal) public externalProposals; // proposalId => info

    mapping(uint256 => mapping(address => uint256)) public addressVotedInternal; // proposalId => user => voted amount
    mapping(uint256 => mapping(address => uint256)) public addressVotedExternal; // proposalId => user => voted amount

    event Voted(uint256 proposalId, address sender, uint256 vote);
    event ChangedValidatorsBalances(address[] validators, uint256[] newBalance);

    /// @dev Access only for addresses that have validator tokens
    modifier onlyValidatorHolder() {
        require(
            govValidatorsToken.balanceOf(msg.sender) > 0,
            "Validators: caller is not the validator"
        );
        _;
    }

    function __GovValidators_init(
        string calldata name,
        string calldata symbol,
        uint64 duration,
        uint128 quorum,
        address[] calldata validators,
        uint256[] calldata balances
    ) external initializer {
        __Ownable_init();

        require(validators.length == balances.length, "Validators: invalid array length");
        require(duration > 0, "Validators: duration is zero");
        require(quorum <= PERCENTAGE_100, "Validators: invalid quorum value");

        GovValidatorsToken _validatorsTokenContract = new GovValidatorsToken(name, symbol);

        govValidatorsToken = _validatorsTokenContract;
        internalProposalSettings.duration = duration;
        internalProposalSettings.quorum = quorum;

        _changeBalances(balances, validators);
    }

    function createInternalProposal(
        ProposalType proposalType,
        uint256[] calldata newValues,
        address[] calldata users
    ) external override onlyValidatorHolder {
        if (proposalType == ProposalType.ChangeInternalDuration) {
            require(newValues[0] > 0, "Validators: invalid duration value");
        } else if (proposalType == ProposalType.ChangeInternalQuorum) {
            require(newValues[0] <= PERCENTAGE_100, "Validators: invalid quorum value");
        } else if (proposalType == ProposalType.ChangeInternalDurationAndQuorum) {
            require(
                newValues[0] > 0 && newValues[1] <= PERCENTAGE_100,
                "Validators: invalid duration or quorum values"
            );
        } else {
            require(newValues.length == users.length, "Validators: invalid length");

            for (uint256 i = 0; i < users.length; i++) {
                require(users[i] != address(0), "Validators: invalid address");
            }
        }

        internalProposals[++_latestInternalProposalId] = InternalProposal({
            proposalType: proposalType,
            core: ProposalCore({
                voteEnd: uint64(block.timestamp + internalProposalSettings.duration),
                executed: false,
                quorum: internalProposalSettings.quorum,
                votesFor: 0,
                snapshotId: govValidatorsToken.snapshot()
            }),
            newValues: newValues,
            userAddresses: users
        });
    }

    function createExternalProposal(
        uint256 proposalId,
        uint64 duration,
        uint128 quorum
    ) external override onlyOwner {
        require(!_proposalExists(proposalId, false), "Validators: proposal already exist");

        externalProposals[proposalId] = ExternalProposal({
            core: ProposalCore({
                voteEnd: uint64(block.timestamp + duration),
                executed: false,
                quorum: quorum,
                votesFor: 0,
                snapshotId: govValidatorsToken.snapshot()
            })
        });
    }

    function vote(
        uint256 proposalId,
        uint256 amount,
        bool isInternal
    ) external override {
        require(_proposalExists(proposalId, isInternal), "Validators: proposal does not exist");

        ProposalCore storage core = isInternal
            ? internalProposals[proposalId].core
            : externalProposals[proposalId].core;

        require(_getProposalState(core) == ProposalState.Voting, "Validators: not Voting state");

        uint256 balanceAt = govValidatorsToken.balanceOfAt(msg.sender, core.snapshotId);
        uint256 voted = isInternal
            ? addressVotedInternal[proposalId][msg.sender]
            : addressVotedExternal[proposalId][msg.sender];
        uint256 voteAmount = amount.min(balanceAt - voted);

        require(voteAmount > 0, "Validators: vote amount can't be a zero");

        if (isInternal) {
            addressVotedInternal[proposalId][msg.sender] = voted + voteAmount;
        } else {
            addressVotedExternal[proposalId][msg.sender] = voted + voteAmount;
        }

        core.votesFor += voteAmount;

        emit Voted(proposalId, msg.sender, voteAmount);
    }

    function execute(uint256 proposalId) external override {
        require(_proposalExists(proposalId, true), "Validators: proposal does not exist");

        InternalProposal storage proposal = internalProposals[proposalId];

        require(
            _getProposalState(proposal.core) == ProposalState.Succeeded,
            "Validators: not Succeeded state"
        );

        proposal.core.executed = true;

        ProposalType proposalType = proposal.proposalType;

        if (proposalType == ProposalType.ChangeInternalDuration) {
            internalProposalSettings.duration = uint64(proposal.newValues[0]);
        } else if (proposalType == ProposalType.ChangeInternalQuorum) {
            internalProposalSettings.quorum = uint128(proposal.newValues[0]);
        } else if (proposalType == ProposalType.ChangeInternalDurationAndQuorum) {
            internalProposalSettings.duration = uint64(proposal.newValues[0]);
            internalProposalSettings.quorum = uint128(proposal.newValues[1]);
        } else {
            _changeBalances(proposal.newValues, proposal.userAddresses);
        }
    }

    function getProposalState(uint256 proposalId, bool isInternal)
        external
        view
        override
        returns (ProposalState)
    {
        if (!_proposalExists(proposalId, isInternal)) {
            return ProposalState.Undefined;
        }

        return
            isInternal
                ? _getProposalState(internalProposals[proposalId].core)
                : _getProposalState(externalProposals[proposalId].core);
    }

    function _getProposalState(ProposalCore storage core) internal view returns (ProposalState) {
        if (core.executed) {
            return ProposalState.Executed;
        }

        if (_isQuorumReached(core)) {
            return ProposalState.Succeeded;
        }

        if (core.voteEnd < block.timestamp) {
            return ProposalState.Defeated;
        }

        return ProposalState.Voting;
    }

    function isQuorumReached(uint256 proposalId, bool isInternal)
        external
        view
        override
        returns (bool)
    {
        if (!_proposalExists(proposalId, isInternal)) {
            return false;
        }

        return
            isInternal
                ? _isQuorumReached(internalProposals[proposalId].core)
                : _isQuorumReached(externalProposals[proposalId].core);
    }

    function _isQuorumReached(ProposalCore storage core) internal view returns (bool) {
        uint256 totalSupply = govValidatorsToken.totalSupplyAt(core.snapshotId);
        uint256 currentQuorum = PERCENTAGE_100.ratio(core.votesFor, totalSupply);

        return currentQuorum >= core.quorum;
    }

    function _proposalExists(uint256 proposalId, bool isInternal) internal view returns (bool) {
        return
            isInternal
                ? internalProposals[proposalId].core.voteEnd != 0
                : externalProposals[proposalId].core.voteEnd != 0;
    }

    function changeBalances(uint256[] calldata newValues, address[] calldata userAddresses)
        external
        override
        onlyOwner
    {
        _changeBalances(newValues, userAddresses);
    }

    function _changeBalances(uint256[] memory newValues, address[] memory userAddresses) internal {
        GovValidatorsToken validatorsToken = govValidatorsToken;
        uint256 length = newValues.length;

        uint256 validatorsCount_ = validatorsCount;

        for (uint256 i = 0; i < length; i++) {
            address user = userAddresses[i];
            uint256 newBalance = newValues[i];
            uint256 balance = validatorsToken.balanceOf(user);

            if (balance < newBalance) {
                validatorsToken.mint(user, newBalance - balance);

                if (balance == 0) {
                    validatorsCount_++;
                }
            } else if (balance > newBalance) {
                validatorsToken.burn(user, balance - newBalance);

                if (newBalance == 0) {
                    validatorsCount_--;
                }
            }
        }

        validatorsCount = validatorsCount_;

        emit ChangedValidatorsBalances(userAddresses, newValues);
    }
}
