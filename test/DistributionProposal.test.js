const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");

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

const getBytesExecute = () => {
  return web3.eth.abi.encodeFunctionSignature("execute()");
};

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

describe("DistributionProposal", () => {
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
    proposal = await DistributionProposal.new(govPool.address, token.address, wei("100000"));

    await settings.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
    await userKeeper.__GovUserKeeper_init(ZERO, nft.address, wei("33000"), 33);
    await govPool.__GovPool_init(settings.address, userKeeper.address, ZERO, 100, PRECISION.times(10), "example.com");

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
      assert.equal(await proposal.rewardAddress(), token.address);
      assert.equal((await proposal.rewardAmount()).toFixed(), wei("100000"));
    });

    it("should revert if `_govAddress` is zero", async () => {
      await truffleAssert.reverts(
        DistributionProposal.new("0x0000000000000000000000000000000000000000", token.address, wei("100000")),
        "DP: `_govAddress` is zero"
      );
    });

    it("should revert if `_rewardAddress` is zero", async () => {
      await truffleAssert.reverts(
        DistributionProposal.new(govPool.address, "0x0000000000000000000000000000000000000000", wei("100000")),
        "DP: `_rewardAddress` is zero"
      );
    });

    it("should revert if `_rewardAmount` is zero", async () => {
      await truffleAssert.reverts(
        DistributionProposal.new(govPool.address, token.address, wei("0")),
        "DP: `_rewardAmount` is zero"
      );
    });
  });

  describe("setProposalId()", () => {
    it("should correctly set initial params", async () => {
      await proposal.setProposalId(111);
      assert.equal(await proposal.proposalId(), 111);
    });

    it("should revert if `_proposalId` is zero", async () => {
      await truffleAssert.reverts(proposal.setProposalId(0), "DP: `_proposalId` is zero");
    });

    it("should revert if already set up", async () => {
      await proposal.setProposalId(111);
      await truffleAssert.reverts(proposal.setProposalId(0), "DP: already set up");
    });
  });

  describe("execute()", () => {
    let startTime;

    it("should correctly execute", async () => {
      startTime = await getCurrentBlockTime();
      await proposal.setProposalId(1);

      await userKeeper.depositNfts(OWNER, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      await setTime(startTime + 999);
      await govPool.createProposal("example.com", [proposal.address], [0], [getBytesExecute()]);

      await govPool.voteNfts(1, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      await setTime(startTime + 2000);
      await govPool.execute(1);

      assert.equal(await proposal.distributionStarted(), true);
    });

    it("should revert if not a `Gov` contract", async () => {
      await truffleAssert.reverts(proposal.execute(), "DP: not a `Gov` contract");
    });
  });

  describe("claim()", () => {
    let startTime;

    beforeEach("setup", async () => {
      startTime = await getCurrentBlockTime();

      await token.mint(proposal.address, wei("100000"));

      await userKeeper.depositNfts(SECOND, [1, 2, 3, 4, 5]);
      await userKeeper.depositNfts(THIRD, [6, 7, 8, 9]);

      await setTime(startTime + 999);
      await govPool.createProposal("example.com", [proposal.address], [0], [getBytesExecute()], { from: SECOND });
      await proposal.setProposalId(1);
    });

    it("should correctly claim", async () => {
      await govPool.voteNfts(1, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.voteNfts(1, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await proposal.claim(SECOND);
      await proposal.claim(THIRD);

      assert.equal((await token.balanceOf(SECOND)).toFixed(), "55555555555555555555556");
      assert.equal((await token.balanceOf(THIRD)).toFixed(), "44444444444444444444443");
    });

    it("should revert if already claimed", async () => {
      await govPool.voteNfts(1, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.voteNfts(1, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await proposal.claim(SECOND);

      await truffleAssert.reverts(proposal.claim(SECOND), "DP: already claimed");
    });

    it("should revert if nothing to claim", async () => {
      await govPool.voteNfts(1, [1, 2, 3, 4, 5], { from: SECOND });
      await govPool.voteNfts(1, [6, 7, 8, 9], { from: THIRD });

      await setTime(startTime + 1700);
      await govPool.execute(1);

      await truffleAssert.reverts(proposal.claim(OWNER), "DP: nothing to claim");
    });

    it("should revert if distribution isn't start yet", async () => {
      await truffleAssert.reverts(proposal.claim(SECOND), "DP: distribution hasn't started yet");
    });
  });
});
