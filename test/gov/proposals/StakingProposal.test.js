const { toBN, accounts, wei } = require("../../../scripts/utils/utils");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("../../helpers/block-helper");
const { ZERO_ADDR, ETHER_ADDR, PRECISION } = require("../../../scripts/utils/constants");
const MAX_TOKENSALE_AMOUNT = 10;

const StakingProposal = artifacts.require("StakingProposal");
const ERC20Mock = artifacts.require("ERC20Mock");

StakingProposal.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

function extractNamedFields(array) {
  // Фильтруем свойства объекта, игнорируя числовые индексы
  return Object.fromEntries(Object.entries(array).filter(([key]) => isNaN(key)));
}

describe("StakingProposal", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let GOVPOOL;
  let USERKEEPER;

  let stakingProposal, token;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    GOVPOOL = await accounts(8);
    USERKEEPER = await accounts(9);

    stakingProposal = await StakingProposal.new();
    token = await ERC20Mock.new("Mock", "Mock", 18);
    await stakingProposal.__StakingProposal_init(GOVPOOL, { from: USERKEEPER });
    await token.mint(GOVPOOL, wei("1000000000"));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("Initializer", () => {
    it("Cant initialize twice", async () => {
      await truffleAssert.reverts(
        stakingProposal.__StakingProposal_init(GOVPOOL, { from: USERKEEPER }),
        "Initializable: contract is already initialized",
      );
    });

    it("should revert if _govAddress is zero", async () => {
      let sp = await StakingProposal.new();

      await truffleAssert.reverts(sp.__StakingProposal_init(ZERO_ADDR), "SP: Gov is zero");
    });
  });

  describe("Create staking", () => {
    it("Can't create staking not from govpool", async () => {
      await truffleAssert.reverts(
        stakingProposal.createStaking(ZERO_ADDR, 0, 0, 0, "ipfs://default"),
        "SP: not a Gov contract",
      );
    });

    it("Can't create invalid staking", async () => {
      await truffleAssert.reverts(
        stakingProposal.createStaking(ZERO_ADDR, 1, 1, 2, "ipfs://default", { from: GOVPOOL }),
        "SP: Invalid settings",
      );
      await truffleAssert.reverts(
        stakingProposal.createStaking(OWNER, 0, 1, 2, "ipfs://default", { from: GOVPOOL }),
        "SP: Invalid settings",
      );
      await truffleAssert.reverts(
        stakingProposal.createStaking(OWNER, 1, 1, 1, "ipfs://default", { from: GOVPOOL }),
        "SP: Invalid settings",
      );
    });

    it("Outdated proposal does not create staking but spends allowance", async () => {
      await token.approve(stakingProposal.address, 1, { from: GOVPOOL });
      assert.equal((await token.allowance(GOVPOOL, stakingProposal.address)).toFixed(), 1);
      const govPoolBalance = (await token.balanceOf(GOVPOOL)).toFixed();
      const stakingsCount = (await stakingProposal.stakingsCount()).toFixed();

      await stakingProposal.createStaking(token.address, 1, 1, 2, "ipfs://default", { from: GOVPOOL });
      assert.equal((await token.allowance(GOVPOOL, stakingProposal.address)).toFixed(), 0);
      assert.equal(govPoolBalance, (await token.balanceOf(GOVPOOL)).toFixed());
      assert.equal(stakingsCount, (await stakingProposal.stakingsCount()).toFixed());
    });

    it("Non-existant proposal is not active", async () => {
      assert.equal(await stakingProposal.isActiveTier(0), false);
    });

    it("Can't be more than max active stakings", async () => {
      await token.approve(stakingProposal.address, wei("1000"), { from: GOVPOOL });

      const startTime = (await getCurrentBlockTime()) + 1;
      const endTime = startTime + 1000;

      for (let i = 0; i < MAX_TOKENSALE_AMOUNT; i++) {
        await stakingProposal.createStaking(token.address, wei("1"), startTime, endTime, "ipfs://default", {
          from: GOVPOOL,
        });
      }

      await truffleAssert.reverts(
        stakingProposal.createStaking(token.address, wei("1"), startTime, endTime, "ipfs://default", { from: GOVPOOL }),
        "SP: Max tiers reached",
      );

      await setTime((await getCurrentBlockTime()) + 2000);

      await stakingProposal.createStaking(token.address, wei("1"), startTime, startTime + 10000, "ipfs://default", {
        from: GOVPOOL,
      });
    });

    it("Could create proposal", async () => {
      await token.approve(stakingProposal.address, wei("1000"), { from: GOVPOOL });

      let startTime = (await getCurrentBlockTime()) + 1;
      let endTime = startTime + 1000;
      assert.equal((await token.balanceOf(stakingProposal.address)).toFixed(), "0");

      await stakingProposal.createStaking(token.address, wei("1"), startTime, endTime, "ipfs://default", {
        from: GOVPOOL,
      });
      assert.equal((await token.balanceOf(stakingProposal.address)).toFixed(), wei("1"));

      let stakingInfo = (await stakingProposal.getStakingInfo([1]))[0];

      assert.equal(stakingInfo.id, 1);
      assert.equal(stakingInfo.metadata, "ipfs://default");
      assert.equal(stakingInfo.rewardToken, token.address);
      assert.equal(stakingInfo.totalRewardsAmount, wei("1"));
      assert.equal(stakingInfo.startedAt, startTime.toString());
      assert.equal(stakingInfo.deadline, endTime.toString());
      assert.equal(stakingInfo.isActive, true);
      assert.equal(stakingInfo.totalStaked, "0");
      assert.equal(stakingInfo.owedToProtocol, "0");

      stakingInfo = (await stakingProposal.getStakingInfo([0]))[0];

      assert.equal(stakingInfo.id, 0);
      assert.equal(stakingInfo.metadata, "");
      assert.equal(stakingInfo.rewardToken, ZERO_ADDR);
      assert.equal(stakingInfo.totalRewardsAmount, "0");
      assert.equal(stakingInfo.startedAt, "0");
      assert.equal(stakingInfo.deadline, "0");
      assert.equal(stakingInfo.isActive, false);
      assert.equal(stakingInfo.totalStaked, "0");
      assert.equal(stakingInfo.owedToProtocol, "0");
    });
  });

  describe("Staking itself", () => {
    let startTime, endTime, duration, amount;

    beforeEach("setup", async () => {
      amount = wei("1000000000");
      await token.approve(stakingProposal.address, amount, { from: GOVPOOL });
      startTime = (await getCurrentBlockTime()) + 1;
      duration = 1000;
      endTime = startTime + duration;
      await stakingProposal.createStaking(token.address, amount, startTime, endTime, "ipfs://default", {
        from: GOVPOOL,
      });
    });

    it("Cant stake not from keeper", async () => {
      await truffleAssert.reverts(stakingProposal.stake(OWNER, 1, 1), "SP: not a Keeper contract");
    });

    it("Cant stake if not active", async () => {
      await truffleAssert.reverts(stakingProposal.stake(OWNER, 1, 0, { from: USERKEEPER }), "SP: Not Active");
    });

    it("Cant stake zero", async () => {
      await truffleAssert.reverts(
        stakingProposal.stake(OWNER, 0, 1, { from: USERKEEPER }),
        "ValueDistributor: amount has to be more than 0",
      );
    });

    it("Cant claim or reclaim before ending or non-existant proposal", async () => {
      await truffleAssert.reverts(stakingProposal.reclaim(0), "SP: invalid id");
      await truffleAssert.reverts(stakingProposal.reclaim(1), "SP: Still active");
      await truffleAssert.reverts(stakingProposal.claim(0), "SP: invalid id");
      await truffleAssert.reverts(stakingProposal.claim(1), "SP: Still active");
    });

    it("claimAll claims zero before deadline", async () => {
      const balanceBefore = (await token.balanceOf(OWNER)).toFixed();
      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });
      await stakingProposal.claimAll();
      assert.equal((await token.balanceOf(OWNER)).toFixed(), balanceBefore);
    });

    it("Edge-case: reclaims all amount when no stakings", async () => {
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), 0);

      await setTime(startTime + 1001);
      await stakingProposal.reclaim(1);
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), wei("1000000000"));
    });

    it("Claim and reclaim 50/50 when staking on the halfway", async () => {
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), 0);
      await setTime(startTime + 499);

      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });

      await setTime(startTime + 1001);
      await stakingProposal.reclaim(1);
      await stakingProposal.claim(1);
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), wei("500000000"));
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("500000000"));
    });

    it("Claiming second time gives zero", async () => {
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), 0);
      await setTime(startTime + 499);

      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });

      await setTime(startTime + 1001);
      await stakingProposal.claim(1);
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("500000000"));

      await stakingProposal.claim(1);
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("500000000"));
    });

    it("Reclaiming second time gives zero", async () => {
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), 0);
      await setTime(startTime + 499);

      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });

      await setTime(startTime + 1001);
      await stakingProposal.reclaim(1);
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), wei("500000000"));

      await stakingProposal.reclaim(1);
      assert.equal((await token.balanceOf(GOVPOOL)).toFixed(), wei("500000000"));
    });

    it("Correct staked amount", async () => {
      let token2 = await ERC20Mock.new("Mock", "Mock", 18);
      await token2.mint(GOVPOOL, wei("1000000000"));
      await token2.approve(stakingProposal.address, wei("1000000000"), { from: GOVPOOL });

      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });
      assert.equal((await stakingProposal.getTotalStakes(OWNER)).toFixed(), "1");

      for (let i = 2; i < 10; i++) {
        await stakingProposal.createStaking(
          token2.address,
          wei("1"),
          startTime,
          startTime + duration * i,
          "ipfs://default",
          {
            from: GOVPOOL,
          },
        );
        await stakingProposal.stake(OWNER, 1, i, { from: USERKEEPER });
        assert.equal((await stakingProposal.getTotalStakes(OWNER)).toFixed(), i.toString());
      }

      for (let i = 1; i < 10; i++) {
        await setTime(startTime + duration * i + 1);
        assert.equal((await stakingProposal.getTotalStakes(OWNER)).toFixed(), (9 - i).toString());
      }

      assert.equal((await token.balanceOf(OWNER)).toFixed(), 0);
      assert.equal((await token2.balanceOf(OWNER)).toFixed(), 0);

      await stakingProposal.claimAll();

      for (let i = 1; i < 10; i++) {
        await stakingProposal.reclaim(i);
      }

      let token1Balance = toBN((await token.balanceOf(GOVPOOL)).toFixed()).plus(
        (await token.balanceOf(OWNER)).toFixed(),
      );
      let token2Balance = toBN((await token2.balanceOf(GOVPOOL)).toFixed()).plus(
        (await token2.balanceOf(OWNER)).toFixed(),
      );

      assert.equal(token1Balance.toFixed(), wei("1000000000"));
      assert.equal(token2Balance.plus(4).toFixed(), wei("1000000000"));
    });

    it("Correct staked amount if activeTiers < claimable", async () => {
      let token2 = await ERC20Mock.new("Mock", "Mock", 18);
      await token2.mint(GOVPOOL, wei("1000000000"));
      await token2.approve(stakingProposal.address, wei("1000000000"), { from: GOVPOOL });

      for (let i = 2; i < 10; i++) {
        await setTime(startTime + duration * (i - 1));
        await stakingProposal.createStaking(
          token2.address,
          wei("1"),
          startTime + duration * (i - 1),
          startTime + duration * i - 1,
          "ipfs://default",
          {
            from: GOVPOOL,
          },
        );
        await stakingProposal.stake(OWNER, 1, i, { from: USERKEEPER });
        assert.equal((await stakingProposal.getTotalStakes(OWNER)).toFixed(), 1);
      }
    });

    it("getOwedValue", async () => {
      assert.equal(await stakingProposal.getOwedValue(0, OWNER), "0");
      await setTime(startTime + 499);
      assert.equal(await stakingProposal.getOwedValue(1, OWNER), "0");

      await stakingProposal.stake(OWNER, 1, 1, { from: USERKEEPER });
      assert.equal(await stakingProposal.getOwedValue(1, OWNER), "0");

      await setTime(startTime + 600);
      assert.equal((await stakingProposal.getOwedValue(1, OWNER)).toFixed(), wei("100000000"));

      await setTime(startTime + 900);
      assert.equal((await stakingProposal.getOwedValue(1, OWNER)).toFixed(), wei("400000000"));

      await setTime(startTime + 1000);
      assert.equal((await stakingProposal.getOwedValue(1, OWNER)).toFixed(), wei("500000000"));

      await setTime(startTime + 1100);
      assert.equal((await stakingProposal.getOwedValue(1, OWNER)).toFixed(), wei("500000000"));

      startTime = (await getCurrentBlockTime()) + 100;
      endTime = startTime + duration;

      let token2 = await ERC20Mock.new("Mock", "Mock", 18);
      await token2.mint(GOVPOOL, wei("1000000000"));
      await token2.approve(stakingProposal.address, wei("1000000000"), { from: GOVPOOL });

      await stakingProposal.createStaking(token2.address, 1, startTime, endTime, "ipfs://default", { from: GOVPOOL });
      assert.equal(await stakingProposal.getOwedValue(2, OWNER), "0");
    });

    it("getUserInfo", async () => {
      assert.equal((await stakingProposal.getUserInfo(OWNER)).length.toFixed(), 0);
      await stakingProposal.stake(OWNER, wei("1"), 1, { from: USERKEEPER });

      let info = await stakingProposal.getUserInfo(OWNER);
      assert.equal(info.length.toFixed(), 1);

      const expectedInfo = {
        tierId: "1",
        isActive: true,
        rewardToken: token.address,
        startedAt: startTime.toString(),
        deadline: (startTime + 1000).toString(),
        currentStake: wei("1"),
        currentRewards: "0",
        tierCurrentStakes: wei("1"),
      };

      assert.deepEqual(expectedInfo, extractNamedFields(info[0]));

      await setTime(startTime + 1001);
      info = await stakingProposal.getUserInfo(OWNER);
      assert.equal(info.length.toFixed(), 1);

      expectedInfo.isActive = false;
      expectedInfo.currentRewards = toBN(wei("1000000000")).times(999).idiv(1000).toFixed();
      assert.deepEqual(expectedInfo, extractNamedFields(info[0]));
    });

    it("getActiveStakings", async () => {
      let info = await stakingProposal.getActiveStakings();
      assert.equal(info.length.toFixed(), 1);
      assert.equal(info[0].id, 1);

      await setTime(startTime + 1001);
      info = await stakingProposal.getActiveStakings();
      assert.equal(info.length.toFixed(), 0);
    });
  });
});
