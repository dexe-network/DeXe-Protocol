// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Create2.sol";

import "../../gov/ERC20/ERC20Sale.sol";
import "../../gov/ERC721/ERC721Expert.sol";
import "../../gov/ERC721/ERC721Multiplier.sol";

library GovTokenDeployer {
    string internal constant EXPERT_NAME_POSTFIX = (" Expert Nft");
    string internal constant EXPERT_SYMBOL_POSTFIX = (" EXPNFT");

    string internal constant NFT_MULTIPLIER_NAME_POSTFIX = (" NFT Multiplier");
    string internal constant NFT_MULTIPLIER_SYMBOL_POSTFIX = (" MULTIPLIER");

    function deployToken(
        address poolProxy,
        address tokenSaleProxy,
        bytes32 salt,
        ERC20Sale.ConstructorParams calldata tokenParams
    ) external returns (address) {
        ERC20Sale token = new ERC20Sale{salt: salt}();

        token.__ERC20Sale_init(poolProxy, tokenSaleProxy, tokenParams);

        return address(token);
    }

    function predictTokenAddress(bytes32 salt) external view returns (address) {
        bytes32 bytecodeHash = keccak256(type(ERC20Sale).creationCode);

        return Create2.computeAddress(salt, bytecodeHash);
    }

    function deployExpertNft(address poolProxy, string calldata name_) external returns (address) {
        ERC721Expert nft = new ERC721Expert();

        nft.__ERC721Expert_init(
            concatStrings(name_, EXPERT_NAME_POSTFIX),
            concatStrings(name_, EXPERT_SYMBOL_POSTFIX)
        );
        nft.transferOwnership(poolProxy);

        return address(nft);
    }

    function deployNftMultiplier(
        address poolProxy,
        string calldata name_
    ) external returns (address) {
        ERC721Multiplier nft = new ERC721Multiplier();

        nft.__ERC721Multiplier_init(
            concatStrings(name_, NFT_MULTIPLIER_NAME_POSTFIX),
            concatStrings(name_, NFT_MULTIPLIER_SYMBOL_POSTFIX)
        );
        nft.transferOwnership(poolProxy);

        return address(nft);
    }

    function concatStrings(
        string calldata a,
        string memory b
    ) internal pure returns (string memory) {
        // TODO: rewrite when compiler version will be updated
        return string(abi.encodePacked(a, b));
    }
}
