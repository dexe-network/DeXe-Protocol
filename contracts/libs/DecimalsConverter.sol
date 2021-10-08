// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice the intention of this library is to be able to easily convert
/// one amount of tokens with N decimal places
/// to another amount with M decimal places
library DecimalsConverter {
    function convert(
        uint256 amount,
        uint256 baseDecimals,
        uint256 destinationDecimals
    ) internal pure returns (uint256) {
        if (baseDecimals > destinationDecimals) {
            amount = amount / 10**(baseDecimals - destinationDecimals);
        } else if (baseDecimals < destinationDecimals) {
            amount = amount * 10**(destinationDecimals - baseDecimals);
        }

        return amount;
    }

    function convertTo18(uint256 amount, uint256 baseDecimals) internal pure returns (uint256) {
        return convert(amount, baseDecimals, 18);
    }

    function convertFrom18(uint256 amount, uint256 destinationDecimals)
        internal
        pure
        returns (uint256)
    {
        return convert(amount, 18, destinationDecimals);
    }
}
