const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const LogExpMathMock = artifacts.require("LogExpMathMock");

LogExpMathMock.numberFormat = "BigNumber";

describe("LogExpMath", () => {
  let math;

  const reverter = new Reverter();

  before("setup", async () => {
    math = await LogExpMathMock.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("functionality", () => {
    it("should calculate pow correctly", async () => {
      const sqrt2 = await math.pow("2000000000000000000", "500000000000000000");
      assert.equal(sqrt2, "1414213562373095047");
    });
  });
});
