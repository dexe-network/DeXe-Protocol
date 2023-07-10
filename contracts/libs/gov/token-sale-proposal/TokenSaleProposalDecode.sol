// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/gov/proposals/ITokenSaleProposal.sol";

library TokenSaleProposalDecode {
    function decodeDAOVotes(
        ITokenSaleProposal.Tier storage tier
    ) internal view returns (uint256 amount) {
        ITokenSaleProposal.ParticipationDetails memory participationDetails = tier
            .tierInitParams
            .participationDetails;

        require(
            participationDetails.participationType ==
                ITokenSaleProposal.ParticipationType.DAOVotes,
            "TSP: wrong participation type"
        );

        amount = abi.decode(participationDetails.data, (uint256));
    }

    function decodeTokenLock(
        ITokenSaleProposal.Tier storage tier
    ) internal view returns (address token, uint256 amount) {
        ITokenSaleProposal.ParticipationDetails memory participationDetails = tier
            .tierInitParams
            .participationDetails;

        require(
            participationDetails.participationType ==
                ITokenSaleProposal.ParticipationType.TokenLock,
            "TSP: wrong participation type"
        );

        (token, amount) = abi.decode(participationDetails.data, (address, uint256));
    }

    function decodeNftLock(
        ITokenSaleProposal.Tier storage tier
    ) internal view returns (address token) {
        ITokenSaleProposal.ParticipationDetails memory participationDetails = tier
            .tierInitParams
            .participationDetails;

        require(
            participationDetails.participationType == ITokenSaleProposal.ParticipationType.NftLock,
            "TSP: wrong participation type"
        );

        token = abi.decode(participationDetails.data, (address));
    }
}
