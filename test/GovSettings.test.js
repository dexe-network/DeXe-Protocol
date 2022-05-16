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

describe("GovSettings", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let settings;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
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
});
