// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/gov/IGovUserKeeper.sol";

import "../libs/MathHelper.sol";
import "../libs/ShrinkableArray.sol";
import "../libs/DecimalsConverter.sol";

import "./ERC721/ERC721Power.sol";

contract GovUserKeeper is IGovUserKeeper, OwnableUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using ShrinkableArray for ShrinkableArray.UintArray;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using DecimalsConverter for uint256;

    address public tokenAddress;
    address public nftAddress;

    NFTInfo private _nftInfo;

    mapping(address => uint256) public override tokenBalance; // user => token balance
    mapping(address => EnumerableSet.UintSet) private _nftBalance; // user => nft balance

    mapping(address => uint256) private _maxTokensLocked; // user => maximum locked amount
    mapping(address => mapping(uint256 => uint256)) private _lockedInProposals; // user => proposal id => locked amount
    mapping(address => EnumerableSet.UintSet) private _lockedProposals; // user => array of proposal ids

    mapping(address => EnumerableSet.UintSet) private _nftLocked; // user => locked nfts
    mapping(uint256 => uint256) private _nftLockedNums; // tokenId => locked num

    mapping(address => mapping(address => uint256)) public override delegatedTokens; // holder => spender => amount
    mapping(address => mapping(address => EnumerableSet.UintSet)) private _delegatedNfts; // holder => spender => tokenIds

    uint256 private _latestPowerSnapshotId;

    mapping(uint256 => NFTSnapshot) public nftSnapshot; // snapshot id => snapshot info

    event TokensAdded(address account, uint256 amount);
    event TokensDelegated(address holder, address spender, uint256 amount);
    event TokensWithdrawn(address account, uint256 amount);
    event TokensLocked(address account, uint256 amount);

    event NftsAdded(address account, uint256[] ids);
    event NftsDelegated(address holder, address spender, uint256[] ids, bool[] status);
    event NftsWithdrawn(address account);
    event NftsLocked(address account, uint256[] ids, uint256 length);

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

        tokenAddress = _tokenAddress;
        nftAddress = _nftAddress;

        if (_nftAddress != address(0)) {
            require(totalPowerInTokens > 0, "GovUK: the equivalent is zero");

            _nftInfo.totalPowerInTokens = totalPowerInTokens;

            if (IERC165(_nftAddress).supportsInterface(type(IERC721Power).interfaceId)) {
                _nftInfo.isSupportPower = true;
                _nftInfo.isSupportTotalSupply = true;
            } else if (
                IERC165(_nftAddress).supportsInterface(type(IERC721Enumerable).interfaceId)
            ) {
                _nftInfo.isSupportTotalSupply = true;
            } else {
                require(nftsTotalSupply > 0, "GovUK: total supply is zero");

                _nftInfo.totalSupply = nftsTotalSupply;
            }
        }
    }

    function depositTokens(address holder, uint256 amount) external override withSupportedToken {
        address token = tokenAddress;

        IERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            amount.convertFrom18(ERC20(token).decimals())
        );

        tokenBalance[holder] += amount;

        emit TokensAdded(holder, amount);
    }

    function delegateTokens(address spender, uint256 amount) external override withSupportedToken {
        delegatedTokens[msg.sender][spender] = amount;

        emit TokensDelegated(msg.sender, spender, amount);
    }

    function withdrawTokens(uint256 amount) external override withSupportedToken {
        address token = tokenAddress;
        uint256 balance = tokenBalance[msg.sender];
        uint256 newLockedAmount = _getNewTokenLockedAmount(msg.sender);

        _maxTokensLocked[msg.sender] = newLockedAmount;
        amount = amount.min(balance - newLockedAmount);

        require(amount > 0, "GovUK: nothing to withdraw");

        tokenBalance[msg.sender] = balance - amount;

        IERC20(token).safeTransfer(msg.sender, amount.convertFrom18(ERC20(token).decimals()));

        emit TokensWithdrawn(msg.sender, amount);
    }

    function depositNfts(address holder, uint256[] calldata nftIds)
        external
        override
        withSupportedNft
    {
        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            nft.safeTransferFrom(msg.sender, address(this), nftIds[i]);

            _nftBalance[holder].add(nftIds[i]);
        }

        emit NftsAdded(holder, nftIds);
    }

    function delegateNfts(
        address spender,
        uint256[] calldata nftIds,
        bool[] calldata delegationStatus
    ) external override withSupportedNft {
        for (uint256 i; i < nftIds.length; i++) {
            if (delegationStatus[i]) {
                _delegatedNfts[msg.sender][spender].add(nftIds[i]);
            } else {
                _delegatedNfts[msg.sender][spender].remove(nftIds[i]);
            }
        }

        emit NftsDelegated(msg.sender, spender, nftIds, delegationStatus);
    }

    function withdrawNfts(uint256[] calldata nftIds) external override withSupportedNft {
        IERC721 nft = IERC721(nftAddress);

        for (uint256 i; i < nftIds.length; i++) {
            if (
                !_nftBalance[msg.sender].contains(nftIds[i]) ||
                _nftLocked[msg.sender].contains(nftIds[i])
            ) {
                continue;
            }

            _nftBalance[msg.sender].remove(nftIds[i]);

            nft.safeTransferFrom(address(this), msg.sender, nftIds[i]);
        }

        emit NftsWithdrawn(msg.sender);
    }

    function getNftContractInfo()
        external
        view
        override
        returns (
            bool,
            bool,
            uint256,
            uint256
        )
    {
        return (
            _nftInfo.isSupportPower,
            _nftInfo.isSupportTotalSupply,
            _nftInfo.totalPowerInTokens,
            _nftInfo.totalSupply
        );
    }

    function tokenBalanceOf(address user) external view override returns (uint256, uint256) {
        return (tokenBalance[user], _getNewTokenLockedAmount(user));
    }

    function nftBalanceCountOf(address user) external view override returns (uint256, uint256) {
        return (_nftBalance[user].length(), _nftLocked[user].length());
    }

    function delegatedNftsCountOf(address holder, address spender)
        external
        view
        override
        returns (uint256)
    {
        return _delegatedNfts[holder][spender].length();
    }

    function nftBalanceOf(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (uint256[] memory nftIds) {
        uint256 to = (offset + limit).min(_nftBalance[user].length()).max(offset);

        nftIds = new uint256[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            nftIds[i - offset] = _nftBalance[user].at(i);
        }
    }

    function nftLockedBalanceOf(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (uint256[] memory nftIds, uint256[] memory lockedAmounts) {
        uint256 to = (offset + limit).min(_nftLocked[user].length()).max(offset);

        nftIds = new uint256[](to - offset);
        lockedAmounts = new uint256[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            nftIds[i - offset] = _nftLocked[user].at(i);
            lockedAmounts[i - offset] = _nftLockedNums[nftIds[i - offset]];
        }
    }

    function getDelegatedNfts(
        address holder,
        address spender,
        uint256 offset,
        uint256 limit
    ) external view override returns (uint256[] memory nftIds) {
        uint256 to = (offset + limit).min(_delegatedNfts[holder][spender].length()).max(offset);

        nftIds = new uint256[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            nftIds[i - offset] = _delegatedNfts[holder][spender].at(i);
        }
    }

    function getTotalVoteWeight() external view override returns (uint256) {
        address token = tokenAddress;

        return
            (
                token != address(0)
                    ? IERC20(token).totalSupply().convertTo18(ERC20(token).decimals())
                    : 0
            ) + _nftInfo.totalPowerInTokens;
    }

    function getNftsPowerInTokens(ShrinkableArray.UintArray calldata nftIds, uint256 snapshotId)
        external
        view
        override
        returns (uint256)
    {
        address _nftAddress = nftAddress;

        if (_nftAddress == address(0)) {
            return 0;
        }

        if (!_nftInfo.isSupportPower) {
            uint256 totalSupply;

            if (_nftInfo.isSupportTotalSupply) {
                totalSupply = nftSnapshot[snapshotId].totalSupply;
            } else {
                totalSupply = _nftInfo.totalSupply;
            }

            return
                totalSupply == 0
                    ? 0
                    : nftIds.length.ratio(_nftInfo.totalPowerInTokens, totalSupply);
        }

        uint256 nftsPower;

        for (uint256 i; i < nftIds.length; i++) {
            (, , uint256 collateralAmount, , ) = ERC721Power(_nftAddress).nftInfos(
                nftIds.values[i]
            );

            nftsPower += collateralAmount;
        }

        uint256 totalNftsPower = nftSnapshot[snapshotId].totalNftsPower;

        if (totalNftsPower != 0) {
            uint256 totalPowerInTokens = _nftInfo.totalPowerInTokens;

            for (uint256 i; i < nftIds.length; i++) {
                nftsPower += totalPowerInTokens.ratio(
                    nftSnapshot[snapshotId].nftPower[nftIds.values[i]],
                    totalNftsPower
                );
            }
        }

        return nftsPower;
    }

    function filterNftsAvailableForDelegator(
        address delegate,
        address holder,
        ShrinkableArray.UintArray calldata nftIds
    ) external view override returns (ShrinkableArray.UintArray memory) {
        ShrinkableArray.UintArray memory validNfts = ShrinkableArray.create(nftIds.length);
        uint256 length;

        for (uint256 i; i < nftIds.length; i++) {
            if (!_delegatedNfts[holder][delegate].contains(nftIds.values[i])) {
                continue;
            }

            validNfts.values[length++] = nftIds.values[i];
        }

        return validNfts.crop(length);
    }

    function createNftPowerSnapshot() external override onlyOwner returns (uint256) {
        bool isSupportPower = _nftInfo.isSupportPower;
        bool isSupportTotalSupply = _nftInfo.isSupportTotalSupply;

        if (!isSupportTotalSupply) {
            return 0;
        }

        IERC721Power nftContract = IERC721Power(nftAddress);
        uint256 supply = nftContract.totalSupply();

        uint256 currentPowerSnapshotId = ++_latestPowerSnapshotId;

        if (!isSupportPower) {
            nftSnapshot[currentPowerSnapshotId].totalSupply = supply;

            return currentPowerSnapshotId;
        }

        uint256 totalNftsPower;

        for (uint256 i; i < supply; i++) {
            uint256 index = nftContract.tokenByIndex(i);
            uint256 power = nftContract.recalculateNftPower(index);

            nftSnapshot[currentPowerSnapshotId].nftPower[index] = power;
            totalNftsPower += power;
        }

        nftSnapshot[currentPowerSnapshotId].totalNftsPower = totalNftsPower;

        return currentPowerSnapshotId;
    }

    function lockTokens(
        address voter,
        uint256 amount,
        uint256 proposalId
    ) external onlyOwner {
        uint256 newLockedAmount = _lockedInProposals[voter][proposalId] + amount;

        _lockedInProposals[voter][proposalId] = newLockedAmount;
        _lockedProposals[voter].add(proposalId);

        if (newLockedAmount > _maxTokensLocked[voter]) {
            _maxTokensLocked[voter] = newLockedAmount;

            emit TokensLocked(voter, newLockedAmount);
        }
    }

    function unlockTokens(address voter, uint256 proposalId) external override onlyOwner {
        if (_maxTokensLocked[voter] == 0) {
            return;
        }

        delete _lockedInProposals[voter][proposalId];
        _lockedProposals[voter].remove(proposalId);
    }

    function lockNfts(address voter, ShrinkableArray.UintArray calldata nftIds)
        external
        override
        onlyOwner
        returns (ShrinkableArray.UintArray memory)
    {
        ShrinkableArray.UintArray memory locked = ShrinkableArray.create(nftIds.length);
        uint256 length;

        for (uint256 i; i < nftIds.length; i++) {
            if (!_nftBalance[voter].contains(nftIds.values[i])) {
                continue;
            }

            _nftLocked[voter].add(nftIds.values[i]);
            _nftLockedNums[nftIds.values[i]]++;

            locked.values[length++] = nftIds.values[i];
        }

        locked = locked.crop(length);

        emit NftsLocked(voter, locked.values, locked.length);

        return locked;
    }

    function unlockNfts(address voter, uint256[] calldata nftIds) external override onlyOwner {
        for (uint256 i; i < nftIds.length; i++) {
            if (!_nftLocked[voter].contains(nftIds[i])) {
                continue;
            }

            uint256 nftLockedNum = _nftLockedNums[nftIds[i]];

            if (nftLockedNum == 1) {
                _nftLocked[voter].remove(nftIds[i]);
            } else {
                _nftLockedNums[nftIds[i]] = nftLockedNum - 1;
            }
        }
    }

    function canUserParticipate(
        address user,
        uint256 requiredTokens,
        uint256 requiredNfts
    ) external view override returns (bool) {
        return (tokenBalance[user] >= requiredTokens ||
            _nftBalance[user].length() >= requiredNfts);
    }

    function _getNewTokenLockedAmount(address voter) private view returns (uint256) {
        EnumerableSet.UintSet storage lockedProposals = _lockedProposals[voter];

        uint256 lockedAmount = _maxTokensLocked[voter];
        uint256 length = lockedProposals.length();

        if (lockedAmount == 0) {
            return 0;
        }

        uint256 newLockedAmount;

        for (uint256 i = length; i > 0; i--) {
            newLockedAmount = newLockedAmount.max(
                _lockedInProposals[voter][lockedProposals.at(i - 1)]
            );

            if (newLockedAmount == lockedAmount) {
                break;
            }
        }

        return newLockedAmount;
    }
}
