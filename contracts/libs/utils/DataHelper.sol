// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library DataHelper {
    function getSelector(bytes calldata data) internal pure returns (bytes4 selector) {
        assembly {
            selector := calldataload(data.offset)
        }
    }

    function decodeTreasuryFunction(
        bytes storage data
    ) internal pure returns (bytes4 selector, address user) {
        (selector, user, , ) = abi.decode(data, (bytes4, address, uint256, uint256[]));
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
