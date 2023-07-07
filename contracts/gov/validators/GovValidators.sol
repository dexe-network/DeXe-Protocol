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

    ProposalSettings public internalProposalSettings;

    uint256 public override latestInternalProposalId;
    uint256 public validatorsCount;

    mapping(uint256 => InternalProposal) internal _internalProposals; // proposalId => info
    mapping(uint256 => ExternalProposal) internal _externalProposals; // proposalId => info

    mapping(uint256 => mapping(bool => mapping(address => uint256))) public addressVoted; // proposalId => isInternal => user => voted amount

    event ExternalProposalCreated(uint256 proposalId, uint256 quorum);
    event InternalProposalCreated(
        uint256 proposalId,
        string proposalDescription,
        uint256 quorum,
        address sender
    );
    event InternalProposalExecuted(uint256 proposalId, address executor);

    event Voted(uint256 proposalId, address sender, uint256 vote, bool isInternal, bool isVoteFor);
    event ChangedValidatorsBalances(address[] validators, uint256[] newBalance);

    /// @dev Access only for addresses that have validator tokens
    modifier onlyValidator() {
        _onlyValidator();
        _;
    }

    function __GovValidators_init(
        string calldata name,
        string calldata symbol,
        ProposalSettings calldata proposalSettings,
        address[] calldata validators,
        uint256[] calldata balances
    ) external initializer {
        __Ownable_init();

        _validateChangeBalances(balances, validators);
        _validateProposalSettings(proposalSettings);

        govValidatorsToken = new GovValidatorsToken(name, symbol);

        internalProposalSettings = proposalSettings;

        _changeBalances(balances, validators);
    }

    function createInternalProposal(
        ProposalType proposalType,
        string calldata descriptionURL,
        uint256[] calldata newValues,
        address[] calldata users
    ) external override onlyValidator {
        if (proposalType == ProposalType.ChangeBalances) {
            _validateChangeBalances(newValues, users);
        } else {
            ProposalSettings memory proposalSettings = ProposalSettings({
                duration: 1,
                executionDelay: 0,
                quorum: 1
            });

            if (proposalType == ProposalType.ChangeInternalDuration) {
                proposalSettings.duration = uint64(newValues[0]);
            } else if (proposalType == ProposalType.ChangeInternalQuorum) {
                proposalSettings.quorum = uint128(newValues[0]);
            } else if (
                proposalType == ProposalType.ChangeInternalDurationAndExecutionDelayAndQuorum
            ) {
                proposalSettings.duration = uint64(newValues[0]);
                proposalSettings.executionDelay = uint64(newValues[1]);
                proposalSettings.quorum = uint128(newValues[2]);
            }

            _validateProposalSettings(proposalSettings);
        }

        ProposalSettings storage _internalProposalSettings = internalProposalSettings;

        _internalProposals[++latestInternalProposalId] = InternalProposal({
            proposalType: proposalType,
            core: ProposalCore({
                voteEnd: uint64(block.timestamp + _internalProposalSettings.duration),
                executeAfter: _internalProposalSettings.executionDelay,
                executed: false,
                quorum: _internalProposalSettings.quorum,
                votesFor: 0,
                votesAgainst: 0,
                snapshotId: uint56(govValidatorsToken.snapshot())
            }),
            descriptionURL: descriptionURL,
            newValues: newValues,
            userAddresses: users
        });

        emit InternalProposalCreated(
            latestInternalProposalId,
            descriptionURL,
            _internalProposalSettings.quorum,
            msg.sender
        );
    }

    function createExternalProposal(
        uint256 proposalId,
        ProposalSettings calldata proposalSettings
    ) external override onlyOwner {
        require(!_proposalExists(proposalId, false), "Validators: proposal already exists");
        _validateProposalSettings(proposalSettings);

        _externalProposals[proposalId] = ExternalProposal({
            core: ProposalCore({
                voteEnd: uint64(block.timestamp + proposalSettings.duration),
                executed: false,
                quorum: proposalSettings.quorum,
                executeAfter: proposalSettings.executionDelay,
                votesFor: 0,
                votesAgainst: 0,
                snapshotId: uint56(govValidatorsToken.snapshot())
            })
        });

        emit ExternalProposalCreated(proposalId, proposalSettings.quorum);
    }

    function changeBalances(
        uint256[] calldata newValues,
        address[] calldata userAddresses
    ) external override onlyOwner {
        _changeBalances(newValues, userAddresses);
    }

    function vote(
        uint256 proposalId,
        uint256 amount,
        bool isInternal,
        bool isVoteFor
    ) external override {
        require(_proposalExists(proposalId, isInternal), "Validators: proposal does not exist");

        ProposalCore storage core = _getCore(proposalId, isInternal);

        require(_getProposalState(core) == ProposalState.Voting, "Validators: not Voting state");

        uint256 balanceAt = govValidatorsToken.balanceOfAt(msg.sender, core.snapshotId);
        uint256 voted = addressVoted[proposalId][isInternal][msg.sender];

        require(balanceAt != 0, "Validators: caller is not the validator");
        require(amount + voted <= balanceAt, "Validators: excessive vote amount");

        addressVoted[proposalId][isInternal][msg.sender] += amount;

        if (isVoteFor) {
            core.votesFor += amount;
        } else {
            core.votesAgainst += amount;
        }

        if (_quorumReached(core)) {
            core.executeAfter += uint64(block.timestamp);
        }

        emit Voted(proposalId, msg.sender, amount, isInternal, isVoteFor);
    }

    function execute(uint256 proposalId) external override {
        require(_proposalExists(proposalId, true), "Validators: proposal does not exist");

        InternalProposal storage proposal = _internalProposals[proposalId];

        require(
            _getProposalState(proposal.core) == ProposalState.Succeeded,
            "Validators: not Succeeded state"
        );

        proposal.core.executed = true;

        ProposalType proposalType = proposal.proposalType;

        ProposalSettings memory proposalSettings = internalProposalSettings;

        if (proposalType == ProposalType.ChangeInternalDuration) {
            proposalSettings.duration = uint64(proposal.newValues[0]);
        } else if (proposalType == ProposalType.ChangeInternalExecutionDelay) {
            proposalSettings.executionDelay = uint64(proposal.newValues[0]);
        } else if (proposalType == ProposalType.ChangeInternalQuorum) {
            proposalSettings.quorum = uint128(proposal.newValues[0]);
        } else if (proposalType == ProposalType.ChangeInternalDurationAndExecutionDelayAndQuorum) {
            proposalSettings.duration = uint64(proposal.newValues[0]);
            proposalSettings.executionDelay = uint64(proposal.newValues[1]);
            proposalSettings.quorum = uint128(proposal.newValues[2]);
        } else {
            _changeBalances(proposal.newValues, proposal.userAddresses);
        }

        emit InternalProposalExecuted(proposalId, msg.sender);
    }

    function executeExternalProposal(uint256 proposalId) external override onlyOwner {
        _externalProposals[proposalId].core.executed = true;
    }

    function getExternalProposal(
        uint256 index
    ) external view override returns (ExternalProposal memory) {
        return _externalProposals[index];
    }

    function getInternalProposals(
        uint256 offset,
        uint256 limit
    ) external view override returns (InternalProposalView[] memory internalProposals) {
        uint256 to = (offset + limit).min(latestInternalProposalId).max(offset);

        internalProposals = new InternalProposalView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            internalProposals[i - offset] = InternalProposalView({
                proposal: _internalProposals[i + 1],
                proposalState: getProposalState(i + 1, true),
                requiredQuorum: getProposalRequiredQuorum(i + 1, true)
            });
        }
    }

    function getProposalState(
        uint256 proposalId,
        bool isInternal
    ) public view override returns (ProposalState) {
        if (!_proposalExists(proposalId, isInternal)) {
            return ProposalState.Undefined;
        }

        return
            isInternal
                ? _getProposalState(_internalProposals[proposalId].core)
                : _getProposalState(_externalProposals[proposalId].core);
    }

    function getProposalRequiredQuorum(
        uint256 proposalId,
        bool isInternal
    ) public view override returns (uint256) {
        ProposalCore storage core = _getCore(proposalId, isInternal);

        if (core.voteEnd == 0) {
            return 0;
        }

        return
            govValidatorsToken.totalSupplyAt(core.snapshotId).ratio(core.quorum, PERCENTAGE_100);
    }

    function isValidator(address user) public view override returns (bool) {
        return govValidatorsToken.balanceOf(user) > 0;
    }

    function _getProposalState(ProposalCore storage core) internal view returns (ProposalState) {
        if (core.executed) {
            return ProposalState.Executed;
        }

        if (_quorumReached(core)) {
            if (_votesForMoreThanAgainst(core)) {
                if (block.timestamp <= core.executeAfter) {
                    return ProposalState.Locked;
                }

                return ProposalState.Succeeded;
            }

            return ProposalState.Defeated;
        }

        if (core.voteEnd < block.timestamp) {
            return ProposalState.Defeated;
        }

        return ProposalState.Voting;
    }

    function _quorumReached(ProposalCore storage core) internal view returns (bool) {
        uint256 totalSupply = govValidatorsToken.totalSupplyAt(core.snapshotId);
        uint256 currentQuorum = PERCENTAGE_100.ratio(
            core.votesFor + core.votesAgainst,
            totalSupply
        );

        return currentQuorum >= core.quorum;
    }

    function _getCore(
        uint256 proposalId,
        bool isInternal
    ) internal view returns (ProposalCore storage) {
        return
            isInternal ? _internalProposals[proposalId].core : _externalProposals[proposalId].core;
    }

    function _proposalExists(uint256 proposalId, bool isInternal) internal view returns (bool) {
        ProposalCore storage core = _getCore(proposalId, isInternal);

        return core.voteEnd != 0;
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

    function _validateProposalSettings(ProposalSettings memory proposalSettings) internal pure {
        require(proposalSettings.duration > 0, "Validators: duration is zero");
        require(proposalSettings.quorum <= PERCENTAGE_100, "Validators: invalid quorum value");
        require(proposalSettings.quorum > 0, "Validators: invalid quorum value");
    }

    function _validateChangeBalances(
        uint256[] memory newValues,
        address[] memory userAddresses
    ) internal pure {
        require(newValues.length == userAddresses.length, "Validators: invalid array length");

        for (uint256 i = 0; i < userAddresses.length; i++) {
            require(userAddresses[i] != address(0), "Validators: invalid address");
        }
    }

    function _votesForMoreThanAgainst(ProposalCore storage core) internal view returns (bool) {
        return core.votesFor > core.votesAgainst;
    }

    function _onlyValidator() internal view {
        require(isValidator(msg.sender), "Validators: caller is not the validator");
    }
}
