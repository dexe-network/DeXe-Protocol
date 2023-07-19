const { assert } = require("chai");
const { toBN, accounts, wei, fromWei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const LogExpMathMock = artifacts.require("LogExpMathMock");

LogExpMathMock.numberFormat = "BigNumber";

const maxUint = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("LogExpMath", () => {
  let math;

  const reverter = new Reverter();

  async function testPow(a, b) {
    let contractPow = await math.pow(wei(a), wei(b));
    contractPow = fromWei(contractPow);
    contractPow = parseFloat(contractPow);
    let backendPow = Math.pow(a, b);
    assert.closeTo(contractPow, backendPow, 0.00000000001);
  }

  before("setup", async () => {
    math = await LogExpMathMock.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("functionality", () => {
    it("should calculate pow correctly", async () => {
      await testPow(2, 0.5);

      for (let i = 1000; i <= 10000; i += 1000) {
        await testPow(i, 0.5);
      }

      for (let i = 0.1; i < 1; i += 0.1) {
        await testPow(10000, i);
      }
    });

    it("zero exponent should revert", async () => {
      await truffleAssert.reverts(math.pow(1, 0), "LogExpMath: Zero exponent");
    });

    it("reverts on x, y or result too big", async () => {
      await truffleAssert.reverts(math.pow(maxUint, 1), "LogExpMath: X out of bounds");
      await truffleAssert.reverts(math.pow(wei(2), maxUint), "LogExpMath: Y out of bounds");
      await truffleAssert.reverts(math.pow(wei(2), wei(188)), "LogExpMath: Product out of bounds");
    });
  });
});
