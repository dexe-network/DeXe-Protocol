// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@spherex-xyz/contracts/src/ISphereXEngine.sol";

contract SphereXEngineMock is ISphereXEngine {
    bool public shouldRevert;

    function toggleRevert() external {
        shouldRevert = !shouldRevert;
    }

    function sphereXValidatePre(
        int256 num,
        address sender,
        bytes calldata data
    ) external override returns (bytes32[] memory returnData) {
        _revert();
    }

    function sphereXValidatePost(
        int256 num,
        uint256 gas,
        bytes32[] calldata valuesBefore,
        bytes32[] calldata valuesAfter
    ) external override {
        _revert();
    }

    function sphereXValidateInternalPre(
        int256 num
    ) external returns (bytes32[] memory returnData) {
        _revert();
    }

    function sphereXValidateInternalPost(
        int256 num,
        uint256 gas,
        bytes32[] calldata valuesBefore,
        bytes32[] calldata valuesAfter
    ) external {
        _revert();
    }

    function addAllowedSenderOnChain(address sender) external override {}

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return true;
    }

    function _revert() internal {
        require(!shouldRevert, "SphereXEngineMock: malicious tx");
    }
}
