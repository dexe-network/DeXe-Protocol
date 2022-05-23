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
const GovPool = artifacts.require("GovPool");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const ExecutorMock = artifacts.require("ExecutorMock");

GovUserKeeper.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC721Power.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
ExecutorMock.numberFormat = "BigNumber";

const getBytesApprove = (address, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "approve",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "_address",
        },
        {
          type: "uint256",
          name: "_amount",
        },
      ],
    },
    [address, amount]
  );
};

const PRECISION = toBN(10).pow(25);

function toPercent(num) {
  return PRECISION.times(num).toFixed();
}

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

      it("should revert if nft is not supported", async () => {
        const newUserKeeper = await GovUserKeeper.new();
        await newUserKeeper.__GovUserKeeper_init(
          token.address,
          "0x0000000000000000000000000000000000000000",
          wei("33000"),
          33
        );

        await truffleAssert.reverts(newUserKeeper.depositNfts(OWNER, [1]), "GovUK: nft is not supported");
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

        let delegatedForIvan = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForIvan.map((e) => e.toFixed()),
          ["1", "3"]
        );

        const delegatedForOleg = await userKeeper.getDelegatedNfts(OWNER, THIRD, 0, 10);
        assert.deepEqual(
          delegatedForOleg.map((e) => e.toFixed()),
          ["2", "4"]
        );

        await userKeeper.delegateNfts(SECOND, [5], [true]);
        delegatedForIvan = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForIvan.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );
      });

      it("should correctly delegate nfts, rewrite existed delegation", async () => {
        await userKeeper.delegateNfts(SECOND, [1, 3], [true, true]);
        let delegatedForIvan = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.deepEqual(
          delegatedForIvan.map((e) => e.toFixed()),
          ["1", "3"]
        );
        assert.equal(delegatedForIvan.length, 2);

        await userKeeper.delegateNfts(SECOND, [1, 3, 5], [false, false, true]);
        delegatedForIvan = await userKeeper.getDelegatedNfts(OWNER, SECOND, 0, 10);
        assert.equal(delegatedForIvan[0], 5);
        assert.equal(delegatedForIvan.length, 1);
      });

      it("should revert if invalid array length", async () => {
        await truffleAssert.reverts(
          userKeeper.delegateNfts(SECOND, [1, 3, 2], [true, true]),
          "reverted with panic code 0x32"
        );
      });
    });

    describe("nftBalanceOf()", async () => {
      it("should correctly return paginated NFTs", async () => {
        await userKeeper.depositNfts(SECOND, [1, 2, 3, 4, 5]);

        let bal = await userKeeper.nftBalanceOf(SECOND, 0, 5);
        assert.deepEqual(
          bal.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5"]
        );
        assert.equal(bal.length, 5);

        bal = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          bal.map((e) => e.toFixed()),
          ["1", "2", "3", "4", "5"]
        );
        assert.equal(bal.length, 5);

        bal = await userKeeper.nftBalanceOf(SECOND, 0, 2);
        assert.deepEqual(
          bal.map((e) => e.toFixed()),
          ["1", "2"]
        );
        assert.equal(bal.length, 2);

        bal = await userKeeper.nftBalanceOf(SECOND, 1, 2);
        assert.deepEqual(
          bal.map((e) => e.toFixed()),
          ["2", "3"]
        );
        assert.equal(bal.length, 2);
      });
    });

    describe("withdrawTokens(), tokens", async () => {
      let startTime;
      let settings;
      let executor;
      let poolWithNftBase;

      const INTERNAL_SETTINGS = {
        earlyCompletion: true,
        duration: 500,
        durationValidators: 600,
        quorum: PRECISION.times("51").toFixed(),
        quorumValidators: PRECISION.times("61").toFixed(),
        minTokenBalance: wei("10"),
        minNftBalance: 2,
      };

      const DEFAULT_SETTINGS = {
        earlyCompletion: false,
        duration: 700,
        durationValidators: 800,
        quorum: PRECISION.times("71").toFixed(),
        quorumValidators: PRECISION.times("100").toFixed(),
        minTokenBalance: wei("20"),
        minNftBalance: 3,
      };

      beforeEach(async () => {
        settings = await GovSettings.new();
        await settings.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);

        executor = await ExecutorMock.new();

        validators = await GovValidators.new();
        await validators.__GovValidators_init(
          "Validator Token",
          "VT",
          500,
          PRECISION.times("51"),
          [SECOND, THIRD],
          [wei("100"), wei("200")]
        );

        poolWithNftBase = await GovPool.new();
        poolWithNftBase.__GovPool_init(settings.address, userKeeper.address, validators.address, 10, toPercent("10"));

        await settings.transferOwnership(poolWithNftBase.address);
        await userKeeper.transferOwnership(poolWithNftBase.address);
        await validators.transferOwnership(poolWithNftBase.address);

        startTime = await getCurrentBlockTime();
        await token.mint(OWNER, wei("900"));
        await token.mint(SECOND, wei("900"));
        await token.approve(poolWithNftBase.address, wei("900"), { from: SECOND });
        await token.approve(userKeeper.address, wei("900"));
        await userKeeper.depositTokens(THIRD, wei("900"));

        await setTime(startTime + 999);
        await poolWithNftBase.createProposal(
          [executor.address],
          [getBytesApprove("0x0000000000000000000000000000000000000000", "1")],
          { from: THIRD }
        );
        await poolWithNftBase.createProposal(
          [executor.address],
          [getBytesApprove("0x0000000000000000000000000000000000000000", "1")],
          { from: THIRD }
        );
        await poolWithNftBase.createProposal(
          [executor.address],
          [getBytesApprove("0x0000000000000000000000000000000000000000", "1")],
          { from: THIRD }
        );
      });

      it("should withdraw part of token, considering lock", async () => {
        await poolWithNftBase.voteTokens(1, wei("600"), { from: THIRD });
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });

        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("300"));
      });

      it("should withdraw part of token few times, considering lock", async () => {
        await poolWithNftBase.voteTokens(1, wei("600"), { from: THIRD });

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("600"));

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("200"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("600"));

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("600"));

        await setTime(startTime + 99999);
        await poolWithNftBase.unlockInProposals([1], THIRD);

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("400"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });

      it("should withdraw all tokens", async () => {
        await poolWithNftBase.voteTokens(1, wei("600"), { from: THIRD });

        await setTime(startTime + 99999);
        await poolWithNftBase.unlockInProposals([1], THIRD);

        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });

        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });

      it("should unlock tokens from all proposals", async () => {
        await poolWithNftBase.voteTokens(1, wei("600"), { from: THIRD });
        await poolWithNftBase.voteTokens(2, wei("800"), { from: THIRD });
        await poolWithNftBase.voteTokens(3, wei("400"), { from: THIRD });

        await setTime(startTime + 99999);
        await poolWithNftBase.unlockInProposals([1, 2, 3], THIRD, { from: THIRD });

        await poolWithNftBase.unlockInProposals([2], THIRD, { from: THIRD });
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });
      it("should unlock tokens from few proposals", async () => {
        await poolWithNftBase.voteTokens(1, wei("600"), { from: THIRD });
        await poolWithNftBase.voteTokens(2, wei("800"), { from: THIRD });
        await poolWithNftBase.voteTokens(3, wei("400"), { from: THIRD });

        await userKeeper.withdrawTokens(wei("100"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("800"), { from: THIRD });

        await setTime(startTime + 99999);
        await poolWithNftBase.unlockInProposals([3], THIRD, { from: THIRD });

        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("800"));

        await poolWithNftBase.unlockInProposals([2], THIRD, { from: THIRD });
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("300"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("600"));

        await poolWithNftBase.unlockInProposals([1], THIRD, { from: THIRD });
        await userKeeper.withdrawTokens(wei("999999"), { from: THIRD });
        assert.equal(await token.balanceOf(THIRD), wei("900"));
        assert.equal((await userKeeper.tokenBalanceOf(THIRD))[1], wei("0"));
      });
    });

    describe("check snapshot", async () => {
      let startTime;
      let enumUserKeeper;
      let powerUserKeeper;
      let poolWithNftBase;
      let poolWithNftEnum;
      let poolWithNftPower;

      let nftEnum;
      let nftPower;

      const INTERNAL_SETTINGS = {
        earlyCompletion: true,
        duration: 500,
        durationValidators: 600,
        quorum: PRECISION.times("51").toFixed(),
        quorumValidators: PRECISION.times("61").toFixed(),
        minTokenBalance: wei("10"),
        minNftBalance: 2,
      };

      const DEFAULT_SETTINGS = {
        earlyCompletion: false,
        duration: 700,
        durationValidators: 800,
        quorum: PRECISION.times("71").toFixed(),
        quorumValidators: PRECISION.times("100").toFixed(),
        minTokenBalance: wei("20"),
        minNftBalance: 3,
      };

      beforeEach("setup", async () => {
        startTime = await getCurrentBlockTime();

        nftEnum = await ERC721EnumMock.new("Mock", "Mock");
        nftPower = await ERC721Power.new("Mock", "Mock", startTime + 100);
        await nftPower.setMaxPower("10000");
        await nftPower.setRequiredCollateral("500");
        await nftPower.setReductionPercent(toPercent("0.01"));

        enumUserKeeper = await GovUserKeeper.new();
        powerUserKeeper = await GovUserKeeper.new();

        await enumUserKeeper.__GovUserKeeper_init(token.address, nftEnum.address, wei("33000"), 33);
        await powerUserKeeper.__GovUserKeeper_init(token.address, nftPower.address, wei("33000"), 33);

        for (let i = 1; i < 10; i++) {
          if (i === 8) continue;
          await nftEnum.safeMint(OWNER, i);
          await nftEnum.approve(enumUserKeeper.address, i);
          await nftPower.safeMint(OWNER, i);
          await nftPower.approve(powerUserKeeper.address, i);
        }

        await nftPower.setCollateralToken(token.address);
        await token.approve(nftPower.address, wei("500"));
        await nftPower.addCollateral(wei("500"), "9");

        let settingsWithNftBase = await GovSettings.new();
        await settingsWithNftBase.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
        let settingWithNftEnum = await GovSettings.new();
        await settingWithNftEnum.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
        let settingWithNftPower = await GovSettings.new();
        await settingWithNftPower.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);

        // let executorWithNftBase = await ExecutorMock.new();
        // let executorWithNftEnum = await ExecutorMock.new();
        // let executorWithNftPower = await ExecutorMock.new();

        let validatorsNftBase = await GovValidators.new();
        await validatorsNftBase.__GovValidators_init(
          "Validator Token",
          "VT",
          600,
          PRECISION.times("51"),
          [OWNER],
          [wei("100")]
        );

        let validatorsNftEnum = await GovValidators.new();
        await validatorsNftEnum.__GovValidators_init(
          "Validator Token",
          "VT",
          600,
          PRECISION.times("51"),
          [OWNER],
          [wei("100")]
        );

        let validatorsNftPower = await GovValidators.new();
        await validatorsNftPower.__GovValidators_init(
          "Validator Token",
          "VT",
          600,
          PRECISION.times("51"),
          [OWNER],
          [wei("100")]
        );

        poolWithNftBase = await GovPool.new();
        poolWithNftBase.__GovPool_init(
          settingsWithNftBase.address,
          userKeeper.address,
          validatorsNftBase.address,
          10,
          toPercent("10")
        );
        poolWithNftEnum = await GovPool.new();
        poolWithNftEnum.__GovPool_init(
          settingWithNftEnum.address,
          enumUserKeeper.address,
          "0x0000000000000000000000000000000000000000",
          10,
          toPercent("10")
        );
        poolWithNftPower = await GovPool.new();
        poolWithNftPower.__GovPool_init(
          settingWithNftPower.address,
          powerUserKeeper.address,
          "0x0000000000000000000000000000000000000000",
          10,
          toPercent("10")
        );

        await settingsWithNftBase.transferOwnership(poolWithNftBase.address);
        await settingWithNftEnum.transferOwnership(poolWithNftEnum.address);
        await settingWithNftPower.transferOwnership(poolWithNftPower.address);

        await userKeeper.transferOwnership(poolWithNftBase.address);
        await enumUserKeeper.transferOwnership(poolWithNftEnum.address);
        await powerUserKeeper.transferOwnership(poolWithNftPower.address);

        await validatorsNftBase.transferOwnership(poolWithNftBase.address);
        await validatorsNftEnum.transferOwnership(poolWithNftEnum.address);
        await validatorsNftPower.transferOwnership(poolWithNftPower.address);

        await token.mint(OWNER, wei("900"));
        await token.mint(SECOND, wei("900"));
        await token.approve(poolWithNftBase.address, wei("900"), { from: SECOND });
        await token.approve(userKeeper.address, wei("900"));
        await userKeeper.depositTokens(THIRD, wei("900"));

        await userKeeper.depositNfts(OWNER, [1]);
        await enumUserKeeper.depositNfts(OWNER, [1]);
        await powerUserKeeper.depositNfts(OWNER, [1]);
      });

      it("should correctly calculate NFT power after snapshot", async () => {
        await setTime(startTime + 999 + 100);
        await poolWithNftPower.createProposal([SECOND], ["0x00"]);

        await setTime(startTime + 1999 + 100);
        await poolWithNftPower.createProposal([SECOND], ["0x00"]);

        assert.equal((await powerUserKeeper.nftSnapshot(1)).totalNftsPower.toString(), "73000");
        assert.equal(
          (await powerUserKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(),
          wei("4068.493150684931506849")
        );
        assert.equal((await powerUserKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 1)).toFixed(), "0");
        assert.equal(
          (await powerUserKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 1)).toFixed(),
          wei("5020.547945205479452054")
        );
        assert.equal(
          (await powerUserKeeper.getNftsPowerInTokens({ values: [1, 8, 9], length: 3 }, 1)).toFixed(),
          wei("9089.041095890410958903")
        );

        assert.equal((await powerUserKeeper.nftSnapshot(2)).totalNftsPower.toFixed(), "66000");
        assert.equal(
          (await powerUserKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 2)).toFixed(),
          wei("4000")
        );
        assert.equal((await powerUserKeeper.getNftsPowerInTokens({ values: [8], length: 1 }, 2)).toFixed(), "0");
        assert.equal(
          (await powerUserKeeper.getNftsPowerInTokens({ values: [9], length: 1 }, 2)).toFixed(),
          wei("5500")
        );
      });

      it("should correctly calculate NFT weight when support only totalSupply()", async () => {
        await setTime(startTime + 999);
        await poolWithNftEnum.createProposal([OWNER], ["0x00"]);
        await nftEnum.safeMint(OWNER, 10);

        await setTime(startTime + 1999);
        await poolWithNftEnum.createProposal([OWNER], ["0x00"]);

        assert.equal((await enumUserKeeper.nftSnapshot(1)).totalSupply.toFixed(), "8");
        assert.equal((await enumUserKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(), wei("4125"));
        assert.equal((await enumUserKeeper.nftSnapshot(2)).totalSupply.toFixed(), "9");
        assert.equal(
          (await enumUserKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 2)).toFixed(),
          wei("3666.666666666666666666")
        );
        assert.equal(
          (await enumUserKeeper.getNftsPowerInTokens({ values: [1, 10], length: 2 }, 2)).toFixed(),
          wei("7333.333333333333333333")
        );
      });

      it("should correctly calculate NFT weight when totalSupply() and power is not supported", async () => {
        await setTime(startTime + 999);
        await poolWithNftBase.createProposal([OWNER], ["0x00"]);

        await setTime(startTime + 1999);
        await poolWithNftBase.createProposal([OWNER], ["0x00"]);

        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 2)).toFixed(), wei("1000"));
        assert.equal((await userKeeper.getNftsPowerInTokens({ values: [1, 2], length: 2 }, 2)).toFixed(), wei("2000"));
      });

      it("should correctly calculate NFT weight if NFT contract is not added", async () => {
        const newKeeper = await GovUserKeeper.new();
        await newKeeper.__GovUserKeeper_init(
          token.address,
          "0x0000000000000000000000000000000000000000",
          wei("33000"),
          33
        );

        expect((await newKeeper.getNftsPowerInTokens({ values: [0], length: 1 }, 0)).toFixed(), "0");
        expect((await newKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 0)).toFixed(), "0");
        expect((await newKeeper.getNftsPowerInTokens({ values: [1], length: 1 }, 1)).toFixed(), "0");
        expect((await newKeeper.getNftsPowerInTokens({ values: [0], length: 1 }, 1)).toFixed(), "0");
      });
    });
  });
});
