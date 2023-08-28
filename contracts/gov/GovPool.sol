// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "@solarity/solidity-lib/contracts-registry/AbstractDependant.sol";

import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/gov/IGovPool.sol";
import "../interfaces/gov/ERC721/IERC721Expert.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/ISBT721.sol";
import "../interfaces/factory/IPoolFactory.sol";

import "../libs/gov/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/gov/gov-pool/GovPoolView.sol";
import "../libs/gov/gov-pool/GovPoolCreate.sol";
import "../libs/gov/gov-pool/GovPoolRewards.sol";
import "../libs/gov/gov-pool/GovPoolVote.sol";
import "../libs/gov/gov-pool/GovPoolUnlock.sol";
import "../libs/gov/gov-pool/GovPoolExecute.sol";
import "../libs/gov/gov-pool/GovPoolMicropool.sol";
import "../libs/gov/gov-pool/GovPoolCredit.sol";
import "../libs/gov/gov-pool/GovPoolOffchain.sol";
import "../libs/math/MathHelper.sol";

import "../core/Globals.sol";

contract GovPool is
    IGovPool,
    AbstractDependant,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable,
    Multicall
{
    using MathHelper for uint256;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using GovPoolOffchain for *;
    using GovUserKeeperLocal for *;
    using GovPoolView for *;
    using GovPoolCreate for *;
    using GovPoolRewards for *;
    using GovPoolVote for *;
    using GovPoolUnlock for *;
    using GovPoolExecute for *;
    using GovPoolCredit for *;
    using GovPoolMicropool for *;
    using DecimalsConverter for *;
    using TokenBalance for address;

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _poolRegistry;
    address internal _votePowerContract;

    ICoreProperties public coreProperties;

    address internal _nftMultiplier;
    IERC721Expert internal _expertNft;
    IERC721Expert internal _dexeExpertNft;
    ISBT721 internal _babt;

    bool public onlyBABTHolders;

    string public descriptionURL;
    string public name;

    uint256 public latestProposalId;
    uint256 public deployerBABTid;

    CreditInfo internal _creditInfo;

    OffChain internal _offChain;

    mapping(uint256 => Proposal) internal _proposals; // proposalId => info

    mapping(uint256 => mapping(address => VoteInfo)) internal _voteInfos; // proposalId => voter => info
    mapping(address => EnumerableSet.UintSet) internal _votedInProposals; // voter => active proposal ids

    mapping(address => PendingRewards) internal _pendingRewards; // user => pending rewards

    mapping(address => MicropoolInfo) internal _micropoolInfos; // delegatee => info

    mapping(address => EnumerableSet.UintSet) internal _restrictedProposals; // voter => restricted proposal ids

    event Delegated(address from, address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event DelegatedTreasury(address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event Deposited(uint256 amount, uint256[] nfts, address sender);
    event Withdrawn(uint256 amount, uint256[] nfts, address sender);

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    modifier onlyBABTHolder() {
        _onlyBABTHolder();
        _;
    }

    modifier onlyValidatorContract() {
        _onlyValidatorContract();
        _;
    }

    function __GovPool_init(
        Dependencies calldata govPoolDeps,
        address _verifier,
        bool _onlyBABTHolders,
        uint256 _deployerBABTid,
        string calldata _descriptionURL,
        string calldata _name
    ) external initializer {
        _govSettings = IGovSettings(govPoolDeps.settingsAddress);
        _govUserKeeper = IGovUserKeeper(govPoolDeps.userKeeperAddress);
        _govValidators = IGovValidators(govPoolDeps.validatorsAddress);
        _expertNft = IERC721Expert(govPoolDeps.expertNftAddress);
        _nftMultiplier = govPoolDeps.nftMultiplierAddress;
        _votePowerContract = govPoolDeps.votePowerAddress;

        onlyBABTHolders = _onlyBABTHolders;
        deployerBABTid = _deployerBABTid;

        descriptionURL = _descriptionURL;
        name = _name;

        _offChain.verifier = _verifier;
    }

    function setDependencies(address contractsRegistry, bytes memory) public override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
        _babt = ISBT721(registry.getBABTContract());
        _dexeExpertNft = IERC721Expert(registry.getDexeExpertNftContract());
        _poolRegistry = registry.getPoolRegistryContract();
    }

    function unlock(address user) public override onlyBABTHolder {
        _unlock(user);
    }

    function execute(uint256 proposalId) public override onlyBABTHolder {
        _updateRewards(proposalId, msg.sender, RewardType.Execute);

        _proposals.execute(proposalId);
    }

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        _govUserKeeper.depositTokens.exec(receiver, amount);
        _govUserKeeper.depositNfts.exec(receiver, nftIds);

        emit Deposited(amount, nftIds, receiver);
    }

    function createProposal(
        string calldata _descriptionURL,
        ProposalAction[] calldata actionsOnFor,
        ProposalAction[] calldata actionsOnAgainst
    ) external override onlyBABTHolder {
        uint256 proposalId = ++latestProposalId;

        _proposals.createProposal(
            _restrictedProposals,
            _descriptionURL,
            actionsOnFor,
            actionsOnAgainst
        );

        _updateRewards(proposalId, msg.sender, RewardType.Create);
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        _proposals.moveProposalToValidators(proposalId);

        _updateRewards(proposalId, msg.sender, RewardType.Create);
    }

    function vote(
        uint256 proposalId,
        bool isVoteFor,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override onlyBABTHolder {
        _unlock(msg.sender);

        Votes memory votes = _proposals.vote(
            _votedInProposals,
            _voteInfos,
            _restrictedProposals,
            proposalId,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        _updateVotingRewards(proposalId, msg.sender, isVoteFor, votes);
    }

    function cancelVote(uint256 proposalId) external override onlyBABTHolder {
        _unlock(msg.sender);

        _proposals.cancelVote(_votedInProposals, _voteInfos, proposalId);

        _cancelVotingRewards(proposalId, msg.sender);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        _unlock(msg.sender);

        _govUserKeeper.withdrawTokens.exec(receiver, amount);
        _govUserKeeper.withdrawNfts.exec(receiver, nftIds);

        emit Withdrawn(amount, nftIds, receiver);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");
        require(msg.sender != delegatee, "Gov: delegator's equal delegatee");

        _unlock(msg.sender);
        _unlock(delegatee);

        _govUserKeeper.delegateTokens.exec(delegatee, amount);
        _govUserKeeper.delegateNfts.exec(delegatee, nftIds);

        _micropoolInfos[delegatee].saveDelegationInfo(delegatee);

        _revoteDelegated(delegatee, VoteType.MicropoolVote);

        emit Delegated(msg.sender, delegatee, amount, nftIds, true);
    }

    function delegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyThis {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");
        require(getExpertStatus(delegatee), "Gov: delegatee is not an expert");

        _unlock(delegatee);

        if (amount != 0) {
            address token = _govUserKeeper.tokenAddress();

            IERC20(token).transfer(address(_govUserKeeper), amount.from18(token.decimals()));

            _govUserKeeper.delegateTokensTreasury(delegatee, amount);
        }

        if (nftIds.length != 0) {
            IERC721 nft = IERC721(_govUserKeeper.nftAddress());

            for (uint256 i; i < nftIds.length; i++) {
                nft.safeTransferFrom(address(this), address(_govUserKeeper), nftIds[i]);
            }

            _govUserKeeper.delegateNftsTreasury(delegatee, nftIds);
        }

        _revoteDelegated(delegatee, VoteType.TreasuryVote);

        emit DelegatedTreasury(delegatee, amount, nftIds, true);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _unlock(delegatee);

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        _micropoolInfos[delegatee].saveDelegationInfo(delegatee);

        _revoteDelegated(delegatee, VoteType.MicropoolVote);

        emit Delegated(msg.sender, delegatee, amount, nftIds, false);
    }

    function undelegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyThis {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _unlock(msg.sender);

        _govUserKeeper.undelegateTokensTreasury.exec(delegatee, amount);
        _govUserKeeper.undelegateNftsTreasury.exec(delegatee, nftIds);

        _revoteDelegated(delegatee, VoteType.TreasuryVote);

        emit DelegatedTreasury(delegatee, amount, nftIds, false);
    }

    function claimRewards(uint256[] calldata proposalIds) external override onlyBABTHolder {
        for (uint256 i; i < proposalIds.length; i++) {
            _pendingRewards.claimReward(_proposals, proposalIds[i]);
        }
    }

    function claimMicropoolRewards(
        uint256[] calldata proposalIds,
        address delegatee
    ) external override onlyBABTHolder {
        _micropoolInfos[delegatee].claim(_proposals, _voteInfos, proposalIds, delegatee);
    }

    function editDescriptionURL(string calldata newDescriptionURL) external override onlyThis {
        descriptionURL = newDescriptionURL;
    }

    function changeVerifier(address newVerifier) external override onlyThis {
        _offChain.verifier = newVerifier;
    }

    function changeBABTRestriction(bool onlyBABT) external override onlyThis {
        onlyBABTHolders = onlyBABT;
    }

    function setNftMultiplierAddress(address nftMultiplierAddress) external override onlyThis {
        _setNftMultiplierAddress(nftMultiplierAddress);
    }

    function setCreditInfo(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external override onlyThis {
        _creditInfo.setCreditInfo(tokens, amounts);
    }

    function transferCreditAmount(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address destination
    ) external override onlyValidatorContract {
        _creditInfo.transferCreditAmount(tokens, amounts, destination);
    }

    function saveOffchainResults(
        string calldata resultsHash,
        bytes calldata signature
    ) external override onlyBABTHolder {
        resultsHash.saveOffchainResults(signature, _offChain);

        _updateRewards(0, msg.sender, RewardType.SaveOffchainResults);
    }

    receive() external payable {}

    function getProposalState(uint256 proposalId) public view override returns (ProposalState) {
        return _proposals.getProposalState(proposalId);
    }

    function getHelperContracts()
        external
        view
        override
        returns (
            address settings,
            address userKeeper,
            address validators,
            address poolRegistry,
            address votePower
        )
    {
        return (
            address(_govSettings),
            address(_govUserKeeper),
            address(_govValidators),
            _poolRegistry,
            _votePowerContract
        );
    }

    function getNftContracts()
        external
        view
        override
        returns (address nftMultiplier, address expertNft, address dexeExpertNft, address babt)
    {
        return (_nftMultiplier, address(_expertNft), address(_dexeExpertNft), address(_babt));
    }

    function getProposals(
        uint256 offset,
        uint256 limit
    ) external view override returns (ProposalView[] memory proposals) {
        return _proposals.getProposals(offset, limit);
    }

    function getUserActiveProposalsCount(address user) external view override returns (uint256) {
        return _votedInProposals[user].length();
    }

    function getProposalRequiredQuorum(
        uint256 proposalId
    ) external view override returns (uint256) {
        ProposalCore storage core = _proposals[proposalId].core;

        if (core.voteEnd == 0) {
            return 0;
        }

        return _govUserKeeper.getTotalVoteWeight().ratio(core.settings.quorum, PERCENTAGE_100);
    }

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        VoteType voteType
    ) external view override returns (uint256, uint256, uint256, bool) {
        require(voteType != VoteType.DelegatedVote, "Gov: use personal");

        ProposalCore storage core = _proposals[proposalId].core;
        VoteInfo storage info = _voteInfos[proposalId][voter];

        return (core.votesFor, core.votesAgainst, info.getVoteShare(voteType), info.isVoteFor);
    }

    function getUserVotes(
        uint256 proposalId,
        address voter,
        VoteType voteType
    ) external view override returns (VoteInfoView memory voteInfo) {
        VoteInfo storage info = _voteInfos[proposalId][voter];
        VotePower storage power = info.votePowers[voteType];

        return
            VoteInfoView({
                isVoteFor: info.isVoteFor,
                totalVoted: info.totalVoted,
                tokensVoted: power.tokensVoted,
                powerVoted: power.powerVoted,
                nftsVoted: power.nftsVoted.values()
            });
    }

    function getWithdrawableAssets(
        address delegator
    ) external view override returns (uint256 tokens, uint256[] memory nfts) {
        return delegator.getWithdrawableAssets(_votedInProposals, _voteInfos);
    }

    function getPendingRewards(
        address user,
        uint256[] calldata proposalIds
    ) external view override returns (PendingRewardsView memory) {
        return _pendingRewards.getPendingRewards(_proposals, user, proposalIds);
    }

    function getDelegatorRewards(
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view override returns (DelegatorRewards memory) {
        return
            _micropoolInfos[delegatee].getDelegatorRewards(
                _proposals,
                _voteInfos,
                proposalIds,
                delegator,
                delegatee
            );
    }

    function getCreditInfo() external view override returns (CreditInfoView[] memory) {
        return _creditInfo.getCreditInfo();
    }

    function getOffchainInfo()
        external
        view
        override
        returns (address validator, string memory resultsHash)
    {
        return (_offChain.verifier, _offChain.resultsHash);
    }

    function getOffchainSignHash(
        string calldata resultHash
    ) external view override returns (bytes32) {
        return resultHash.getSignHash();
    }

    function getExpertStatus(address user) public view override returns (bool) {
        return _expertNft.isExpert(user) || _dexeExpertNft.isExpert(user);
    }

    function _setNftMultiplierAddress(address nftMultiplierAddress) internal {
        _nftMultiplier = nftMultiplierAddress;
    }

    function _updateRewards(uint256 proposalId, address user, RewardType rewardType) internal {
        _updateRewards(proposalId, user, rewardType, 0);
    }

    function _updateRewards(
        uint256 proposalId,
        address user,
        RewardType rewardType,
        uint256 amount
    ) internal {
        _pendingRewards.updateRewards(_proposals, proposalId, user, rewardType, amount);
    }

    function _updateVotingRewards(
        uint256 proposalId,
        address voter,
        bool isVoteFor,
        Votes memory votes
    ) internal {
        _updateRewards(
            proposalId,
            voter,
            isVoteFor ? RewardType.VoteFor : RewardType.VoteAgainst,
            votes.personal
        );
        _updateRewards(
            proposalId,
            voter,
            isVoteFor ? RewardType.VoteForTreasury : RewardType.VoteAgainstTreasury,
            votes.treasury
        );

        RewardType micropoolRewardType = isVoteFor
            ? RewardType.VoteForDelegated
            : RewardType.VoteAgainstDelegated;

        _updateRewards(proposalId, voter, micropoolRewardType, votes.micropool);

        _micropoolInfos[voter].updateRewards(
            _proposals,
            proposalId,
            votes.micropool,
            micropoolRewardType
        );
    }

    function _cancelVotingRewards(uint256 proposalId, address voter) internal {
        _pendingRewards.cancelVotingRewards(_proposals, proposalId, voter);
    }

    function _unlock(address user) internal {
        _votedInProposals.unlockInProposals(_voteInfos, user);
    }

    function _revoteDelegated(address delegatee, VoteType voteType) internal {
        uint256[] memory proposalIds = _votedInProposals[delegatee].values();

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            Votes memory votes = _proposals.revoteDelegated(
                _voteInfos,
                _votedInProposals,
                proposalId,
                delegatee,
                voteType
            );

            _cancelVotingRewards(proposalId, delegatee);
            _updateVotingRewards(
                proposalId,
                delegatee,
                _voteInfos[proposalId][delegatee].isVoteFor,
                votes
            );
        }
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "Gov: not this contract");
    }

    function _onlyValidatorContract() internal view {
        require(address(_govValidators) == msg.sender, "Gov: not the validators contract");
    }

    function _onlyBABTHolder() internal view {
        require(!onlyBABTHolders || _babt.balanceOf(msg.sender) > 0, "Gov: not BABT holder");
    }
}
