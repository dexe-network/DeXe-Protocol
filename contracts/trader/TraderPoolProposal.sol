// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/core/IPriceFeed.sol";

import "../libs/DecimalsConverter.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

contract TraderPoolProposal is ERC1155SupplyUpgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;

    IPriceFeed internal _priceFeed;

    struct ParentTraderPoolInfo {
        address parentTraderPoolAddress;
        address trader;
        address baseToken;
        uint8 baseTokenDecimals;
    }

    struct ProposalInfo {
        address token;
        uint256 timestampLimit;
        uint256 investBaseLimit;
        uint256 investedBase;
        uint256 balanceBase;
        uint256 balancePosition;
    }

    struct InvestmentInfo {
        uint256 investedLP;
        uint256 investedBase;
    }

    ParentTraderPoolInfo internal _parentTraderPoolInfo;

    uint256 internal _proposalsTotalNum;

    mapping(uint256 => ProposalInfo) internal _proposalInfos; // proposal id => info

    mapping(address => EnumerableSet.UintSet) internal _investedProposals; // user => proposals
    mapping(address => mapping(uint256 => InvestmentInfo)) internal _investmentsInfos; // user => proposal id => investment info
    mapping(address => InvestmentInfo) internal _totalInvestmentsInfos; // user => investment info

    modifier onlyParentTraderPool() {
        require(
            msg.sender == _parentTraderPoolInfo.parentTraderPoolAddress,
            "TPP: not a ParentPool"
        );
        _;
    }

    function __TraderPoolProposal_init(ParentTraderPoolInfo calldata parentTraderPoolInfo)
        external
        initializer
    {
        __ERC1155_init("");

        _parentTraderPoolInfo = parentTraderPoolInfo;
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
    }

    function _transferAndMintLP(
        uint256 proposalNum,
        address to,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) internal {
        address parentPool = _parentTraderPoolInfo.parentTraderPoolAddress;
        uint256 baseInvesmentConverted = baseInvestment.convertFrom18(
            _parentTraderPoolInfo.baseTokenDecimals
        );

        IERC20(parentPool).safeTransferFrom(to, address(this), lpInvestment);
        IERC20(_parentTraderPoolInfo.baseToken).safeTransferFrom(
            parentPool,
            address(this),
            baseInvesmentConverted
        );

        uint256 totalSupply = totalSupply(proposalNum);
        uint256 toMint;

        if (totalSupply == 0) {
            toMint = baseInvestment;
        } else {
            toMint = (baseInvestment * _getBaseInProposal(proposalNum)) / totalSupply;
        }

        _mint(to, proposalNum, toMint, "");
    }

    function createProposal(
        address token,
        uint256 timestampLimit,
        uint256 investBaseLimit,
        uint256 lpInvestment,
        uint256 baseInvestment,
        bool instantTrade
    ) external onlyParentTraderPool {
        require(timestampLimit == 0 || timestampLimit >= block.timestamp, "TPP: wrong timestamp");
        require(
            investBaseLimit == 0 || investBaseLimit >= baseInvestment,
            "TPP: wrong investment limit"
        );

        uint256 proposalsTotalNum = _proposalsTotalNum + 1;

        address baseToken = _parentTraderPoolInfo.baseToken;
        address trader = _parentTraderPoolInfo.trader;

        _transferAndMintLP(proposalsTotalNum, trader, lpInvestment, baseInvestment);

        _checkPriceFeedAllowance(baseToken);
        _checkPriceFeedAllowance(token);

        _investmentsInfos[trader][proposalsTotalNum] = InvestmentInfo(
            lpInvestment,
            baseInvestment
        );

        _totalInvestmentsInfos[trader].investedLP += lpInvestment;
        _totalInvestmentsInfos[trader].investedBase += baseInvestment;

        _proposalInfos[proposalsTotalNum] = ProposalInfo(
            token,
            timestampLimit,
            investBaseLimit,
            baseInvestment,
            baseInvestment,
            0
        );

        if (instantTrade) {
            _proposalInfos[proposalsTotalNum].balancePosition = _priceFeed.exchangeTo(
                baseToken,
                token,
                baseInvestment.convertFrom18(_parentTraderPoolInfo.baseTokenDecimals)
            );
            _proposalInfos[proposalsTotalNum].balanceBase = 0;
        }

        _investedProposals[trader].add(proposalsTotalNum);

        _proposalsTotalNum = proposalsTotalNum;
    }

    function _getInvestmentPercentage(
        uint256 proposalId,
        address who,
        uint256 toBeInvested
    ) internal view returns (uint256) {
        uint256 traderLPBalance = _totalInvestmentsInfos[who].investedLP +
            IERC20(_parentTraderPoolInfo.parentTraderPoolAddress).balanceOf(who);

        return
            ((_investmentsInfos[who][proposalId].investedLP + toBeInvested) * PERCENTAGE_100) /
            traderLPBalance;
    }

    // TODO parentPool has to exchange every position asset to base token proportionally to LP invested, then call this function
    // otherwise we are breaking pool shares
    function investProposal(
        uint256 proposalId,
        address user,
        uint256 lpInvestment,
        uint256 baseInvestment
    ) external onlyParentTraderPool {
        require(proposalId <= _proposalsTotalNum, "TPP: proposal doesn't exist");
        require(
            block.timestamp <= _proposalInfos[proposalId].timestampLimit,
            "TPP: proposal is closed"
        );
        require(
            _proposalInfos[proposalId].investedBase + baseInvestment <=
                _proposalInfos[proposalId].investBaseLimit,
            "TPP: proposal is overinvested"
        );

        address trader = _parentTraderPoolInfo.trader;

        if (user != trader) {
            uint256 traderPercentage = _getInvestmentPercentage(proposalId, trader, 0);
            uint256 userPercentage = _getInvestmentPercentage(proposalId, user, lpInvestment);

            require(userPercentage <= traderPercentage, "TPP: investing more than trader");
        }

        _transferAndMintLP(proposalId, user, lpInvestment, baseInvestment);

        _investmentsInfos[user][proposalId].investedLP += lpInvestment;
        _investmentsInfos[user][proposalId].investedBase += baseInvestment;

        _totalInvestmentsInfos[user].investedLP += lpInvestment;
        _totalInvestmentsInfos[user].investedBase += baseInvestment;

        _proposalInfos[proposalId].balanceBase += baseInvestment;

        _investedProposals[user].add(proposalId);
    }

    function _getBaseInProposal(uint256 proposalId) internal view returns (uint256) {
        uint256 balancePositionConverted = _proposalInfos[proposalId]
            .balancePosition
            .convertFrom18(ERC20(_proposalInfos[proposalId].token).decimals());

        return
            _proposalInfos[proposalId].balanceBase +
            _priceFeed
                .getPriceIn(
                    _proposalInfos[proposalId].token,
                    _parentTraderPoolInfo.baseToken,
                    balancePositionConverted
                )
                .convertTo18(_parentTraderPoolInfo.baseTokenDecimals);
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(_priceFeed)) == 0) {
            IERC20(token).safeApprove(address(_priceFeed), MAX_UINT);
        }
    }
}
