const { assert } = require("chai");
const { wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR } = require("../../scripts/utils/constants");

const LinearPower = artifacts.require("LinearPower");

LinearPower.numberFormat = "BigNumber";

describe("LinearPower", () => {
  let linearPower;

  const reverter = new Reverter();

  before("setup", async () => {
    linearPower = await LinearPower.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initializer", () => {
    it("should not initialize twice", async () => {
      await linearPower.__LinearPower_init();

      await truffleAssert.reverts(linearPower.__LinearPower_init(), "Initializable: contract is already initialized");
    });
  });

  describe("functionality", () => {
    beforeEach(async () => {
      await linearPower.__LinearPower_init();
    });

    describe("transformVotes()", async () => {
      it("should return the same value as input", async () => {
        assert.equal(await linearPower.transformVotes(ZERO_ADDR, wei(1)), wei(1));

        assert.equal(await linearPower.transformVotes(ZERO_ADDR, "0"), "0");
      });
    });
  });
});
