const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { getCurrentBlockTime, setTime } = require("../helpers/block-helper");
const { VoteType } = require("../utils/constants");

const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC721Power = artifacts.require("ERC721Power");
const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolMock = artifacts.require("GovPoolMock");
const VotePowerMock = artifacts.require("VotePowerMock");

GovUserKeeper.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC721Power.numberFormat = "BigNumber";

describe("GovUserKeeper", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let userKeeper;
  let token;
  let nft;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    const govUserKeeperViewLib = await GovUserKeeperViewLib.new();

    await GovUserKeeper.link(govUserKeeperViewLib);

    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721Mock.new("Mock", "Mock");

    userKeeper = await GovUserKeeper.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("Bad GovUserKeeper", () => {
    describe("init", () => {
      it("should not init with both zero tokens", async () => {
        await truffleAssert.reverts(
          userKeeper.__GovUserKeeper_init(ZERO_ADDR, ZERO_ADDR, wei("33000"), 33),
          "GovUK: zero addresses"
        );
      });

      it("should revert if NFT power == 0", async () => {
        await truffleAssert.reverts(
          userKeeper.__GovUserKeeper_init(ZERO_ADDR, token.address, 0, 33),
          "GovUK: the equivalent is zero"
        );
      });

      it("should revert if NFT total supply == 0", async () => {
        await truffleAssert.reverts(
          userKeeper.__GovUserKeeper_init(ZERO_ADDR, nft.address, wei("1"), 0),
          "GovUK: total supply is zero"
        );
      });

      it("should revert if NFT total supply >= 2^128", async () => {
        await truffleAssert.reverts(
          userKeeper.__GovUserKeeper_init(ZERO_ADDR, nft.address, wei("1"), toBN(2).pow(128)),
          "GovUK: total supply is zero"
        );
      });
    });
  });

  describe("Plain GovUserKeeper", () => {
    beforeEach("setup", async () => {
      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);

      await token.mint(OWNER, wei("1000000"));
      await token.approve(userKeeper.address, wei("1000"));

      for (let i = 1; i < 10; i++) {
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
    });

    describe("init", () => {
      it("should correctly set initial parameters", async () => {
        assert.equal(await userKeeper.tokenAddress(), token.address);
        assert.equal(await userKeeper.nftAddress(), nft.address);

        const nftInfo = await userKeeper.getNftInfo();

        assert.isFalse(nftInfo.isSupportPower);
        assert.equal(toBN(nftInfo.totalPowerInTokens).toFixed(), wei("33000"));
        assert.equal(nftInfo.totalSupply, "33");
      });
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33),
          "Initializable: contract is already initialized"
        );
      });

      it("only owner should call these functions", async () => {
        await truffleAssert.reverts(
          userKeeper.depositTokens(OWNER, SECOND, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.withdrawTokens(OWNER, SECOND, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.delegateTokens(OWNER, SECOND, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.delegateTokensTreasury(OWNER, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.undelegateTokens(OWNER, SECOND, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.undelegateTokensTreasury(OWNER, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.depositNfts(OWNER, SECOND, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.withdrawNfts(OWNER, SECOND, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.delegateNfts(OWNER, SECOND, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.delegateNftsTreasury(OWNER, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.undelegateNfts(OWNER, SECOND, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.undelegateNftsTreasury(OWNER, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.createNftPowerSnapshot({ from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.updateMaxTokenLockedAmount([1], OWNER, { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.lockTokens(1, OWNER, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.unlockTokens(1, OWNER, "0", { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.lockNfts(OWNER, VoteType.PersonalVote, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(userKeeper.unlockNfts([1], { from: SECOND }), "Ownable: caller is not the owner");
      });
    });

    describe("depositTokens()", () => {
      it("should correctly add tokens to balance", async () => {
        assert.equal(
          toBN((await userKeeper.votingPower([SECOND], [VoteType.PersonalVote], true))[0].power).toFixed(),
          "0"
        );

        await userKeeper.depositTokens(OWNER, SECOND, wei("100"));

        const power = (await userKeeper.votingPower([SECOND], [VoteType.PersonalVote], true))[0];

        assert.equal(toBN(power.power).toFixed(), wei("100"));
        assert.equal(toBN(power.nftPower).toFixed(), "0");
        assert.deepEqual(power.perNftPower, []);
        assert.equal(toBN(power.ownedBalance).toFixed(), "0");
        assert.equal(toBN(power.ownedLength).toFixed(), "0");
        assert.deepEqual(power.nftIds, []);

        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote)).totalBalance.toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote)).ownedBalance.toFixed(), "0");

        await userKeeper.depositTokens(OWNER, SECOND, wei("200"));
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote)).totalBalance.toFixed(), wei("300"));
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.PersonalVote)).ownedBalance.toFixed(), "0");

        await userKeeper.depositTokens(OWNER, OWNER, wei("10"));
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("999700")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("999690")
        );
      });
    });

    describe("depositNfts()", () => {
      it("should correctly add tokens to balance", async () => {
        assert.equal(
          toBN((await userKeeper.votingPower([SECOND], [VoteType.PersonalVote], false))[0].power).toFixed(),
          "0"
        );

        await userKeeper.depositNfts(OWNER, SECOND, [1, 3, 5]);

        const power = (await userKeeper.votingPower([SECOND], [VoteType.PersonalVote], true))[0];

        assert.equal(toBN(power.power).toFixed(), wei("3000"));
        assert.equal(toBN(power.rawPower).toFixed(), wei("3000"));
        assert.equal(toBN(power.nftPower).toFixed(), wei("3000"));
        assert.equal(toBN(power.rawNftPower).toFixed(), wei("3000"));
        assert.deepEqual(
          power.perNftPower.map((e) => toBN(e).toFixed()),
          [wei("1000"), wei("1000"), wei("1000")]
        );
        assert.equal(toBN(power.ownedBalance).toFixed(), "0");
        assert.equal(toBN(power.ownedLength).toFixed(), "0");
        assert.deepEqual(
          power.nftIds.map((e) => toBN(e).toFixed()),
          ["1", "3", "5"]
        );

        const nftPower = await userKeeper.nftVotingPower(power.nftIds, true);

        assert.equal(nftPower.nftPower.toFixed(), wei("3000"));
        assert.deepEqual(
          nftPower.perNftPower.map((e) => e.toFixed()),
          [wei("1000"), wei("1000"), wei("1000")]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        await userKeeper.depositNfts(OWNER, SECOND, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5", "2", "4"]
        );

        await userKeeper.depositNfts(OWNER, OWNER, [6, 9]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["6", "9", "0", "0"]
        );
      });
    });

    describe("delegateTokens(), undelegateTokens()", () => {
      it("should correctly delegate tokens, add delegators and spenders", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("444"));

        assert.equal(
          (await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).totalBalance.toFixed(),
          wei("333")
        );
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.MicropoolVote)).totalBalance.toFixed(), wei("444"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("999223")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("999000")
        );

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.DelegatedVote)).totalBalance.toFixed(),
          wei("1000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.DelegatedVote)).ownedBalance.toFixed(),
          wei("999000")
        );

        await userKeeper.delegateTokens(OWNER, SECOND, wei("111"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("111"));

        assert.equal(
          (await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).totalBalance.toFixed(),
          wei("444")
        );
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.MicropoolVote)).totalBalance.toFixed(), wei("555"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).totalBalance.toFixed(),
          wei("999001")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote)).ownedBalance.toFixed(),
          wei("999000")
        );

        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.DelegatedVote)).totalBalance.toFixed(),
          wei("1000000")
        );
        assert.equal(
          (await userKeeper.tokenBalance(OWNER, VoteType.DelegatedVote)).ownedBalance.toFixed(),
          wei("999000")
        );

        const delegations = await userKeeper.delegations(OWNER, false);

        assert.equal(delegations.power.toFixed(), wei("999"));
        assert.equal(delegations.delegationsInfo.length, 2);

        assert.equal(delegations.delegationsInfo[0].delegatee, SECOND);
        assert.equal(delegations.delegationsInfo[0].delegatedTokens, wei("444"));
        assert.deepEqual(delegations.delegationsInfo[0].delegatedNfts, []);
        assert.deepEqual(delegations.delegationsInfo[0].nftPower, "0");
        assert.deepEqual(delegations.delegationsInfo[0].perNftPower, []);

        assert.equal(delegations.delegationsInfo[1].delegatee, THIRD);
        assert.equal(delegations.delegationsInfo[1].delegatedTokens, wei("555"));
        assert.deepEqual(delegations.delegationsInfo[1].delegatedNfts, []);
        assert.deepEqual(delegations.delegationsInfo[1].nftPower, "0");
        assert.deepEqual(delegations.delegationsInfo[1].perNftPower, []);
      });

      it("should not delegate more than balance", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await truffleAssert.reverts(userKeeper.delegateTokens(OWNER, SECOND, wei("1001")), "GovUK: overdelegation");
      });

      it("should undelegate all tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));

        assert.equal(
          (await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).totalBalance.toFixed(),
          wei("333")
        );
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("333"));

        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).totalBalance.toFixed(), "0");
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.MicropoolVote)).ownedBalance.toFixed(), "0");
      });

      it("should not undelegate more tokens than available", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));

        await truffleAssert.reverts(
          userKeeper.undelegateTokens(OWNER, SECOND, wei("334")),
          "GovUK: amount exceeds delegation"
        );
      });
    });

    describe("delegateTokensTreasury(), undelegateTokensTreasury()", () => {
      it("should correctly delegate tokens, add delegators and spenders", async () => {
        await userKeeper.delegateTokensTreasury(SECOND, wei("333"));
        await userKeeper.delegateTokensTreasury(THIRD, wei("444"));

        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.TreasuryVote)).totalBalance.toFixed(), wei("333"));
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).totalBalance.toFixed(), wei("444"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");
      });

      it("should undelegate all tokens", async () => {
        await token.mint(userKeeper.address, wei("1000"));

        await userKeeper.delegateTokensTreasury(SECOND, wei("333"));

        const balanceBefore = await token.balanceOf(OWNER);

        await userKeeper.undelegateTokensTreasury(SECOND, wei("333"));

        const balanceAfter = await token.balanceOf(OWNER);

        assert.equal(balanceAfter.minus(balanceBefore).toFixed(), wei("333"));

        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.TreasuryVote)).totalBalance.toFixed(), "0");
        assert.equal((await userKeeper.tokenBalance(SECOND, VoteType.TreasuryVote)).ownedBalance.toFixed(), "0");
      });

      it("should not undelegate more tokens than available", async () => {
        await userKeeper.delegateTokensTreasury(SECOND, wei("333"));

        await truffleAssert.reverts(
          userKeeper.undelegateTokensTreasury(SECOND, wei("334")),
          "GovUK: can't withdraw this"
        );
      });
    });

    describe("delegateNfts(), undelegateNfts()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5]);
      });

      it("should correctly delegate nfts and add new nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);
        await userKeeper.delegateNfts(OWNER, THIRD, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote)).nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.deepEqual(
          (await userKeeper.nftExactBalance(THIRD, VoteType.MicropoolVote)).nfts.map((e) => e.toFixed()),
          ["2", "4"]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["5", "0", "0", "0", "0"]
        );

        const balanceOwner = await userKeeper.nftBalance(OWNER, VoteType.DelegatedVote);
        const exactBalanceOwner = await userKeeper.nftExactBalance(OWNER, VoteType.DelegatedVote);

        assert.equal(balanceOwner.totalBalance.toFixed(), "9");
        assert.equal(balanceOwner.ownedBalance.toFixed(), "4");
        assert.deepEqual(
          exactBalanceOwner.nfts.map((e) => e.toFixed()),
          ["5", "1", "3", "2", "4", "0", "0", "0", "0"]
        );
        assert.equal(exactBalanceOwner.ownedLength, "4");

        await userKeeper.delegateNfts(OWNER, SECOND, [5]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        const delegations = await userKeeper.delegations(OWNER, true);

        assert.equal(delegations.power.toFixed(), wei("5000"));
        assert.equal(delegations.delegationsInfo.length, 2);

        assert.equal(delegations.delegationsInfo[0].delegatee, SECOND);
        assert.equal(delegations.delegationsInfo[0].delegatedTokens, "0");
        assert.deepEqual(delegations.delegationsInfo[0].delegatedNfts, ["1", "3", "5"]);
        assert.deepEqual(delegations.delegationsInfo[0].nftPower, wei("3000"));
        assert.deepEqual(delegations.delegationsInfo[0].perNftPower, [wei("1000"), wei("1000"), wei("1000")]);

        assert.equal(delegations.delegationsInfo[1].delegatee, THIRD);
        assert.equal(delegations.delegationsInfo[1].delegatedTokens, "0");
        assert.deepEqual(delegations.delegationsInfo[1].delegatedNfts, ["2", "4"]);
        assert.deepEqual(delegations.delegationsInfo[1].nftPower, wei("2000"));
        assert.deepEqual(delegations.delegationsInfo[1].perNftPower, [wei("1000"), wei("1000")]);
      });

      it("should not delegate unavailable NFTs", async () => {
        await truffleAssert.reverts(userKeeper.delegateNfts(OWNER, SECOND, [6]), "GovUK: NFT is not owned or locked");

        await userKeeper.lockNfts(OWNER, VoteType.PersonalVote, [1]);

        await truffleAssert.reverts(userKeeper.delegateNfts(OWNER, SECOND, [1]), "GovUK: NFT is not owned or locked");
      });

      it("should undelegate nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);

        const balance1 = await userKeeper.nftBalance(SECOND, VoteType.MicropoolVote);
        const exactBalance1 = await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote);

        assert.equal(balance1.totalBalance.toFixed(), "2");
        assert.equal(balance1.ownedBalance.toFixed(), "0");
        assert.deepEqual(
          exactBalance1.nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(exactBalance1.ownedLength, "0");

        await userKeeper.undelegateNfts(OWNER, SECOND, [1]);

        const balance2 = await userKeeper.nftBalance(SECOND, VoteType.MicropoolVote);
        const exactBalance2 = await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote);

        assert.equal(balance2.totalBalance.toFixed(), "1");
        assert.equal(balance2.ownedBalance.toFixed(), "0");
        assert.deepEqual(
          exactBalance2.nfts.map((e) => e.toFixed()),
          ["3"]
        );
        assert.equal(exactBalance2.ownedLength, "0");
      });

      it("should undelegate all nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);

        const balanceSecond = await userKeeper.nftBalance(SECOND, VoteType.MicropoolVote);
        const exactBalanceSecond = await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote);

        assert.equal(balanceSecond.totalBalance.toFixed(), "2");
        assert.equal(balanceSecond.ownedBalance, "0");
        assert.deepEqual(
          exactBalanceSecond.nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(exactBalanceSecond.ownedLength, "0");

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["5", "2", "4", "0", "0", "0", "0"]
        );

        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 3]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.MicropoolVote)).nfts.map((e) => e.toFixed()),
          []
        );

        const balanceOwner = await userKeeper.nftBalance(OWNER, VoteType.PersonalVote);
        const exactBalanceOwner = await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote);

        assert.equal(balanceOwner.totalBalance.toFixed(), "9");
        assert.equal(balanceOwner.ownedBalance.toFixed(), "4");
        assert.deepEqual(
          exactBalanceOwner.nfts.map((e) => e.toFixed()),
          ["5", "2", "4", "1", "3", "0", "0", "0", "0"]
        );
        assert.equal(exactBalanceOwner.ownedLength, "4");
      });

      it("should not undelegate unavailable NFTs", async () => {
        await userKeeper.depositNfts(OWNER, THIRD, [8]);

        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);
        await userKeeper.delegateNfts(THIRD, SECOND, [8]);

        await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, SECOND, [6]), "GovUK: NFT is not delegated");
        await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, SECOND, [4]), "GovUK: NFT is not delegated");
      });
    });

    describe("delegateNftsTreasury(), undelegateNftsTreasury()", () => {
      beforeEach("setup", async () => {
        await nft.transferFrom(OWNER, userKeeper.address, "1");
        await nft.transferFrom(OWNER, userKeeper.address, "3");
      });

      it("should correctly delegate nfts and add new nfts", async () => {
        await userKeeper.delegateNftsTreasury(SECOND, [1, 3]);
        await userKeeper.delegateNftsTreasury(THIRD, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.deepEqual(
          (await userKeeper.nftExactBalance(THIRD, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
          ["2", "4"]
        );

        await userKeeper.delegateNftsTreasury(SECOND, [5]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );
      });

      it("should undelegate nfts", async () => {
        await userKeeper.delegateNftsTreasury(SECOND, [1, 3]);

        await userKeeper.undelegateNftsTreasury(SECOND, [1]);

        const balance = await userKeeper.nftBalance(SECOND, VoteType.TreasuryVote);
        const exactBalance = await userKeeper.nftExactBalance(SECOND, VoteType.TreasuryVote);

        assert.equal(balance.totalBalance.toFixed(), "1");
        assert.equal(balance.ownedBalance.toFixed(), "0");
        assert.deepEqual(
          exactBalance.nfts.map((e) => e.toFixed()),
          ["3"]
        );
        assert.equal(exactBalance.ownedLength, "0");

        assert.equal(await nft.ownerOf(1), OWNER);
      });

      it("should undelegate all nfts", async () => {
        await userKeeper.delegateNftsTreasury(SECOND, [1, 3]);

        await userKeeper.undelegateNftsTreasury(SECOND, [1, 3]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.TreasuryVote)).nfts.map((e) => e.toFixed()),
          []
        );

        assert.equal(await nft.ownerOf(1), OWNER);

        assert.equal(await nft.ownerOf(3), OWNER);
      });

      it("should not undelegate unavailable NFTs", async () => {
        await truffleAssert.reverts(userKeeper.undelegateNftsTreasury(SECOND, [99]), "GovUK: NFT is not owned");
      });
    });

    describe("lockTokens(), unlockTokens()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositTokens(OWNER, SECOND, wei("500"));
        await userKeeper.depositTokens(OWNER, THIRD, wei("500"));
      });

      it("should lock tokens from to addresses", async () => {
        await userKeeper.lockTokens(1, SECOND, wei("10"));
        await userKeeper.lockTokens(1, SECOND, wei("5"));
        await userKeeper.lockTokens(1, THIRD, wei("30"));

        const withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, [1], []);
        const withdrawableThird = await userKeeper.getWithdrawableAssets(THIRD, [1], []);

        assert.equal(withdrawableSecond.withdrawableTokens.toFixed(), wei("485"));
        assert.equal(withdrawableThird.withdrawableTokens.toFixed(), wei("470"));
      });

      it("should unlock all", async () => {
        await userKeeper.lockTokens(1, SECOND, wei("10"));

        let withdrawable = await userKeeper.getWithdrawableAssets(SECOND, [1], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("490"));

        await userKeeper.unlockTokens(1, SECOND, wei("10"));

        withdrawable = await userKeeper.getWithdrawableAssets(SECOND, [1], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("500"));
      });

      it("should unlock part of tokens", async () => {
        await userKeeper.lockTokens(1, SECOND, wei("10"));

        let withdrawable = await userKeeper.getWithdrawableAssets(SECOND, [1], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("490"));

        await userKeeper.unlockTokens(1, SECOND, wei("9"));

        withdrawable = await userKeeper.getWithdrawableAssets(SECOND, [1], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("499"));
      });
    });

    describe("maxLockedAmount()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositTokens(OWNER, SECOND, wei("500"));
        await userKeeper.depositTokens(OWNER, THIRD, wei("500"));
      });

      it("should return max locked amount", async () => {
        await userKeeper.lockTokens(1, SECOND, wei("10"));
        await userKeeper.lockTokens(1, SECOND, wei("5"));
        await userKeeper.lockTokens(1, THIRD, wei("30"));

        assert.equal((await userKeeper.maxLockedAmount(SECOND)).toFixed(), wei("15"));
        assert.equal((await userKeeper.maxLockedAmount(THIRD)).toFixed(), wei("30"));
      });

      it("should return 0 if no locked tokens", async () => {
        assert.equal((await userKeeper.maxLockedAmount(SECOND)).toFixed(), wei("0"));
      });

      it("should return max locked amount from different proposals", async () => {
        await userKeeper.lockTokens(1, SECOND, wei("10"));
        await userKeeper.lockTokens(1, SECOND, wei("5"));
        await userKeeper.lockTokens(2, SECOND, wei("50"));

        assert.equal((await userKeeper.maxLockedAmount(SECOND)).toFixed(), wei("50"));

        await userKeeper.lockTokens(1, SECOND, wei("50"));

        assert.equal((await userKeeper.maxLockedAmount(SECOND)).toFixed(), wei("65"));
      });
    });

    describe("withdrawTokens(), tokens", () => {
      beforeEach(async () => {
        await token.mint(OWNER, wei("900"));
        await token.mint(SECOND, wei("900"));

        await token.approve(userKeeper.address, wei("900"));

        await userKeeper.depositTokens(OWNER, THIRD, wei("900"));
      });

      it("should withdraw tokens", async () => {
        const withdrawable = await userKeeper.getWithdrawableAssets(THIRD, [], []);

        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("900"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("900"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });

      it("should withdraw part of token few times, considering lock", async () => {
        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).ownedBalance.toFixed(), wei("100"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("200"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).ownedBalance.toFixed(), wei("200"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).ownedBalance.toFixed(), wei("300"));

        await userKeeper.lockTokens(1, THIRD, wei("500"));

        await truffleAssert.reverts(userKeeper.withdrawTokens(THIRD, THIRD, wei("600")), "GovUK: can't withdraw this");

        await userKeeper.unlockTokens(1, THIRD, VoteType.PersonalVote);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD);
        await userKeeper.withdrawTokens(THIRD, THIRD, wei("600"));

        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, VoteType.PersonalVote)).ownedBalance.toFixed(), wei("900"));
      });

      it("should not withdraw more than balance", async () => {
        await truffleAssert.reverts(
          userKeeper.withdrawTokens(THIRD, THIRD, wei("999999")),
          "GovUK: can't withdraw this"
        );
      });

      it("should unlock tokens from all proposals", async () => {
        await userKeeper.lockTokens(1, THIRD, wei("100"));
        await userKeeper.lockTokens(2, THIRD, wei("300"));
        await userKeeper.lockTokens(3, THIRD, wei("500"));

        const withdrawable = await userKeeper.getWithdrawableAssets(THIRD, [], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("900"));

        await userKeeper.unlockTokens(1, THIRD, VoteType.PersonalVote);
        await userKeeper.unlockTokens(2, THIRD, VoteType.PersonalVote);
        await userKeeper.unlockTokens(3, THIRD, VoteType.PersonalVote);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD);

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("900"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });

      it("should unlock tokens from few proposals", async () => {
        await userKeeper.lockTokens(1, THIRD, wei("100"));
        await userKeeper.lockTokens(2, THIRD, wei("300"));
        await userKeeper.lockTokens(3, THIRD, wei("500"));

        let withdrawable = await userKeeper.getWithdrawableAssets(THIRD, [2], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("600"));

        await userKeeper.unlockTokens(1, THIRD, VoteType.PersonalVote);
        await userKeeper.unlockTokens(3, THIRD, VoteType.PersonalVote);
        await userKeeper.updateMaxTokenLockedAmount([2], THIRD);

        await truffleAssert.passes(userKeeper.updateMaxTokenLockedAmount([2], THIRD), "pass");

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("600"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("600"));

        withdrawable = await userKeeper.getWithdrawableAssets(THIRD, [], []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("300"));

        await userKeeper.unlockTokens(2, THIRD, VoteType.PersonalVote);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD);

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("300"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });
    });

    describe("lockNfts(), unlockNfts()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositNfts(OWNER, SECOND, [1, 2]);
        await userKeeper.depositNfts(OWNER, THIRD, [3, 4]);
      });

      it("should lock nfts from to addresses", async () => {
        await userKeeper.lockNfts(SECOND, VoteType.PersonalVote, [1]);
        await userKeeper.lockNfts(SECOND, VoteType.PersonalVote, [2]);
        await userKeeper.lockNfts(THIRD, VoteType.PersonalVote, [3]);

        const withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, [], []);

        assert.equal(withdrawableSecond.withdrawableNfts.length, "0");
        assert.deepEqual(
          withdrawableSecond.withdrawableNfts.map((e) => e.toFixed()),
          []
        );

        const withdrawableThird = await userKeeper.getWithdrawableAssets(THIRD, [], []);

        assert.equal(withdrawableThird.withdrawableNfts.length, "1");
        assert.deepEqual(
          withdrawableThird.withdrawableNfts.map((e) => e.toFixed()),
          ["4"]
        );
      });

      it("should not lock wrong delegated NFTs", async () => {
        await userKeeper.delegateNfts(SECOND, THIRD, [1, 2]);

        await truffleAssert.reverts(
          userKeeper.lockNfts(SECOND, VoteType.DelegatedVote, [3]),
          "GovUK: NFT is not owned"
        );
      });

      it("should unlock nfts", async () => {
        await userKeeper.lockNfts(SECOND, VoteType.PersonalVote, [1, 2]);

        let withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, [], []);

        assert.equal(withdrawableSecond.withdrawableNfts.length, "0");
        assert.deepEqual(
          withdrawableSecond.withdrawableNfts.map((e) => e.toFixed()),
          []
        );

        await userKeeper.unlockNfts([2]);

        withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, [], []);

        assert.equal(withdrawableSecond.withdrawableNfts.length, "1");
        assert.deepEqual(
          withdrawableSecond.withdrawableNfts.map((e) => e.toFixed()),
          ["2"]
        );
      });

      it("should not unlock unlocked NFTs", async () => {
        await userKeeper.lockNfts(SECOND, VoteType.PersonalVote, [1, 2]);

        await userKeeper.unlockNfts([2]);
        await truffleAssert.reverts(userKeeper.unlockNfts([2]), "GovUK: NFT is not locked");
      });
    });

    describe("withdrawNfts()", () => {
      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();

        await userKeeper.depositNfts(OWNER, SECOND, [1, 2]);
        await userKeeper.depositNfts(OWNER, THIRD, [3]);
      });

      it("should withdraw nfts", async () => {
        await userKeeper.lockNfts(SECOND, VoteType.PersonalVote, [1, 2]);

        const withdrawable = await userKeeper.getWithdrawableAssets(SECOND, [], [1, 8]);

        assert.deepEqual(
          withdrawable.withdrawableNfts.map((e) => e.toFixed()),
          ["1"]
        );

        await userKeeper.unlockNfts([1, 2]);

        await userKeeper.withdrawNfts(SECOND, SECOND, [1, 2]);

        assert.equal(await nft.ownerOf(1), SECOND);
        assert.equal(await nft.ownerOf(2), SECOND);
      });

      it("should withdraw nfts a few times", async () => {
        await userKeeper.withdrawNfts(SECOND, SECOND, [1]);

        assert.equal(await nft.ownerOf(1), SECOND);
        assert.equal(await nft.ownerOf(2), userKeeper.address);
        assert.equal(await nft.ownerOf(3), userKeeper.address);

        await userKeeper.withdrawNfts(THIRD, THIRD, [3]);

        assert.equal(await nft.ownerOf(2), userKeeper.address);
        assert.equal(await nft.ownerOf(3), THIRD);

        await userKeeper.withdrawNfts(SECOND, SECOND, [2]);

        assert.equal(await nft.ownerOf(2), SECOND);
      });

      it("should not withdraw more than deposited", async () => {
        await truffleAssert.reverts(
          userKeeper.withdrawNfts(SECOND, SECOND, [1, 2, 3]),
          "GovUK: NFT is not owned or locked"
        );
      });
    });

    describe("check snapshot", () => {
      let startTime;

      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();
        await userKeeper.depositNfts(OWNER, OWNER, [1]);
      });

      it("should correctly calculate NFT power after snapshot", async () => {
        await setTime(startTime + 999 + 100);
        await userKeeper.createNftPowerSnapshot();

        await setTime(startTime + 1999 + 100);
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.nftSnapshot(1)).toFixed(), "33");
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([8], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([9], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1, 8, 9], 1)).toFixed(), wei("3000"));

        assert.equal((await userKeeper.nftSnapshot(2)).toFixed(), "33");
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1], 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([8], 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([9], 2)).toFixed(), wei("1000"));
      });
    });

    describe("getDelegatedAssets()", () => {
      it("should return delegated assets properly", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("400"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), 0);
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          []
        );

        await userKeeper.delegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
        );

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), 0);
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          []
        );
      });

      it("should return delegated assets properly", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("400"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("0"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          []
        );

        await userKeeper.delegateTokens(OWNER, SECOND, wei("400"));

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          []
        );

        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
        );

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("200"));
        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 2, 3, 4]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("200"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          ["9", "8", "7", "6", "5"]
        );
      });
    });

    describe("canCreate()", () => {
      const DOUBLE_NFT_COST = wei("2000");
      const TRIPLE_NFT_COST = wei("3000");

      beforeEach(async () => {
        await userKeeper.createNftPowerSnapshot();
      });

      it("should return `true` if user has enough Personal tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        assert.isTrue(await userKeeper.canCreate(OWNER, VoteType.PersonalVote, wei("1000"), 1));
      });

      it("should return `false` if user has not enough Personal tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        assert.isFalse(await userKeeper.canCreate(OWNER, VoteType.PersonalVote, wei("1001"), 1));
      });

      it("should return `true` if user has enough Delegated tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));
        await userKeeper.delegateTokens(OWNER, SECOND, wei("1000"));

        assert.isTrue(await userKeeper.canCreate(OWNER, VoteType.DelegatedVote, wei("1000"), 1));
      });

      it("should return `false` if user has not enough Delegated tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));
        await userKeeper.delegateTokens(OWNER, SECOND, wei("1000"));

        assert.isFalse(await userKeeper.canCreate(OWNER, VoteType.DelegatedVote, wei("1001"), 1));
      });

      it("should return `true` if user has enough Personal NFTs", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2]);

        assert.isTrue(await userKeeper.canCreate(OWNER, VoteType.PersonalVote, DOUBLE_NFT_COST, 1));
      });

      it("should return `false` if user has not enough Personal NFTs", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1]);

        assert.isFalse(await userKeeper.canCreate(OWNER, VoteType.PersonalVote, DOUBLE_NFT_COST, 1));
      });

      it("should return `true` if user has enough Delegated NFTs", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2]);
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2]);

        assert.isTrue(await userKeeper.canCreate(OWNER, VoteType.DelegatedVote, DOUBLE_NFT_COST, 1));
      });

      it("should return `false` if user has not enough Delegated NFTs", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1]);
        await userKeeper.delegateNfts(OWNER, SECOND, [1]);

        assert.isFalse(await userKeeper.canCreate(OWNER, VoteType.DelegatedVote, DOUBLE_NFT_COST, 1));
      });

      it("should return `true` if user has enough tokens and NFTs", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));
        await userKeeper.delegateTokens(OWNER, SECOND, wei("500"));
        await userKeeper.delegateTokensTreasury(OWNER, wei("1000"));

        await userKeeper.depositNfts(OWNER, OWNER, [1, 2]);
        await userKeeper.delegateNfts(OWNER, SECOND, [2]);
        await userKeeper.delegateNftsTreasury(OWNER, [3]);

        assert.isTrue(
          await userKeeper.canCreate(
            OWNER,
            VoteType.DelegatedVote,
            toBN(TRIPLE_NFT_COST).plus(wei("2000")).toFixed(),
            1
          )
        );
      });
    });
  });

  describe("No ERC20 GovUserKeeper", () => {
    beforeEach("setup", async () => {
      await userKeeper.__GovUserKeeper_init(ZERO_ADDR, nft.address, wei("33000"), 33);
    });

    it("should revert if token is not supported", async () => {
      await truffleAssert.reverts(userKeeper.depositTokens(OWNER, OWNER, wei("100")), "GovUK: token is not supported");

      await truffleAssert.reverts(userKeeper.withdrawTokens(OWNER, OWNER, wei("100")), "GovUK: token is not supported");

      await truffleAssert.reverts(userKeeper.delegateTokens(OWNER, OWNER, wei("100")), "GovUK: token is not supported");

      await truffleAssert.reverts(
        userKeeper.delegateTokensTreasury(OWNER, wei("100")),
        "GovUK: token is not supported"
      );

      await truffleAssert.reverts(
        userKeeper.undelegateTokens(OWNER, OWNER, wei("100")),
        "GovUK: token is not supported"
      );

      await truffleAssert.reverts(
        userKeeper.undelegateTokensTreasury(OWNER, wei("100")),
        "GovUK: token is not supported"
      );
    });

    it("should calculate voting power", async () => {
      const power = (await userKeeper.votingPower([OWNER], [VoteType.DelegatedVote], true))[0];

      assert.equal(toBN(power.power).toFixed(), "0");
      assert.equal(toBN(power.rawPower).toFixed(), "0");
      assert.equal(toBN(power.nftPower).toFixed(), "0");
      assert.equal(toBN(power.rawNftPower).toFixed(), "0");
      assert.deepEqual(power.perNftPower, []);

      const tokenBalance = await userKeeper.tokenBalance(OWNER, VoteType.PersonalVote);

      assert.equal(tokenBalance.totalBalance, "0");
      assert.equal(tokenBalance.ownedBalance, "0");
    });

    it("should set erc20", async () => {
      await userKeeper.setERC20Address(token.address);

      assert.equal(token.address, await userKeeper.tokenAddress());
    });

    it("should revert, when new token address is 0", async () => {
      await truffleAssert.reverts(userKeeper.setERC20Address(ZERO_ADDR), "GovUK: new token address is zero");
    });

    it("should revert, when token address already set", async () => {
      await userKeeper.setERC20Address(token.address);
      await truffleAssert.reverts(userKeeper.setERC20Address(token.address), "GovUK: current token address isn't zero");
    });

    it("should revert, when caller is not owner", async () => {
      await truffleAssert.reverts(
        userKeeper.setERC20Address(token.address, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });

    it("should get total vote weight if tokenAddress is zero", async () => {
      assert.equal((await userKeeper.getTotalVoteWeight()).toFixed(), wei("33000"));
    });

    it("should get total vote weight", async () => {
      await userKeeper.setERC20Address(token.address);

      assert.equal((await userKeeper.getTotalVoteWeight()).toFixed(), wei("33000"));
    });
  });

  describe("No NFT GovUserKeeper", () => {
    beforeEach("setup", async () => {
      await userKeeper.__GovUserKeeper_init(token.address, ZERO_ADDR, wei("33000"), 33);
    });

    it("should revert if nft is not supported", async () => {
      await truffleAssert.reverts(userKeeper.depositNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");

      await truffleAssert.reverts(userKeeper.withdrawNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");

      await truffleAssert.reverts(userKeeper.delegateNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");

      await truffleAssert.reverts(userKeeper.delegateNftsTreasury(OWNER, [1]), "GovUK: nft is not supported");

      await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");

      await truffleAssert.reverts(userKeeper.undelegateNftsTreasury(OWNER, [1]), "GovUK: nft is not supported");
    });

    it("should calculate voting power", async () => {
      const power = (await userKeeper.votingPower([OWNER], [VoteType.DelegatedVote], false))[0];

      assert.equal(toBN(power.power).toFixed(), "0");
      assert.equal(toBN(power.rawPower).toFixed(), "0");
      assert.equal(toBN(power.nftPower).toFixed(), "0");
      assert.equal(toBN(power.rawNftPower).toFixed(), "0");
      assert.deepEqual(power.perNftPower, []);

      const nftPower = await userKeeper.nftVotingPower([], true);

      assert.equal(nftPower.nftPower, "0");
      assert.deepEqual(nftPower.perNftPower, []);

      const nftBalance = await userKeeper.nftBalance(OWNER, VoteType.PersonalVote);
      const nftExactBalance = await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote);

      assert.equal(nftBalance.totalBalance, "0");
      assert.equal(nftBalance.ownedBalance, "0");
      assert.deepEqual(nftExactBalance.nfts, []);
      assert.equal(nftExactBalance.ownedLength, "0");
    });

    it("should return zero delegated assets", async () => {
      const delegatedAmounts = await userKeeper.getDelegatedAssets(OWNER, SECOND);

      assert.equal(delegatedAmounts[0], "0");
      assert.deepEqual(delegatedAmounts[1], []);
    });

    it("should correctly calculate NFT weight if NFT contract is not added", async () => {
      assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([0], 0)).toFixed(), "0");
      assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1], 0)).toFixed(), "0");
      assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1], 1)).toFixed(), "0");
      assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([0], 1)).toFixed(), "0");
    });

    it("should snapshot with no NFTs", async () => {
      await userKeeper.createNftPowerSnapshot();

      assert.equal((await userKeeper.nftSnapshot(1)).toFixed(), "0");
      assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([], 1)).toFixed(), "0");
    });

    it("should set erc721", async () => {
      await userKeeper.setERC721Address(nft.address, wei("33000"), 33);

      assert.equal(nft.address, await userKeeper.nftAddress());
    });

    it("should revert, when new token address is 0", async () => {
      await truffleAssert.reverts(
        userKeeper.setERC721Address(ZERO_ADDR, wei("33000"), 33),
        "GovUK: new token address is zero"
      );
    });

    it("should revert, when token address already set", async () => {
      await userKeeper.setERC721Address(nft.address, wei("33000"), 33);
      await truffleAssert.reverts(
        userKeeper.setERC721Address(nft.address, wei("33000"), 33),
        "GovUK: current token address isn't zero"
      );
    });

    it("should revert, when caller is not owner", async () => {
      await truffleAssert.reverts(
        userKeeper.setERC721Address(nft.address, wei("33000"), 33, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("enumerable nft", () => {
    beforeEach("setup", async () => {
      nft = await ERC721EnumMock.new("Enum", "Enum");

      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 0);
    });

    describe("voting power", () => {
      it("should calculate voting power", async () => {
        assert.equal(
          toBN((await userKeeper.votingPower([OWNER], [VoteType.DelegatedVote], false))[0].power).toFixed(),
          "0"
        );

        await token.mint(OWNER, wei("10000"));
        await token.approve(userKeeper.address, wei("1000"));

        for (let i = 1; i < 10; i++) {
          await nft.safeMint(OWNER, i);
          await nft.approve(userKeeper.address, i);
        }

        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 3, 5]);

        const power = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];
        const singleNFTPower = toBN(wei("33000")).idiv(9).toFixed();

        assert.equal(toBN(power.power).toFixed(), wei("43000"));
        assert.equal(toBN(power.rawPower).toFixed(), wei("12000"));
        assert.equal(toBN(power.nftPower).toFixed(), wei("33000"));
        assert.equal(toBN(power.rawNftPower).toFixed(), wei("11000"));
        assert.deepEqual(
          power.perNftPower.map((e) => toBN(e).toFixed()),
          [
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
          ]
        );

        assert.equal(
          toBN((await userKeeper.votingPower([OWNER], [VoteType.MicropoolVote], false))[0].power).toFixed(),
          "0"
        );

        const balanceOwner = await userKeeper.nftBalance(OWNER, VoteType.PersonalVote);
        const exactBalanceOwner = await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote);

        assert.equal(balanceOwner.totalBalance, "9");
        assert.equal(balanceOwner.ownedBalance, "6");
        assert.deepEqual(
          exactBalanceOwner.nfts.map((e) => e.toFixed()),
          ["1", "3", "5", "9", "2", "8", "4", "7", "6"]
        );
        assert.equal(exactBalanceOwner.ownedLength, "6");
      });

      it("should calculate transformed voting power", async () => {
        const govPoolMock = await GovPoolMock.new();
        const votePowerMock = await VotePowerMock.new();
        await govPoolMock.setVotePowerContract(votePowerMock.address);

        assert.equal(
          toBN((await userKeeper.votingPower([OWNER], [VoteType.DelegatedVote], false))[0].power).toFixed(),
          "0"
        );

        await token.mint(OWNER, wei("10000"));
        await token.approve(userKeeper.address, wei("1000"));

        for (let i = 1; i < 10; i++) {
          await nft.safeMint(OWNER, i);
          await nft.approve(userKeeper.address, i);
        }

        await userKeeper.transferOwnership(govPoolMock.address);

        assert.equal(
          (await userKeeper.transformedVotingPower(SECOND, wei("1"), [1, 2, 3])).toFixed(),
          toBN(wei("1"))
            .plus(toBN(wei("33000")).multipliedBy(3).idiv(9))
            .pow(2)
            .toFixed()
        );
        assert.equal(
          (await userKeeper.transformedVotingPower(SECOND, 0, [1, 2, 3])).toFixed(),
          toBN(wei("33000")).multipliedBy(3).idiv(9).pow(2).toFixed()
        );
        assert.equal(
          (await userKeeper.transformedVotingPower(SECOND, wei("1"), [])).toFixed(),
          toBN(wei("1")).pow(2).toFixed()
        );
        assert.equal((await userKeeper.transformedVotingPower(SECOND, 0, [])).toFixed(), "0");
      });
    });

    describe("snapshot", () => {
      beforeEach("setup", async () => {
        for (let i = 1; i <= 9; i++) {
          await nft.safeMint(OWNER, i);
          await nft.approve(userKeeper.address, i);
        }
      });

      it("should not change NFT power after updateNftPowers", async () => {
        const power1 = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];

        const totalNFTPower = wei("33000");
        const singleNFTPower = toBN(totalNFTPower).idiv(9).toFixed();

        assert.equal(toBN(power1.power).toFixed(), totalNFTPower);
        assert.equal(toBN(power1.rawPower).toFixed(), "0");
        assert.equal(toBN(power1.nftPower).toFixed(), totalNFTPower);
        assert.equal(toBN(power1.rawNftPower).toFixed(), "0");
        assert.deepEqual(
          power1.perNftPower.map((e) => toBN(e).toFixed()),
          [
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
          ]
        );

        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        const power2 = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];

        assert.equal(toBN(power2.power).toFixed(), totalNFTPower);
        assert.equal(toBN(power1.rawPower).toFixed(), "0");
        assert.equal(toBN(power2.nftPower).toFixed(), totalNFTPower);
        assert.equal(toBN(power1.rawNftPower).toFixed(), "0");
        assert.deepEqual(
          power2.perNftPower.map((e) => toBN(e).toFixed()),
          [
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
            singleNFTPower,
          ]
        );
      });

      it("should snapshot with no NFTs", async () => {
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([], 1)).toFixed(), "0");
      });
    });

    describe("getDelegatedAssets()", () => {
      it("should return delegated assets properly", async () => {
        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("0"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          []
        );

        await token.mint(OWNER, wei("400"));
        await token.approve(userKeeper.address, wei("400"));

        for (let i = 1; i <= 3; i++) {
          await nft.safeMint(OWNER, i);
          await nft.approve(userKeeper.address, i);
        }

        await userKeeper.depositTokens(OWNER, OWNER, wei("400"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("0"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          []
        );

        await userKeeper.delegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2, 3]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          ["1", "2", "3"]
        );

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 2, 3]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("0"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => toBN(e).toFixed()),
          []
        );
      });
    });
  });

  describe("nft with power", () => {
    let startTime;

    beforeEach("setup", async () => {
      startTime = await getCurrentBlockTime();

      nft = await ERC721Power.new();
      await nft.__ERC721Power_init(
        "Power",
        "Power",
        startTime + 200,
        token.address,
        wei("10000"),
        PRECISION.times(toBN("0.01")),
        wei("500")
      );

      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);

      await token.mint(OWNER, wei("900"));
      await token.approve(nft.address, wei("500"));

      for (let i = 1; i <= 9; i++) {
        if (i === 8) {
          continue;
        }

        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }

      await nft.addCollateral(wei("500"), "9");
    });

    describe("updateNfts()", () => {
      it("should not update if caller is not an owner", async () => {
        await truffleAssert.reverts(
          userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9], { from: THIRD }),
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("snapshot()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositNfts(OWNER, SECOND, [1]);
      });

      it("should correctly calculate NFT power after snapshot", async () => {
        const power1 = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];

        assert.equal(toBN(power1.power).toFixed(), wei("400"));
        assert.equal(toBN(power1.rawPower).toFixed(), "0");
        assert.equal(toBN(power1.nftPower).toFixed(), "0");
        assert.equal(toBN(power1.rawNftPower).toFixed(), "0");
        assert.deepEqual(
          power1.perNftPower.map((e) => toBN(e).toFixed()),
          ["0", "0", "0", "0", "0", "0", "0"]
        );

        await setTime(startTime + 999);

        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        let power2 = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];

        assert.equal(
          toBN(power2.power).toFixed(),
          (await userKeeper.getNftsPowerInTokensBySnapshot([2, 3, 4, 5, 6, 7, 9], 1)).plus(wei("400")).toFixed()
        );
        assert.equal(toBN(power2.rawPower).toFixed(), "0");
        assert.equal(
          toBN(power2.nftPower).toFixed(),
          (await userKeeper.getNftsPowerInTokensBySnapshot([2, 3, 4, 5, 6, 7, 9], 1)).toFixed()
        );
        assert.equal(toBN(power2.rawNftPower).toFixed(), "0");
        assert.deepEqual(
          power2.perNftPower.map((e) => toBN(e).toFixed()),
          [
            "4435483870967741935483",
            "4080201612903225806451",
            "4080201612903225806451",
            "4080201612903225806451",
            "4080201612903225806451",
            "4080201612903225806451",
            "4080201612903225806451",
          ]
        );

        power2 = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], false))[0];

        assert.deepEqual(
          power2.perNftPower.map((e) => toBN(e).toFixed()),
          []
        );

        await setTime(startTime + 1999);
        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        const balanceOwner = await userKeeper.nftBalance(OWNER, VoteType.PersonalVote);
        const exactBalanceOwner = await userKeeper.nftExactBalance(OWNER, VoteType.PersonalVote);

        assert.equal(balanceOwner.totalBalance, "7");
        assert.equal(balanceOwner.ownedBalance, "7");
        assert.deepEqual(
          exactBalanceOwner.nfts.map((e) => e.toFixed()),
          ["9", "2", "3", "4", "5", "6", "7"]
        );
        assert.equal(exactBalanceOwner.ownedLength.toFixed(), "7");

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, VoteType.PersonalVote)).nfts.map((e) => e.toFixed()),
          ["1"]
        );

        assert.equal((await userKeeper.nftSnapshot(1)).toFixed(), wei("74400"));
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([1], 1)).toFixed(),
          wei("3636.653225806451612903")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([2], 1)).toFixed(),
          wei("3636.653225806451612903")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([8], 1)).toFixed(),
          wei("3636.653225806451612903")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([9], 1)).toFixed(),
          wei("4435.483870967741935483")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([1, 8, 9], 1)).toFixed(),
          wei("11708.790322580645161289")
        );

        assert.equal((await userKeeper.nftSnapshot(2)).toFixed(), wei("67400"));
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([1], 2)).toFixed(),
          wei("4014.347181008902077151")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([2], 2)).toFixed(),
          wei("4014.347181008902077151")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([8], 2)).toFixed(),
          wei("4014.347181008902077151")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokensBySnapshot([9], 2)).toFixed(),
          wei("4896.142433234421364985")
        );
      });

      it("should calculate zero NFT power", async () => {
        await nft.removeCollateral(wei("500"), "9");

        await setTime(startTime + 1000000000000);

        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.nftSnapshot(1)).toFixed(), "0");
        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([1], 1)).toFixed(), "0");

        const power = (await userKeeper.votingPower([OWNER], [VoteType.PersonalVote], true))[0];

        assert.equal(toBN(power.power).toFixed(), wei("900"));
        assert.equal(toBN(power.rawPower).toFixed(), "0");
        assert.equal(toBN(power.nftPower).toFixed(), "0");
        assert.equal(toBN(power.rawNftPower).toFixed(), "0");
        assert.deepEqual(
          power.perNftPower.map((e) => toBN(e).toFixed()),
          ["0", "0", "0", "0", "0", "0", "0"]
        );
      });
    });

    describe("getDelegatedAssets()", () => {
      it("should return delegated amount properly", async () => {
        await token.approve(userKeeper.address, wei("400"));

        await userKeeper.depositTokens(OWNER, OWNER, wei("400"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5, 6, 7, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), "0");
        assert.deepEqual((await userKeeper.getDelegatedAssets(OWNER, SECOND))[1], []);

        await userKeeper.delegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "9"]
        );

        await setTime(startTime + 201);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), wei("400"));
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "9"]
        );

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("400"));
        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), "0");
        assert.deepEqual((await userKeeper.getDelegatedAssets(OWNER, SECOND))[1], []);
      });

      it("should return zero delegated stake amount", async () => {
        await nft.removeCollateral(wei("500"), "9");

        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 2, 3, 4, 5, 6, 7, 9]);

        await setTime(startTime + 1000000000000);

        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);

        assert.equal((await userKeeper.getDelegatedAssets(OWNER, SECOND))[0].toFixed(), "0");
        assert.deepEqual(
          (await userKeeper.getDelegatedAssets(OWNER, SECOND))[1].map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5", "6", "7", "9"]
        );
      });
    });
  });
});
