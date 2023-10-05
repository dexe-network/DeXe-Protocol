// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@spherex-dexe/contracts/ISphereXEngine.sol";

contract SphereXEngineMock is ISphereXEngine {
    function sphereXValidatePre(
        int256 num,
        address sender,
        bytes calldata data
    ) external override returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    function sphereXValidatePost(
        int256 num,
        uint256 gas,
        bytes32[] calldata valuesBefore,
        bytes32[] calldata valuesAfter
    ) external override {}

    function sphereXValidateInternalPre(int256 num) external override returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    function sphereXValidateInternalPost(
        int256 num,
        uint256 gas,
        bytes32[] calldata valuesBefore,
        bytes32[] calldata valuesAfter
    ) external override {}

    function addAllowedSenderOnChain(address sender) external override {}

    function supportsInterface(bytes4 interfaceId) external view override returns (bool) {
        return true;
    }
}
