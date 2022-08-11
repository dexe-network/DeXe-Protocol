const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { assert } = require("chai");

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
ExecutorTransferMock.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);

const ProposalState = {
  Voting: 0,
  WaitingForVotingTransfer: 1,
  ValidatorVoting: 2,
  Defeated: 3,
  Succeeded: 4,
  Executed: 5,
  Undefined: 6,
};

const INTERNAL_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: true,
  duration: 500,
  durationValidators: 600,
  quorum: PRECISION.times("51").toFixed(),
  quorumValidators: PRECISION.times("61").toFixed(),
  minTokenBalance: wei("10"),
  minNftBalance: 2,
};

const DP_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  duration: 600,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
};

const DEFAULT_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: true,
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
              type: "bool",
              name: "delegatedVotingAllowed",
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
          name: "_settings",
        },
      ],
    },
    [settings]
  );
};

const getBytesEditSettings = (ids, settings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "editSettings",
      type: "function",
      inputs: [
        {
          type: "uint256[]",
          name: "settingsIds",
        },
        {
          components: [
            {
              type: "bool",
              name: "earlyCompletion",
            },
            {
              type: "bool",
              name: "delegatedVotingAllowed",
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
          name: "_settings",
        },
      ],
    },
    [ids, settings]
  );
};

const getBytesChangeExecutors = (executors, ids) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "changeExecutors",
      type: "function",
      inputs: [
        {
          type: "address[]",
          name: "executors",
        },
        {
          type: "uint256[]",
          name: "settingsIds",
        },
      ],
    },
    [executors, ids]
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

describe("GovPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FOURTH;

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
    FOURTH = await accounts(3);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    settings = await GovSettings.new();
    validators = await GovValidators.new();
    userKeeper = await GovUserKeeper.new();
    govPool = await GovPool.new();
  });

  describe("Empty pool", () => {
    describe("GovCreator", () => {
      describe("init", () => {
        it("should revert when try to set zero addresses", async () => {
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              "0x0000000000000000000000000000000000000000",
              userKeeper.address,
              "0x0000000000000000000000000000000000000000",
              validators.address,
              100,
              PRECISION.times(10),
              "example.com"
            ),
            "GovC: address is zero (1)"
          );
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              settings.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              validators.address,
              100,
              PRECISION.times(10),
              ""
            ),
            "GovC: address is zero (2)"
          );
        });
      });
    });

    describe("GovVote", () => {
      describe("init()", () => {
        it("should revert when try to set votesLimit = 0", async () => {
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              settings.address,
              userKeeper.address,
              "0x0000000000000000000000000000000000000000",
              validators.address,
              0,
              PRECISION.times(10),
              "example.com"
            )
          );
        });
      });
    });

    describe("GovFee", () => {
      describe("init()", () => {
        it("should revert when try set fee percentage more than 100%", async () => {
          await truffleAssert.reverts(
            govPool.__GovPool_init(
              settings.address,
              userKeeper.address,
              "0x0000000000000000000000000000000000000000",
              validators.address,
              100,
              PRECISION.times(1000),
              "example.com"
            ),
            "GovFee: `_feePercentage` can't be more than 100%"
          );
        });
      });
    });
  });

  describe("Fullfat GovPool", () => {
    beforeEach("setup", async () => {
      nft = await ERC721EnumMock.new("Mock", "Mock");

      await settings.__GovSettings_init(INTERNAL_SETTINGS, DP_SETTINGS, DEFAULT_SETTINGS);
      await validators.__GovValidators_init(
        "Validator Token",
        "VT",
        600,
        PRECISION.times("51").toFixed(),
        [OWNER, SECOND],
        [wei("100"), wei("1000000000000")]
      );
      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);
      await govPool.__GovPool_init(
        settings.address,
        userKeeper.address,
        "0x0000000000000000000000000000000000000000",
        validators.address,
        100,
        PRECISION.times(10),
        "example.com"
      );

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

    describe("GovUserKeeperController", () => {
      describe("deposit()", () => {
        it("should deposit tokens", async () => {
          assert.equal(await userKeeper.tokenBalance(OWNER, false, false), "0");
          assert.equal(await userKeeper.nftBalance(OWNER, false, false), "0");

          await govPool.deposit(OWNER, wei("100"), [1, 2, 3]);

          assert.equal(await userKeeper.tokenBalance(OWNER, false, false), wei("100"));
          assert.equal(await userKeeper.nftBalance(OWNER, false, false), "3");
        });
      });

      describe("unlockInProposals(), unlock()", () => {
        let startTime;

        beforeEach("setup", async () => {
          await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

          await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
          await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);

          startTime = await getCurrentBlockTime();

          await govPool.vote(1, 0, [], wei("100"), [2]);
          await govPool.vote(2, 0, [], wei("50"), []);
        });

        it("should unlock in first proposal", async () => {
          const beforeUnlock = await govPool.getWithdrawableAssets(OWNER);

          assert.equal(beforeUnlock.withdrawableTokens.toFixed(), wei("900"));
          assert.deepEqual(beforeUnlock.withdrawableNfts[0].slice(0, beforeUnlock.withdrawableNfts[1]), [
            "1",
            "3",
            "4",
          ]);

          await setTime(startTime + 1000);
          await govPool.unlockInProposals([1], OWNER, false);

          const afterUnlock = await govPool.getWithdrawableAssets(OWNER);

          assert.equal(afterUnlock.withdrawableTokens.toFixed(), wei("1000"));
          assert.deepEqual(afterUnlock.withdrawableNfts[0].slice(0, afterUnlock.withdrawableNfts[1]), [
            "1",
            "2",
            "3",
            "4",
          ]);
        });

        it("should unlock all", async () => {
          const beforeUnlock = await govPool.getWithdrawableAssets(OWNER);

          assert.equal(beforeUnlock.withdrawableTokens.toFixed(), wei("900"));
          assert.deepEqual(beforeUnlock.withdrawableNfts[0].slice(0, beforeUnlock.withdrawableNfts[1]), [
            "1",
            "3",
            "4",
          ]);

          await setTime(startTime + 1000);
          await govPool.unlock(OWNER, false);

          const afterUnlock = await govPool.getWithdrawableAssets(OWNER);

          assert.equal(afterUnlock.withdrawableTokens.toFixed(), wei("1000"));
          assert.deepEqual(afterUnlock.withdrawableNfts[0].slice(0, afterUnlock.withdrawableNfts[1]), [
            "1",
            "2",
            "3",
            "4",
          ]);
        });
      });
    });

    describe("GovCreator", () => {
      describe("init()", () => {
        it("should correctly set all parameters", async () => {
          assert.equal(await govPool.govSetting(), settings.address);
          assert.equal(await govPool.govUserKeeper(), userKeeper.address);
        });
      });

      describe("createProposal()", () => {
        beforeEach("", async () => {
          await govPool.deposit(OWNER, 1, [1]);
        });

        it("should create 2 proposals", async () => {
          await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
          let proposal = await govPool.proposals(1);

          assert.equal(proposal.core.settings[0], DEFAULT_SETTINGS.earlyCompletion);
          assert.equal(proposal.core.settings[1], DEFAULT_SETTINGS.delegatedVotingAllowed);
          assert.equal(proposal.core.settings[2], DEFAULT_SETTINGS.duration);
          assert.equal(proposal.core.settings[3], DEFAULT_SETTINGS.durationValidators);
          assert.equal(proposal.core.settings[4], DEFAULT_SETTINGS.quorum);
          assert.equal(proposal.core.settings[5], DEFAULT_SETTINGS.quorumValidators);
          assert.equal(proposal.core.settings[6], DEFAULT_SETTINGS.minTokenBalance);
          assert.equal(proposal.core.settings[7], DEFAULT_SETTINGS.minNftBalance);

          assert.isFalse(proposal.core.executed);
          assert.equal(proposal.core.proposalId, 1);
          assert.equal(proposal.descriptionURL, "example.com");

          await govPool.createProposal("example2.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
          proposal = await govPool.proposals(2);

          assert.equal(proposal.core.settings[0], DEFAULT_SETTINGS.earlyCompletion);
          assert.equal(proposal.core.settings[1], DEFAULT_SETTINGS.delegatedVotingAllowed);
          assert.equal(proposal.core.settings[2], DEFAULT_SETTINGS.duration);
          assert.equal(proposal.core.settings[3], DEFAULT_SETTINGS.durationValidators);
          assert.equal(proposal.core.settings[4], DEFAULT_SETTINGS.quorum);
          assert.equal(proposal.core.settings[5], DEFAULT_SETTINGS.quorumValidators);
          assert.equal(proposal.core.settings[6], DEFAULT_SETTINGS.minTokenBalance);
          assert.equal(proposal.core.settings[7], DEFAULT_SETTINGS.minNftBalance);

          assert.isFalse(proposal.core.executed);
          assert.equal(proposal.core.proposalId, 2);
          assert.equal(proposal.descriptionURL, "example2.com");
        });

        it("should revert when create proposal with arrays zero length", async () => {
          await truffleAssert.reverts(
            govPool.createProposal("", [], [0], [getBytesApprove(SECOND, 1)]),
            "GovC: invalid array length"
          );
          await truffleAssert.reverts(
            govPool.createProposal("", [SECOND], [0, 0], [getBytesApprove(SECOND, 1)]),
            "GovC: invalid array length"
          );
          await truffleAssert.reverts(
            govPool.createProposal("", [SECOND, THIRD], [0, 0], [getBytesApprove(SECOND, 1)]),
            "GovC: invalid array length"
          );
        });

        it("should revert when creating internal proposal with non zero value", async () => {
          await truffleAssert.reverts(
            govPool.createProposal(
              "example.com",
              [settings.address],
              [1],
              [getBytesEditSettings([3], [DEFAULT_SETTINGS])]
            ),
            "GovC: invalid internal data"
          );
          await truffleAssert.passes(
            govPool.createProposal(
              "example.com",
              [settings.address],
              [0],
              [getBytesEditSettings([3], [DEFAULT_SETTINGS])]
            ),
            "Created"
          );
        });
      });

      describe("getProposalInfo()", () => {
        beforeEach("", async () => {
          await govPool.deposit(OWNER, 1, [1]);

          await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
          await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
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

    describe("GovVote", () => {
      beforeEach("setup", async () => {
        await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);

        await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);
        await govPool.createProposal("example.com", [THIRD], [0], [getBytesApprove(SECOND, 1)]);
      });

      describe("init()", () => {
        it("should correctly set parameters", async () => {
          assert.equal(await govPool.votesLimit(), 100);
          assert.equal(await govPool.validators(), validators.address);
        });
      });

      describe("vote() tokens", () => {
        it("should vote for two proposals", async () => {
          await govPool.vote(1, 0, [], wei("100"), []);
          await govPool.vote(2, 0, [], wei("50"), []);

          assert.equal((await govPool.proposals(1)).descriptionURL, "example.com");
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).core.votesFor, wei("50"));
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));

          await govPool.vote(1, 0, [], wei("100"), []);

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("200"));
        });

        it("should revert when vote zero amount", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], 0, []), "GovV: empty vote");
        });
      });

      describe("voteDelegated() tokens", () => {
        beforeEach("setup", async () => {
          await govPool.delegate(SECOND, wei("500"), []);
          await govPool.delegate(THIRD, wei("500"), []);
        });

        it("should vote delegated tokens for two proposals", async () => {
          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          await govPool.voteDelegated(2, wei("50"), [], { from: THIRD });

          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));
          assert.equal((await govPool.proposals(2)).core.votesFor, wei("50"));
        });

        it("should vote delegated tokens twice", async () => {
          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("100"));

          await govPool.voteDelegated(1, wei("100"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("200"));

          const total = await govPool.getTotalVotes(1, SECOND, true);

          assert.equal(toBN(total[0]).toFixed(), wei("200"));
          assert.equal(toBN(total[1]).toFixed(), wei("200"));
        });

        it("should vote for all tokens", async () => {
          await govPool.voteDelegated(1, wei("500"), [], { from: SECOND });
          assert.equal((await govPool.proposals(1)).core.votesFor, wei("500"));
        });

        it("should revert when vote is zero amount", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [], { from: SECOND }), "GovV: empty delegated vote");
        });

        it("should revert when spending undelegated tokens", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 1, [], { from: FOURTH }), "GovV: low balance");
        });

        it("should revert if voting with amount exceeding delegation", async () => {
          await truffleAssert.reverts(
            govPool.voteDelegated(1, wei("1000"), [], { from: SECOND }),
            "GovV: wrong vote amount"
          );
        });
      });

      describe("vote() nfts", () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");

        it("should vote for two proposals", async () => {
          await govPool.vote(1, 0, [], 0, [1]);
          await govPool.vote(2, 0, [], 0, [2, 3]);

          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote for proposal twice", async () => {
          await govPool.vote(1, 0, [], 0, [1]);
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.vote(1, 0, [], 0, [2, 3]);
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.times(3).plus(1).toFixed());
        });

        it("should revert when order is wrong", async () => {
          await truffleAssert.reverts(govPool.vote(1, 0, [], 0, [3, 2]), "GovV: wrong NFT order");
        });
      });

      describe("voteDelegated() nfts", () => {
        const SINGLE_NFT_COST = toBN("3666666666666666666666");

        beforeEach("setup", async () => {
          await govPool.delegate(SECOND, wei("500"), [1]);
          await govPool.delegate(THIRD, wei("500"), [2, 3]);
        });

        it("should vote delegated nfts for two proposals", async () => {
          await govPool.voteDelegated(1, 0, [1], { from: SECOND });
          await govPool.voteDelegated(2, 0, [2, 3], { from: THIRD });

          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());
          assert.equal((await govPool.proposals(2)).core.votesFor, SINGLE_NFT_COST.times(2).plus(1).toFixed());
        });

        it("should vote delegated nfts twice", async () => {
          await govPool.voteDelegated(1, 0, [2], { from: THIRD });
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.toFixed());

          await govPool.voteDelegated(1, 0, [3], { from: THIRD });
          assert.equal((await govPool.proposals(1)).core.votesFor, SINGLE_NFT_COST.times(2).toFixed());
        });

        it("should revert when spending undelegated nfts", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [1], { from: FOURTH }), "GovV: low balance");
        });

        it("should revert when voting with not delegated nfts", async () => {
          await truffleAssert.reverts(govPool.voteDelegated(1, 0, [2], { from: SECOND }), "GovUK: NFT is not owned");
        });
      });

      describe("moveProposalToValidators()", () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          duration: 70,
          durationValidators: 800,
          quorum: PRECISION.times("71").toFixed(),
          quorumValidators: PRECISION.times("100").toFixed(),
          minTokenBalance: wei("20"),
          minNftBalance: 3,
        };

        beforeEach("setup", async () => {
          startTime = await getCurrentBlockTime();
          await govPool.createProposal(
            "example.com",
            [settings.address],
            [0],
            [getBytesEditSettings([3], [NEW_SETTINGS])]
          );

          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });
        });

        it("should move proposal to validators", async () => {
          await govPool.vote(3, wei("1000"), [], wei("1000"), []);
          await govPool.vote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], { from: SECOND });

          const proposal = await govPool.proposals(3);

          await govPool.moveProposalToValidators(3);

          const afterMove = await validators.externalProposals(3);

          assert.equal(await govPool.getProposalState(3), ProposalState.ValidatorVoting);

          assert.equal(proposal.core.executed, afterMove.executed);
          assert.equal(proposal.core.settings.quorumValidators, afterMove.quorum);

          await validators.vote(3, wei("1000000000000"), false, { from: SECOND });

          assert.equal(await govPool.getProposalState(3), ProposalState.Succeeded);
        });

        it("should be rejected by validators", async () => {
          await govPool.vote(3, wei("1000"), [], wei("1000"), []);
          await govPool.vote(3, wei("100000000000000000000"), [], wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(3);

          await setTime(startTime + 1000000);

          assert.equal(await govPool.getProposalState(3), ProposalState.Defeated);
        });

        it("should revert when try move without vote", async () => {
          await truffleAssert.reverts(govPool.moveProposalToValidators(3), "GovV: can't be moved");
        });
      });
    });

    describe("GovFee", () => {
      describe("init()", () => {
        it("should correctly set fee", async () => {
          assert.equal((await govPool.feePercentage()).toFixed(), PRECISION.times(10).toFixed());
        });
      });

      describe("withdrawFee (for token)", () => {
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

    describe("GovUserKeeperController", () => {
      describe("deposit, vote, withdraw", () => {
        it("should deposit, vote and withdraw tokens", async () => {
          await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);
          await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await token.mint(SECOND, wei("1000"));
          await token.approve(userKeeper.address, wei("1000"), { from: SECOND });

          await govPool.vote(1, wei("1000"), [], wei("500"), [], { from: SECOND });

          let proposals = await govPool.getProposals(SECOND, false);
          let withdrawable = await govPool.getWithdrawableAssets(SECOND);

          assert.deepEqual(proposals.unlockedIds[0], ["0"]);
          assert.deepEqual(proposals.lockedIds[0], ["1"]);
          assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), wei("500"));
          assert.equal(withdrawable.withdrawableNfts[1], "0");

          await govPool.vote(1, 0, [], wei("1000"), [1, 2, 3, 4]);

          await setTime((await getCurrentBlockTime()) + 10000);

          proposals = await govPool.getProposals(SECOND, false);
          withdrawable = await govPool.getWithdrawableAssets(SECOND);

          assert.deepEqual(proposals.unlockedIds[0], ["1"]);
          assert.deepEqual(proposals.lockedIds[0], ["0"]);
          assert.equal(toBN(withdrawable.withdrawableTokens).toFixed(), wei("1000"));
          assert.equal(withdrawable.withdrawableNfts[1], "0");

          assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), "0");

          await govPool.withdraw(SECOND, wei("1000"), [], { from: SECOND });

          assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), wei("1000"));
        });

        it("should not unlock nonexisting proposals", async () => {
          await truffleAssert.reverts(
            govPool.unlockInProposals([1], OWNER, false),
            "GovUKC: hasn't voted for this proposal"
          );
        });

        it("should not deposit zero tokens", async () => {
          await truffleAssert.reverts(govPool.deposit(OWNER, 0, []), "GovUKC: empty deposit");
        });

        it("should not withdraw zero tokens", async () => {
          await truffleAssert.reverts(govPool.withdraw(OWNER, 0, []), "GovUKC: empty withdrawal");
        });

        it("should not delegate zero tokens", async () => {
          await truffleAssert.reverts(govPool.delegate(OWNER, 0, []), "GovUKC: empty delegation");
        });

        it("should not undelegate zero tokens", async () => {
          await truffleAssert.reverts(govPool.undelegate(OWNER, 0, []), "GovUKC: empty undelegation");
        });
      });

      describe("deposit, delegate, vote, withdraw", () => {
        it("should deposit, delegate, vote delegated, undelegate and withdraw nfts", async () => {
          await govPool.deposit(OWNER, wei("1000"), [1, 2, 3, 4]);
          await govPool.createProposal("example.com", [SECOND], [0], [getBytesApprove(SECOND, 1)]);

          await govPool.delegate(SECOND, wei("500"), [2, 4]);

          await govPool.voteDelegated(1, wei("400"), [4], { from: SECOND });

          let proposals = await govPool.getProposals(SECOND, true);
          let undelegateable = await govPool.getUndelegateableAssets(OWNER, SECOND);

          assert.deepEqual(proposals.unlockedIds[0], ["0"]);
          assert.deepEqual(proposals.lockedIds[0], ["1"]);
          assert.equal(toBN(undelegateable.undelegateableTokens).toFixed(), wei("100"));
          assert.deepEqual(undelegateable.undelegateableNfts[0], ["2"]);

          await govPool.vote(1, 0, [], wei("500"), [1, 3]);

          await setTime((await getCurrentBlockTime()) + 10000);

          proposals = await govPool.getProposals(SECOND, true);
          undelegateable = await govPool.getUndelegateableAssets(OWNER, SECOND);

          assert.deepEqual(proposals.unlockedIds[0], ["1"]);
          assert.deepEqual(proposals.lockedIds[0], ["0"]);
          assert.equal(toBN(undelegateable.undelegateableTokens).toFixed(), wei("500"));
          assert.deepEqual(undelegateable.undelegateableNfts[0], ["2", "4"]);

          await govPool.undelegate(SECOND, wei("500"), [2, 4]);

          await govPool.withdraw(OWNER, wei("1000"), [1, 2, 3, 4]);
        });
      });
    });

    describe("GovPool", () => {
      describe("execute()", () => {
        const NEW_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          duration: 1,
          durationValidators: 1,
          quorum: 1,
          quorumValidators: 1,
          minTokenBalance: 1,
          minNftBalance: 1,
        };

        const NEW_INTERNAL_SETTINGS = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          duration: 500,
          durationValidators: 60,
          quorum: PRECISION.times("1").toFixed(),
          quorumValidators: PRECISION.times("1").toFixed(),
          minTokenBalance: wei("1"),
          minNftBalance: 1,
        };

        beforeEach(async () => {
          await token.mint(SECOND, wei("100000000000000000000"));

          await token.approve(userKeeper.address, wei("100000000000000000000"), { from: SECOND });

          await govPool.deposit(OWNER, wei("1000"), []);
          await govPool.deposit(SECOND, wei("100000000000000000000"), [], { from: SECOND });
        });

        it("should add new settings", async () => {
          const bytes = getBytesAddSettings([NEW_SETTINGS]);

          await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
          await govPool.vote(1, 0, [], wei("1000"), []);
          await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          const addedSettings = await settings.settings(4);

          assert.isTrue(addedSettings.earlyCompletion);
          assert.isFalse(addedSettings.delegatedVotingAllowed);
          assert.equal(addedSettings.duration, 1);
          assert.equal(addedSettings.durationValidators, 1);
          assert.equal(addedSettings.quorum, 1);
          assert.equal(addedSettings.quorumValidators, 1);
          assert.equal(addedSettings.minTokenBalance, 1);
          assert.equal(addedSettings.minNftBalance, 1);

          assert.isTrue((await govPool.proposals(1)).core.executed);
        });

        it("should not execute random proposals", async () => {
          await truffleAssert.reverts(govPool.execute(1), "Gov: invalid proposal status");
        });

        it("should change settings then full vote", async () => {
          const bytes = getBytesEditSettings([1], [NEW_INTERNAL_SETTINGS]);

          await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
          await govPool.vote(1, 0, [], wei("1000"), []);
          await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          await govPool.deposit(OWNER, 0, [1, 2, 3, 4]);
          await govPool.delegate(SECOND, wei("1000"), [1, 2, 3, 4]);

          await govPool.createProposal("example.com", [settings.address], [0], [bytes]);
          await govPool.vote(2, 0, [], wei("1000"), [1, 2, 3, 4]);
          await truffleAssert.reverts(
            govPool.voteDelegated(2, wei("1000"), [1, 2, 3, 4], { from: SECOND }),
            "GovV: delegated voting unavailable"
          );
        });

        it("should add new settings, change executors and create default trusted proposal", async () => {
          const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);

          const settingsBytes = getBytesAddSettings([NEW_SETTINGS]);
          const changeExecutorBytes = getBytesChangeExecutors([executorTransfer.address], [4]);

          assert.equal(await govPool.getProposalState(1), ProposalState.Undefined);

          await govPool.createProposal(
            "example.com",
            [settings.address, settings.address],
            [0, 0],
            [settingsBytes, changeExecutorBytes]
          );
          await govPool.vote(1, 0, [], wei("1000"), []);
          await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await govPool.execute(1);

          assert.equal(await govPool.getProposalState(1), ProposalState.Executed);
          assert.equal((await settings.executorInfo(executorTransfer.address))[0], 4);

          const bytesExecute = getBytesExecute();
          const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

          await govPool.createProposal(
            "example.com",
            [token.address, executorTransfer.address],
            [wei("1"), wei("1")],
            [bytesApprove, bytesExecute]
          );

          assert.equal((await govPool.proposals(2)).core.settings[2], DEFAULT_SETTINGS.duration);

          await govPool.createProposal(
            "example.com",
            [token.address, executorTransfer.address],
            ["0", wei("1")],
            [bytesApprove, bytesExecute]
          );

          assert.equal((await govPool.proposals(3)).core.settings[2], NEW_SETTINGS.duration);
        });

        it("should execute proposal and send ether", async () => {
          let startTime = await getCurrentBlockTime();

          const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);
          await executorTransfer.setTransferAmount(wei("99"));

          await token.transfer(govPool.address, wei("100"));
          await govPool.sendTransaction({ value: wei("1"), from: OWNER });

          const bytesExecute = getBytesExecute();
          const bytesApprove = getBytesApprove(executorTransfer.address, wei("99"));

          await govPool.createProposal(
            "example.com",
            [token.address, executorTransfer.address],
            ["0", wei("1")],
            [bytesApprove, bytesExecute]
          );
          await govPool.vote(1, 0, [], wei("1000"), []);
          await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

          await setTime(startTime + 999);

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          assert.equal(await web3.eth.getBalance(executorTransfer.address), "0");

          await truffleAssert.passes(govPool.execute(1), "Executed");

          assert.equal(await web3.eth.getBalance(executorTransfer.address), wei("1"));
        });

        it("should get revert from proposal call", async () => {
          let startTime = await getCurrentBlockTime();

          const executorTransfer = await ExecutorTransferMock.new(govPool.address, token.address);
          await executorTransfer.setTransferAmount(wei("99"));

          await token.transfer(govPool.address, wei("100"));

          const bytesExecute = getBytesExecute();

          await govPool.createProposal("example.com", [executorTransfer.address], [0], [bytesExecute]);
          await govPool.vote(1, 0, [], wei("1000"), []);
          await govPool.vote(1, 0, [], wei("100000000000000000000"), [], { from: SECOND });

          await setTime(startTime + 999);

          await govPool.moveProposalToValidators(1);
          await validators.vote(1, wei("100"), false);
          await validators.vote(1, wei("1000000000000"), false, { from: SECOND });

          await truffleAssert.reverts(govPool.execute(1), "ERC20: insufficient allowance");
        });
      });
    });
  });
});
