const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");

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

const ZERO = "0x0000000000000000000000000000000000000000";
const PRECISION = toBN(10).pow(25);

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
    userKeeper = await GovUserKeeper.new();
  });

  describe("Plain GovUserKeeper", () => {
    beforeEach("setup", async () => {
      nft = await ERC721Mock.new("Mock", "Mock");

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
        assert.isFalse(nftInfo.isSupportTotalSupply);
        assert.equal(nftInfo.totalPowerInTokens.toFixed(), wei("33000"));
        assert.equal(nftInfo.totalSupply, "33");
      });
    });

    describe("depositTokens()", () => {
      it("should correctly add tokens to balance", async () => {
        await userKeeper.depositTokens(OWNER, SECOND, wei("100"));
        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).toFixed(), wei("100"));

        await userKeeper.depositTokens(OWNER, SECOND, wei("200"));
        assert.equal((await userKeeper.tokenBalance(SECOND, false, false)).toFixed(), wei("300"));

        await userKeeper.depositTokens(OWNER, OWNER, wei("10"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).toFixed(), wei("10"));
      });
    });

    describe("depositNfts()", () => {
      it("should correctly add tokens to balance", async () => {
        await userKeeper.depositNfts(OWNER, SECOND, [1, 3, 5]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        await userKeeper.depositNfts(OWNER, SECOND, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).map((e) => e.toFixed()),
          ["1", "3", "5", "2", "4"]
        );

        await userKeeper.depositNfts(OWNER, OWNER, [6, 9]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).map((e) => e.toFixed()),
          ["6", "9"]
        );
      });
    });

    describe("delegateTokens(), undelegateTokens()", () => {
      it("should correctly delegate tokens, add delegators and spenders", async () => {
        await userKeeper.depositTokens(OWNER, OWNER, wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("333"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("444"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).toFixed(), wei("333"));
        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).toFixed(), wei("444"));

        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).toFixed(), wei("223"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).toFixed(), wei("1000"));

        await userKeeper.delegateTokens(OWNER, SECOND, wei("111"));
        await userKeeper.delegateTokens(OWNER, THIRD, wei("111"));

        assert.equal((await userKeeper.tokenBalance(SECOND, true, false)).toFixed(), wei("444"));
        assert.equal((await userKeeper.tokenBalance(THIRD, true, false)).toFixed(), wei("555"));

        assert.equal((await userKeeper.tokenBalance(OWNER, false, false)).toFixed(), wei("1"));
        assert.equal((await userKeeper.tokenBalance(OWNER, false, true)).toFixed(), wei("1000"));
      });

      it("should undelegate tokens", async () => {});
    });

    describe("delegateNfts(), undelegateNfts()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositNfts(OWNER, OWNER, [1, 2, 3, 4, 5]);
      });

      it("should correctly delegate nfts and add new nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);
        await userKeeper.delegateNfts(OWNER, THIRD, [2, 4]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, true, false)).map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.deepEqual(
          (await userKeeper.nftExactBalance(THIRD, true, false)).map((e) => e.toFixed()),
          ["2", "4"]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).map((e) => e.toFixed()),
          ["5"]
        );
        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, true)).map((e) => e.toFixed()),
          ["5", "1", "3", "2", "4"]
        );

        await userKeeper.delegateNfts(OWNER, SECOND, [5]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, true, false)).map((e) => e.toFixed()),
          ["1", "3", "5"]
        );
      });

      it("should undelegate nfts", async () => {
        await userKeeper.delegateNfts(OWNER, SECOND, [1, 3]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, true, false)).map((e) => e.toFixed()),
          ["1", "3"]
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).map((e) => e.toFixed()),
          ["5", "2", "4"]
        );

        await userKeeper.undelegateNfts(OWNER, SECOND, [1, 3]);

        assert.deepEqual(
          (await userKeeper.nftExactBalance(SECOND, false, false)).map((e) => e.toFixed()),
          []
        );

        assert.deepEqual(
          (await userKeeper.nftExactBalance(OWNER, false, false)).map((e) => e.toFixed()),
          ["5", "2", "4", "1", "3"]
        );
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
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).toFixed(), wei("800"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("200"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).toFixed(), wei("700"));

        await userKeeper.withdrawTokens(THIRD, THIRD, wei("100"));

        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).toFixed(), wei("600"));

        await userKeeper.lockTokens(1, THIRD, false, wei("500"));

        await truffleAssert.reverts(userKeeper.withdrawTokens(THIRD, THIRD, wei("600")), "GovUK: can't withdraw this");

        await userKeeper.unlockTokens(1, THIRD, false);
        await userKeeper.updateMaxTokenLockedAmount([], THIRD, false);
        await userKeeper.withdrawTokens(THIRD, THIRD, wei("600"));

        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalance(THIRD, false, false)).toFixed(), "0");
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
    });

    describe("withdrawNfts()", () => {
      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();

        await userKeeper.depositNfts(OWNER, SECOND, [1, 2]);
        await userKeeper.depositNfts(OWNER, THIRD, [3]);
      });

      it("should withdraw nfts", async () => {
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

        assert.equal((await userKeeper.nftSnapshot(1)).totalNftsPower.toFixed(), "0");
        assert.equal((await userKeeper.getNftsPowerInTokens([1], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens([8], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens([9], 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens([1, 8, 9], 1)).toFixed(), wei("3000"));

        assert.equal((await userKeeper.nftSnapshot(2)).totalNftsPower.toFixed(), "0");
        assert.equal((await userKeeper.getNftsPowerInTokens([1], 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens([8], 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens([9], 2)).toFixed(), wei("1000"));
      });
    });
  });

  describe("No ERC20 GovUserKeeper", () => {
    beforeEach("setup", async () => {
      nft = await ERC721Mock.new("Mock", "Mock");

      await userKeeper.__GovUserKeeper_init(ZERO, nft.address, wei("33000"), 33);
    });

    it("should revert if token is not supported", async () => {
      await truffleAssert.reverts(userKeeper.depositTokens(OWNER, OWNER, wei("100")), "GovUK: token is not supported");
    });
  });

  describe("No NFT GovUserKeeper", () => {
    beforeEach("", async () => {
      await userKeeper.__GovUserKeeper_init(token.address, ZERO, wei("33000"), 33);
    });

    it("should revert if nft is not supported", async () => {
      await truffleAssert.reverts(userKeeper.depositNfts(OWNER, OWNER, [1]), "GovUK: nft is not supported");
    });

    it("should correctly calculate NFT weight if NFT contract is not added", async () => {
      expect((await userKeeper.getNftsPowerInTokens([0], 0)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens([1], 0)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens([1], 1)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens([0], 1)).toFixed(), "0");
    });
  });

  describe("nft with power", () => {
    let startTime;

    beforeEach("setup", async () => {
      startTime = await getCurrentBlockTime();

      nft = await ERC721Power.new("Power", "Power", startTime + 200);

      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);

      await token.mint(OWNER, wei("900"));
      await token.approve(nft.address, wei("500"));

      await nft.setMaxPower("10000");
      await nft.setRequiredCollateral("500");
      await nft.setReductionPercent(PRECISION.times(toBN("0.01")));

      for (let i = 1; i <= 9; i++) {
        if (i === 8) {
          continue;
        }

        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }

      await nft.setCollateralToken(token.address);
      await nft.addCollateral(wei("500"), "9");
    });

    describe("snapshot()", () => {
      beforeEach("setup", async () => {
        await userKeeper.depositNfts(OWNER, SECOND, [1]);
      });

      it("should correctly calculate NFT power after snapshot", async () => {
        await setTime(startTime + 999);
        await userKeeper.createNftPowerSnapshot();

        await setTime(startTime + 1999);
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.nftSnapshot(1)).totalNftsPower.toFixed(), "74400");
        assert.equal((await userKeeper.getNftsPowerInTokens([1], 1)).toFixed(), wei("4080.645161290322580645"));
        assert.equal((await userKeeper.getNftsPowerInTokens([8], 1)).toFixed(), wei("0"));
        assert.equal((await userKeeper.getNftsPowerInTokens([9], 1)).toFixed(), wei("4935.483870967741935483"));
        assert.equal((await userKeeper.getNftsPowerInTokens([1, 8, 9], 1)).toFixed(), wei("9016.129032258064516128"));

        assert.equal((await userKeeper.nftSnapshot(2)).totalNftsPower.toFixed(), "67400");
        assert.equal((await userKeeper.getNftsPowerInTokens([1], 2)).toFixed(), wei("4014.836795252225519287"));
        assert.equal((await userKeeper.getNftsPowerInTokens([8], 2)).toFixed(), wei("0"));
        assert.equal((await userKeeper.getNftsPowerInTokens([9], 2)).toFixed(), wei("5396.142433234421364985"));
      });
    });
  });
});
