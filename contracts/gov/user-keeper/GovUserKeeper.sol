// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";
import "@dlsl/dev-modules/libs/arrays/Paginator.sol";
import "@dlsl/dev-modules/libs/arrays/ArrayHelper.sol";

import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/IGovPool.sol";

import "../../libs/math/MathHelper.sol";

import "../ERC721/ERC721Power.sol";

contract GovUserKeeper is IGovUserKeeper, OwnableUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using ArrayHelper for uint256[];
    using Paginator for EnumerableSet.UintSet;
    using DecimalsConverter for uint256;

    address public tokenAddress;
    address public nftAddress;

    NFTInfo public nftInfo;

    uint256 internal _latestPowerSnapshotId;

    mapping(address => UserInfo) internal _usersInfo; // user => info
    mapping(address => BalanceInfo) internal _micropoolsInfo; // user = micropool address => info

    mapping(uint256 => uint256) internal _nftLockedNums; // tokenId => locked num

    mapping(uint256 => NFTSnapshot) public nftSnapshot; // snapshot id => snapshot info

    modifier withSupportedToken() {
        require(tokenAddress != address(0), "GovUK: token is not supported");
        _;
    }

    modifier withSupportedNft() {
        require(nftAddress != address(0), "GovUK: nft is not supported");
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

        IERC20(token).safeTransferFrom(
            payer,
            address(this),
            amount.from18(ERC20(token).decimals())
        );

        _usersInfo[receiver].balanceInfo.tokenBalance += amount;
    }

    function withdrawTokens(
        address payer,
        address receiver,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        BalanceInfo storage payerBalanceInfo = _usersInfo[payer].balanceInfo;

        address token = tokenAddress;
        uint256 balance = payerBalanceInfo.tokenBalance;
        uint256 availableBalance = balance.max(payerBalanceInfo.maxTokensLocked) -
            payerBalanceInfo.maxTokensLocked;

        require(amount <= availableBalance, "GovUK: can't withdraw this");

        payerBalanceInfo.tokenBalance = balance - amount;

        IERC20(token).safeTransfer(receiver, amount.from18(ERC20(token).decimals()));
    }

    function delegateTokens(
        address delegator,
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        UserInfo storage delegatorInfo = _usersInfo[delegator];

        uint256 balance = delegatorInfo.balanceInfo.tokenBalance;
        uint256 availableBalance = balance.max(delegatorInfo.balanceInfo.maxTokensLocked) -
            delegatorInfo.balanceInfo.maxTokensLocked;

        require(amount <= availableBalance, "GovUK: overdelegation");

        delegatorInfo.balanceInfo.tokenBalance = balance - amount;

        delegatorInfo.delegatees.add(delegatee);
        delegatorInfo.delegatedTokens[delegatee] += amount;

        _micropoolsInfo[delegatee].tokenBalance += amount;
    }

    function undelegateTokens(
        address delegator,
        address delegatee,
        uint256 amount
    ) external override onlyOwner withSupportedToken {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        BalanceInfo storage micropoolInfo = _micropoolsInfo[delegatee];

        uint256 delegated = delegatorInfo.delegatedTokens[delegatee];
        uint256 availableAmount = micropoolInfo.tokenBalance - micropoolInfo.maxTokensLocked;

        require(
            amount <= delegated && amount <= availableAmount,
            "GovUK: amount exceeds delegation"
        );

        micropoolInfo.tokenBalance -= amount;

        delegatorInfo.balanceInfo.tokenBalance += amount;
        delegatorInfo.delegatedTokens[delegatee] -= amount;

        if (
            delegatorInfo.delegatedTokens[delegatee] == 0 &&
            delegatorInfo.delegatedNfts[delegatee].length() == 0
        ) {
            delegatorInfo.delegatees.remove(delegatee);
        }
    }

    function depositNfts(
        address payer,
        address receiver,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        BalanceInfo storage receiverInfo = _usersInfo[receiver].balanceInfo;

        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            nft.safeTransferFrom(payer, address(this), nftIds[i]);

            receiverInfo.nftBalance.add(nftIds[i]);
        }
    }

    function withdrawNfts(
        address payer,
        address receiver,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        BalanceInfo storage payerInfo = _usersInfo[payer].balanceInfo;

        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            require(
                payerInfo.nftBalance.contains(nftIds[i]) && _nftLockedNums[nftIds[i]] == 0,
                "GovUK: NFT is not owned or locked"
            );

            payerInfo.nftBalance.remove(nftIds[i]);

            nft.safeTransferFrom(address(this), receiver, nftIds[i]);
        }
    }

    function delegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        BalanceInfo storage micropoolInfo = _micropoolsInfo[delegatee];

        for (uint256 i; i < nftIds.length; i++) {
            require(
                delegatorInfo.balanceInfo.nftBalance.contains(nftIds[i]) &&
                    _nftLockedNums[nftIds[i]] == 0,
                "GovUK: NFT is not owned or locked"
            );

            delegatorInfo.balanceInfo.nftBalance.remove(nftIds[i]);

            delegatorInfo.delegatees.add(delegatee);
            delegatorInfo.delegatedNfts[delegatee].add(nftIds[i]);

            micropoolInfo.nftBalance.add(nftIds[i]);
        }
    }

    function undelegateNfts(
        address delegator,
        address delegatee,
        uint256[] calldata nftIds
    ) external override onlyOwner withSupportedNft {
        UserInfo storage delegatorInfo = _usersInfo[delegator];
        BalanceInfo storage micropoolInfo = _micropoolsInfo[delegatee];

        for (uint256 i; i < nftIds.length; i++) {
            require(
                delegatorInfo.delegatedNfts[delegatee].contains(nftIds[i]) &&
                    _nftLockedNums[nftIds[i]] == 0,
                "GovUK: NFT is not owned or locked"
            );

            micropoolInfo.nftBalance.remove(nftIds[i]);

            delegatorInfo.balanceInfo.nftBalance.add(nftIds[i]);
            delegatorInfo.delegatedNfts[delegatee].remove(nftIds[i]);
        }

        if (
            delegatorInfo.delegatedTokens[delegatee] == 0 &&
            delegatorInfo.delegatedNfts[delegatee].length() == 0
        ) {
            delegatorInfo.delegatees.remove(delegatee);
        }
    }

    function createNftPowerSnapshot() external override onlyOwner returns (uint256) {
        IERC721Power nftContract = IERC721Power(nftAddress);

        if (address(nftContract) == address(0)) {
            return 0;
        }

        uint256 currentPowerSnapshotId = ++_latestPowerSnapshotId;
        NFTSnapshot storage snapshot = nftSnapshot[currentPowerSnapshotId];

        if (nftInfo.isSupportPower) {
            snapshot.totalNftsPower = nftContract.totalPower();
        } else {
            snapshot.totalNftsPower = nftInfo.totalSupply == 0
                ? nftContract.totalSupply()
                : nftInfo.totalSupply;
        }

        return currentPowerSnapshotId;
    }

    function updateMaxTokenLockedAmount(
        uint256[] calldata lockedProposals,
        address voter,
        bool isMicropool
    ) external override onlyOwner {
        BalanceInfo storage balanceInfo = _getBalanceInfoStorage(voter, isMicropool);

        uint256 lockedAmount = balanceInfo.maxTokensLocked;
        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(
                balanceInfo.lockedInProposals[lockedProposals[i]]
            );

            if (newLockedAmount == lockedAmount) {
                break;
            }
        }

        balanceInfo.maxTokensLocked = newLockedAmount;
    }

    function lockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool,
        uint256 amount
    ) external override onlyOwner {
        BalanceInfo storage balanceInfo = _getBalanceInfoStorage(voter, isMicropool);

        balanceInfo.lockedInProposals[proposalId] += amount;

        balanceInfo.maxTokensLocked = balanceInfo.maxTokensLocked.max(
            balanceInfo.lockedInProposals[proposalId]
        );
    }

    function unlockTokens(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external override onlyOwner returns (uint256 unlockedAmount) {
        unlockedAmount = _getBalanceInfoStorage(voter, isMicropool).lockedInProposals[proposalId];

        delete _getBalanceInfoStorage(voter, isMicropool).lockedInProposals[proposalId];
    }

    function lockNfts(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256[] calldata nftIds
    ) external override onlyOwner {
        BalanceInfo storage balanceInfo = _getBalanceInfoStorage(voter, isMicropool);

        for (uint256 i; i < nftIds.length; i++) {
            bool userContains = balanceInfo.nftBalance.contains(nftIds[i]);
            bool delegatedContains;

            if (!userContains && !isMicropool && useDelegated) {
                UserInfo storage userInfo = _usersInfo[voter];

                uint256 delegateeLength = userInfo.delegatees.length();

                for (uint256 j; j < delegateeLength; j++) {
                    if (userInfo.delegatedNfts[userInfo.delegatees.at(j)].contains(nftIds[i])) {
                        delegatedContains = true;
                        break;
                    }
                }
            }

            require(userContains || delegatedContains, "GovUK: NFT is not owned");

            _nftLockedNums[nftIds[i]]++;
        }
    }

    function unlockNfts(uint256[] calldata nftIds) external override onlyOwner {
        for (uint256 i; i < nftIds.length; i++) {
            require(_nftLockedNums[nftIds[i]] > 0, "GovUK: NFT is not locked");

            _nftLockedNums[nftIds[i]]--;
        }
    }

    function updateNftPowers(uint256[] calldata nftIds) external override onlyOwner {
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

    function maxLockedAmount(address voter, bool isMicropool)
        external
        view
        override
        returns (uint256)
    {
        return _getBalanceInfoStorage(voter, isMicropool).maxTokensLocked;
    }

    function tokenBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) public view override returns (uint256 totalBalance, uint256 ownedBalance) {
        if (tokenAddress == address(0)) {
            return (0, 0);
        }

        totalBalance = _getBalanceInfoStorage(voter, isMicropool).tokenBalance;

        if (!isMicropool) {
            if (useDelegated) {
                UserInfo storage userInfo = _usersInfo[voter];

                uint256 delegateeLength = userInfo.delegatees.length();

                for (uint256 i; i < delegateeLength; i++) {
                    totalBalance += userInfo.delegatedTokens[userInfo.delegatees.at(i)];
                }
            }

            ownedBalance = ERC20(tokenAddress).balanceOf(voter).to18(
                ERC20(tokenAddress).decimals()
            );
            totalBalance += ownedBalance;
        }
    }

    function nftBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) public view override returns (uint256 totalBalance, uint256 ownedBalance) {
        if (nftAddress == address(0)) {
            return (0, 0);
        }

        totalBalance = _getBalanceInfoStorage(voter, isMicropool).nftBalance.length();

        if (!isMicropool) {
            if (useDelegated) {
                UserInfo storage userInfo = _usersInfo[voter];

                uint256 delegateeLength = userInfo.delegatees.length();

                for (uint256 i; i < delegateeLength; i++) {
                    totalBalance += userInfo.delegatedNfts[userInfo.delegatees.at(i)].length();
                }
            }

            ownedBalance = ERC721(nftAddress).balanceOf(voter);
            totalBalance += ownedBalance;
        }
    }

    function nftExactBalance(
        address voter,
        bool isMicropool,
        bool useDelegated
    ) public view override returns (uint256[] memory nfts, uint256 ownedLength) {
        uint256 length;
        (length, ownedLength) = nftBalance(voter, isMicropool, useDelegated);

        if (length == 0) {
            return (nfts, 0);
        }

        uint256 currentLength;
        nfts = new uint256[](length);

        currentLength = nfts.insert(
            currentLength,
            _getBalanceInfoStorage(voter, isMicropool).nftBalance.values()
        );

        if (!isMicropool) {
            if (useDelegated) {
                UserInfo storage userInfo = _usersInfo[voter];

                uint256 delegateeLength = userInfo.delegatees.length();

                for (uint256 i; i < delegateeLength; i++) {
                    currentLength = nfts.insert(
                        currentLength,
                        userInfo.delegatedNfts[userInfo.delegatees.at(i)].values()
                    );
                }
            }

            if (nftInfo.totalSupply == 0) {
                ERC721Power nftContract = ERC721Power(nftAddress);

                for (uint256 i; i < ownedLength; i++) {
                    nfts[currentLength++] = nftContract.tokenOfOwnerByIndex(voter, i);
                }
            }
        }
    }

    function getNftsPowerInTokensBySnapshot(uint256[] memory nftIds, uint256 snapshotId)
        public
        view
        override
        returns (uint256)
    {
        NFTSnapshot storage snapshot = nftSnapshot[snapshotId];
        uint256 totalNftsPower = snapshot.totalNftsPower;

        if (nftAddress == address(0) || totalNftsPower == 0) {
            return 0;
        }

        ERC721Power nftContract = ERC721Power(nftAddress);

        uint256 nftsPower;

        if (!nftInfo.isSupportPower) {
            nftsPower = nftIds.length.ratio(nftInfo.totalPowerInTokens, totalNftsPower);
        } else {
            uint256 totalPowerInTokens = nftInfo.totalPowerInTokens;

            for (uint256 i; i < nftIds.length; i++) {
                (uint256 power, ) = nftContract.getNftPower(nftIds[i]);
                nftsPower += totalPowerInTokens.ratio(power, totalNftsPower);
            }
        }

        return nftsPower;
    }

    function getTotalVoteWeight() external view override returns (uint256) {
        address token = tokenAddress;

        return
            (token != address(0) ? IERC20(token).totalSupply().to18(ERC20(token).decimals()) : 0) +
            nftInfo.totalPowerInTokens;
    }

    function canParticipate(
        address voter,
        bool isMicropool,
        bool useDelegated,
        uint256 requiredVotes,
        uint256 snapshotId
    ) external view override returns (bool) {
        (uint256 tokens, ) = tokenBalance(voter, isMicropool, useDelegated);

        if (tokens >= requiredVotes) {
            return true;
        }

        (uint256[] memory nftIds, ) = nftExactBalance(voter, isMicropool, useDelegated);
        uint256 nftPower = getNftsPowerInTokensBySnapshot(nftIds, snapshotId);

        return tokens + nftPower >= requiredVotes;
    }

    function votingPower(
        address user,
        bool isMicropool,
        bool useDelegated
    ) external view override returns (uint256 power, uint256[] memory nftPower) {
        if (tokenAddress != address(0)) {
            (power, ) = tokenBalance(user, isMicropool, useDelegated);
        }

        if (nftAddress != address(0)) {
            ERC721Power nftContract = ERC721Power(nftAddress);
            (uint256[] memory nftIds, ) = nftExactBalance(user, isMicropool, useDelegated);
            nftPower = new uint256[](nftIds.length);

            if (!nftInfo.isSupportPower) {
                uint256 totalSupply = nftInfo.totalSupply == 0
                    ? nftContract.totalSupply()
                    : nftInfo.totalSupply;

                if (totalSupply > 0) {
                    uint256 totalPower = nftInfo.totalPowerInTokens;

                    for (uint256 i; i < nftIds.length; i++) {
                        nftPower[i] = totalPower / totalSupply;
                    }

                    power += nftIds.length.ratio(totalPower, totalSupply);
                }
            } else {
                uint256 totalSupply = nftContract.totalSupply();
                uint256 totalNftsPower;

                for (uint256 i; i < totalSupply; i++) {
                    uint256 tokenId = nftContract.tokenByIndex(i);
                    (uint256 solePower, uint256 collateral) = nftContract.getNftPower(tokenId);

                    totalNftsPower += solePower + collateral;
                }

                if (totalNftsPower > 0) {
                    uint256 totalPowerInTokens = nftInfo.totalPowerInTokens;

                    for (uint256 i; i < nftIds.length; i++) {
                        (uint256 solePower, uint256 collateral) = nftContract.getNftPower(
                            nftIds[i]
                        );
                        nftPower[i] = totalPowerInTokens.ratio(
                            solePower + collateral,
                            totalNftsPower
                        );

                        power += nftPower[i];
                    }
                }
            }
        }
    }

    function delegations(address user)
        external
        view
        override
        returns (DelegationInfoView[] memory delegationsInfo)
    {
        UserInfo storage userInfo = _usersInfo[user];

        delegationsInfo = new DelegationInfoView[](userInfo.delegatees.length());

        for (uint256 i; i < delegationsInfo.length; i++) {
            address delegatee = userInfo.delegatees.at(i);

            delegationsInfo[i] = DelegationInfoView({
                delegatee: delegatee,
                delegatedTokens: userInfo.delegatedTokens[delegatee],
                delegatedNfts: userInfo.delegatedNfts[delegatee].values()
            });
        }
    }

    function getUndelegateableAssets(
        address delegator,
        address delegatee,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        external
        view
        override
        returns (uint256 undelegateableTokens, ShrinkableArray.UintArray memory undelegateableNfts)
    {
        UserInfo storage delegatorInfo = _usersInfo[delegator];

        (
            uint256 withdrawableTokens,
            ShrinkableArray.UintArray memory withdrawableNfts
        ) = _getFreeAssets(delegatee, true, lockedProposals, unlockedNfts);

        undelegateableTokens = delegatorInfo.delegatedTokens[delegatee].min(withdrawableTokens);

        uint256[] memory nfts = new uint256[](withdrawableNfts.length);
        uint256 nftsLength;

        for (uint256 i; i < nfts.length; i++) {
            if (delegatorInfo.delegatedNfts[delegatee].contains(withdrawableNfts.values[i])) {
                nfts[nftsLength++] = withdrawableNfts.values[i];
            }
        }

        undelegateableNfts = nfts.transform().crop(nftsLength);
    }

    function getWithdrawableAssets(
        address voter,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        external
        view
        override
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        return _getFreeAssets(voter, false, lockedProposals, unlockedNfts);
    }

    function _getFreeAssets(
        address voter,
        bool isMicropool,
        ShrinkableArray.UintArray calldata lockedProposals,
        uint256[] calldata unlockedNfts
    )
        internal
        view
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        BalanceInfo storage balanceInfo = _getBalanceInfoStorage(voter, isMicropool);

        uint256 newLockedAmount;

        for (uint256 i; i < lockedProposals.length; i++) {
            newLockedAmount = newLockedAmount.max(
                balanceInfo.lockedInProposals[lockedProposals.values[i]]
            );
        }

        withdrawableTokens = balanceInfo.tokenBalance - newLockedAmount;

        uint256[] memory nfts = new uint256[](balanceInfo.nftBalance.length());
        uint256 nftsLength;

        for (uint256 i; i < nfts.length; i++) {
            uint256 nftId = balanceInfo.nftBalance.at(i);
            uint256 nftLockAmount = _nftLockedNums[nftId];

            if (nftLockAmount != 0) {
                for (uint256 j = 0; j < unlockedNfts.length; j++) {
                    if (unlockedNfts[j] == nftId) {
                        nftLockAmount--;
                    }
                }
            }

            if (nftLockAmount == 0) {
                nfts[nftsLength++] = nftId;
            }
        }

        withdrawableNfts = nfts.transform().crop(nftsLength);
    }

    function _getBalanceInfoStorage(address voter, bool isMicropool)
        internal
        view
        returns (BalanceInfo storage)
    {
        return isMicropool ? _micropoolsInfo[voter] : _usersInfo[voter].balanceInfo;
    }

    function _setERC20Address(address _tokenAddress) internal {
        require(tokenAddress == address(0), "GovUK: current token address isn't zero");
        require(_tokenAddress != address(0), "GovUK: new token address is zero");

        tokenAddress = _tokenAddress;
    }

    function _setERC721Address(
        address _nftAddress,
        uint256 totalPowerInTokens,
        uint256 nftsTotalSupply
    ) internal {
        require(nftAddress == address(0), "GovUK: current token address isn't zero");
        require(_nftAddress != address(0), "GovUK: new token address is zero");
        require(totalPowerInTokens > 0, "GovUK: the equivalent is zero");

        nftInfo.totalPowerInTokens = totalPowerInTokens;

        if (!IERC165(_nftAddress).supportsInterface(type(IERC721Power).interfaceId)) {
            if (!IERC165(_nftAddress).supportsInterface(type(IERC721Enumerable).interfaceId)) {
                require(nftsTotalSupply > 0, "GovUK: total supply is zero");

                nftInfo.totalSupply = uint128(nftsTotalSupply);
            }
        } else {
            nftInfo.isSupportPower = true;
        }

        nftAddress = _nftAddress;
    }
}
