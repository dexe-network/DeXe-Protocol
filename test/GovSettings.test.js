const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const GovSettings = artifacts.require("GovSettings");

GovSettings.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);
const ZERO = "0x0000000000000000000000000000000000000000";

const INTERNAL_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: true,
  validatorsVote: true,
  duration: 500,
  durationValidators: 600,
  quorum: PRECISION.times("51").toFixed(),
  quorumValidators: PRECISION.times("61").toFixed(),
  minTokenBalance: wei("10"),
  minNftBalance: 2,
  rewardToken: ZERO,
  creationRewards: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
};

const DP_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  validatorsVote: true,
  duration: 600,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creationRewards: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
};

const VALIDATORS_BALANCES_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  validatorsVote: true,
  duration: 600,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creationRewards: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
};

const DEFAULT_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: true,
  validatorsVote: true,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
  rewardToken: ZERO,
  creationRewards: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
};

function toPercent(num) {
  return PRECISION.times(num).toFixed();
}

describe("GovSettings", () => {
  let OWNER;
  let EXECUTOR1;
  let EXECUTOR2;

  let GOV_POOL_ADDRESS;
  let DP_ADDRESS;
  let VALIDATORS_ADDRESS;
  let USER_KEEPER_ADDRESS;

  let settings;

  before("setup", async () => {
    OWNER = await accounts(0);
    EXECUTOR1 = await accounts(1);
    EXECUTOR2 = await accounts(2);

    GOV_POOL_ADDRESS = await accounts(3);
    DP_ADDRESS = await accounts(4);
    VALIDATORS_ADDRESS = await accounts(5);
    USER_KEEPER_ADDRESS = await accounts(6);
  });

  beforeEach("setup", async () => {
    settings = await GovSettings.new();
  });

  describe("incorrect settings", () => {
    it("should revert when delegatedVotingAllowed for DP", async () => {
      await truffleAssert.reverts(
        settings.__GovSettings_init(
          GOV_POOL_ADDRESS,
          DP_ADDRESS,
          VALIDATORS_ADDRESS,
          USER_KEEPER_ADDRESS,
          INTERNAL_SETTINGS,
          DEFAULT_SETTINGS,
          VALIDATORS_BALANCES_SETTINGS,
          DEFAULT_SETTINGS
        ),
        "GovSettings: invalid distribution settings"
      );
    });
  });

  describe("correct settings", () => {
    beforeEach("setup", async () => {
      await settings.__GovSettings_init(
        GOV_POOL_ADDRESS,
        DP_ADDRESS,
        VALIDATORS_ADDRESS,
        USER_KEEPER_ADDRESS,
        INTERNAL_SETTINGS,
        DP_SETTINGS,
        VALIDATORS_BALANCES_SETTINGS,
        DEFAULT_SETTINGS
      );
    });

    describe("init", () => {
      it("should set initial parameters correctly", async () => {
        const internalSettings = await settings.settings(1);

        assert.isTrue(internalSettings.earlyCompletion);
        assert.isTrue(internalSettings.delegatedVotingAllowed);
        assert.equal(internalSettings.duration, 500);
        assert.equal(internalSettings.durationValidators, 600);
        assert.equal(internalSettings.quorum.toFixed(), PRECISION.times("51").toFixed());
        assert.equal(internalSettings.quorumValidators.toFixed(), PRECISION.times("61").toFixed());
        assert.equal(internalSettings.minTokenBalance.toFixed(), wei("10"));
        assert.equal(internalSettings.minNftBalance, 2);

        const defaultProposalSetting = await settings.settings(2);

        assert.isFalse(defaultProposalSetting.earlyCompletion);
        assert.isFalse(defaultProposalSetting.delegatedVotingAllowed);
        assert.equal(defaultProposalSetting.duration, 600);
        assert.equal(defaultProposalSetting.durationValidators, 800);
        assert.equal(defaultProposalSetting.quorum.toFixed(), PRECISION.times("71").toFixed());
        assert.equal(defaultProposalSetting.quorumValidators.toFixed(), PRECISION.times("100").toFixed());
        assert.equal(defaultProposalSetting.minTokenBalance.toFixed(), wei("20"));
        assert.equal(defaultProposalSetting.minNftBalance, 3);

        const defaultSettings = await settings.settings(4);

        assert.isFalse(defaultSettings.earlyCompletion);
        assert.isTrue(internalSettings.delegatedVotingAllowed);
        assert.equal(defaultSettings.duration, 700);
        assert.equal(defaultSettings.durationValidators, 800);
        assert.equal(defaultSettings.quorum.toFixed(), PRECISION.times("71").toFixed());
        assert.equal(defaultSettings.quorumValidators.toFixed(), PRECISION.times("100").toFixed());
        assert.equal(defaultSettings.minTokenBalance.toFixed(), wei("20"));
        assert.equal(defaultSettings.minNftBalance, 3);

        assert.equal(await settings.executorToSettings(settings.address), 1);
      });
    });

    describe("addSettings()", () => {
      it("should add two settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        const newSettings2 = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          duration: 150,
          durationValidators: 120,
          quorum: toPercent("2"),
          quorumValidators: toPercent("3"),
          minTokenBalance: wei("4"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await settings.addSettings([newSettings1, newSettings2]);

        const settings1 = await settings.settings(5);
        const settings2 = await settings.settings(6);

        assert.equal(settings1.earlyCompletion, newSettings1.earlyCompletion);
        assert.equal(settings1.delegatedVotingAllowed, newSettings1.delegatedVotingAllowed);
        assert.equal(settings1.duration.toString(), newSettings1.duration);
        assert.equal(settings1.durationValidators, newSettings1.durationValidators);
        assert.equal(settings1.quorum.toString(), toBN(newSettings1.quorum));
        assert.equal(settings1.quorumValidators.toString(), toBN(newSettings1.quorumValidators));
        assert.equal(settings1.minTokenBalance, newSettings1.minTokenBalance);
        assert.equal(settings1.minNftBalance, newSettings1.minNftBalance);

        assert.equal(settings2.earlyCompletion, newSettings2.earlyCompletion);
        assert.equal(settings2.delegatedVotingAllowed, newSettings2.delegatedVotingAllowed);
        assert.equal(settings2.duration.toString(), newSettings2.duration);
        assert.equal(settings2.durationValidators, newSettings2.durationValidators);
        assert.equal(settings2.quorum.toString(), toBN(newSettings2.quorum));
        assert.equal(settings2.quorumValidators.toString(), toBN(newSettings2.quorumValidators));
        assert.equal(settings2.minTokenBalance, newSettings2.minTokenBalance);
        assert.equal(settings2.minNftBalance, newSettings2.minNftBalance);
      });
    });

    describe("_validateProposalSettings()", () => {
      it("should revert if invalid vote duration value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 0,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid vote duration value");
      });

      it("should revert if invalid quorum value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("100.0001"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid quorum value");
      });

      it("should revert if invalid quorum value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 0,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await truffleAssert.reverts(
          settings.addSettings([newSettings]),
          "GovSettings: invalid validator vote duration value"
        );
      });

      it("should revert if invalid quorum value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("100.0001"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid validator quorum value");
      });
    });

    describe("editSettings()", () => {
      it("should edit existed settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await settings.editSettings([1, 2], [newSettings1, newSettings1]);

        const internalSettings = await settings.settings(1);

        assert.isFalse(internalSettings.earlyCompletion);
        assert.isFalse(internalSettings.delegatedVotingAllowed);
        assert.equal(internalSettings.duration, newSettings1.duration);
        assert.equal(internalSettings.durationValidators, newSettings1.durationValidators);
        assert.equal(internalSettings.quorum.toFixed(), newSettings1.quorum);
        assert.equal(internalSettings.quorumValidators.toFixed(), newSettings1.quorumValidators);
        assert.equal(internalSettings.minTokenBalance.toFixed(), newSettings1.minTokenBalance);
        assert.equal(internalSettings.minNftBalance, newSettings1.minNftBalance);

        const defaultSettings = await settings.settings(2);

        assert.isFalse(defaultSettings.earlyCompletion);
        assert.isFalse(defaultSettings.delegatedVotingAllowed);
        assert.equal(defaultSettings.duration, newSettings1.duration);
        assert.equal(defaultSettings.durationValidators, newSettings1.durationValidators);
        assert.equal(defaultSettings.quorum.toFixed(), newSettings1.quorum);
        assert.equal(defaultSettings.quorumValidators.toFixed(), newSettings1.quorumValidators);
        assert.equal(defaultSettings.minTokenBalance.toFixed(), newSettings1.minTokenBalance);
        assert.equal(defaultSettings.minNftBalance, newSettings1.minNftBalance);
      });

      it("should skip editing nonexistent settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await settings.editSettings([1, 4], [newSettings1, newSettings1]);

        const internalSettings = await settings.settings(1);

        assert.isFalse(internalSettings.earlyCompletion);
        assert.isFalse(internalSettings.delegatedVotingAllowed);
        assert.equal(internalSettings.duration, newSettings1.duration);
        assert.equal(internalSettings.durationValidators, newSettings1.durationValidators);
        assert.equal(internalSettings.quorum.toFixed(), newSettings1.quorum);
        assert.equal(internalSettings.quorumValidators.toFixed(), newSettings1.quorumValidators);
        assert.equal(internalSettings.minTokenBalance.toFixed(), newSettings1.minTokenBalance);
        assert.equal(internalSettings.minNftBalance, newSettings1.minNftBalance);

        const newSettings = await settings.settings(5);

        assert.isFalse(newSettings.earlyCompletion);
        assert.isFalse(newSettings.delegatedVotingAllowed);
        assert.equal(newSettings.duration, 0);
        assert.equal(newSettings.durationValidators, 0);
        assert.equal(newSettings.quorum.toFixed(), 0);
        assert.equal(newSettings.quorumValidators.toFixed(), 0);
        assert.equal(newSettings.minTokenBalance.toFixed(), 0);
        assert.equal(newSettings.minNftBalance, 0);
      });
    });

    describe("changeExecutors()", () => {
      it("should add two executors", async () => {
        await settings.changeExecutors([EXECUTOR1, EXECUTOR2], [2, 2]);

        assert.equal(await settings.executorToSettings(EXECUTOR1), 2);
        assert.equal(await settings.executorToSettings(EXECUTOR2), 2);
      });

      it("should skip adding executor to internal settings", async () => {
        await settings.changeExecutors([EXECUTOR1, EXECUTOR2], [2, 1]);

        assert.equal(await settings.executorToSettings(EXECUTOR1), 2);
        assert.equal(await settings.executorToSettings(EXECUTOR2), 0);
      });

      it("should skip adding 'Gov' executor association", async () => {
        await settings.changeExecutors([EXECUTOR1, OWNER], [2, 4]);

        assert.equal(await settings.executorToSettings(EXECUTOR1), 2);
        assert.equal((await settings.executorToSettings(EXECUTOR2)).toString(), 0);
      });
    });

    describe("executorInfo()", () => {
      it("should return info about executor", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await settings.addSettings([newSettings1]);
        await settings.changeExecutors([EXECUTOR1], [3]);

        const executorInfo = await settings.executorInfo(EXECUTOR1);

        assert.equal(executorInfo[0].toString(), 3);
        assert.equal(executorInfo[1].toFixed(), "3");
      });

      it("should return info about internal executor", async () => {
        const executorInfo = await settings.executorInfo(settings.address);

        assert.equal(executorInfo[0].toString(), 1);
        assert.equal(executorInfo[1].toFixed(), "1");
      });

      it("should return info about nonexistent executor", async () => {
        const executorInfo = await settings.executorInfo(EXECUTOR1);

        assert.equal(executorInfo[0].toString(), 0);
        assert.equal(executorInfo[1].toFixed(), "0");
      });
    });

    describe("getSettings()", () => {
      it("should return setting for executor", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: false,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minTokenBalance: wei("3"),
          minNftBalance: 4,
          rewardToken: ZERO,
          creationRewards: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
        };

        await settings.addSettings([newSettings1]);
        await settings.changeExecutors([EXECUTOR1], [5]);

        const executorSettings = await settings.getSettings(EXECUTOR1);

        assert.isFalse(executorSettings[0]);
        assert.isFalse(executorSettings[1]);
        assert.equal(executorSettings[3].toString(), 50);
        assert.equal(executorSettings[4].toString(), 100);
      });

      it("should return setting for internal executor", async () => {
        const internalSettings = await settings.getSettings(settings.address);

        assert.isTrue(internalSettings[0]);
        assert.isTrue(internalSettings[1]);
        assert.equal(internalSettings[3], 500);
        assert.equal(internalSettings[4], 600);
      });

      it("should return settings for validators executor", async () => {
        const validatorSettings = await settings.getSettings(VALIDATORS_ADDRESS);

        assert.isFalse(validatorSettings[0]);
        assert.isFalse(validatorSettings[1]);
        assert.equal(validatorSettings[3], 600);
        assert.equal(validatorSettings[4], 800);
      });

      it("should return setting for nonexistent executor", async () => {
        const nonexistent = await settings.getSettings(EXECUTOR1);

        assert.isFalse(nonexistent[0]);
        assert.isTrue(nonexistent[1]);
        assert.equal(nonexistent[3], 700);
        assert.equal(nonexistent[4], 800);
      });
    });
  });
});
