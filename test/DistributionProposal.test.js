const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");
const { assert } = require("chai");

const GovPool = artifacts.require("GovPool");
const DistributionProposal = artifacts.require("DistributionProposal");
const GovSettings = artifacts.require("GovSettings");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC20Mock = artifacts.require("ERC20Mock");

GovPool.numberFormat = "BigNumber";
DistributionProposal.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);
const ZERO = "0x0000000000000000000000000000000000000000";

const getBytesExecute = (proposalId, token, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "proposalId",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "token",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
      ],
      name: "execute",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [proposalId, token, amount]
  );
};

const INTERNAL_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: true,
  validatorsVote: false,
  duration: 500,
  durationValidators: 600,
  quorum: PRECISION.times("51").toFixed(),
  quorumValidators: PRECISION.times("61").toFixed(),
  minTokenBalance: wei("10"),
  minNftBalance: 2,
  rewardToken: ZERO,
  creatingReward: 0,
  executionReward: 0,
  voteCoefficient: 0,
};

const DEFAULT_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: true,
  validatorsVote: false,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creatingReward: 0,
  executionReward: 0,
  voteCoefficient: 0,
};

const DP_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  validatorsVote: false,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creatingReward: 0,
  executionReward: 0,
  voteCoefficient: 0,
};

const VALIDATORS_BALANCES_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creatingReward: 0,
  executionReward: 0,
  voteCoefficient: 0,
};

describe("DistributionProposal", () => {
  const unlockAndMint = async (address) => {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });

    await network.provider.send("hardhat_setBalance", [address, "0xFFFFFFFFFFFFFFFF"]);
  };

  let OWNER;
  let SECOND;
  let THIRD;

  let settings;
  let userKeeper;
  let govPool;
  let proposal;
  let token;
  let nft;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EnumMock.new("Mock", "Mock");
    settings = await GovSettings.new();
    userKeeper = await GovUserKeeper.new();
    govPool = await GovPool.new();
    proposal = await DistributionProposal.new(govPool.address);

    await settings.__GovSettings_init(
      proposal.address,
      ZERO,
      INTERNAL_SETTINGS,
      DP_SETTINGS,
      VALIDATORS_BALANCES_SETTINGS,
      DEFAULT_SETTINGS
    );
    await userKeeper.__GovUserKeeper_init(ZERO, nft.address, wei("33000"), 33);
    await proposal.__DistributionProposal_init(govPool.address);
    await govPool.__GovPool_init(
      settings.address,
      userKeeper.address,
      proposal.address,
      ZERO,
      100,
      PRECISION.times(10),
      "example.com"
    );

    await settings.transferOwnership(govPool.address);
    await userKeeper.transferOwnership(govPool.address);

    await token.mint(OWNER, wei("1000000"));

    for (let i = 1; i < 10; i++) {
      await nft.safeMint(OWNER, i);
      await nft.approve(userKeeper.address, i);
    }
  });

  describe("constructor", () => {
    it("should set parameter correctly", async () => {
      assert.equal(await proposal.govAddress(), govPool.address);
    });

    it("should revert if `_govAddress` is zero", async () => {
      let newDP = await DistributionProposal.new();
      await truffleAssert.reverts(newDP.__DistributionProposal_init(ZERO), "DP: `_govAddress` is zero");
    });
  });

  describe("execute()", () => {
    let startTime;

    beforeEach(async () => {
      startTime = await getCurrentBlockTime();

      await govPool.deposit(OWNER, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      await setTime(startTime + 999);
      await govPool.createProposal(
        "example.com",
        [proposal.address],
        [0],
        [getBytesExecute(1, token.address, wei("100"))]
      );

      await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      await setTime(startTime + 2000);

      await unlockAndMint(govPool.address);
    });

    it("should correctly execute", async () => {
      await govPool.execute(1);
      assert.equal((await proposal.proposals(1)).rewardAddress, token.address);
      assert.equal((await proposal.proposals(1)).rewardAmount, wei("100"));
    });

    it("should revert if not a `Gov` contract", async () => {
      await truffleAssert.reverts(proposal.execute(1, token.address, wei("100")), "DP: not a `Gov` contract");
    });

    it("should revert when try execute existed porposal", async () => {
      await govPool.execute(1);
      await truffleAssert.reverts(
        proposal.execute(1, token.address, wei("100"), { from: govPool.address }),
        "DP: proposal already exist"
      );
    });

    it("should revert when address is zero", async () => {
      await truffleAssert.reverts(proposal.execute(1, ZERO, wei("100"), { from: govPool.address }), "DP: zero address");
    });

    it("should revert when amount is zero", async () => {
      await truffleAssert.reverts(
        proposal.execute(1, token.address, "0", { from: govPool.address }),
        "DP: zero amount"
      );
    });
  });

  describe("claim()", () => {
    let startTime;

    beforeEach("setup", async () => {
      startTime = await getCurrentBlockTime();

      await govPool.deposit(SECOND, 0, [1, 2, 3, 4, 5]);
      await govPool.deposit(THIRD, 0, [6, 7, 8, 9]);

      await setTime(startTime + 999);
      await govPool.createProposal(
        "example.com",
        [proposal.address],
        [0],
        [getBytesExecute(1, token.address, wei("100000"))],
        { from: SECOND }
      );
    });

    it("should correctly claim", async () => {
      await token.mint(proposal.address, wei("100000"));

      await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await proposal.claim(SECOND, [1]);
      await proposal.claim(THIRD, [1]);

      assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
      assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
    });

    it("should claim, when proposal amount < reward", async () => {
      await token.mint(proposal.address, wei("10"));

      await unlockAndMint(govPool.address);

      await token.mint(govPool.address, wei("100000"));
      await token.approve(proposal.address, wei("100000"), { from: govPool.address });

      await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await proposal.claim(SECOND, [1]);
      await proposal.claim(THIRD, [1]);

      assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
      assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
    });

    it("should revert if already claimed", async () => {
      await token.mint(proposal.address, wei("100000"));

      await govPool.vote(1, 0, [], 0, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.vote(1, 0, [], 0, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await proposal.claim(SECOND, [1]);

      await truffleAssert.reverts(proposal.claim(SECOND, [1]), "DP: already claimed");
    });

    it("should revert if distribution isn't start yet", async () => {
      await token.mint(proposal.address, wei("100000"));

      await truffleAssert.reverts(proposal.claim(SECOND, [1]), "DP: zero address");
    });

    it("should revert when array length is zero", async () => {
      await token.mint(proposal.address, wei("100000"));

      await truffleAssert.reverts(proposal.claim(SECOND, []), "DP: zero array length");
    });

    it("should revert when address is zero", async () => {
      await token.mint(proposal.address, wei("100000"));

      await truffleAssert.reverts(proposal.claim(ZERO, [1]), "DP: zero address");
    });
  });
});
