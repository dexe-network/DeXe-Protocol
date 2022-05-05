// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/settings/IGovSettings.sol";

import "../../core/Globals.sol";

contract GovSettings is IGovSettings, OwnableUpgradeable {
    uint256 private constant _INTERNAL_SETTINGS_ID = 1;
    uint256 private constant _UNTYPED_SETTINGS_ID = 2;

    uint256 private _latestSettingsId;

    mapping(uint256 => ProposalSettings) public settings;
    mapping(address => uint256) public executorToSettings;

    function __GovSettings_init(
        ProposalSettings calldata internalProposalSetting,
        ProposalSettings calldata untypedProposalSetting
    ) external initializer {
        __Ownable_init();

        _validateProposalSettings(internalProposalSetting);
        _validateProposalSettings(untypedProposalSetting);

        settings[_INTERNAL_SETTINGS_ID] = internalProposalSetting;
        settings[_UNTYPED_SETTINGS_ID] = untypedProposalSetting;

        executorToSettings[address(this)] = _INTERNAL_SETTINGS_ID;

        _latestSettingsId += 2;
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
        address owner = owner();

        for (uint256 i; i < executors.length; i++) {
            if (settingsIds[i] == _INTERNAL_SETTINGS_ID || executors[i] == owner) {
                continue;
            }

            executorToSettings[executors[i]] = settingsIds[i];
        }
    }

    function _validateProposalSettings(ProposalSettings memory _settings) private pure {
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

    function executorInfo(address executor)
        public
        view
        returns (
            uint256,
            bool,
            bool
        )
    {
        uint256 settingsId = executorToSettings[executor];

        return
            settingsId == 0
                ? (0, false, false)
                : (settingsId, settingsId == _INTERNAL_SETTINGS_ID, _settingsExist(settingsId));
    }

    function getSettings(address executor)
        external
        view
        override
        returns (ProposalSettings memory)
    {
        (uint256 settingsId, bool isInternal, bool isSettingsSet) = executorInfo(executor);

        if (isInternal) {
            return settings[_INTERNAL_SETTINGS_ID];
        }

        if (isSettingsSet) {
            return settings[settingsId];
        }

        return settings[_UNTYPED_SETTINGS_ID];
    }
}
