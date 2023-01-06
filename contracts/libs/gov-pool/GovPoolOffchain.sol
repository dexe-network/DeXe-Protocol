// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";

import "../../gov/GovPool.sol";

import "../utils/TokenBalance.sol";

import "../math/MathHelper.sol";

library GovPoolOffchain {
    using MathHelper for uint256;
    using Math for uint256;
    using ECDSA for bytes32;
    using TokenBalance for address;

    function saveOffchainResults(
        bytes32[] calldata hashes,
        bytes calldata signature,
        IGovPool.OffChain storage offChain
    ) external {
        bytes32 signHash_ = getSignHash(hashes);

        require(!offChain.usedHashes[signHash_], "Gov: already used");
        require(
            signHash_.toEthSignedMessageHash().recover(signature) == offChain.verifier,
            "Gov: invalid signer"
        );

        for (uint256 i; i < hashes.length; i++) {
            offChain.hashes.push(hashes[i]);
        }

        offChain.usedHashes[signHash_] = true;

        /// @dev rewards
        GovPool govPool = GovPool(payable(address(this)));
        (address settingsAddress, , , ) = govPool.getHelperContracts();

        IGovSettings.ProposalSettings memory internalSettings = IGovSettings(settingsAddress)
            .getInternalSettings();

        require(
            internalSettings.rewardToken.normThisBalance() >= internalSettings.executionReward,
            "Gov: not enough balance"
        );

        internalSettings.rewardToken.sendFunds(msg.sender, internalSettings.executionReward);

        /// @dev commission
        (, uint256 commissionPercentage, , address[3] memory commissionReceivers) = govPool
            .coreProperties()
            .getDEXECommissionPercentages();

        if (commissionReceivers[1] == address(this)) {
            return;
        }

        uint256 commission = internalSettings.rewardToken.normThisBalance().min(
            internalSettings.executionReward.percentage(commissionPercentage)
        );

        internalSettings.rewardToken.sendFunds(commissionReceivers[1], commission);
    }

    function getSignHash(bytes32[] calldata hashes) public view returns (bytes32) {
        return keccak256(abi.encodePacked(hashes, block.chainid, address(this)));
    }
}
