const { assert, use } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { web3, artifacts } = require("hardhat");

const GovPool = artifacts.require("GovPool");
const GovValidators = artifacts.require("GovValidators");
const GovSettings = artifacts.require("GovSettings");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const ExecutorTransferMock = artifacts.require("ExecutorTransferMock");

GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);

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

const getBytesExecute = () => {
  return web3.eth.abi.encodeFunctionSignature("execute()");
};

const getBytesAddSettings = (settings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "addSettings",
      type: "function",
      inputs: [
        {
          components: [
            {
              type: "bool",
              name: "earlyCompletion",
            },
            {
              type: "uint64",
              name: "duration",
            },
            {
              type: "uint64",
              name: "durationValidators",
            },
            {
              type: "uint128",
              name: "quorum",
            },
            {
              type: "uint128",
              name: "quorumValidators",
            },
            {
              type: "uint256",
              name: "minTokenBalance",
            },
            {
              type: "uint256",
              name: "minNftBalance",
            },
          ],
          type: "tuple[]",
          name: "_var",
        },
      ],
    },
    [settings]
  );
};

const getBytesApprove = (address, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "approve",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "spender",
        },
        {
          type: "uint256",
          name: "amount",
        },
      ],
    },
    [address, amount]
  );
};

const getBytesEditSettings = (types, settings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "editSettings",
      type: "function",
      inputs: [
        {
          type: "uint256[]",
          name: "_var",
        },
        {
          components: [
            {
              type: "bool",
              name: "earlyCompletion",
            },
            {
              type: "uint64",
              name: "duration",
            },
            {
              type: "uint64",
              name: "durationValidators",
            },
            {
              type: "uint128",
              name: "quorum",
            },
            {
              type: "uint128",
              name: "quorumValidators",
            },
            {
              type: "uint256",
              name: "minTokenBalance",
            },
            {
              type: "uint256",
              name: "minNftBalance",
            },
          ],
          type: "tuple[]",
          name: "_var",
        },
      ],
    },
    [types, settings]
  );
};

describe("GovPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FOUTH;

  let settings;
  let validators;
  let userKeeper;
  let govPool;
  let token;
  let nft;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FOUTH = await accounts(3);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    settings = await GovSettings.new();
    validators = await GovValidators.new();
    userKeeper = await GovUserKeeper.new();
    govPool = await GovPool.new();
  });

  describe("Fullfat GovPool", () => {
    beforeEach("setup", async () => {
      nft = await ERC721EnumMock.new("Mock", "Mock");

      await settings.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
      await validators.__GovValidators_init(
        "Validator Token",
        "VT",
        600,
        PRECISION.times("51").toFixed(),
        [OWNER, SECOND],
        [wei("100"), wei("1000000000000")]
      );
      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);
      await govPool.__GovPool_init(settings.address, userKeeper.address, validators.address, 100, PRECISION.times(10));

      await settings.transferOwnership(govPool.address);
      await validators.transferOwnership(govPool.address);
      await userKeeper.transferOwnership(govPool.address);

      await token.mint(OWNER, wei("100000000000"));
      await token.approve(userKeeper.address, wei("10000000000"));

      for (let i = 1; i < 10; i++) {
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
    });

    describe("GovCreator", () => {
      describe("init", () => {
        it("should correctly set all parameters", async () => {
          assert.equal(await govPool.govSetting(), settings.address);
          assert.equal(await govPool.govUserKeeper(), userKeeper.address);
        });

        it("should revert when try to set zero addresses", async () => {
          govPool = await GovPool.new();

          await truffleAssert.reverts(
            govPool.__GovPool_init(
              "0x0000000000000000000000000000000000000000",
              userKeeper.address,
              validators.address,
              100,
              PRECISION.times(10)
            ),
            "GovC: address is zero (1)"
          );
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              settings.address,
              "0x0000000000000000000000000000000000000000",
              validators.address,
              100,
              PRECISION.times(10)
            ),
            "GovC: address is zero (2)"
          );
        });
      });

      describe("createProposal()", async () => {
        beforeEach("", async () => {
          await userKeeper.depositTokens(OWNER, 1);
          await userKeeper.depositNfts(OWNER, [1]);
        });

        it("should create 2 proposals", async () => {
          await govPool.createProposal([SECOND], [getBytesApprove(SECOND, 1)]);
          let proposal = await govPool.proposals(1);

          assert.equal(proposal[0][0], DEFAULT_SETTINGS.earlyCompletion);
          assert.equal(proposal[0][1], DEFAULT_SETTINGS.duration);
          assert.equal(proposal[0][2], DEFAULT_SETTINGS.durationValidators);
          assert.equal(proposal[0][3], DEFAULT_SETTINGS.quorum);
          assert.equal(proposal[0][4], DEFAULT_SETTINGS.quorumValidators);
          assert.equal(proposal[0][5], DEFAULT_SETTINGS.minTokenBalance);
          assert.equal(proposal[0][6], DEFAULT_SETTINGS.minNftBalance);

          assert.isFalse(proposal.executed);
          assert.equal(proposal.proposalId, 1);

          await govPool.createProposal([THIRD], [getBytesApprove(SECOND, 1)]);
          proposal = await govPool.proposals(2);

          assert.equal(proposal[0][0], DEFAULT_SETTINGS.earlyCompletion);
          assert.equal(proposal[0][1], DEFAULT_SETTINGS.duration);
          assert.equal(proposal[0][2], DEFAULT_SETTINGS.durationValidators);
          assert.equal(proposal[0][3], DEFAULT_SETTINGS.quorum);
          assert.equal(proposal[0][4], DEFAULT_SETTINGS.quorumValidators);
          assert.equal(proposal[0][5], DEFAULT_SETTINGS.minTokenBalance);
          assert.equal(proposal[0][6], DEFAULT_SETTINGS.minNftBalance);

          assert.isFalse(proposal.executed);
          assert.equal(proposal.proposalId, 2);
        });

        it("should revert when create proposal with arrays zero length", async () => {
          await truffleAssert.reverts(
            govPool.createProposal([], [getBytesApprove(SECOND, 1)]),
            "GovC: invalid array length"
          );
          await truffleAssert.reverts(
            govPool.createProposal([SECOND, THIRD], [getBytesApprove(SECOND, 1)]),
            "GovC: invalid array length"
          );
        });
      });

      describe("getProposalInfo()", async () => {
        beforeEach("", async () => {
          await userKeeper.depositTokens(OWNER, 1);
          await userKeeper.depositNfts(OWNER, [1]);

          await govPool.createProposal([SECOND], [getBytesApprove(SECOND, 1)]);
          await govPool.createProposal([THIRD], [getBytesApprove(SECOND, 1)]);
        });

        it("should get info from 2 proposals", async () => {
          let info = await govPool.getProposalInfo(1);

          assert.equal(info[0], SECOND);
          assert.equal(info[1], getBytesApprove(SECOND, 1));

          info = await govPool.getProposalInfo(2);

          assert.equal(info[0], THIRD);
          assert.equal(info[1], getBytesApprove(SECOND, 1));
        });
      });
    });

    describe("GovVote", async () => {
      beforeEach("", async () => {
        await userKeeper.depositTokens(OWNER, wei("1000"));
        await userKeeper.depositNfts(OWNER, [1, 2, 3, 4]);

        await govPool.createProposal([SECOND], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal([THIRD], [getBytesApprove(SECOND, 1)]);
      });

      describe("init()", async () => {
        it("should correctly set parameters", async () => {
          assert.equal(await govPool.votesLimit(), 100);
          assert.equal(await govPool.validators(), validators.address);
        });

        it("should revert when try to set votesLimit = 0", async () => {
          govPool = await GovPool.new();
          await truffleAssert.reverts(
            govPool.__GovPool_init(settings.address, userKeeper.address, validators.address, 0, PRECISION.times(10))
          );
        });
      });

      describe("voteTokens()", async () => {
        it("should vote for two proposals", async () => {
          await govPool.voteTokens(1, wei("100"));
          await govPool.voteTokens(2, wei("50"));

          assert.equal((await govPool.proposals(1)).votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).votesFor, wei("50"));
        });

        it("should vote for proposal twice", async () => {
          await govPool.voteTokens(1, wei("100"));
          assert.equal((await govPool.proposals(1)).votesFor, wei("100"));

          await govPool.voteTokens(1, wei("100"));
          assert.equal((await govPool.proposals(1)).votesFor, wei("200"));
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(govPool.voteTokens(1, 0), "GovV: vote amount is zero");
        });
      });

      describe("voteDelegatedTokens()", async () => {
        beforeEach("", async () => {
          await userKeeper.delegateTokens(SECOND, wei("1000"));
          await userKeeper.delegateTokens(THIRD, wei("1000"));
        });

        it("should vote delegated tokens for two proposals", async () => {
          await govPool.voteDelegatedTokens(1, wei("100"), OWNER, { from: SECOND });
          await govPool.voteDelegatedTokens(2, wei("50"), OWNER, { from: THIRD });

          assert.equal((await govPool.proposals(1)).votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).votesFor, wei("50"));
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegatedTokens(1, wei("100"), OWNER, { from: SECOND });
          assert.equal((await govPool.proposals(1)).votesFor, wei("100"));

          await govPool.voteDelegatedTokens(1, wei("100"), OWNER, { from: SECOND });
          assert.equal((await govPool.proposals(1)).votesFor, wei("200"));
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegatedTokens(1, wei("1000000000"), OWNER, { from: SECOND });
          assert.equal((await govPool.proposals(1)).votesFor, wei("1000"));
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegatedTokens(1, 0, OWNER, { from: SECOND }),
            "GovV: vote amount is zero"
          );
        });

        it("should revert when spend undelegated tokens", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegatedTokens(1, 1, OWNER, { from: FOUTH }),
            "GovV: vote amount is zero"
          );
        });
      });

      describe("voteNfts()", async () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");
        it("should vote for two proposals", async () => {
          await govPool.voteNfts(1, [1]);
          await govPool.voteNfts(2, [2, 3]);

          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote for proposal twice", async () => {
          await govPool.voteNfts(1, [1]);
          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.voteNfts(1, [2, 3]);
          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.times(3).plus(1).toFixed());
        });

        it("should revert when order is wrong", async () => {
          await truffleAssert.reverts(govPool.voteNfts(1, [3, 2]), "GovV: wrong NFT order");
        });
      });

      describe("voteDelegatedNfts()", async () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");
        beforeEach("", async () => {
          await userKeeper.delegateNfts(SECOND, [1], [true]);
          await userKeeper.delegateNfts(THIRD, [2, 3], [true, true]);
        });

        it("should vote delegated tokens for two proposals", async () => {
          await govPool.voteDelegatedNfts(1, [1], OWNER, { from: SECOND });
          await govPool.voteDelegatedNfts(2, [2, 3], OWNER, { from: THIRD });

          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegatedNfts(1, [2], OWNER, { from: THIRD });
          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.voteDelegatedNfts(1, [3], OWNER, { from: THIRD });
          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.times(2).toFixed());
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegatedNfts(1, [1, 2, 3], OWNER, { from: SECOND });
          assert.equal((await govPool.proposals(1)).votesFor, SINGLE_NFT_COST.toFixed());
        });

        it("should revert when spend undelegated tokens", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegatedTokens(1, 1, OWNER, { from: FOUTH }),
            "GovV: vote amount is zero"
          );
        });
      });

      describe("unlockInProposals(), unlock(), unlockNfts()", async () => {
        let startTime;
        beforeEach("", async () => {
          startTime = await getCurrentBlockTime();
          await govPool.voteTokens(1, wei("100"));
          await govPool.voteTokens(2, wei("50"));
          await govPool.voteNfts(1, [2]);
        });

        it("should unlock in first proposal", async () => {
          await setTime(startTime + 1000);
          await govPool.unlockInProposals([1], OWNER);
          assert.equal((await userKeeper.tokenBalanceOf(OWNER))[1].toFixed(), wei("50"));
          assert.deepEqual((await userKeeper.nftLockedBalanceOf(OWNER, 0, 1))[0], []);
        });

        it("should unlock all", async () => {
          await setTime(startTime + 1000);
          await govPool.unlock(OWNER);
          assert.equal((await userKeeper.tokenBalanceOf(OWNER))[1].toFixed(), 0);
          assert.deepEqual((await userKeeper.nftLockedBalanceOf(OWNER, 0, 1))[0], []);
        });

        it("should unlock nft", async () => {
          await setTime(startTime + 1000);
          await govPool.unlockNfts(1, OWNER, [2]);
          assert.deepEqual((await userKeeper.nftLockedBalanceOf(OWNER, 0, 1))[0], []);
        });
      });

      describe("moveProposalToValidators()", async () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          duration: 70,
          durationValidators: 800,
          quorum: PRECISION.times("71").toFixed(),
          quorumValidators: PRECISION.times("100").toFixed(),
          minTokenBalance: wei("20"),
          minNftBalance: 3,
        };

        beforeEach("", async () => {
          startTime = await getCurrentBlockTime();
          await govPool.createProposal([settings.address], [getBytesEditSettings([3], [NEW_SETTINGS])]);

          await token.mint(SECOND, wei("100000000000000000000"));
          await token.mint(THIRD, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: THIRD });

          await userKeeper.depositTokens(OWNER, wei("1000"));
          await userKeeper.depositTokens(SECOND, wei("100000000000000000000"), { from: SECOND });
          await userKeeper.depositTokens(THIRD, wei("100000000000000000000"), { from: THIRD });
        });

        it("should move proposal to validators", async () => {
          await govPool.voteTokens(3, wei("1000"));
          await govPool.voteTokens(3, wei("100000000000000000000"), { from: SECOND });
          await govPool.voteTokens(3, wei("100000000000000000000"), { from: THIRD });

          const proposal = await govPool.proposals(3);
          await govPool.moveProposalToValidators(3);
          const afterMove = await validators.externalProposals(3);

          assert.equal(proposal.executed, afterMove.executed);
          assert.equal(proposal[0].quorumValidators, afterMove.quorum);
        });

        it("should revert when try move without vote", async () => {
          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "GovV: can't be moved");
        });
      });
    });

    describe("GovFee", async () => {
      describe("init", async () => {
        it("should correctly set fee", async () => {
          assert.equal((await govPool.feePercentage()).toFixed(), PRECISION.times(10).toFixed());
        });

        it("should revert when try set fee percentege more than 100%", async () => {
          govPool = await GovPool.new();
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              settings.address,
              userKeeper.address,
              validators.address,
              100,
              PRECISION.times(1000)
            ),
            "GovFee: `_feePercentage` can't be more than 100%"
          );
        });
      });

      describe("withdrawFee (for token)", async () => {
        let startTime;

        it("should withdraw fee", async () => {
          startTime = await getCurrentBlockTime();
          await token.mint(govPool.address, wei("1000"));
          let secondBalance = await token.balanceOf(SECOND);

          await setTime(startTime + 1000);

          await govPool.withdrawFee(token.address, SECOND);

          assert.equal(
            (await token.balanceOf(SECOND)).toFixed(),
            secondBalance.plus(toBN("3247082699137493")).toFixed()
          );
        });

        it("should revert when nothing to withdraw", async () => {
          await truffleAssert.reverts(govPool.withdrawFee(token.address, SECOND), "GFee: nothing to withdraw");
        });
      });

      describe("withdrawFee (for native)", () => {
        let startTime;

        it("should withdraw fee", async () => {
          startTime = await getCurrentBlockTime();
          await web3.eth.sendTransaction({ from: OWNER, to: govPool.address, value: wei("50") });
          let secondBalance = await web3.eth.getBalance(SECOND);

          await setTime(startTime + 1000);

          await govPool.withdrawFee("0x0000000000000000000000000000000000000000", SECOND);

          assert.equal(await web3.eth.getBalance(SECOND), toBN(secondBalance).plus(toBN("162354134956874")).toFixed());
        });

        it("should revert when nothing to withdraw", async () => {
          await truffleAssert.reverts(
            govPool.withdrawFee("0x0000000000000000000000000000000000000000", SECOND),
            "GFee: nothing to withdraw"
          );
        });
      });
    });

    describe("GovPool", async () => {
      describe("execute()", async () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          duration: 1,
          durationValidators: 1,
          quorum: 1,
          quorumValidators: 1,
          minTokenBalance: 1,
          minNftBalance: 1,
        };

        beforeEach(async () => {
          await token.mint(SECOND, wei("100000000000000000000"));
          await token.mint(THIRD, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: THIRD });

          await userKeeper.depositTokens(OWNER, wei("1000"));
          await userKeeper.depositTokens(SECOND, wei("100000000000000000000"), { from: SECOND });
          await userKeeper.depositTokens(THIRD, wei("100000000000000000000"), { from: THIRD });
        });

        it("should add new settings", async () => {
          const bytes = getBytesAddSettings([NEW_SETTINGS]);
          await govPool.createProposal([settings.address], [bytes]);
          await govPool.voteTokens(1, wei("1000"));
          await govPool.voteTokens(1, wei("100000000000000000000"), { from: SECOND });
          await govPool.voteTokens(1, wei("100000000000000000000"), { from: THIRD });

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false, { from: OWNER });
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          const addedSettings = await settings.settings(3);
          assert.equal(addedSettings.earlyCompletion, true);
          assert.equal(addedSettings.duration, 1);
          assert.equal(addedSettings.durationValidators, 1);
          assert.equal(addedSettings.quorum, 1);
          assert.equal(addedSettings.quorumValidators, 1);
          assert.equal(addedSettings.minTokenBalance, 1);
          assert.equal(addedSettings.minNftBalance, 1);
          assert.equal((await govPool.proposals(1)).executed, true);
        });

        it("should get revert from proposal call", async () => {
          let startTime = await getCurrentBlockTime();
          const executorTransfer = await ExecutorTransferMock.new(
            govPool.address,
            token.address,
            nft.address,
            nft.address
          );
          await executorTransfer.setTransferAmount(wei("99"), [], [], []);

          await token.transfer(govPool.address, wei("100"));

          const bytesExecute = getBytesExecute(web3);

          await govPool.createProposal([executorTransfer.address], [bytesExecute]);
          await govPool.voteTokens(1, wei("1000"));
          await govPool.voteTokens(1, wei("100000000000000000000"), { from: SECOND });
          await govPool.voteTokens(1, wei("100000000000000000000"), { from: THIRD });

          await setTime(startTime + 999);
          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false, { from: OWNER });
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await truffleAssert.reverts(govPool.execute(1), "ERC20: transfer amount exceeds allowance");
        });
      });
    });
  });
});
