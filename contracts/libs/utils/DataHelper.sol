// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library DataHelper {
    function getSelector(bytes calldata data) internal pure returns (bytes4 selector) {
        assembly {
            selector := calldataload(data.offset)
        }
    }

    function getFirstArgument(bytes calldata data) internal pure returns (address arg) {
        assembly {
            arg := calldataload(add(data.offset, 0x04))
        }
    }

    function getRevertMsg(bytes memory data) internal pure returns (string memory) {
        if (data.length < 68) {
            return "Transaction reverted silently";
        }

        assembly {
            data := add(data, 0x04)
        }

        return abi.decode(data, (string));
    }
}
