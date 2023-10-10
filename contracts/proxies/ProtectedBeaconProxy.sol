// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "@spherex-xyz/contracts/src/SphereXProtectedProxy.sol";
import "@spherex-xyz/contracts/src/ISphereXEngine.sol";
import "@spherex-xyz/contracts/src/ProtectedProxies/ISphereXBeacon.sol";

contract ProtectedBeaconProxy is SphereXProtectedProxy, BeaconProxy {
    constructor(
        address sphereXAdmin,
        address sphereXOperator,
        address beacon,
        bytes memory data
    ) SphereXProtectedProxy(sphereXAdmin, sphereXOperator, address(0)) BeaconProxy(beacon, data) {}

    function _delegate(
        address implementation
    ) internal virtual override(Proxy, SphereXProtectedProxy) {
        SphereXProtectedProxy._delegate(implementation);
    }

    function _before(address engine) private returns (ModifierLocals memory locals) {
        locals.storageSlots = ISphereXEngine(engine).sphereXValidatePre(
            int256(uint256(uint32(msg.sig))),
            msg.sender,
            msg.data
        );
        locals.valuesBefore = _readStorage(locals.storageSlots);
        locals.gas = gasleft();
    }

    function _after(address engine, ModifierLocals memory locals) private {
        uint256 gas = locals.gas - gasleft();
        bytes32[] memory valuesAfter;
        valuesAfter = _readStorage(locals.storageSlots);

        ISphereXEngine(engine).sphereXValidatePost(
            -int256(uint256(uint32(msg.sig))),
            gas,
            locals.valuesBefore,
            valuesAfter
        );
    }

    function _fallback() internal virtual override {
        (address implementation, address engine, bool isProtectedFunctionSig) = ISphereXBeacon(
            _getBeacon()
        ).protectedImplementation(msg.sig);

        if (!isProtectedFuncSig || engine == address(0)) {
            super._delegate(implementation);
        }

        ModifierLocals memory locals = _before(engine);

        bytes memory returnData = Address.functionDelegateCall(implementation, msg.data);

        _after(engine, locals);

        uint256 returnDataSize = returnData.length;

        assembly {
            return(add(returnData, 0x20), returnDataSize)
        }
    }
}
