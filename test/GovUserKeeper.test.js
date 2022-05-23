const { assert, use } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { artifacts, web3 } = require("hardhat");

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

      for (let i = 1; i < 10; i++) {
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
    });

    describe("init", () => {
      it("should correctly set initial parameters", async () => {
        assert.equal(await userKeeper.tokenAddress(), token.address);
        assert.equal(await userKeeper.nftAddress(), nft.address);

        const nftInfo = await userKeeper.getNftContractInfo();

        assert.isFalse(nftInfo.supportPower);
        assert.isFalse(nftInfo.supportTotalSupply);
        assert.equal(nftInfo.totalPowerInTokens.toFixed(), wei("33000"));
        assert.equal(nftInfo.totalSupply, "33");
      });
    });

    describe("depositTokens()", async () => {
      it("should correctly add tokens to balance", async () => {
        await token.approve(userKeeper.address, wei("1000"));

        await userKeeper.depositTokens(SECOND, wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[0].toFixed(), wei("100"));

        await userKeeper.depositTokens(SECOND, wei("200"));
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[0].toFixed(), wei("300"));

        await userKeeper.depositTokens(OWNER, wei("10"));
        assert.equal((await userKeeper.tokenBalanceOf(OWNER))[0].toFixed(), wei("10"));
      });

      it("should revert if token is not supported", async () => {
        const newUserKeeper = await GovUserKeeper.new();
        await newUserKeeper.__GovUserKeeper_init(
          "0x0000000000000000000000000000000000000000",
          nft.address,
          wei("33000"),
          33
        );

        await truffleAssert.reverts(newUserKeeper.depositTokens(OWNER, wei("100")), "GovUK: token is not supported");
      });
    });

    describe("depositNfts()", () => {
      it("should correctly add tokens to balance", async () => {
        await userKeeper.depositNfts(SECOND, [1, 3, 5]);

        let balance = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        await userKeeper.depositNfts(SECOND, [2, 4]);

        balance = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["1", "3", "5", "2", "4"]
        );

        await userKeeper.depositNfts(OWNER, [6, 9]);

        balance = await userKeeper.nftBalanceOf(OWNER, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["6", "9"]
        );
      });
    });

    describe("delegateTokens()", async () => {
      it("should correctly delegate tokens, add delegators and spenders", async () => {
        await userKeeper.delegateTokens(SECOND, wei("333"));
        await userKeeper.delegateTokens(THIRD, wei("444"));

        assert.equal(await userKeeper.delegatedTokens(OWNER, SECOND), wei("333"));
        assert.equal(await userKeeper.delegatedTokens(OWNER, THIRD), wei("444"));

        await userKeeper.delegateTokens(SECOND, wei("111"));
        await userKeeper.delegateTokens(THIRD, wei("222"));

        assert.equal(await userKeeper.delegatedTokens(OWNER, SECOND), wei("111"));
        assert.equal(await userKeeper.delegatedTokens(OWNER, THIRD), wei("222"));
      });
    });

    describe("delegateNfts()", async () => {
      it("should correctly delegate nfts and add new nfts", async () => {
        await userKeeper.delegateNfts(SECOND, [1, 3], [true, true]);
        await userKeeper.delegateNfts(THIRD, [2, 4], [true, true]);

        let delegatedForSecond = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForSecond.map((e) => e.toFixed()),
          ["1", "3"]
        );

        const delegatedForThird = await userKeeper.getDelegatedNfts(OWNER, THIRD, 0, 10);
        assert.deepEqual(
          delegatedForThird.map((e) => e.toFixed()),
          ["2", "4"]
        );

        await userKeeper.delegateNfts(SECOND, [5], [true]);
        delegatedForSecond = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForSecond.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );
      });

      it("should correctly delegate nfts, rewrite existed delegation", async () => {
        await userKeeper.delegateNfts(SECOND, [1, 3], [true, true]);
        let delegatedForSecond = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForSecond.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(delegatedForSecond.length, 2);

        await userKeeper.delegateNfts(SECOND, [1, 3, 5], [false, false, true]);
        delegatedForSecond = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.equal(delegatedForSecond[0], 5);
        assert.equal(delegatedForSecond.length, 1);
      });
    });

    describe("nftBalanceOf()", async () => {
      it("should correctly return paginated NFTs", async () => {
        await userKeeper.depositNfts(SECOND, [1, 2, 3, 4, 5]);

        let balances = await userKeeper.nftBalanceOf(SECOND, 0, 5);
        assert.deepEqual(
          balances.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5"]
        );
        assert.equal(balances.length, 5);

        balances = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          balances.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5"]
        );
        assert.equal(balances.length, 5);

        balances = await userKeeper.nftBalanceOf(SECOND, 0, 2);
        assert.deepEqual(
          balances.map((e) => e.toFixed()),
          ["1", "2"]
        );
        assert.equal(balances.length, 2);

        balances = await userKeeper.nftBalanceOf(SECOND, 1, 2);
        assert.deepEqual(
          balances.map((e) => e.toFixed()),
          ["2", "3"]
        );
        assert.equal(balances.length, 2);
      });
    });

    describe("lockTokens(), unlockTokens()", async () => {
      it("should lock tokens from to addresses", async () => {
        await userKeeper.lockTokens(SECOND, wei("10"), 1);
        await userKeeper.lockTokens(SECOND, wei("5"), 1);
        await userKeeper.lockTokens(THIRD, wei("30"), 1);
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[1].toString(), wei("15"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1].toString(), wei("30"));
      });

      it("should unlock", async () => {
        await userKeeper.lockTokens(SECOND, wei("10"), 1);
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[1].toString(), wei("10"));
        await userKeeper.unlockTokens(SECOND, 1);
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[1].toString(), wei("0"));
      });
    });

    describe("withdrawTokens(), tokens", async () => {
      let startTime;

      beforeEach(async () => {
        startTime = await getCurrentBlockTime();
        await token.mint(OWNER, wei("900"));
        await token.mint(SECOND, wei("900"));
        await token.approve(userKeeper.address, wei("900"));
        await userKeeper.depositTokens(THIRD, wei("900"));
      });

      it("should withdraw tokens", async () => {
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("900"));
      });

      it("should withdraw part of token few times, considering lock", async () => {
        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("800"));

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("200"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("700"));

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("600"));

        await setTime(startTime + 99999);
        await userKeeper.unlockTokens(THIRD, [1]);

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("400"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });

      it("should withdraw all tokens", async () => {
        await setTime(startTime + 99999);
        await userKeeper.unlockTokens(THIRD, [1]);

        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });

        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });

      it("should unlock tokens from all proposals", async () => {
        await userKeeper.lockTokens(THIRD, wei("100"), 1);
        await userKeeper.lockTokens(THIRD, wei("300"), 2);
        await userKeeper.lockTokens(THIRD, wei("500"), 3);

        await setTime(startTime + 99999);
        await userKeeper.unlockTokens(THIRD, [1, 2, 3]);
        await userKeeper.unlockTokens(THIRD, [2]);
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("400"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1].toFixed(), wei("500"));
      });
      it("should unlock tokens from few proposals", async () => {
        await userKeeper.lockTokens(THIRD, wei("100"), 1);
        await userKeeper.lockTokens(THIRD, wei("300"), 2);
        await userKeeper.lockTokens(THIRD, wei("500"), 3);

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("800"));

        await setTime(startTime + 99999);
        await userKeeper.unlockTokens(THIRD, [3]);

        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("800"));

        await userKeeper.unlockTokens(THIRD, [2]);
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("800"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0].toFixed(), wei("100"));

        await userKeeper.unlockTokens(THIRD, [1]);
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[0], wei("0"));
      });
    });

    describe("lockNfts(), unlockNfts()", async () => {
      beforeEach("", async () => {
        await userKeeper.depositNfts(SECOND, [1, 2]);
        await userKeeper.depositNfts(THIRD, [3]);
      });
      it("should lock nfts from to addresses", async () => {
        await userKeeper.lockNfts(SECOND, { values: [1], length: 1 });
        await userKeeper.lockNfts(SECOND, { values: [2], length: 1 });
        await userKeeper.lockNfts(THIRD, { values: [3], length: 1 });

        let locked = await userKeeper.nftLockedBalanceOf(SECOND, 0, 10);
        let ids = locked[0];
        let lockedAmount = locked[1];

        assert.deepEqual(
          ids.map((e) => e.toFixed()),
          ["1", "2"]
        );
        assert.deepEqual(
          lockedAmount.map((e) => e.toFixed()),
          ["1", "1"]
        );

        locked = await userKeeper.nftLockedBalanceOf(THIRD, 0, 10);
        ids = locked[0];
        lockedAmount = locked[1];

        assert.deepEqual(
          ids.map((e) => e.toFixed()),
          ["3"]
        );
        assert.deepEqual(
          lockedAmount.map((e) => e.toFixed()),
          ["1"]
        );
      });

      it("should unlock nfts", async () => {
        await userKeeper.lockNfts(SECOND, { values: [1, 2], length: 2 });
        assert.deepEqual(
          (await userKeeper.nftLockedBalanceOf(SECOND, 0, 10))[0].map((e) => e.toFixed()),
          ["1", "2"]
        );

        await userKeeper.unlockNfts(SECOND, [2]);
        assert.deepEqual(
          (await userKeeper.nftLockedBalanceOf(SECOND, 0, 10))[0].map((e) => e.toFixed()),
          ["1"]
        );
      });
    });

    describe("withdrawNfts()", async () => {
      beforeEach(async () => {
        startTime = await getCurrentBlockTime();
        await userKeeper.depositNfts(SECOND, [1, 2]);
        await userKeeper.depositNfts(THIRD, [3]);
      });

      it("should withdraw tokens", async () => {
        await userKeeper.withdrawNfts([1, 2], { from: SECOND });
        assert.equal(await nft.ownerOf(1), SECOND);
        assert.equal(await nft.ownerOf(2), SECOND);
      });

      it("should withdraw part of token few times", async () => {
        await userKeeper.withdrawNfts([1], { from: SECOND });
        assert.equal(await nft.ownerOf(1), SECOND);
        assert.equal(await nft.ownerOf(2), userKeeper.address);
        assert.equal(await nft.ownerOf(3), userKeeper.address);

        await userKeeper.withdrawNfts([3], { from: THIRD });
        assert.equal(await nft.ownerOf(2), userKeeper.address);
        assert.equal(await nft.ownerOf(3), THIRD);

        await userKeeper.withdrawNfts([2], { from: SECOND });
        assert.equal(await nft.ownerOf(2), SECOND);
      });

      it("should withdraw all tokens", async () => {
        await userKeeper.withdrawNfts([1, 2, 3], { from: SECOND });

        assert.equal(await nft.ownerOf(1), SECOND);
        assert.equal(await nft.ownerOf(2), SECOND);
        assert.equal(await nft.ownerOf(3), userKeeper.address);
      });
    });

    describe("check snapshot", async () => {
      let startTime;
      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();
        await userKeeper.depositNfts(OWNER, [1]);
      });

      it("should correctly calculate NFT power after snapshot", async () => {
        await setTime(startTime + 999 + 100);
        await userKeeper.createNftPowerSnapshot();

        await setTime(startTime + 1999 + 100);
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.nftSnapshot(1)).totalNftsPower.toString(), "0");
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 1)).toFixed(), wei("1000"));
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [1, 8, 9], length: 3 }, 1)).toFixed(),
          wei("3000")
        );

        assert.equal((await userKeeper.nftSnapshot(2)).totalNftsPower.toFixed(), "0");
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 2)).toFixed(), wei("1000"));
      });
    });
  });

  describe("No NFT GovUserKeeper", async () => {
    beforeEach("", async () => {
      await userKeeper.__GovUserKeeper_init(
        token.address,
        "0x0000000000000000000000000000000000000000",
        wei("33000"),
        33
      );
    });

    it("should revert if nft is not supported", async () => {
      await truffleAssert.reverts(userKeeper.depositNfts(OWNER, [1]), "GovUK: nft is not supported");
    });
    it("should correctly calculate NFT weight if NFT contract is not added", async () => {
      expect((await userKeeper.getNftsPowerInTokens({ values: [0], length: 1 }, 0)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 0)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(), "0");
      expect((await userKeeper.getNftsPowerInTokens({ values: [0], length: 1 }, 1)).toFixed(), "0");
    });
  });

  describe("nft with power", async () => {
    let startTime;
    beforeEach("", async () => {
      await token.mint(OWNER, wei("900"));
      startTime = await getCurrentBlockTime();
      nft = await ERC721Power.new("Power", "Power", startTime + 200);
      await nft.setMaxPower("10000");
      await nft.setRequiredCollateral("500");
      await nft.setReductionPercent(PRECISION.times(toBN("0.01")));
      for (let i = 1; i <= 9; i++) {
        if (i === 8) continue;
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
      await nft.setCollateralToken(token.address);
      await token.approve(nft.address, wei("500"));
      await nft.addCollateral(wei("500"), "9");

      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);
    });
    describe("snapshot()", async () => {
      beforeEach("", async () => {
        await userKeeper.depositNfts(SECOND, [1]);
      });
      it("should correctly calculate NFT power after snapshot", async () => {
        await setTime(startTime + 999);
        await userKeeper.createNftPowerSnapshot();

        await setTime(startTime + 1999);
        await userKeeper.createNftPowerSnapshot();

        assert.equal((await userKeeper.nftSnapshot(1)).totalNftsPower.toString(), "74400");
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(),
          wei("4080.645161290322580645")
        );
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 1)).toFixed(), wei("0"));
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 1)).toFixed(),
          wei("4935.483870967741935483")
        );
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [1, 8, 9], length: 3 }, 1)).toFixed(),
          wei("9016.129032258064516128")
        );

        assert.equal((await userKeeper.nftSnapshot(2)).totalNftsPower.toFixed(), "67400");
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 2)).toFixed(),
          wei("4014.836795252225519287")
        );
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 2)).toFixed(), wei("0"));
        assert.equal(
          (await userKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 2)).toFixed(),
          wei("5396.142433234421364985")
        );
      });
    });
  });
});
