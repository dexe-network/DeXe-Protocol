// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@spherex-xyz/contracts/src/SphereXProtectedBase.sol";

import "../../gov/GovPool.sol";

contract GovPoolMigration {
    address internal immutable DEPLOYER;

    constructor() {
        DEPLOYER = msg.sender;
    }

    modifier onlyDeployer() {
        _onlyDeployer();
        _;
    }

    function acceptSphereXAdmins(address[] calldata sphereXProxies) external onlyDeployer {
        for (uint256 i = 0; i < sphereXProxies.length; ++i) {
            SphereXProtectedBase(sphereXProxies[i]).acceptSphereXAdminRole();
        }
    }

    function _onlyDeployer() internal {
        require(msg.sender == DEPLOYER, "Gov: caller is not a deployer");
    }
}
