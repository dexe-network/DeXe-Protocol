const { assert } = require("chai");
const { wei, fromWei, toBN } = require("../../scripts/utils/utils");
const { solidityPow, solidityExp, solidityLog, solidityLn } = require("../../scripts/utils/log-exp-math");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const LogExpMathMock = artifacts.require("LogExpMathMock");

LogExpMathMock.numberFormat = "BigNumber";

const maxUint = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("LogExpMath", () => {
  let math;

  const reverter = new Reverter();

  before("setup", async () => {
    math = await LogExpMathMock.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("functionality", () => {
    async function testPow(a, b) {
      let r1 = await math.pow(a, b);
      let r2 = solidityPow(a, b);

      assert.equal(r1.toFixed(), r2.toFixed());
    }

    async function testPowEpsilon(a, b) {
      let contractPow = await math.pow(wei(a), wei(b));

      contractPow = fromWei(contractPow);
      contractPow = parseFloat(contractPow);

      let backendPow = Math.pow(a, b);

      assert.closeTo(contractPow, backendPow, 0.00000000001);
    }

    async function testExp(a) {
      let r1 = await math.exp(a);
      let r2 = solidityExp(a);

      assert.equal(r1.toFixed(), r2.toFixed());
    }

    async function testLog(arg, base) {
      let r1 = await math.log(arg, base);
      let r2 = solidityLog(arg, base);

      assert.equal(r1.toFixed(), r2.toFixed());
    }

    async function testLn(a) {
      let r1 = await math.ln(a);
      let r2 = solidityLn(a);

      assert.equal(r1.toFixed(), r2.toFixed());
    }

    describe("pow", () => {
      it("pow", async () => {
        await testPow(0, 1);
        await testPow(wei("1"), wei("1"));
        await testPow(wei(2), wei(0.5));
        await testPow("261951731874906267618555344999021733924457198851775325773392067866700000", "54354644323235435");

        await testPowEpsilon(2, 0.5);

        for (let i = 1000; i <= 10000; i += 1000) {
          await testPowEpsilon(i, 0.5);
        }

        for (let i = 0.1; i < 1; i += 0.1) {
          await testPowEpsilon(10000, i);
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

    describe("exp", () => {
      it("exp", async () => {
        await testExp("12345");
        await testExp(wei("2"));
        await testExp(toBN(wei("1")).negated());
        await testExp(toBN(wei("27")).negated());
        await testExp(wei("123"));
        await testExp(wei("129"));
      });

      it("should revert", async () => {
        await truffleAssert.reverts(
          math.exp(toBN("261951731874906267618555344999021733924457198851775325773392067866700000").negated()),
          "LogExpMath: Invalid exponent"
        );
        await truffleAssert.reverts(
          math.exp("261951731874906267618555344999021733924457198851775325773392067866700000"),
          "LogExpMath: Invalid exponent"
        );
      });
    });

    describe("log", () => {
      it("log", async () => {
        await testLog("1000000000000012345", "1000000000000012345");
        await testLog(
          "261951731874906267618555344999021733924457198851775325773392067866700000",
          "261951731874906267618555344999021733924457198851775325773392067866700000"
        );
        await testLog("1879528", "1879528");
      });
    });

    describe("ln", () => {
      it("ln", async () => {
        await testLn("1000000000000012345");
        await testLn("261951731874906267618555344999021733924457198851775325773392067866700000");
        await testLn("3887708405994595092220000000000000000000000000000000000000000000000000000000");
        await testLn("1879528");
      });

      it("should revert", async () => {
        await truffleAssert.reverts(math.ln(0), "LogExpMath: Out of bounds");
      });
    });
  });
});
