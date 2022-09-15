const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { ZERO, PRECISION } = require("./utils/constants");
const truffleAssert = require("truffle-assertions");

const GovSettings = artifacts.require("GovSettings");

GovSettings.numberFormat = "BigNumber";

const INTERNAL_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: true,
  validatorsVote: true,
  duration: 500,
  durationValidators: 600,
  quorum: PRECISION.times("51").toFixed(),
  quorumValidators: PRECISION.times("61").toFixed(),
  minVotesForVoting: wei("10"),
  minVotesForCreating: wei("2"),
  rewardToken: ZERO,
  creationReward: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
  executorDescription: "internal",
};

const DP_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: false,
  validatorsVote: true,
  duration: 600,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minVotesForVoting: wei("20"),
  minVotesForCreating: wei("3"),
  rewardToken: ZERO,
  creationReward: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
  executorDescription: "DP",
};

const VALIDATORS_BALANCES_SETTINGS = {
  earlyCompletion: true,
  delegatedVotingAllowed: false,
  validatorsVote: true,
  duration: 600,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minVotesForVoting: wei("20"),
  minVotesForCreating: wei("3"),
  rewardToken: ZERO,
  creationReward: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
  executorDescription: "validators",
};

const DEFAULT_SETTINGS = {
  earlyCompletion: false,
  delegatedVotingAllowed: true,
  validatorsVote: true,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minVotesForVoting: wei("20"),
  minVotesForCreating: wei("3"),
  rewardToken: ZERO,
  creationReward: 0,
  executionReward: 0,
  voteRewardsCoefficient: 0,
  executorDescription: "default",
};

function toPercent(num) {
  return PRECISION.times(num).toFixed();
}

describe("GovSettings", () => {
  let OWNER;
  let SECOND;
  let EXECUTOR1;
  let EXECUTOR2;

  let GOV_POOL_ADDRESS;
  let DP_ADDRESS;
  let VALIDATORS_ADDRESS;
  let USER_KEEPER_ADDRESS;

  let settings;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    EXECUTOR1 = await accounts(2);
    EXECUTOR2 = await accounts(3);

    GOV_POOL_ADDRESS = await accounts(4);
    DP_ADDRESS = await accounts(5);
    VALIDATORS_ADDRESS = await accounts(6);
    USER_KEEPER_ADDRESS = await accounts(7);
  });

  beforeEach("setup", async () => {
    settings = await GovSettings.new();
  });

  describe("incorrect settings", () => {
    it("should revert when delegatedVotingAllowed is on for DP", async () => {
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

    it("should revert when earlyComletion is on for DP", async () => {
      await truffleAssert.reverts(
        settings.__GovSettings_init(
          GOV_POOL_ADDRESS,
          DP_ADDRESS,
          VALIDATORS_ADDRESS,
          USER_KEEPER_ADDRESS,
          INTERNAL_SETTINGS,
          VALIDATORS_BALANCES_SETTINGS,
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
        assert.equal(internalSettings.minVotesForVoting.toFixed(), wei("10"));
        assert.equal(internalSettings.minVotesForCreating.toFixed(), wei("2"));
        assert.equal(internalSettings.executorDescription, "internal");

        const defaultProposalSettings = await settings.settings(2);

        assert.isFalse(defaultProposalSettings.earlyCompletion);
        assert.isFalse(defaultProposalSettings.delegatedVotingAllowed);
        assert.equal(defaultProposalSettings.duration, 600);
        assert.equal(defaultProposalSettings.durationValidators, 800);
        assert.equal(defaultProposalSettings.quorum.toFixed(), PRECISION.times("71").toFixed());
        assert.equal(defaultProposalSettings.quorumValidators.toFixed(), PRECISION.times("100").toFixed());
        assert.equal(defaultProposalSettings.minVotesForVoting.toFixed(), wei("20"));
        assert.equal(defaultProposalSettings.minVotesForCreating.toFixed(), wei("3"));
        assert.equal(defaultProposalSettings.executorDescription, "DP");

        const defaultSettings = await settings.settings(4);

        assert.isFalse(defaultSettings.earlyCompletion);
        assert.isTrue(internalSettings.delegatedVotingAllowed);
        assert.equal(defaultSettings.duration, 700);
        assert.equal(defaultSettings.durationValidators, 800);
        assert.equal(defaultSettings.quorum.toFixed(), PRECISION.times("71").toFixed());
        assert.equal(defaultSettings.quorumValidators.toFixed(), PRECISION.times("100").toFixed());
        assert.equal(defaultSettings.minVotesForVoting.toFixed(), wei("20"));
        assert.equal(defaultSettings.minVotesForCreating.toFixed(), wei("3"));
        assert.equal(defaultSettings.executorDescription, "default");

        assert.equal(await settings.executorToSettings(settings.address), 1);
      });
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          settings.__GovSettings_init(
            GOV_POOL_ADDRESS,
            DP_ADDRESS,
            VALIDATORS_ADDRESS,
            USER_KEEPER_ADDRESS,
            INTERNAL_SETTINGS,
            DP_SETTINGS,
            VALIDATORS_BALANCES_SETTINGS,
            DEFAULT_SETTINGS
          ),
          "Initializable: contract is already initialized"
        );
      });

      it("only owner should call these functions", async () => {
        await truffleAssert.reverts(
          settings.addSettings([INTERNAL_SETTINGS], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          settings.editSettings([1], [INTERNAL_SETTINGS], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          settings.changeExecutors([OWNER], [2], { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("addSettings()", () => {
      it("should add two settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: true,
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings_1",
        };

        const newSettings2 = {
          earlyCompletion: true,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 150,
          durationValidators: 120,
          quorum: toPercent("2"),
          quorumValidators: toPercent("3"),
          minVotesForVoting: wei("4"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings_2",
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
        assert.equal(settings1.minVotesForVoting, newSettings1.minVotesForVoting);
        assert.equal(settings1.minVotesForCreating, newSettings1.minVotesForCreating);
        assert.equal(settings1.executorDescription, newSettings1.executorDescription);

        assert.equal(settings2.earlyCompletion, newSettings2.earlyCompletion);
        assert.equal(settings2.delegatedVotingAllowed, newSettings2.delegatedVotingAllowed);
        assert.equal(settings2.duration.toString(), newSettings2.duration);
        assert.equal(settings2.durationValidators, newSettings2.durationValidators);
        assert.equal(settings2.quorum.toString(), toBN(newSettings2.quorum));
        assert.equal(settings2.quorumValidators.toString(), toBN(newSettings2.quorumValidators));
        assert.equal(settings2.minVotesForVoting, newSettings2.minVotesForVoting);
        assert.equal(settings2.minVotesForCreating, newSettings2.minVotesForCreating);
        assert.equal(settings2.executorDescription, newSettings2.executorDescription);
      });
    });

    describe("_validateProposalSettings()", () => {
      it("should revert if invalid vote duration value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 0,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid vote duration value");
      });

      it("should revert if invalid quorum value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("100.0001"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid quorum value");
      });

      it("should revert if invalid quorum value", async () => {
        const newSettings = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 50,
          durationValidators: 0,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
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
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("100.0001"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid validator quorum value");
      });
    });

    describe("editSettings()", () => {
      it("should edit existed settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        await settings.editSettings([1, 2], [newSettings1, newSettings1]);

        const internalSettings = await settings.settings(1);

        assert.isFalse(internalSettings.earlyCompletion);
        assert.isFalse(internalSettings.delegatedVotingAllowed);
        assert.equal(internalSettings.duration, newSettings1.duration);
        assert.equal(internalSettings.durationValidators, newSettings1.durationValidators);
        assert.equal(internalSettings.quorum.toFixed(), newSettings1.quorum);
        assert.equal(internalSettings.quorumValidators.toFixed(), newSettings1.quorumValidators);
        assert.equal(internalSettings.minVotesForVoting.toFixed(), newSettings1.minVotesForVoting);
        assert.equal(internalSettings.minVotesForCreating, newSettings1.minVotesForCreating);
        assert.equal(internalSettings.executorDescription, newSettings1.executorDescription);

        const defaultSettings = await settings.settings(2);

        assert.isFalse(defaultSettings.earlyCompletion);
        assert.isFalse(defaultSettings.delegatedVotingAllowed);
        assert.equal(defaultSettings.duration, newSettings1.duration);
        assert.equal(defaultSettings.durationValidators, newSettings1.durationValidators);
        assert.equal(defaultSettings.quorum.toFixed(), newSettings1.quorum);
        assert.equal(defaultSettings.quorumValidators.toFixed(), newSettings1.quorumValidators);
        assert.equal(defaultSettings.minVotesForVoting.toFixed(), newSettings1.minVotesForVoting);
        assert.equal(defaultSettings.minVotesForCreating, newSettings1.minVotesForCreating);
        assert.equal(defaultSettings.executorDescription, newSettings1.executorDescription);
      });

      it("should skip editing nonexistent settings", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
        };

        await truffleAssert.reverts(
          settings.editSettings([1, 10], [newSettings1, newSettings1]),
          "GovSettings: settings do not exist"
        );
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
        assert.equal(await settings.executorToSettings(EXECUTOR2), 1);
      });
    });

    describe("executorInfo()", () => {
      it("should return info about executor", async () => {
        const newSettings1 = {
          earlyCompletion: false,
          delegatedVotingAllowed: false,
          validatorsVote: true,
          duration: 50,
          durationValidators: 100,
          quorum: toPercent("1"),
          quorumValidators: toPercent("2"),
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
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
          minVotesForVoting: wei("3"),
          minVotesForCreating: wei("4"),
          rewardToken: ZERO,
          creationReward: 0,
          executionReward: 0,
          voteRewardsCoefficient: 0,
          executorDescription: "new_settings",
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

        assert.isTrue(validatorSettings[0]);
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
