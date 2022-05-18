const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const GovSettings = artifacts.require("GovSettings");

GovSettings.numberFormat = "BigNumber";

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

function toPercent(num) {
  return PRECISION.times(num).toFixed();
}

describe("GovSettings", () => {
  let OWNER;
  let EXECUTOR1;
  let EXECUTOR2;

  let settings;

  before("setup", async () => {
    OWNER = await accounts(0);
    EXECUTOR1 = await accounts(1);
    EXECUTOR2 = await accounts(2);
  });

  beforeEach("setup", async () => {
    settings = await GovSettings.new();

    await settings.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
  });

  describe("init", () => {
    it("should set initial parameters correctly", async () => {
      const internalSettings = await settings.settings(1);

      assert.isTrue(internalSettings.earlyCompletion);
      assert.equal(internalSettings.duration, 500);
      assert.equal(internalSettings.durationValidators, 600);
      assert.equal(internalSettings.quorum.toFixed(), PRECISION.times("51").toFixed());
      assert.equal(internalSettings.quorumValidators.toFixed(), PRECISION.times("61").toFixed());
      assert.equal(internalSettings.minTokenBalance.toFixed(), wei("10"));
      assert.equal(internalSettings.minNftBalance, 2);

      const defaultSettings = await settings.settings(2);

      assert.isFalse(defaultSettings.earlyCompletion);
      assert.equal(defaultSettings.duration, 700);
      assert.equal(defaultSettings.durationValidators, 800);
      assert.equal(defaultSettings.quorum.toFixed(), PRECISION.times("71").toFixed());
      assert.equal(defaultSettings.quorumValidators.toFixed(), PRECISION.times("100").toFixed());
      assert.equal(defaultSettings.minTokenBalance.toFixed(), wei("20"));
      assert.equal(defaultSettings.minNftBalance, 3);

      assert.equal(await settings.executorToSettings(settings.address), 1);
    });
  });

  describe("addTypes()", async () => {
    it("should add two type", async () => {
      const newType1 = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      const newType2 = {
        earlyCompletion: true,
        duration: 150,
        durationValidators: 120,
        quorum: toPercent("2"),
        quorumValidators: toPercent("3"),
        minTokenBalance: wei("4"),
        minNftBalance: 4,
      };

      await settings.addSettings([newType1, newType2]);

      const type1 = await settings.settings(3);
      const type2 = await settings.settings(4);

      assert.equal(type1.earlyCompletion, newType1.earlyCompletion);
      assert.equal(type1.duration.toString(), newType1.duration);
      assert.equal(type1.durationValidators, newType1.durationValidators);
      assert.equal(type1.quorum.toString(), toBN(newType1.quorum));
      assert.equal(type1.quorumValidators.toString(), toBN(newType1.quorumValidators));
      assert.equal(type1.minTokenBalance, newType1.minTokenBalance);
      assert.equal(type1.minNftBalance, newType1.minNftBalance);

      assert.equal(type2.earlyCompletion, newType2.earlyCompletion);
      assert.equal(type2.duration.toString(), newType2.duration);
      assert.equal(type2.durationValidators, newType2.durationValidators);
      assert.equal(type2.quorum.toString(), toBN(newType2.quorum));
      assert.equal(type2.quorumValidators.toString(), toBN(newType2.quorumValidators));
      assert.equal(type2.minTokenBalance, newType2.minTokenBalance);
      assert.equal(type2.minNftBalance, newType2.minNftBalance);
    });
  });

  describe("_validateProposalSettings", async () => {
    it("should revert if invalid vote duration value", async () => {
      const newSettings = {
        earlyCompletion: false,
        duration: 0,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid vote duration value");
    });

    it("should revert if invalid quorum value", async () => {
      const newSettings = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("100.0001"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid quorum value");
    });

    it("should revert if invalid quorum value", async () => {
      const newSettings = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 0,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await truffleAssert.reverts(
        settings.addSettings([newSettings]),
        "GovSettings: invalid validator vote duration value"
      );
    });

    it("should revert if invalid quorum value", async () => {
      const newSettings = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("100.0001"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await truffleAssert.reverts(settings.addSettings([newSettings]), "GovSettings: invalid validator quorum value");
    });
  });

  describe("editTypes()", async () => {
    it("should edit existed settings", async () => {
      const newType1 = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await settings.editSettings([1, 2], [newType1, newType1]);

      const internalSettings = await settings.settings(1);

      assert.isFalse(internalSettings.earlyCompletion);
      assert.equal(internalSettings.duration, newType1.duration);
      assert.equal(internalSettings.durationValidators, newType1.durationValidators);
      assert.equal(internalSettings.quorum.toFixed(), newType1.quorum);
      assert.equal(internalSettings.quorumValidators.toFixed(), newType1.quorumValidators);
      assert.equal(internalSettings.minTokenBalance.toFixed(), newType1.minTokenBalance);
      assert.equal(internalSettings.minNftBalance, newType1.minNftBalance);

      const defaultSettings = await settings.settings(2);

      assert.isFalse(defaultSettings.earlyCompletion);
      assert.equal(defaultSettings.duration, newType1.duration);
      assert.equal(defaultSettings.durationValidators, newType1.durationValidators);
      assert.equal(defaultSettings.quorum.toFixed(), newType1.quorum);
      assert.equal(defaultSettings.quorumValidators.toFixed(), newType1.quorumValidators);
      assert.equal(defaultSettings.minTokenBalance.toFixed(), newType1.minTokenBalance);
      assert.equal(defaultSettings.minNftBalance, newType1.minNftBalance);
    });

    it("should skip editing nonexistent settings", async () => {
      const newType1 = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await settings.editSettings([1, 4], [newType1, newType1]);

      const internalSettings = await settings.settings(1);
      assert.isFalse(internalSettings.earlyCompletion);
      assert.equal(internalSettings.duration, newType1.duration);
      assert.equal(internalSettings.durationValidators, newType1.durationValidators);
      assert.equal(internalSettings.quorum.toFixed(), newType1.quorum);
      assert.equal(internalSettings.quorumValidators.toFixed(), newType1.quorumValidators);
      assert.equal(internalSettings.minTokenBalance.toFixed(), newType1.minTokenBalance);
      assert.equal(internalSettings.minNftBalance, newType1.minNftBalance);

      const newSettings = await settings.settings(4);
      assert.isFalse(newSettings.earlyCompletion);
      assert.equal(newSettings.duration, 0);
      assert.equal(newSettings.durationValidators, 0);
      assert.equal(newSettings.quorum.toFixed(), 0);
      assert.equal(newSettings.quorumValidators.toFixed(), 0);
      assert.equal(newSettings.minTokenBalance.toFixed(), 0);
      assert.equal(newSettings.minNftBalance, 0);
    });
  });

  describe("changeExecutors()", async () => {
    it("should add two executors", async () => {
      await settings.changeExecutors([EXECUTOR1, EXECUTOR2], [2, 2]);

      assert.equal(await settings.executorToSettings(EXECUTOR1), 2);
      assert.equal(await settings.executorToSettings(EXECUTOR2), 2);
    });

    it("should skip adding executor to internal type", async () => {
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

  describe("executorInfo()", async () => {
    it("should return info about typed executor", async () => {
      const newType1 = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await settings.addSettings([newType1]);
      await settings.changeExecutors([EXECUTOR1], [3]);

      const executorInfo = await settings.executorInfo(EXECUTOR1);
      assert.equal(executorInfo[0].toString(), 3);
      assert.isFalse(executorInfo[1]);
      assert.isTrue(executorInfo[2]);
    });

    it("should return info about internal executor", async () => {
      const executorInfo = await settings.executorInfo(settings.address);
      assert.equal(executorInfo[0].toString(), 1);
      assert.isTrue(executorInfo[1]);
      assert.isTrue(executorInfo[2]);
    });

    it("should return info about nonexistent executor", async () => {
      const executorInfo = await settings.executorInfo(EXECUTOR1);
      assert.equal(executorInfo[0].toString(), 0);
      assert.isFalse(executorInfo[1]);
      assert.isFalse(executorInfo[2]);
    });
  });

  describe("getSettings()", async () => {
    it("should return setting for executor", async () => {
      const newType1 = {
        earlyCompletion: false,
        duration: 50,
        durationValidators: 100,
        quorum: toPercent("1"),
        quorumValidators: toPercent("2"),
        minTokenBalance: wei("3"),
        minNftBalance: 4,
      };

      await settings.addSettings([newType1]);
      await settings.changeExecutors([EXECUTOR1], [3]);

      const executorSettings = await settings.getSettings(EXECUTOR1);
      assert.isFalse(executorSettings[0]);
      assert.equal(executorSettings[1].toString(), 50);
      assert.equal(executorSettings[2].toString(), 100);
    });

    it("should return setting for internal executor", async () => {
      const internalSettings = await settings.getSettings(settings.address);
      assert.isTrue(internalSettings[0]);
      assert.equal(internalSettings[1], 500);
      assert.equal(internalSettings[2], 600);
    });

    it("should return setting for nonexistent executor", async () => {
      const nonexistent = await settings.getSettings(EXECUTOR1);
      assert.isFalse(nonexistent[0]);
      assert.equal(nonexistent[1], 700);
      assert.equal(nonexistent[2], 800);
    });
  });
});
