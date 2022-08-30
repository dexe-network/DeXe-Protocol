// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/settings/IGovSettings.sol";

import "../../core/Globals.sol";

contract GovSettings is IGovSettings, OwnableUpgradeable {
    uint256 private constant _INTERNAL_SETTINGS_ID = 1;
    uint256 private constant _DISTRIBUTION_PROPOSAL_SETTINGS_ID = 2;
    uint256 private constant _VALIDATORS_BALANCES_ID = 3;
    uint256 private constant _DEFAULT_SETTINGS_ID = 4;

    uint256 private _latestSettingsId;

    mapping(uint256 => ProposalSettings) public settings; // settingsId => info
    mapping(address => uint256) public executorToSettings; // executor => seetingsId

    function __GovSettings_init(
        address govPoolAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        address govUserKeeperAddress,
        ProposalSettings calldata internalProposalSetting,
        ProposalSettings calldata distributionProposalSettings,
        ProposalSettings calldata validatorsBalancesSettings,
        ProposalSettings calldata defaultProposalSetting
    ) external initializer {
        __Ownable_init();

        require(
            !distributionProposalSettings.delegatedVotingAllowed,
            "GovSettings: Distribution proposal settings delegatedVotingAllowed"
        );

        _validateProposalSettings(internalProposalSetting);
        _validateProposalSettings(distributionProposalSettings);
        _validateProposalSettings(defaultProposalSetting);

        settings[_INTERNAL_SETTINGS_ID] = internalProposalSetting;
        settings[_DISTRIBUTION_PROPOSAL_SETTINGS_ID] = distributionProposalSettings;
        settings[_VALIDATORS_BALANCES_ID] = validatorsBalancesSettings;
        settings[_DEFAULT_SETTINGS_ID] = defaultProposalSetting;

        executorToSettings[address(this)] = _INTERNAL_SETTINGS_ID;
        executorToSettings[distributionProposalAddress] = _DISTRIBUTION_PROPOSAL_SETTINGS_ID;
        executorToSettings[validatorsAddress] = _VALIDATORS_BALANCES_ID;
        executorToSettings[govPoolAddress] = _INTERNAL_SETTINGS_ID;
        executorToSettings[govUserKeeperAddress] = _INTERNAL_SETTINGS_ID;

        _latestSettingsId = 4;
    }

    function addSettings(ProposalSettings[] calldata _settings) external override onlyOwner {
        uint256 settingsId = _latestSettingsId;

        for (uint256 i; i < _settings.length; i++) {
            _validateProposalSettings(_settings[i]);

            settings[++settingsId] = _settings[i];
        }

        _latestSettingsId = settingsId;
    }

    function editSettings(uint256[] calldata settingsIds, ProposalSettings[] calldata _settings)
        external
        override
        onlyOwner
    {
        for (uint256 i; i < _settings.length; i++) {
            if (!_settingsExist(settingsIds[i])) {
                continue;
            }

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
            if (settingsIds[i] == _INTERNAL_SETTINGS_ID || executors[i] == address(this)) {
                continue;
            }

            executorToSettings[executors[i]] = settingsIds[i];
        }
    }

    function _validateProposalSettings(ProposalSettings calldata _settings) private pure {
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

    function _settingsExist(uint256 settingsId) private view returns (bool) {
        return settings[settingsId].duration > 0;
    }

    function executorInfo(address executor) public view returns (uint256, ExecutorType) {
        uint256 settingsId = executorToSettings[executor];

        if (settingsId == 0) {
            return (0, ExecutorType.NONE);
        } else if (settingsId == _INTERNAL_SETTINGS_ID) {
            return (settingsId, ExecutorType.INTERNAL);
        } else if (settingsId == _DISTRIBUTION_PROPOSAL_SETTINGS_ID) {
            return (settingsId, ExecutorType.DISTRIBUTION);
        } else if (settingsId == _VALIDATORS_BALANCES_ID) {
            return (settingsId, ExecutorType.VALIDATORS);
        } else if (_settingsExist(settingsId)) {
            return (settingsId, ExecutorType.TRUSTED);
        } else {
            return (settingsId, ExecutorType.NONE);
        }
    }

    function getDefaultSettings() external view override returns (ProposalSettings memory) {
        return settings[_DEFAULT_SETTINGS_ID];
    }

    function getSettings(address executor)
        external
        view
        override
        returns (ProposalSettings memory)
    {
        (uint256 settingsId, ExecutorType executorType) = executorInfo(executor);

        if (executorType == ExecutorType.INTERNAL) {
            return settings[_INTERNAL_SETTINGS_ID];
        } else if (executorType == ExecutorType.DISTRIBUTION) {
            return settings[_DISTRIBUTION_PROPOSAL_SETTINGS_ID];
        } else if (executorType == ExecutorType.VALIDATORS) {
            return settings[_VALIDATORS_BALANCES_ID];
        } else if (executorType == ExecutorType.TRUSTED) {
            return settings[settingsId];
        }

        return settings[_DEFAULT_SETTINGS_ID];
    }
}
