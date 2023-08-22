// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";
import "@solarity/solidity-lib/libs/arrays/Paginator.sol";
import "@solarity/solidity-lib/libs/arrays/ArrayHelper.sol";

import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/IGovPool.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/gov/gov-user-keeper/GovUserKeeperView.sol";

import "../ERC721/ERC721Power.sol";

contract GovUserKeeper is IGovUserKeeper, OwnableUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using ArrayHelper for uint256[];
    using Paginator for EnumerableSet.UintSet;
    using DecimalsConverter for *;
    using GovUserKeeperView for *;

    address public tokenAddress;
    address public nftAddress;

    NFTInfo internal _nftInfo;

    uint256 internal _latestPowerSnapshotId;

    mapping(address => UserInfo) internal _usersInfo; // user => info
    mapping(address => BalanceInfo) internal _micropoolsInfo; // user = micropool address => balance info
    mapping(address => BalanceInfo) internal _treasuryPoolsInfo; // user => balance info

    mapping(uint256 => uint256) internal _nftLockedNums; // tokenId => locked num

    mapping(uint256 => uint256) public nftSnapshot; // snapshot id => totalNftsPower

    event SetERC20(address token);
    event SetERC721(address token);

    modifier withSupportedToken() {
        _withSupportedToken();
        _;
    }

    modifier withSupportedNft() {
        _withSupportedNft();
        _;
    }

    function __GovUserKeeper_init(
        address _tokenAddress,
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) external initializer {
        __Ownable_init();
        __ERC721Holder_init();

        require(_tokenAddress != address(0) || _nftAddress != address(0), "GovUK: zero addresses");

        if (_nftAddress != address(0)) {
            _setERC721Address(_nftAddress, totalPowerInTokens, nftsTotalSupply);
        }

        if (_tokenAddress != address(0)) {
            _setERC20Address(_tokenAddress);
        }
    }

    function depositTokens(
        address payer,
        address receiver,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        address token = tokenAddress;

        IERC20(token).safeTransferFrom(payer, address(this), amount.from18(token.decimals()));

        _usersInfo[receiver].balanceInfo.tokenBalance += amount;
    }

    function withdrawTokens(
        address payer,
        address receiver,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        UserInfo storage payerInfo = _usersInfo[payer];
        BalanceInfo storage payerBalanceInfo = payerInfo.balanceInfo;

        address token = tokenAddress;
        uint256 balance = payerBalanceInfo.tokenBalance;
        uint256 maxTokensLocked = payerInfo.maxTokensLocked;

        require(
            amount <= balance.max(maxTokensLocked) - maxTokensLocked,
            "GovUK: can't withdraw this"
        );

        payerBalanceInfo.tokenBalance = balance - amount;

        IERC20(token).safeTransfer(receiver, amount.from18(token.decimals()));
    }

    function delegateTokens(
        address delegator,
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        BalanceInfo storage delegatorBalanceInfo = delegatorInfo.balanceInfo;

        uint256 balance = delegatorBalanceInfo.tokenBalance;
        uint256 maxTokensLocked = delegatorInfo.maxTokensLocked;

        require(amount <= balance.max(maxTokensLocked) - maxTokensLocked, "GovUK: overdelegation");

        delegatorInfo.delegatedTokens[delegatee] += amount;
        delegatorBalanceInfo.tokenBalance = balance - amount;

        _micropoolsInfo[delegatee].tokenBalance += amount;

        delegatorInfo.delegatees.add(delegatee);
    }

    function delegateTokensTreasury(
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        _treasuryPoolsInfo[delegatee].tokenBalance += amount;
    }

    function undelegateTokens(
        address delegator,
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        UserInfo storage delegatorInfo = _usersInfo[delegator];

        require(
            amount <= delegatorInfo.delegatedTokens[delegatee],
            "GovUK: amount exceeds delegation"
        );

        _micropoolsInfo[delegatee].tokenBalance -= amount;

        delegatorInfo.balanceInfo.tokenBalance += amount;
        delegatorInfo.delegatedTokens[delegatee] -= amount;

        _cleanDelegatee(delegatorInfo, delegatee);
    }

    function undelegateTokensTreasury(
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        BalanceInfo storage delegateeBalanceInfo = _treasuryPoolsInfo[delegatee];

        uint256 balance = delegateeBalanceInfo.tokenBalance;

        require(amount <= balance, "GovUK: can't withdraw this");

        delegateeBalanceInfo.tokenBalance = balance - amount;

        address token = tokenAddress;

        IERC20(token).safeTransfer(msg.sender, amount.from18(token.decimals()));
    }

    function depositNfts(
        address payer,
        address receiver,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        EnumerableSet.UintSet storage receiverNftBalance = _usersInfo[receiver]
            .balanceInfo
            .nftBalance;

        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            nft.safeTransferFrom(payer, address(this), nftId);

            receiverNftBalance.add(nftId);
        }
    }

    function withdrawNfts(
        address payer,
        address receiver,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        EnumerableSet.UintSet storage payerNftBalance = _usersInfo[payer].balanceInfo.nftBalance;

        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            require(
                payerNftBalance.contains(nftId) && _nftLockedNums[nftId] == 0,
                "GovUK: NFT is not owned or locked"
            );

            payerNftBalance.remove(nftId);

            nft.safeTransferFrom(address(this), receiver, nftId);
        }
    }

    function delegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        EnumerableSet.UintSet storage delegatorNftBalance = delegatorInfo.balanceInfo.nftBalance;

        EnumerableSet.UintSet storage delegatedNfts = delegatorInfo.delegatedNfts[delegatee];
        EnumerableSet.UintSet storage delegateeNftBalance = _micropoolsInfo[delegatee].nftBalance;

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            require(
                delegatorNftBalance.contains(nftId) && _nftLockedNums[nftId] == 0,
                "GovUK: NFT is not owned or locked"
            );

            delegatorNftBalance.remove(nftId);

            delegatedNfts.add(nftId);

            delegateeNftBalance.add(nftId);

            delegatorInfo.delegatees.add(delegatee);
        }
    }

    function delegateNftsTreasury(
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        EnumerableSet.UintSet storage delegateeNftBalance = _treasuryPoolsInfo[delegatee]
            .nftBalance;

        for (uint256 i; i < nftIds.length; i++) {
            delegateeNftBalance.add(nftIds[i]);
        }
    }

    function undelegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        EnumerableSet.UintSet storage delegatorNftBalance = delegatorInfo.balanceInfo.nftBalance;

        EnumerableSet.UintSet storage delegatedNfts = delegatorInfo.delegatedNfts[delegatee];
        EnumerableSet.UintSet storage delegateeNftBalance = _micropoolsInfo[delegatee].nftBalance;

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            require(
                delegatedNfts.contains(nftId) && _nftLockedNums[nftId] == 0,
                "GovUK: NFT is not owned or locked"
            );

            delegateeNftBalance.remove(nftId);

            delegatorNftBalance.add(nftId);
            delegatedNfts.remove(nftId);
        }

        _cleanDelegatee(delegatorInfo, delegatee);
    }

    function undelegateNftsTreasury(
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        EnumerableSet.UintSet storage delegateeNftBalance = _treasuryPoolsInfo[delegatee]
            .nftBalance;

        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            require(delegateeNftBalance.remove(nftId), "GovUK: NFT is not owned");

            nft.safeTransferFrom(address(this), msg.sender, nftId);
        }
    }

    function createNftPowerSnapshot() external override onlyOwner returns (uint256) {
        IERC721Power nftContract = IERC721Power(nftAddress);

        if (address(nftContract) == address(0)) {
            return 0;
        }

        uint256 currentPowerSnapshotId = ++_latestPowerSnapshotId;
        uint256 power;

        if (_nftInfo.isSupportPower) {
            power = nftContract.totalPower();
        } else if (_nftInfo.totalSupply == 0) {
            power = nftContract.totalSupply();
        } else {
            power = _nftInfo.totalSupply;
        }

        nftSnapshot[currentPowerSnapshotId] = power;

        return currentPowerSnapshotId;
    }

    function updateMaxTokenLockedAmount(
        uint256[] calldata lockedProposals,
        address voter
    ) external override onlyOwner {
        UserInfo storage voterInfo = _usersInfo[voter];

        uint256 lockedAmount = voterInfo.maxTokensLocked;
        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(voterInfo.lockedInProposals[lockedProposals[i]]);

            if (newLockedAmount == lockedAmount) {
                break;
            }
        }

        voterInfo.maxTokensLocked = newLockedAmount;
    }

    function lockTokens(
        uint256 proposalId,
        address voter,
        uint256 amount
    ) external override onlyOwner {
        UserInfo storage voterInfo = _usersInfo[voter];

        voterInfo.lockedInProposals[proposalId] += amount;
        voterInfo.maxTokensLocked = voterInfo.maxTokensLocked.max(
            voterInfo.lockedInProposals[proposalId]
        );
    }

    function unlockTokens(
        uint256 proposalId,
        address voter,
        uint256 amount
    ) external override onlyOwner {
        _usersInfo[voter].lockedInProposals[proposalId] -= amount;
    }

    function lockNfts(
        address voter,
        IGovPool.VoteType voteType,
        uint256[] calldata nftIds
    ) external override onlyOwner {
        UserInfo storage voterInfo = _usersInfo[voter];

        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            bool hasNft = voterInfo.balanceInfo.nftBalance.contains(nftId);

            if (!hasNft && voteType == IGovPool.VoteType.DelegatedVote) {
                uint256 delegateeLength = voterInfo.delegatees.length();

                for (uint256 j; j < delegateeLength; j++) {
                    if (voterInfo.delegatedNfts[voterInfo.delegatees.at(j)].contains(nftId)) {
                        hasNft = true;
                        break;
                    }
                }
            }

            require(hasNft, "GovUK: NFT is not owned");

            _nftLockedNums[nftId]++;
        }
    }

    function unlockNfts(uint256[] calldata nftIds) external override onlyOwner {
        for (uint256 i; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];

            require(_nftLockedNums[nftId] > 0, "GovUK: NFT is not locked");

            _nftLockedNums[nftId]--;
        }
    }

    function updateNftPowers(uint256[] calldata nftIds) external override onlyOwner {
        if (!_nftInfo.isSupportPower) {
            return;
        }

        ERC721Power nftContract = ERC721Power(nftAddress);

        for (uint256 i = 0; i < nftIds.length; i++) {
            nftContract.recalculateNftPower(nftIds[i]);
        }
    }

    function setERC20Address(address _tokenAddress) external override onlyOwner {
        _setERC20Address(_tokenAddress);
    }

    function setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) external override onlyOwner {
        _setERC721Address(_nftAddress, totalPowerInTokens, nftsTotalSupply);
    }

    function getNftInfo() external view override returns (NFTInfo memory) {
        return _nftInfo;
    }

    function maxLockedAmount(address voter) external view override returns (uint256) {
        return _usersInfo[voter].maxTokensLocked;
    }

    function tokenBalance(
        address voter,
        IGovPool.VoteType voteType
    ) public view override returns (uint256 totalBalance, uint256 ownedBalance) {
        if (tokenAddress == address(0)) {
            return (0, 0);
        }

        totalBalance = _getBalanceInfoStorage(voter, voteType).tokenBalance;

        if (
            voteType != IGovPool.VoteType.PersonalVote &&
            voteType != IGovPool.VoteType.DelegatedVote
        ) {
            return (totalBalance, 0);
        }

        if (voteType == IGovPool.VoteType.DelegatedVote) {
            UserInfo storage userInfo = _usersInfo[voter];

            uint256 delegateeLength = userInfo.delegatees.length();

            for (uint256 i; i < delegateeLength; i++) {
                totalBalance += userInfo.delegatedTokens[userInfo.delegatees.at(i)];
            }
        }

        ownedBalance = ERC20(tokenAddress).balanceOf(voter).to18(tokenAddress.decimals());
        totalBalance += ownedBalance;
    }

    function nftBalance(
        address voter,
        IGovPool.VoteType voteType
    ) public view override returns (uint256 totalBalance, uint256 ownedBalance) {
        if (nftAddress == address(0)) {
            return (0, 0);
        }

        totalBalance = _getBalanceInfoStorage(voter, voteType).nftBalance.length();

        if (
            voteType != IGovPool.VoteType.PersonalVote &&
            voteType != IGovPool.VoteType.DelegatedVote
        ) {
            return (totalBalance, 0);
        }

        if (voteType == IGovPool.VoteType.DelegatedVote) {
            UserInfo storage userInfo = _usersInfo[voter];

            uint256 delegateeLength = userInfo.delegatees.length();

            for (uint256 i; i < delegateeLength; i++) {
                totalBalance += userInfo.delegatedNfts[userInfo.delegatees.at(i)].length();
            }
        }

        ownedBalance = ERC721Upgradeable(nftAddress).balanceOf(voter);
        totalBalance += ownedBalance;
    }

    function nftExactBalance(
        address voter,
        IGovPool.VoteType voteType
    ) public view override returns (uint256[] memory nfts, uint256 ownedLength) {
        uint256 length;
        (length, ownedLength) = nftBalance(voter, voteType);

        if (length == 0) {
            return (nfts, 0);
        }

        uint256 currentLength;
        nfts = new uint256[](length);

        currentLength = nfts.insert(
            currentLength,
            _getBalanceInfoStorage(voter, voteType).nftBalance.values()
        );

        if (
            voteType != IGovPool.VoteType.PersonalVote &&
            voteType != IGovPool.VoteType.DelegatedVote
        ) {
            return (nfts, 0);
        }

        if (voteType == IGovPool.VoteType.DelegatedVote) {
            UserInfo storage userInfo = _usersInfo[voter];

            uint256 delegateeLength = userInfo.delegatees.length();

            for (uint256 i; i < delegateeLength; i++) {
                currentLength = nfts.insert(
                    currentLength,
                    userInfo.delegatedNfts[userInfo.delegatees.at(i)].values()
                );
            }
        }

        if (_nftInfo.totalSupply == 0) {
            ERC721Power nftContract = ERC721Power(nftAddress);

            for (uint256 i; i < ownedLength; i++) {
                nfts[currentLength++] = nftContract.tokenOfOwnerByIndex(voter, i);
            }
        }
    }

    function getNftsPowerInTokensBySnapshot(
        uint256[] memory nftIds,
        uint256 snapshotId
    ) public view override returns (uint256) {
        uint256 totalNftsPower = nftSnapshot[snapshotId];

        ERC721Power nftContract = ERC721Power(nftAddress);

        if (address(nftContract) == address(0) || totalNftsPower == 0) {
            return 0;
        }

        uint256 totalPowerInTokens = _nftInfo.totalPowerInTokens;
        uint256 nftsPower;

        if (!_nftInfo.isSupportPower) {
            nftsPower = nftIds.length.ratio(totalPowerInTokens, totalNftsPower);
        } else {
            for (uint256 i; i < nftIds.length; i++) {
                nftsPower += totalPowerInTokens.ratio(
                    nftContract.getNftPower(nftIds[i]),
                    totalNftsPower
                );
            }
        }

        /// @dev In the case of the custom ERC721Power, the power function can increase
        return nftsPower.min(totalPowerInTokens);
    }

    function getTotalVoteWeight() external view override returns (uint256) {
        address token = tokenAddress;

        return
            (token != address(0) ? IERC20(token).totalSupply().to18(token.decimals()) : 0) +
            _nftInfo.totalPowerInTokens;
    }

    function canCreate(
        address voter,
        IGovPool.VoteType voteType,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view override returns (bool) {
        (uint256 tokens, uint256 ownedBalance) = tokenBalance(voter, voteType);
        (uint256 tokensMicropool, ) = tokenBalance(voter, IGovPool.VoteType.MicropoolVote);
        (uint256 tokensTreasury, ) = tokenBalance(voter, IGovPool.VoteType.TreasuryVote);

        tokens = tokens + tokensMicropool + tokensTreasury - ownedBalance;

        if (tokens >= requiredVotes) {
            return true;
        }

        (uint256[] memory nftIds, uint256 owned) = nftExactBalance(voter, voteType);
        (uint256[] memory nftIdsMicropool, ) = nftExactBalance(
            voter,
            IGovPool.VoteType.MicropoolVote
        );
        (uint256[] memory nftIdsTreasury, ) = nftExactBalance(
            voter,
            IGovPool.VoteType.TreasuryVote
        );

        nftIds.crop(nftIds.length - owned);

        uint256 nftPower = getNftsPowerInTokensBySnapshot(nftIds, snapshotId) +
            getNftsPowerInTokensBySnapshot(nftIdsMicropool, snapshotId) +
            getNftsPowerInTokensBySnapshot(nftIdsTreasury, snapshotId);

        return tokens + nftPower >= requiredVotes;
    }

    function canVote(
        address voter,
        IGovPool.VoteType voteType,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view override returns (bool) {
        (uint256 tokens, ) = tokenBalance(voter, voteType);
        (uint256 tokensMicropool, ) = tokenBalance(voter, IGovPool.VoteType.MicropoolVote);
        (uint256 tokensTreasury, ) = tokenBalance(voter, IGovPool.VoteType.TreasuryVote);

        tokens = tokens + tokensMicropool + tokensTreasury;

        if (tokens >= requiredVotes) {
            return true;
        }

        (uint256[] memory nftIds, ) = nftExactBalance(voter, voteType);
        (uint256[] memory nftIdsMicropool, ) = nftExactBalance(
            voter,
            IGovPool.VoteType.MicropoolVote
        );
        (uint256[] memory nftIdsTreasury, ) = nftExactBalance(
            voter,
            IGovPool.VoteType.TreasuryVote
        );

        uint256 nftPower = getNftsPowerInTokensBySnapshot(nftIds, snapshotId) +
            getNftsPowerInTokensBySnapshot(nftIdsMicropool, snapshotId) +
            getNftsPowerInTokensBySnapshot(nftIdsTreasury, snapshotId);

        return tokens + nftPower >= requiredVotes;
    }

    function votingPower(
        address[] calldata users,
        IGovPool.VoteType[] calldata voteTypes
    ) external view override returns (VotingPowerView[] memory votingPowers) {
        return users.votingPower(voteTypes);
    }

    function nftVotingPower(
        uint256[] memory nftIds
    ) external view override returns (uint256 nftPower, uint256[] memory perNftPower) {
        return nftIds.nftVotingPower();
    }

    function delegations(
        address user
    ) external view override returns (uint256 power, DelegationInfoView[] memory delegationsInfo) {
        return _usersInfo[user].delegations();
    }

    function getWithdrawableAssets(
        address voter,
        uint256[] calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        external
        view
        override
        returns (uint256 withdrawableTokens, uint256[] memory withdrawableNfts)
    {
        return
            lockedProposals.getWithdrawableAssets(unlockedNfts, _usersInfo[voter], _nftLockedNums);
    }

    function getDelegatedAssets(
        address delegator,
        address delegatee
    ) external view override returns (uint256 tokenAmount, uint256[] memory nftIds) {
        UserInfo storage delegatorInfo = _usersInfo[delegator];

        return (
            delegatorInfo.delegatedTokens[delegatee],
            delegatorInfo.delegatedNfts[delegatee].values()
        );
    }

    function _cleanDelegatee(UserInfo storage delegatorInfo, address delegatee) internal {
        if (
            delegatorInfo.delegatedTokens[delegatee] == 0 &&
            delegatorInfo.delegatedNfts[delegatee].length() == 0
        ) {
            delegatorInfo.delegatees.remove(delegatee);
        }
    }

    function _setERC20Address(address _tokenAddress) internal {
        require(tokenAddress == address(0), "GovUK: current token address isn't zero");
        require(_tokenAddress != address(0), "GovUK: new token address is zero");

        tokenAddress = _tokenAddress;

        emit SetERC20(_tokenAddress);
    }

    function _setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) internal {
        require(nftAddress == address(0), "GovUK: current token address isn't zero");
        require(_nftAddress != address(0), "GovUK: new token address is zero");
        require(totalPowerInTokens > 0, "GovUK: the equivalent is zero");

        _nftInfo.totalPowerInTokens = totalPowerInTokens;

        if (IERC165(_nftAddress).supportsInterface(type(IERC721Power).interfaceId)) {
            _nftInfo.isSupportPower = true;
        } else if (
            !IERC165(_nftAddress).supportsInterface(type(IERC721EnumerableUpgradeable).interfaceId)
        ) {
            require(uint128(nftsTotalSupply) > 0, "GovUK: total supply is zero");

            _nftInfo.totalSupply = uint128(nftsTotalSupply);
        }

        nftAddress = _nftAddress;

        emit SetERC721(_nftAddress);
    }

    function _getBalanceInfoStorage(
        address voter,
        IGovPool.VoteType voteType
    ) internal view returns (BalanceInfo storage) {
        if (voteType == IGovPool.VoteType.MicropoolVote) {
            return _micropoolsInfo[voter];
        }

        if (voteType == IGovPool.VoteType.TreasuryVote) {
            return _treasuryPoolsInfo[voter];
        }

        return _usersInfo[voter].balanceInfo;
    }

    function _withSupportedToken() internal view {
        require(tokenAddress != address(0), "GovUK: token is not supported");
    }

    function _withSupportedNft() internal view {
        require(nftAddress != address(0), "GovUK: nft is not supported");
    }
}
