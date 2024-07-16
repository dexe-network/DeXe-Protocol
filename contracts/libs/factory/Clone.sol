// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Clone {
    // 61 PUSH2 deployed code size
    // 80 DUP1
    // 60 PUSH1 0c // deployed code offset
    // 60 PUSH1 00
    // 39 CODECOPY
    // 60 PUSH1 00
    // f3 RETURN
    bytes32 constant CREATION_CODE =
        hex"000000000000000000000000000000000000000061000080600c6000396000f3";

    function clone(address contractToClone) internal returns (address cloned) {
        bytes memory bytecode = contractToClone.code;
        uint256 bytecodeSize = bytecode.length;

        uint8 lowerByte = uint8(bytecodeSize);
        uint8 upperByte = uint8(bytecodeSize / 256);

        assembly {
            mstore(bytecode, CREATION_CODE)
            mstore8(add(bytecode, 22), lowerByte)
            mstore8(add(bytecode, 21), upperByte)

            cloned := create(0, add(bytecode, 20), add(bytecodeSize, 12))
        }

        _verifyResult(cloned);
    }

    function clone2(address contractToClone, bytes32 salt) internal returns (address cloned) {
        bytes memory bytecode = contractToClone.code;
        uint256 bytecodeSize = bytecode.length;
        uint8 lowerByte = uint8(bytecodeSize);
        uint8 upperByte = uint8(bytecodeSize / 256);

        assembly {
            mstore(bytecode, CREATION_CODE)
            mstore8(add(bytecode, 22), lowerByte)
            mstore8(add(bytecode, 21), upperByte)

            cloned := create2(0, add(bytecode, 20), add(bytecodeSize, 12), salt)
        }

        _verifyResult(cloned);
    }

    function predictClonedAddress(
        address contractToClone,
        bytes32 salt
    ) internal view returns (address clonedAddress) {
        bytes memory originalBytecode = contractToClone.code;
        bytes12 creationCodeNotPadded = bytes12(uint96(uint256(CREATION_CODE)));

        bytes memory bytecode = abi.encodePacked(creationCodeNotPadded, originalBytecode);
        bytecode[2] = bytes1(uint8(originalBytecode.length));
        bytecode[1] = bytes1(uint8(originalBytecode.length / 256));

        clonedAddress = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(hex"ff", address(this), salt, keccak256(bytecode)))
                )
            )
        );
    }

    // Covers both cases either deploy failed (cloned == zero) of deploy finised with zero bytecode
    function _verifyResult(address cloned) private view {
        require(cloned.code.length != 0, "Clone: deploy failed");
    }
}
