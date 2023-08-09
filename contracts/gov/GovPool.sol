// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";

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
import "../libs/gov/gov-pool/GovPoolStaking.sol";
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
    using GovPoolStaking for *;
    using DecimalsConverter for *;
    using TokenBalance for address;

    uint256 internal constant PERCENTAGE_MICROPOOL_REWARDS = PERCENTAGE_100 / 5; // 20%
    uint256 internal constant PERCENTAGE_TREASURY_REWARDS = (PERCENTAGE_100 * 809) / 50000; // 1.618%

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _distributionProposal;

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

    uint256 internal _regularVoteModifier;
    uint256 internal _expertVoteModifier;

    CreditInfo internal _creditInfo;

    OffChain internal _offChain;

    mapping(uint256 => Proposal) internal _proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(VoteType => VoteInfo))) internal _voteInfos; // proposalId => voter => VoteType => info
    mapping(address => mapping(VoteType => EnumerableSet.UintSet)) internal _votedInProposals; // voter => VoteType => active proposal ids

    mapping(address => PendingRewards) internal _pendingRewards; // user => pending rewards

    mapping(address => MicropoolInfo) internal _micropoolInfos;

    mapping(address => EnumerableSet.UintSet) internal _restrictedProposals; // voter => restricted proposal ids

    event Delegated(address from, address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event DelegatedTreasury(address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event Requested(address from, address to, uint256 amount, uint256[] nfts);
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
        address nftMultiplierAddress,
        uint256 regularVoteModifier,
        uint256 expertVoteModifier,
        address _verifier,
        bool _onlyBABTHolders,
        uint256 _deployerBABTid,
        string calldata _descriptionURL,
        string calldata _name
    ) external initializer {
        _govSettings = IGovSettings(govPoolDeps.settingsAddress);
        _govUserKeeper = IGovUserKeeper(govPoolDeps.userKeeperAddress);
        _govValidators = IGovValidators(govPoolDeps.validatorsAddress);
        _distributionProposal = govPoolDeps.distributionAddress;
        _expertNft = IERC721Expert(govPoolDeps.expertNftAddress);

        if (nftMultiplierAddress != address(0)) {
            _setNftMultiplierAddress(nftMultiplierAddress);
        }

        _changeVoteModifiers(regularVoteModifier, expertVoteModifier);

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
    }

    function unlock(address user, VoteType voteType) public override onlyBABTHolder {
        _unlock(user, voteType);
    }

    function execute(uint256 proposalId) public override onlyBABTHolder {
        _proposals.execute(proposalId);

        _updateRewards(proposalId, RewardType.Execute);
    }

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) public override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        _govUserKeeper.depositTokens.exec(receiver, amount);
        _govUserKeeper.depositNfts.exec(receiver, nftIds);

        emit Deposited(amount, nftIds, receiver);
    }

    function createProposal(
        string calldata _descriptionURL,
        string calldata misc,
        ProposalAction[] calldata actionsOnFor,
        ProposalAction[] calldata actionsOnAgainst
    ) external override onlyBABTHolder {
        uint256 proposalId = ++latestProposalId;

        _proposals.createProposal(
            _restrictedProposals,
            _descriptionURL,
            misc,
            actionsOnFor,
            actionsOnAgainst
        );

        _updateRewards(proposalId, RewardType.Create);
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        _proposals.moveProposalToValidators(proposalId);

        _updateRewards(proposalId, RewardType.Create);
    }

    function vote(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external override onlyBABTHolder {
        _unlock(msg.sender, VoteType.PersonalVote);

        uint256 reward = _proposals.vote(
            _votedInProposals,
            _voteInfos,
            _restrictedProposals,
            proposalId,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteFor : RewardType.VoteAgainst,
            reward
        );
    }

    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external override onlyBABTHolder {
        _unlock(msg.sender, VoteType.MicropoolVote);

        uint256 reward = _proposals.voteDelegated(
            _votedInProposals,
            _voteInfos,
            _restrictedProposals,
            proposalId,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        uint256 micropoolReward = reward.percentage(PERCENTAGE_MICROPOOL_REWARDS);

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            micropoolReward
        );

        _micropoolInfos[msg.sender].updateRewards(
            _proposals,
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            reward - micropoolReward
        );
    }

    function voteTreasury(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external onlyBABTHolder {
        _unlock(msg.sender, VoteType.TreasuryVote);

        uint256 reward = _proposals.voteTreasury(
            _votedInProposals,
            _voteInfos,
            _restrictedProposals,
            proposalId,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteForTreasury : RewardType.VoteAgainstTreasury,
            reward.percentage(PERCENTAGE_TREASURY_REWARDS)
        );
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        _unlock(msg.sender, VoteType.PersonalVote);

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

        _unlock(msg.sender, VoteType.PersonalVote);

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.stake(delegatee);

        _govUserKeeper.delegateTokens.exec(delegatee, amount);
        _govUserKeeper.delegateNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, true);
    }

    function delegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyThis {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");
        require(getExpertStatus(delegatee), "Gov: delegatee is not an expert");

        _unlock(msg.sender, VoteType.TreasuryVote);

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

        emit DelegatedTreasury(delegatee, amount, nftIds, true);
    }

    function request(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty request");

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.stake(delegatee);

        _govUserKeeper.requestTokens.exec(delegatee, amount);
        _govUserKeeper.requestNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Requested(msg.sender, delegatee, amount, nftIds);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _unlock(delegatee, VoteType.MicropoolVote);

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.unstake(delegatee);

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, false);
    }

    function undelegateTreasury(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyThis {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _unlock(msg.sender, VoteType.TreasuryVote);

        _govUserKeeper.undelegateTokensTreasury.exec(delegatee, amount);

        _govUserKeeper.undelegateNftsTreasury.exec(delegatee, nftIds);

        // TODO: we need to cancel delegatee's rewards and votes in proposals

        emit DelegatedTreasury(delegatee, amount, nftIds, false);
    }

    function claimRewards(uint256[] calldata proposalIds) external override onlyBABTHolder {
        for (uint256 i; i < proposalIds.length; i++) {
            _pendingRewards.claimReward(_proposals, proposalIds[i]);
        }
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

    function changeVoteModifiers(
        uint256 regularModifier,
        uint256 expertModifier
    ) external override onlyThis {
        _changeVoteModifiers(regularModifier, expertModifier);
    }

    function saveOffchainResults(
        string calldata resultsHash,
        bytes calldata signature
    ) external override onlyBABTHolder {
        resultsHash.saveOffchainResults(signature, _offChain);

        _updateRewards(0, RewardType.SaveOffchainResults);
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
            address distributionProposal
        )
    {
        return (
            address(_govSettings),
            address(_govUserKeeper),
            address(_govValidators),
            _distributionProposal
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
    ) external view override returns (uint256, uint256, uint256, uint256) {
        IGovPool.ProposalCore storage core = _proposals[proposalId].core;
        IGovPool.VoteInfo storage info = _voteInfos[proposalId][voter][voteType];

        return (core.votesFor, core.votesAgainst, info.totalVotedFor, info.totalVotedAgainst);
    }

    function getUserVotes(
        uint256 proposalId,
        address voter,
        VoteType voteType
    ) external view override returns (VoteInfoView memory voteInfo) {
        VoteInfo storage info = _voteInfos[proposalId][voter][voteType];

        return
            VoteInfoView({
                totalVotedFor: info.totalVotedFor,
                totalVotedAgainst: info.totalVotedAgainst,
                tokensVotedFor: info.tokensVotedFor,
                tokensVotedAgainst: info.tokensVotedAgainst,
                nftsVotedFor: info.nftsVotedFor.values(),
                nftsVotedAgainst: info.nftsVotedAgainst.values()
            });
    }

    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view override returns (uint256 tokens, uint256[] memory nfts) {
        return
            delegatee == address(0)
                ? delegator.getWithdrawableAssets(_votedInProposals, _voteInfos)
                : delegator.getUndelegateableAssets(delegatee, _votedInProposals, _voteInfos);
    }

    function getPendingRewards(
        address user,
        uint256[] calldata proposalIds
    ) external view override returns (PendingRewardsView memory) {
        return _pendingRewards.getPendingRewards(_proposals, user, proposalIds);
    }

    function getDelegatorStakingRewards(
        address delegator
    ) external view override returns (UserStakeRewardsView[] memory) {
        return _micropoolInfos.getDelegatorStakingRewards(delegator);
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

    function getVoteModifiers() external view override returns (uint256, uint256) {
        return (_regularVoteModifier, _expertVoteModifier);
    }

    function getVoteModifierForUser(address user) external view returns (uint256) {
        return getExpertStatus(user) ? _expertVoteModifier : _regularVoteModifier;
    }

    function _setNftMultiplierAddress(address nftMultiplierAddress) internal {
        require(_nftMultiplier == address(0), "Gov: current nft address isn't zero");
        require(nftMultiplierAddress != address(0), "Gov: new nft address is zero");

        _nftMultiplier = nftMultiplierAddress;
    }

    function _changeVoteModifiers(uint256 regularModifier, uint256 expertModifier) internal {
        require(
            regularModifier >= PRECISION && expertModifier >= PRECISION,
            "Gov: vote modifiers are less than 1"
        );

        _regularVoteModifier = regularModifier;
        _expertVoteModifier = expertModifier;
    }

    function _updateRewards(uint256 proposalId, RewardType rewardType) internal {
        _updateRewards(proposalId, rewardType, 0);
    }

    function _updateRewards(uint256 proposalId, RewardType rewardType, uint256 amount) internal {
        _pendingRewards.updateRewards(_proposals, proposalId, rewardType, amount);
    }

    function _unlock(address user, VoteType voteType) internal {
        _votedInProposals.unlockInProposals(
            _voteInfos,
            _votedInProposals[user][voteType].values(),
            user,
            voteType
        );
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
