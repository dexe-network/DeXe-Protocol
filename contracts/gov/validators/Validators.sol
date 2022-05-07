// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/validators/IValidators.sol";

import "./ValidatorsToken.sol";

import "../../libs/MathHelper.sol";
import "../../core/Globals.sol";

contract Validators is IValidators, OwnableUpgradeable {
    using Math for uint256;
    using MathHelper for uint256;

    ValidatorsToken public validatorsTokenContract;

    /// @dev Base internal proposal settings
    InternalProposalSettings public internalProposalSettings;

    uint256 private _latestInternalProposalId;

    mapping(uint256 => InternalProposal) public internalProposals; // proposalId => info
    mapping(uint256 => ExternalProposal) public externalProposals; // proposalId => info

    mapping(uint256 => mapping(address => uint256)) public addressVotedInternal; // proposalId => user => voted amount
    mapping(uint256 => mapping(address => uint256)) public addressVotedExternal; // proposalId => user => voted amount

    /// @dev Access only for addresses that have validator tokens
    modifier onlyValidatorHolder() {
        require(
            validatorsTokenContract.balanceOf(msg.sender) > 0,
            "Validators: caller is not the validator"
        );
        _;
    }

    function __Validators_init(
        string calldata name,
        string calldata symbol,
        uint64 duration,
        uint128 quorum,
        address[] calldata validators,
        uint256[] calldata balances
    ) external initializer {
        __Ownable_init();

        require(validators.length == balances.length, "Validators: invalid array length");
        require(validators.length > 0, "Validators: length is zero");
        require(duration > 0, "Validators: duration is zero");
        require(quorum <= PERCENTAGE_100, "Validators: invalid quorum value");

        ValidatorsToken _validatorsTokenContract = new ValidatorsToken(name, symbol);

        validatorsTokenContract = _validatorsTokenContract;
        internalProposalSettings.duration = duration;
        internalProposalSettings.quorum = quorum;

        for (uint256 i; i < validators.length; i++) {
            _validatorsTokenContract.mint(validators[i], balances[i]);
        }
    }

    function createInternalProposal(
        ProposalType proposalType,
        uint256 newValue,
        address user
    ) external override onlyValidatorHolder {
        if (proposalType == ProposalType.ChangeInternalDuration) {
            require(newValue > 0, "Validators: invalid duration value");
        } else if (proposalType == ProposalType.ChangeInternalQuorum) {
            require(newValue <= PERCENTAGE_100, "Validators: invalid quorum value");
        } else {
            require(user != address(0), "Validators: invalid address");
        }

        internalProposals[++_latestInternalProposalId] = InternalProposal({
            proposalType: proposalType,
            core: ProposalCore({
                voteEnd: uint64(block.timestamp + internalProposalSettings.duration),
                executed: false,
                quorum: internalProposalSettings.quorum,
                votesFor: 0,
                snapshotId: validatorsTokenContract.snapshot()
            }),
            newValue: newValue,
            userAddress: user
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
                snapshotId: validatorsTokenContract.snapshot()
            })
        });
    }

    function vote(
        uint256 proposalId,
        uint256 amount,
        bool isInternal
    ) external override {
        require(_proposalExists(proposalId, isInternal), "Validators: proposal is not exist");

        ProposalCore storage core = isInternal
            ? internalProposals[proposalId].core
            : externalProposals[proposalId].core;

        require(
            _getProposalState(core) == ProposalState.Voting,
            "Validators: only by `Voting` state"
        );

        uint256 balanceAt = validatorsTokenContract.balanceOfAt(msg.sender, core.snapshotId);
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
    }

    function execute(uint256 proposalId) external override {
        require(_proposalExists(proposalId, true), "Validators: proposal is not exist");

        InternalProposal storage proposal = internalProposals[proposalId];

        require(
            _getProposalState(proposal.core) == ProposalState.Succeeded,
            "Validators: only by `Succeeded` state"
        );

        proposal.core.executed = true;

        ProposalType proposalType = proposal.proposalType;
        uint256 proposalValue = proposal.newValue;

        if (proposalType == ProposalType.ChangeInternalDuration) {
            internalProposalSettings.duration = uint64(proposalValue);
        } else if (proposalType == ProposalType.ChangeInternalQuorum) {
            internalProposalSettings.quorum = uint128(proposalValue);
        } else if (proposalType == ProposalType.ChangeBalance) {
            address user = proposal.userAddress;
            uint256 balance = validatorsTokenContract.balanceOf(user);

            if (balance < proposalValue) {
                validatorsTokenContract.mint(user, proposalValue - balance);
            } else {
                validatorsTokenContract.burn(user, balance - proposalValue);
            }
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

    function _getProposalState(ProposalCore storage core) private view returns (ProposalState) {
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

    function _isQuorumReached(ProposalCore storage core) private view returns (bool) {
        uint256 totalSupply = validatorsTokenContract.totalSupplyAt(core.snapshotId);
        uint256 currentQuorum = PERCENTAGE_100.ratio(core.votesFor, totalSupply);

        return currentQuorum >= core.quorum;
    }

    function _proposalExists(uint256 proposalId, bool isInternal) private view returns (bool) {
        return
            isInternal
                ? internalProposals[proposalId].core.voteEnd != 0
                : externalProposals[proposalId].core.voteEnd != 0;
    }
}
