const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/utils/utils");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR, PRECISION } = require("../scripts/utils/constants");
const { getCurrentBlockTime, setTime } = require("./helpers/block-helper");

const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC721Power = artifacts.require("ERC721Power");

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

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721Mock.new("Mock", "Mock");

    userKeeper = await GovUserKeeper.new();
  });

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

        const nftInfo = await userKeeper.nftInfo();

        assert.isFalse(nftInfo.isSupportPower);
        assert.equal(nftInfo.totalPowerInTokens.toFixed(), wei("33000"));
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
          userKeeper.undelegateTokens(OWNER, SECOND, wei("100"), { from: SECOND }),
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
          userKeeper.undelegateNfts(OWNER, SECOND, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.createNftPowerSnapshot({ from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.updateMaxTokenLockedAmount([1], OWNER, false, { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.lockTokens(1, OWNER, false, wei("100"), { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.unlockTokens(1, OWNER, false, { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          userKeeper.lockNfts(OWNER, false, false, [1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(userKeeper.unlockNfts([1], { from: SECOND }), "Ownable: caller is not the owner");
      });
    });

    describe("depositTokens()", () => {
      it("should correctly add tokens to balance", async () => {
        assert.equal((await userKeeper.votingPower(SECOND, false, false)).power.toFixed(), "0");

        await userKeeper.depositTokens(OWNER, SECOND, wei("100"));

        const power = await userKeeper.votingPower(SECOND, false, false);

        assert.equal(power.power.toFixed(), wei("100"));
        assert.equal(power.nftPower.toFixed(), "0");
        assert.deepEqual(power.perNftPower, []);
        assert.equal(power.ownedBalance.toFixed(), "0");
        assert.equal(power.ownedLength.toFixed(), "0");
        assert.deepEqual(power.nftIds, []);

        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).totalBalance.toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).ownedBalance.toFixed(), "0");

        await userKeeper.depositTokens(OWNER, SECOND, wei("200"));
        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).totalBalance.toFixed(), wei("300"));
        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).ownedBalance.toFixed(), "0");

        await userKeeper.depositTokens(OWNER, OWNER, wei("10"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).totalBalance.toFixed(), wei("999700"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).ownedBalance.toFixed(), wei("999690"));
      });
    });

    describe("depositNfts()", () => {
      it("should correctly add tokens to balance", async () => {
        assert.equal((await userKeeper.votingPower(SECOND, false, false)).power.toFixed(), "0");

        await userKeeper.depositNfts(OWNER, SECOND, [1, 3, 5]);

        const power = await userKeeper.votingPower(SECOND, false, false);

        assert.equal(power.power.toFixed(), wei("3000"));
        assert.equal(power.nftPower.toFixed(), wei("3000"));
        assert.deepEqual(
          power.perNftPower.map((e) => e.toFixed()),
          [wei("1000"), wei("1000"), wei("1000")]
        );
        assert.equal(power.ownedBalance.toFixed(), "0");
        assert.equal(power.ownedLength.toFixed(), "0");
        assert.deepEqual(
          power.nftIds.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        await userKeeper.depositNfts(OWNER, SECOND, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5", "2", "4"]
        );

        await userKeeper.depositNfts(OWNER, OWNER, [6, 9]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).nfts.map((e) => e.toFixed()),
          ["6", "9", "0", "0"]
        );
      });
    });

    describe("delegateTokens(), undelegateTokens()", () => {
      it("should correctly delegate tokens, add delegators and spenders", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("444"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).totalBalance.toFixed(), wei("333"));
        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).totalBalance.toFixed(), wei("444"));
        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).totalBalance.toFixed(), wei("999223"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).ownedBalance.toFixed(), wei("999000"));

        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).totalBalance.toFixed(), wei("1000000"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).ownedBalance.toFixed(), wei("999000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("111"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("111"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).totalBalance.toFixed(), wei("444"));
        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).totalBalance.toFixed(), wei("555"));
        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).ownedBalance.toFixed(), "0");

        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).totalBalance.toFixed(), wei("999001"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).ownedBalance.toFixed(), wei("999000"));

        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).totalBalance.toFixed(), wei("1000000"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).ownedBalance.toFixed(), wei("999000"));

        const delegationsInfo = await userKeeper.delegations(OWNER);

        assert.equal(delegationsInfo.length, 2);

        assert.equal(delegationsInfo[0].delegatee, SECOND);
        assert.equal(delegationsInfo[0].delegatedTokens, wei("444"));
        assert.deepEqual(delegationsInfo[0].delegatedNfts, []);

        assert.equal(delegationsInfo[1].delegatee, THIRD);
        assert.equal(delegationsInfo[1].delegatedTokens, wei("555"));
        assert.deepEqual(delegationsInfo[1].delegatedNfts, []);
      });

      it("should not delegate more than balance", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await truffleAssert.reverts(userKeeper.delegateTokens(OWNER, SECOND, wei("1001")), "GovUK: overdelegation");
      });

      it("should undelegate all tokens", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).totalBalance.toFixed(), wei("333"));
        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).ownedBalance.toFixed(), "0");

        await userKeeper.undelegateTokens(OWNER, SECOND, wei("333"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).totalBalance.toFixed(), "0");
        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).ownedBalance.toFixed(), "0");
      });

      it("should not undelegate more tokens than available", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));

        await truffleAssert.reverts(
          userKeeper.undelegateTokens(OWNER, SECOND, wei("334")),
          "GovUK: amount exceeds delegation"
        );

        await userKeeper.lockTokens(1, SECOND, true, wei("10"));

        await truffleAssert.reverts(
          userKeeper.undelegateTokens(OWNER, SECOND, wei("324")),
          "GovUK: amount exceeds delegation"
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
          (await userKeeper.nftExactBalance(SECOND, true, false)).nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.deepEqual(
          (await userKeeper.nftExactBalance(THIRD, true, false)).nfts.map((e) => e.toFixed()),
          ["2", "4"]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).nfts.map((e) => e.toFixed()),
          ["5", "0", "0", "0", "0"]
        );

        const balanceOwner = await userKeeper.nftExactBalance(OWNER, false, true);

        assert.deepEqual(
          balanceOwner.nfts.map((e) => e.toFixed()),
          ["5", "1", "3", "2", "4", "0", "0", "0", "0"]
        );
        assert.equal(balanceOwner.ownedLength, "4");

        await userKeeper.delegateNfts(OWNER, SECOND, [5]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, true, false)).nfts.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        const delegationsInfo = await userKeeper.delegations(OWNER);

        assert.equal(delegationsInfo.length, 2);

        assert.equal(delegationsInfo[0].delegatee, SECOND);
        assert.equal(delegationsInfo[0].delegatedTokens, "0");
        assert.deepEqual(delegationsInfo[0].delegatedNfts, ["1", "3", "5"]);

        assert.equal(delegationsInfo[1].delegatee, THIRD);
        assert.equal(delegationsInfo[1].delegatedTokens, "0");
        assert.deepEqual(delegationsInfo[1].delegatedNfts, ["2", "4"]);
      });

      it("should not delegate unavailable NFTs", async () => {
        await truffleAssert.reverts(userKeeper.delegateNfts(OWNER, SECOND, [6]), "GovUK: NFT is not owned or locked");

        await userKeeper.lockNfts(OWNER, false, false, [1]);

        await truffleAssert.reverts(userKeeper.delegateNfts(OWNER, SECOND, [1]), "GovUK: NFT is not owned or locked");
      });

      it("should undelegate nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);

        const balance1 = await userKeeper.nftExactBalance(SECOND, true, false);

        assert.deepEqual(
          balance1.nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(balance1.ownedLength, "0");

        await userKeeper.undelegateNfts(OWNER, SECOND, [1]);

        const balance2 = await userKeeper.nftExactBalance(SECOND, true, false);

        assert.deepEqual(
          balance2.nfts.map((e) => e.toFixed()),
          ["3"]
        );
        assert.equal(balance2.ownedLength, "0");
      });

      it("should undelegate all nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);

        const balanceSecond = await userKeeper.nftExactBalance(SECOND, true, false);

        assert.deepEqual(
          balanceSecond.nfts.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(balanceSecond.ownedLength, "0");

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).nfts.map((e) => e.toFixed()),
          ["5", "2", "4", "0", "0", "0", "0"]
        );

        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 3]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, true, false)).nfts.map((e) => e.toFixed()),
          []
        );

        const balanceOwner = await userKeeper.nftExactBalance(OWNER, false, false);

        assert.deepEqual(
          balanceOwner.nfts.map((e) => e.toFixed()),
          ["5", "2", "4", "1", "3", "0", "0", "0", "0"]
        );
        assert.equal(balanceOwner.ownedLength, "4");
      });

      it("should not undelegate unavailable NFTs", async () => {
        await userKeeper.depositNfts(OWNER, THIRD, [8]);

        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);
        await userKeeper.delegateNfts(THIRD, SECOND, [8]);

        const undelegateable = await userKeeper.getUndelegateableAssets(
          OWNER,
          SECOND,
          { values: [], length: 0 },
          [1, 2, 8]
        );

        assert.deepEqual(undelegateable.undelegateableNfts[0], ["1", "3", "0"]);

        await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, SECOND, [6]), "GovUK: NFT is not owned or locked");
        await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, SECOND, [4]), "GovUK: NFT is not owned or locked");

        await userKeeper.lockNfts(SECOND, true, false, [1]);

        await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, SECOND, [1]), "GovUK: NFT is not owned or locked");
      });
    });

    describe("lockTokens(), unlockTokens()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositTokens(OWNER, SECOND, wei("500"));
        await userKeeper.depositTokens(OWNER, THIRD, wei("500"));
      });

      it("should lock tokens from to addresses", async () => {
        await userKeeper.lockTokens(1, SECOND, false, wei("10"));
        await userKeeper.lockTokens(1, SECOND, false, wei("5"));
        await userKeeper.lockTokens(1, THIRD, false, wei("30"));

        const withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, { values: [1], length: 1 }, []);
        const withdrawableThird = await userKeeper.getWithdrawableAssets(THIRD, { values: [1], length: 1 }, []);

        assert.equal(withdrawableSecond.withdrawableTokens.toFixed(), wei("485"));
        assert.equal(withdrawableThird.withdrawableTokens.toFixed(), wei("470"));
      });

      it("should unlock", async () => {
        await userKeeper.lockTokens(1, SECOND, false, wei("10"));

        let withdrawable = await userKeeper.getWithdrawableAssets(SECOND, { values: [1], length: 1 }, []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("490"));

        await userKeeper.unlockTokens(1, SECOND, false);

        withdrawable = await userKeeper.getWithdrawableAssets(SECOND, { values: [1], length: 1 }, []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("500"));
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
        const withdrawable = await userKeeper.getWithdrawableAssets(THIRD, { values: [], length: 0 }, []);

        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("900"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("900"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });

      it("should withdraw part of token few times, considering lock", async () => {
        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).ownedBalance.toFixed(), wei("100"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("200"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).ownedBalance.toFixed(), wei("200"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).ownedBalance.toFixed(), wei("300"));

        await userKeeper.lockTokens(1, THIRD, false, wei("500"));

        await truffleAssert.reverts(userKeeper.withdrawTokens(THIRD, THIRD, wei("600")), "GovUK: can't withdraw this");

        await userKeeper.unlockTokens(1, THIRD, false);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD, false);
        await userKeeper.withdrawTokens(THIRD, THIRD, wei("600"));

        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).totalBalance.toFixed(), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).ownedBalance.toFixed(), wei("900"));
      });

      it("should not withdraw more than balance", async () => {
        await truffleAssert.reverts(
          userKeeper.withdrawTokens(THIRD, THIRD, wei("999999")),
          "GovUK: can't withdraw this"
        );
      });

      it("should unlock tokens from all proposals", async () => {
        await userKeeper.lockTokens(1, THIRD, false, wei("100"));
        await userKeeper.lockTokens(2, THIRD, false, wei("300"));
        await userKeeper.lockTokens(3, THIRD, false, wei("500"));

        const withdrawable = await userKeeper.getWithdrawableAssets(THIRD, { values: [], length: 0 }, []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("900"));

        await userKeeper.unlockTokens(1, THIRD, false);
        await userKeeper.unlockTokens(2, THIRD, false);
        await userKeeper.unlockTokens(3, THIRD, false);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD, false);

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("900"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });

      it("should unlock tokens from few proposals", async () => {
        await userKeeper.lockTokens(1, THIRD, false, wei("100"));
        await userKeeper.lockTokens(2, THIRD, false, wei("300"));
        await userKeeper.lockTokens(3, THIRD, false, wei("500"));

        let withdrawable = await userKeeper.getWithdrawableAssets(THIRD, { values: [2], length: 1 }, []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("600"));

        await userKeeper.unlockTokens(1, THIRD, false);
        await userKeeper.unlockTokens(3, THIRD, false);
        await userKeeper.updateMaxTokenLockedAmount([2], THIRD, false);

        await truffleAssert.passes(userKeeper.updateMaxTokenLockedAmount([2], THIRD, false), "pass");

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("600"));

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("600"));

        withdrawable = await userKeeper.getWithdrawableAssets(THIRD, { values: [], length: 0 }, []);
        assert.equal(withdrawable.withdrawableTokens.toFixed(), wei("300"));

        await userKeeper.unlockTokens(2, THIRD, false);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD, false);

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
        await userKeeper.lockNfts(SECOND, false, false, [1]);
        await userKeeper.lockNfts(SECOND, false, false, [2]);
        await userKeeper.lockNfts(THIRD, false, false, [3]);

        const withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, { values: [], length: 0 }, []);
        let ids = withdrawableSecond.withdrawableNfts[0];
        let length = withdrawableSecond.withdrawableNfts[1];

        assert.equal(length, "0");
        assert.deepEqual(ids, ["0", "0"]);

        const withdrawableThird = await userKeeper.getWithdrawableAssets(THIRD, { values: [], length: 0 }, []);
        ids = withdrawableThird.withdrawableNfts[0];
        length = withdrawableThird.withdrawableNfts[1];

        assert.equal(length, "1");
        assert.deepEqual(ids, ["4", "0"]);
      });

      it("should not lock wrong delegated NFTs", async () => {
        await userKeeper.delegateNfts(SECOND, THIRD, [1, 2]);

        await truffleAssert.reverts(userKeeper.lockNfts(SECOND, false, true, [3]), "GovUK: NFT is not owned");
      });

      it("should unlock nfts", async () => {
        await userKeeper.lockNfts(SECOND, false, false, [1, 2]);

        let withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, { values: [], length: 0 }, []);
        let ids = withdrawableSecond.withdrawableNfts[0];
        let length = withdrawableSecond.withdrawableNfts[1];

        assert.equal(length, "0");
        assert.deepEqual(ids, ["0", "0"]);

        await userKeeper.unlockNfts([2]);

        withdrawableSecond = await userKeeper.getWithdrawableAssets(SECOND, { values: [], length: 0 }, []);
        ids = withdrawableSecond.withdrawableNfts[0];
        length = withdrawableSecond.withdrawableNfts[1];

        assert.equal(length, "1");
        assert.deepEqual(ids, ["2", "0"]);
      });

      it("should not unlock unlocked NFTs", async () => {
        await userKeeper.lockNfts(SECOND, false, false, [1, 2]);

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
        await userKeeper.lockNfts(SECOND, false, false, [1, 2]);

        const withdrawable = await userKeeper.getWithdrawableAssets(SECOND, { values: [], length: 0 }, [1, 8]);

        assert.deepEqual(withdrawable.withdrawableNfts[0], ["1", "0"]);

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
        userKeeper.undelegateTokens(OWNER, OWNER, wei("100")),
        "GovUK: token is not supported"
      );
    });

    it("should calculate voting power", async () => {
      const power = await userKeeper.votingPower(OWNER, false, true);

      assert.equal(power.power.toFixed(), "0");
      assert.equal(power.nftPower.toFixed(), "0");
      assert.deepEqual(power.perNftPower, []);

      const tokenBalance = await userKeeper.tokenBalance(OWNER, false, false);

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

    it("should get total vote weight", async () => {
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

      await truffleAssert.reverts(userKeeper.undelegateNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");
    });

    it("should calculate voting power", async () => {
      const power = await userKeeper.votingPower(OWNER, false, true);

      assert.equal(power.power.toFixed(), "0");
      assert.equal(power.nftPower.toFixed(), "0");
      assert.deepEqual(power.perNftPower, []);

      const nftBalance = await userKeeper.nftBalance(OWNER, false, false);

      assert.equal(nftBalance.totalBalance, "0");
      assert.equal(nftBalance.ownedBalance, "0");
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
        assert.equal((await userKeeper.votingPower(OWNER, false, true)).power.toFixed(), "0");

        await token.mint(OWNER, wei("10000"));
        await token.approve(userKeeper.address, wei("1000"));

        for (let i = 1; i < 10; i++) {
          await nft.safeMint(OWNER, i);
          await nft.approve(userKeeper.address, i);
        }

        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));
        await userKeeper.depositNfts(OWNER, OWNER, [1, 3, 5]);

        const power = await userKeeper.votingPower(OWNER, false, false);
        const singleNFTPower = toBN(wei("33000")).idiv(9).toFixed();

        assert.equal(power.power.toFixed(), wei("43000"));
        assert.equal(power.nftPower.toFixed(), wei("33000"));
        assert.deepEqual(
          power.perNftPower.map((e) => e.toFixed()),
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

        assert.equal((await userKeeper.votingPower(OWNER, true, false)).power.toFixed(), "0");

        const balanceOwner = await userKeeper.nftExactBalance(OWNER, false, false);

        assert.deepEqual(
          balanceOwner.nfts.map((e) => e.toFixed()),
          ["1", "3", "5", "9", "2", "8", "4", "7", "6"]
        );
        assert.equal(balanceOwner.ownedLength, "6");
      });
    });

    describe("snapshot", () => {
      it("should snapshot with no NFTs", async () => {
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.getNftsPowerInTokensBySnapshot([], 1)).toFixed(), "0");
      });
    });
  });

  describe("nft with power", () => {
    let startTime;

    beforeEach("setup", async () => {
      startTime = await getCurrentBlockTime();

      nft = await ERC721Power.new(
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
        const power1 = await userKeeper.votingPower(OWNER, false, false);

        assert.equal(power1.power.toFixed(), wei("400"));
        assert.equal(power1.nftPower.toFixed(), "0");
        assert.deepEqual(
          power1.perNftPower.map((e) => e.toFixed()),
          ["0", "0", "0", "0", "0", "0", "0"]
        );

        await setTime(startTime + 999);

        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        const power2 = await userKeeper.votingPower(OWNER, false, false);

        assert.equal(
          power2.power.toFixed(),
          (await userKeeper.getNftsPowerInTokensBySnapshot([2, 3, 4, 5, 6, 7, 9], 1)).plus(wei("400")).toFixed()
        );
        assert.equal(
          power2.nftPower.toFixed(),
          (await userKeeper.getNftsPowerInTokensBySnapshot([2, 3, 4, 5, 6, 7, 9], 1)).toFixed()
        );
        assert.deepEqual(
          power2.perNftPower.map((e) => e.toFixed()),
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

        await setTime(startTime + 1999);
        await userKeeper.updateNftPowers([1, 2, 3, 4, 5, 6, 7, 9]);
        await userKeeper.createNftPowerSnapshot();

        const balanceOwner = await userKeeper.nftExactBalance(OWNER, false, false);

        assert.deepEqual(
          balanceOwner.nfts.map((e) => e.toFixed()),
          ["9", "2", "3", "4", "5", "6", "7"]
        );
        assert.equal(balanceOwner.ownedLength.toFixed(), "7");

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).nfts.map((e) => e.toFixed()),
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

        const power = await userKeeper.votingPower(OWNER, false, false);

        assert.equal(power.power.toFixed(), wei("900"));
        assert.equal(power.nftPower.toFixed(), "0");
        assert.deepEqual(
          power.perNftPower.map((e) => e.toFixed()),
          ["0", "0", "0", "0", "0", "0", "0"]
        );
      });
    });
  });
});
