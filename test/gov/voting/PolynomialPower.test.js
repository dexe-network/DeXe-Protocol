const { assert } = require("chai");
const { toBN, accounts } = require("../../../scripts/utils/utils");
const { PRECISION, DECIMAL } = require("../../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const Reverter = require("../../helpers/reverter");

const PolynomialTesterMock = artifacts.require("PolynomialTesterMock");
const PolynomialPower = artifacts.require("PolynomialPower");

PolynomialPower.numberFormat = "BigNumber";
PolynomialTesterMock.numberFormat = "BigNumber";

describe("PolynomialPower", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let govPool;
  let power;

  const reverter = new Reverter();

  async function forHolders(votes) {
    const v = toBN(votes);

    let totalSupply = toBN(await govPool.getTotalVoteWeight());
    let [k1, k2, k3] = Object.entries(await power.getVoteCoefficients()).map((x) => toBN(x[1]).div(PRECISION));
    let threshold = totalSupply.times(7).div(100).minus(7);

    if (v.comparedTo(threshold) === -1) {
      return v;
    }

    let t = v.times(100).div(totalSupply).minus(7);
    let t2 = t.times(t);
    let t3 = t2.times(t);

    t = t.times("1.041");
    t2 = t2.times("-0.007211");
    t3 = t3.times("0.00001994");

    t = t.plus(t2).plus(t3);
    t = t.times(k3);
    t = t.times(totalSupply).div(100);
    t = t.plus(threshold);

    return t;
  }

  async function forExpert(votes, isDao) {
    const v = toBN(votes);

    let totalSupply = toBN(await govPool.getTotalVoteWeight());
    let [k1, k2, k3] = Object.entries(await power.getVoteCoefficients()).map((x) => toBN(x[1]).div(PRECISION));
    let k;

    if (isDao) {
      k = k1;
    } else {
      k = k2;
    }

    let threshold = totalSupply.times("0.0663");

    if (v.comparedTo(threshold) === -1) {
      let t = v.times(100).div(totalSupply);
      let t2 = t.times(t);
      let t3 = t2.times(t);
      let t4 = t3.times(t);

      t = t.times("1.801894");

      t2 = t2.times("-0.169889");
      t3 = t3.times("0.023761");
      t4 = t4.times("-0.001328");

      t = t.plus(t2).plus(t3).plus(t4);
      t = t.times(k);
      t = t.times(totalSupply).div(100);

      return t;
    } else {
      let t = v.times(100).div(totalSupply).minus("6.63");
      let t2 = t.times(t);
      let t3 = t2.times(t);
      let t4 = t3.times(t);

      t = t.times("1.13");
      t2 = t2.times("-0.006086");
      t3 = t3.times("0.00004147");
      t4 = t4.times("-0.000000148");

      t = t.plus(t2).plus(t3).plus(t4).plus("8.8375589503609");
      t = t.times(k);
      t = t.times(totalSupply).div(100);

      return t;
    }
  }

  async function compareHolders(votes) {
    let v = DECIMAL.times(votes);
    let result = toBN(await power.transformVotes(SECOND, v));

    const estimated = await forHolders(v);

    assert.equal(result.idiv(DECIMAL).toFixed(), estimated.idiv(DECIMAL).toFixed());
  }

  async function compareExpertsNotDao(votes) {
    let v = DECIMAL.times(votes);
    let result = toBN(await power.transformVotes(SECOND, v));

    const estimated = await forExpert(v, false);

    assert.equal(result.idiv(DECIMAL).toFixed(), estimated.idiv(DECIMAL).toFixed());
  }

  async function compareExpertsDao(votes) {
    let v = DECIMAL.times(votes);
    let result = toBN(await power.transformVotes(SECOND, v));

    const estimated = await forExpert(v, true);

    assert.equal(result.idiv(DECIMAL).toFixed(), estimated.idiv(DECIMAL).toFixed());
  }

  async function compareExpertsDao50Percent(votes) {
    let v = DECIMAL.times(votes);
    let result = toBN(await power.transformVotes(SECOND, v));

    const dao = await forExpert(v, true);
    const notDao = await forExpert(v, false);
    const estimated = dao.plus(notDao).div(2);

    assert.equal(result.idiv(DECIMAL).toFixed(), estimated.idiv(DECIMAL).toFixed());
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    govPool = await PolynomialTesterMock.new();
    power = await PolynomialPower.new();

    await power.__PolynomialPower_init(PRECISION.times("1.08"), PRECISION.times("0.92"), PRECISION.times("0.97"));

    await power.transferOwnership(govPool.address);

    await govPool.setTotalVotes(DECIMAL.times("90748777"));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("check math", () => {
    it("holders", async () => {
      await compareHolders("907488");
      await compareHolders("6352414");
      await compareHolders("23594682");
      await compareHolders("52634291");
      await compareHolders("90748777");
    });

    it("notDao", async () => {
      await govPool.setExpertStatus(SECOND, true);

      await compareExpertsNotDao("907488", false);
      await compareExpertsNotDao("3629951", false);
      await compareExpertsNotDao("23594682", false);
      await compareExpertsNotDao("52634291", false);
      await compareExpertsNotDao("90748777", false);
    });

    it("100% dao", async () => {
      await govPool.setExpertStatus(SECOND, true);
      await govPool.setVotes(SECOND, 0, 0, 1000);

      await compareExpertsDao("907488");
      await compareExpertsDao("3629951");
      await compareExpertsDao("23594682");
      await compareExpertsDao("52634291");
      await compareExpertsDao("90748777");
    });

    it("50% dao", async () => {
      await govPool.setExpertStatus(SECOND, true);
      await govPool.setVotes(SECOND, 0, 500, 500);

      await compareExpertsDao50Percent("907488");
      await compareExpertsDao50Percent("3629951");
      await compareExpertsDao50Percent("23594682");
      await compareExpertsDao50Percent("52634291");
      await compareExpertsDao50Percent("90748777");
    });
  });

  describe("initializer", () => {
    it("can't initialize twice", async () => {
      await truffleAssert.reverts(
        power.__PolynomialPower_init(PRECISION.times("1.08"), PRECISION.times("0.92"), PRECISION.times("0.97")),
        "Initializable: contract is already initialized"
      );
    });
  });
});
