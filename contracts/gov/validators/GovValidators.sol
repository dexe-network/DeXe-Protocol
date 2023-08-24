// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/validators/IGovValidators.sol";
import "../../interfaces/gov/IGovPool.sol";

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

    mapping(uint256 => mapping(bool => mapping(address => mapping(bool => uint256))))
        public addressVoted; // proposalId => isInternal => user => isVoteFor => voted amount

    event ExternalProposalCreated(uint256 proposalId, uint256 quorum);
    event InternalProposalCreated(
        uint256 proposalId,
        string proposalDescription,
        uint256 quorum,
        address sender
    );
    event InternalProposalExecuted(uint256 proposalId, address executor);

    event Voted(
        uint256 proposalId,
        address sender,
        uint256 vote,
        bool isInternal,
        bool isVoteFor,
        bool isVote
    );
    event ChangedValidatorsBalances(address[] validators, uint256[] newBalance);

    /// @dev Access only for addresses that have validator tokens
    modifier onlyValidator() {
        _onlyValidator();
        _;
    }

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    modifier onlyThisOrGovPool() {
        _onlyThisOrGovPool();
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
        bytes calldata data
    ) external override onlyValidator {
        _validateInternalProposal(proposalType, data);

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
            data: data
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

    function changeSettings(
        uint64 duration,
        uint64 executionDelay,
        uint128 quorum
    ) external override onlyThis {
        ProposalSettings storage proposalSettings = internalProposalSettings;

        proposalSettings.duration = duration;
        proposalSettings.executionDelay = executionDelay;
        proposalSettings.quorum = quorum;
    }

    function changeBalances(
        uint256[] calldata newValues,
        address[] calldata userAddresses
    ) external override onlyThisOrGovPool {
        _changeBalances(newValues, userAddresses);
    }

    function monthlyWithdraw(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address destination
    ) external override onlyThis {
        IGovPool(owner()).transferCreditAmount(tokens, amounts, destination);
    }

    receive() external payable onlyThis {}

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
        uint256 voted = addressVoted[proposalId][isInternal][msg.sender][isVoteFor];

        require(balanceAt != 0, "Validators: caller is not the validator");
        require(amount + voted <= balanceAt, "Validators: excessive vote amount");

        addressVoted[proposalId][isInternal][msg.sender][isVoteFor] += amount;

        if (isVoteFor) {
            core.votesFor += amount;
        } else {
            core.votesAgainst += amount;
        }

        if (_quorumReached(core)) {
            core.executeAfter += uint64(block.timestamp);
        }

        emit Voted(proposalId, msg.sender, amount, isInternal, isVoteFor, true);
    }

    function cancelVote(uint256 proposalId, bool isInternal) external {
        require(_proposalExists(proposalId, isInternal), "Validators: proposal does not exist");

        ProposalCore storage core = _getCore(proposalId, isInternal);

        require(_getProposalState(core) == ProposalState.Voting, "Validators: not Voting state");

        mapping(bool => uint256) storage votedInProposal = addressVoted[proposalId][isInternal][
            msg.sender
        ];

        uint256 amount = votedInProposal[false];

        bool isVoteFor;

        if (amount == 0) {
            amount = votedInProposal[true];

            if (amount == 0) {
                return;
            }

            isVoteFor = true;
        }

        delete votedInProposal[isVoteFor];

        if (isVoteFor) {
            core.votesFor -= amount;
        } else {
            core.votesAgainst -= amount;
        }

        emit Voted(proposalId, msg.sender, amount, isInternal, isVoteFor, false);
    }

    function execute(uint256 proposalId) external override {
        require(_proposalExists(proposalId, true), "Validators: proposal does not exist");

        InternalProposal storage proposal = _internalProposals[proposalId];

        require(
            _getProposalState(proposal.core) == ProposalState.Succeeded,
            "Validators: not Succeeded state"
        );

        proposal.core.executed = true;

        (bool success, ) = address(this).call(proposal.data);
        require(success, "Validators: failed to execute");

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

    function _votesForMoreThanAgainst(ProposalCore storage core) internal view returns (bool) {
        return core.votesFor > core.votesAgainst;
    }

    function _onlyValidator() internal view {
        require(isValidator(msg.sender), "Validators: caller is not the validator");
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "Validators: not this contract");
    }

    function _onlyThisOrGovPool() internal view {
        require(
            address(this) == msg.sender || owner() == msg.sender,
            "Validators: not this nor GovPool contract"
        );
    }

    function _validateInternalProposal(
        ProposalType proposalType,
        bytes calldata data
    ) internal pure {
        if (proposalType == ProposalType.OffchainProposal) {
            require(data.length == 0, "Validators: offchain proposal should not have data");
            return;
        }

        bytes4 selector = bytes4(data);
        bytes calldata packedData = data[4:];

        if (proposalType == ProposalType.ChangeBalances) {
            require(
                selector == IGovValidators.changeBalances.selector,
                "Validators: not ChangeBalances function"
            );
            (uint256[] memory newValues, address[] memory users) = _getBalanceInfoFromData(
                packedData
            );

            _validateChangeBalances(newValues, users);
        } else if (proposalType == ProposalType.ChangeSettings) {
            require(
                selector == IGovValidators.changeSettings.selector,
                "Validators: not ChangeSettings function"
            );
            (
                uint64 duration,
                uint64 executionDelay,
                uint128 quorum
            ) = _getValidatorSettingsFromData(packedData);

            ProposalSettings memory proposalSettings = ProposalSettings({
                duration: duration,
                executionDelay: executionDelay,
                quorum: quorum
            });

            _validateProposalSettings(proposalSettings);
        } else {
            require(
                selector == IGovValidators.monthlyWithdraw.selector,
                "Validators: not MonthlyWithdraw function"
            );
            (
                address[] memory tokens,
                uint256[] memory amounts,
                address destination
            ) = _getCreditInfoFromData(packedData);

            _validateMonthlyWithdraw(tokens, amounts, destination);
        }
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

    function _validateMonthlyWithdraw(
        address[] memory tokens,
        uint256[] memory amounts,
        address destination
    ) internal pure {
        uint256 tokensLength = tokens.length;

        require(amounts.length == tokensLength, "Validators: invalid array length");

        for (uint256 i = 0; i < tokensLength; i++) {
            require(tokens[i] != address(0), "Validators: address of token cannot be zero");
        }

        require(destination != address(0), "Validators: destination address cannot be zero");
    }

    function _getValidatorSettingsFromData(
        bytes memory _data
    ) internal pure returns (uint64 duration, uint64 executionDelay, uint128 quorum) {
        (duration, executionDelay, quorum) = abi.decode(_data, (uint64, uint64, uint128));
    }

    function _getBalanceInfoFromData(
        bytes memory _data
    ) internal pure returns (uint256[] memory newValues, address[] memory userAddresses) {
        (newValues, userAddresses) = abi.decode(_data, (uint256[], address[]));
    }

    function _getCreditInfoFromData(
        bytes memory _data
    )
        internal
        pure
        returns (address[] memory tokens, uint256[] memory amounts, address destination)
    {
        (tokens, amounts, destination) = abi.decode(_data, (address[], uint256[], address));
    }
}
