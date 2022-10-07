// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/settings/IGovSettings.sol";

import "../../core/Globals.sol";

contract GovSettings is IGovSettings, OwnableUpgradeable {
    uint256 internal _newSettingsId;

    mapping(uint256 => ProposalSettings) public settings; // settingsId => info
    mapping(address => uint256) public executorToSettings; // executor => seetingsId

    function __GovSettings_init(
        address govPoolAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        address govUserKeeperAddress,
        ProposalSettings[] calldata proposalSettings,
        address[] calldata additionalProposalExecutors
    ) external initializer {
        __Ownable_init();

        uint256 systemExecutors = uint256(ExecutorType.VALIDATORS);
        uint256 settingsId;

        for (uint256 i = 0; i < proposalSettings.length; i++) {
            ProposalSettings calldata executorSettings = proposalSettings[i];

            _validateProposalSettings(executorSettings);

            settings[settingsId] = executorSettings;

            if (settingsId == uint256(ExecutorType.INTERNAL)) {
                executorToSettings[address(this)] = settingsId;
                executorToSettings[govPoolAddress] = settingsId;
                executorToSettings[govUserKeeperAddress] = settingsId;
            } else if (settingsId == uint256(ExecutorType.DISTRIBUTION)) {
                require(
                    !executorSettings.delegatedVotingAllowed && !executorSettings.earlyCompletion,
                    "GovSettings: invalid distribution settings"
                );

                executorToSettings[distributionProposalAddress] = settingsId;
            } else if (settingsId == uint256(ExecutorType.VALIDATORS)) {
                executorToSettings[validatorsAddress] = settingsId;
            } else if (settingsId > systemExecutors) {
                executorToSettings[
                    additionalProposalExecutors[settingsId - systemExecutors - 1]
                ] = settingsId;
            }

            settingsId++;
        }

        _newSettingsId = settingsId;
    }

    function addSettings(ProposalSettings[] calldata _settings) external override onlyOwner {
        uint256 settingsId = _newSettingsId;

        for (uint256 i; i < _settings.length; i++) {
            _validateProposalSettings(_settings[i]);

            settings[settingsId++] = _settings[i];
        }

        _newSettingsId = settingsId;
    }

    function editSettings(uint256[] calldata settingsIds, ProposalSettings[] calldata _settings)
        external
        override
        onlyOwner
    {
        for (uint256 i; i < _settings.length; i++) {
            require(_settingsExist(settingsIds[i]), "GovSettings: settings do not exist");

            _validateProposalSettings(_settings[i]);

            settings[settingsIds[i]] = _settings[i];
        }
    }

    function changeExecutors(address[] calldata executors, uint256[] calldata settingsIds)
        external
        override
        onlyOwner
    {
        for (uint256 i; i < executors.length; i++) {
            require(_settingsExist(settingsIds[i]), "GovSettings: settings do not exist");

            executorToSettings[executors[i]] = settingsIds[i];
        }
    }

    function _validateProposalSettings(ProposalSettings calldata _settings) internal pure {
        require(_settings.duration > 0, "GovSettings: invalid vote duration value");
        require(_settings.quorum <= PERCENTAGE_100, "GovSettings: invalid quorum value");
        require(
            _settings.durationValidators > 0,
            "GovSettings: invalid validator vote duration value"
        );
        require(
            _settings.quorumValidators <= PERCENTAGE_100,
            "GovSettings: invalid validator quorum value"
        );
    }

    function _settingsExist(uint256 settingsId) internal view returns (bool) {
        return settings[settingsId].duration > 0;
    }

    function getDefaultSettings() external view override returns (ProposalSettings memory) {
        return settings[uint256(ExecutorType.DEFAULT)];
    }

    function getSettings(address executor)
        external
        view
        override
        returns (ProposalSettings memory)
    {
        return settings[executorToSettings[executor]];
    }
}
