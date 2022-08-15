const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { setTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const CoreProperties = artifacts.require("CoreProperties");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);
const DECIMAL = toBN(10).pow(18);

const DEFAULT_CORE_PROPERTIES = {
  maxPoolInvestors: 1000,
  maxOpenPositions: 25,
  leverageThreshold: 2500,
  leverageSlope: 5,
  commissionInitTimestamp: 0,
  commissionDurations: [SECONDS_IN_MONTH, SECONDS_IN_MONTH * 3, SECONDS_IN_MONTH * 12],
  dexeCommissionPercentage: PRECISION.times(30).toFixed(),
  dexeCommissionDistributionPercentages: [
    PRECISION.times(33).toFixed(),
    PRECISION.times(33).toFixed(),
    PRECISION.times(33).toFixed(),
  ],
  minTraderCommission: PRECISION.times(20).toFixed(),
  maxTraderCommissions: [PRECISION.times(30).toFixed(), PRECISION.times(50).toFixed(), PRECISION.times(70).toFixed()],
  delayForRiskyPool: SECONDS_IN_DAY * 20,
  insuranceFactor: 10,
  maxInsurancePoolShare: 3,
  minInsuranceDeposit: DECIMAL.times(10).toFixed(),
  minInsuranceProposalAmount: DECIMAL.times(100).toFixed(),
  insuranceWithdrawalLock: SECONDS_IN_DAY,
};

describe("Insurance", async () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let NOTHING;
  let POOL;

  let insurance;
  let insuranceFactor;
  let dexe;
  let decimal;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    POOL = await accounts(3);
    NOTHING = await accounts(9);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();
    const _insurance = await Insurance.new();
    const _coreProperties = await CoreProperties.new();
    dexe = await ERC20Mock.new("DEXE", "DEXE", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), dexe.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), SECOND);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());
    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());

    await traderPoolRegistry.__OwnablePoolContractsRegistry_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await insurance.__Insurance_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    decimal = await dexe.decimals();

    await traderPoolRegistry.addProxyPool(await traderPoolRegistry.BASIC_POOL_NAME(), POOL, {
      from: SECOND,
    });
    await traderPoolRegistry.associateUserWithPool(OWNER, await traderPoolRegistry.BASIC_POOL_NAME(), POOL, {
      from: SECOND,
    });

    insuranceFactor = await coreProperties.getInsuranceFactor();

    await dexe.mint(POOL, toBN(1000000).times(toBN(10).pow(decimal)));
    await dexe.mint(SECOND, toBN(1000).times(toBN(10).pow(decimal)));

    await dexe.approve(insurance.address, toBN(1000).times(toBN(10).pow(decimal)), { from: SECOND });
  });

  describe("buyInsurance", async () => {
    const deposit = toBN(wei("10"));

    it("should buy insurance", async () => {
      const received = await insurance.getReceivedInsurance(deposit);
      await insurance.buyInsurance(deposit, { from: SECOND });

      const depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(deposit.toFixed(), depositInfo[0].toFixed());
      assert.equal(insuranceFactor * deposit, depositInfo[1].toFixed());
      assert.equal(insuranceFactor * deposit, received.toFixed());
    });

    it("should buyInsurance twice", async () => {
      await insurance.buyInsurance(deposit, { from: SECOND });

      let depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(deposit.toFixed(), depositInfo[0].toFixed());
      assert.equal(insuranceFactor * deposit, depositInfo[1].toFixed());

      await insurance.buyInsurance(deposit, { from: SECOND });

      depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(deposit.times(2).toFixed(), depositInfo[0].toFixed());
      assert.equal(insuranceFactor * deposit.times(2), depositInfo[1].toFixed());
    });

    it("should revert, when try to stake less then 10", async () => {
      await truffleAssert.reverts(insurance.buyInsurance("9", { from: SECOND }), "Insurance: deposit is less than min");
    });
  });

  describe("withdraw", async () => {
    const deposit = toBN(wei("100"));

    it("should withdraw all deposit", async () => {
      const balance = await dexe.balanceOf(SECOND);

      await insurance.buyInsurance(deposit, { from: SECOND });

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY + 10);

      await insurance.withdraw(deposit, { from: SECOND });

      let depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(0, depositInfo[0].toFixed());
      assert.equal(0, depositInfo[1].toFixed());
      assert.equal(balance.toFixed(), (await dexe.balanceOf(SECOND)).toFixed());
    });

    it("should withdraw twice", async () => {
      const withdraw = toBN(wei("2"));
      const balance = await dexe.balanceOf(SECOND);

      await insurance.buyInsurance(deposit, { from: SECOND });

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY + 10);

      await insurance.withdraw(withdraw, { from: SECOND });

      let depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(deposit.minus(withdraw), depositInfo[0].toFixed());
      assert.equal(deposit.minus(withdraw) * insuranceFactor, depositInfo[1].toFixed());
      assert.equal(balance.minus(deposit).plus(withdraw).toFixed(), (await dexe.balanceOf(SECOND)).toFixed());

      await insurance.withdraw(deposit.minus(withdraw), { from: SECOND });

      depositInfo = await insurance.getInsurance(SECOND);

      assert.equal(0, depositInfo[0].toFixed());
      assert.equal(0, depositInfo[1].toFixed());
      assert.equal(balance.toFixed(), (await dexe.balanceOf(SECOND)).toFixed());
    });

    it("should revert if lock is not over", async () => {
      await insurance.buyInsurance(deposit, { from: SECOND });

      await truffleAssert.reverts(insurance.withdraw(deposit, { from: SECOND }), "Insurance: lock is not over");
    });

    it("should revert when trying to withdraw more than deposit", async () => {
      await insurance.buyInsurance(deposit, { from: SECOND });

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY + 10);

      await truffleAssert.reverts(
        insurance.withdraw(deposit.times(2), { from: SECOND }),
        "Insurance: out of available amount"
      );
    });
  });

  describe("proposeClaim", async () => {
    const deposit = toBN(wei("100"));

    it("should not propose claim", async () => {
      const url = "url";

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.buyInsurance(wei("10"), { from: SECOND });
      await truffleAssert.reverts(insurance.proposeClaim(url, { from: SECOND }), "Insurance: not enough deposit");
    });

    it("should propose claim", async () => {
      const url = "url";

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.proposeClaim(url, { from: SECOND });

      let ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(1, ongoingClaims.length);
      assert.equal(url, ongoingClaims[0]);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);
      assert.equal(0, finishedClaims[0].length);
    });

    it("should propse two urls", async () => {
      const url1 = "url1";
      const url2 = "url2";

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.proposeClaim(url1, { from: SECOND });

      let ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(1, ongoingClaims.length);
      assert.equal(url1, ongoingClaims[0]);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);
      assert.equal(0, finishedClaims[0].length);

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.proposeClaim(url2, { from: SECOND });

      ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(2, ongoingClaims.length);
      assert.equal(url2, ongoingClaims[1]);
      assert.equal(url1, ongoingClaims[0]);

      finishedClaims = await insurance.listFinishedClaims(0, 100);
      assert.equal(0, finishedClaims[0].length);
    });

    it("should revert when try to add same urls", async () => {
      const url = "url";

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.proposeClaim(url, { from: SECOND });

      let ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(1, ongoingClaims.length);
      assert.equal(url, ongoingClaims[0]);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);
      assert.equal(0, finishedClaims[0].length);

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await truffleAssert.reverts(insurance.proposeClaim(url, { from: SECOND }), "Insurance: Url is not unique");

      ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(1, ongoingClaims.length);
      assert.equal(url, ongoingClaims[0]);

      finishedClaims = await insurance.listFinishedClaims(0, 100);
      assert.equal(0, finishedClaims[0].length);
    });

    it("should revert when try to propose finished claim", async () => {
      const url = "url";

      await insurance.buyInsurance(deposit, { from: SECOND });

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await insurance.proposeClaim(url, { from: SECOND });
      await insurance.rejectClaim(url);

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);

      await truffleAssert.reverts(insurance.proposeClaim(url, { from: SECOND }), "Insurance: Url is not unique");

      let ongoingClaims = await insurance.listOngoingClaims(0, 100);
      assert.equal(0, ongoingClaims.length);
    });
  });

  describe("listOngoingClaims", async () => {
    const len = 10;
    const deposit = toBN(wei("100"));

    beforeEach("make ongoing claim", async () => {
      const url = "url";

      await insurance.buyInsurance(deposit, { from: SECOND });

      for (i = 0; i < len; i++) {
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);
        await insurance.proposeClaim(url + i, { from: SECOND });
      }
    });

    it("should correctly return list", async () => {
      let ongoingClaims = await insurance.listOngoingClaims(0, 100);
      let ongoingClaims1 = await insurance.listOngoingClaims(0, 10);

      assert.deepEqual(ongoingClaims, ongoingClaims1);
      assert.equal(len, await insurance.ongoingClaimsCount());
      assert.equal(len, ongoingClaims.length);
      assert.equal(len, ongoingClaims1.length);
    });

    it("should return first 5 elements", async () => {
      let localLen = 5;
      let ongoingClaims = await insurance.listOngoingClaims(0, localLen);

      assert.equal(localLen, ongoingClaims.length);
      assert.equal("url0", ongoingClaims[0]);
      assert.equal("url4", ongoingClaims[localLen - 1]);
    });

    it("should return last 5 elements", async () => {
      let localLen = 5;
      let ongoingClaims = await insurance.listOngoingClaims(5, 5 + localLen);

      assert.equal(localLen, ongoingClaims.length);
      assert.equal("url5", ongoingClaims[0]);
      assert.equal("url9", ongoingClaims[localLen - 1]);
    });
  });

  describe("acceptClaim", async () => {
    const baseURL = "url";
    const deposit = toBN(wei("100"));
    let ALICE;
    let RON;
    let BOB;

    before("set accounts", async () => {
      ALICE = await accounts(7);
      RON = await accounts(8);
      BOB = await accounts(9);
    });

    beforeEach("make ongoing claim", async () => {
      await dexe.mint(ALICE, deposit);
      await dexe.mint(RON, deposit);
      await dexe.mint(BOB, deposit);

      await dexe.approve(insurance.address, deposit, { from: ALICE });
      await dexe.approve(insurance.address, deposit, { from: RON });
      await dexe.approve(insurance.address, deposit, { from: BOB });

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.buyInsurance(deposit, { from: ALICE });
      await insurance.buyInsurance(deposit, { from: RON });
      await insurance.buyInsurance(deposit, { from: BOB });

      for (i = 0; i < 10; i++) {
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);
        await insurance.proposeClaim(baseURL + i, { from: SECOND });
      }
    });

    it("should accept claim", async () => {
      await dexe.transfer(insurance.address, toBN(1000000).times(toBN(10).pow(decimal)), { from: POOL });
      await insurance.receiveDexeFromPools(1000000, { from: POOL });

      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(1, finishedClaims[0].length);

      assert.equal(amount + amount / insuranceFactor, finishedClaims[1][0][1][0]);
      assert.equal(amount + amount / insuranceFactor, finishedClaims[1][0][1][1]);
      assert.equal(amount + amount / insuranceFactor, finishedClaims[1][0][1][2]);

      assert.equal(ALICE, finishedClaims[1][0][0][0]);
      assert.equal(RON, finishedClaims[1][0][0][1]);
      assert.equal(BOB, finishedClaims[1][0][0][2]);

      assert.equal(balanceAlice.plus(finishedClaims[1][0][1][0]).toFixed(), (await dexe.balanceOf(ALICE)).toFixed());
      assert.equal(balanceRon.plus(finishedClaims[1][0][1][1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(finishedClaims[1][0][1][2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());

      assert.equal(1, finishedClaims[1][0][2]);
    });

    it("should accept claim when totalBalance lower then amounts", async () => {
      await dexe.transfer(insurance.address, 100, { from: POOL });
      await insurance.receiveDexeFromPools(100, { from: POOL });

      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      await insurance.acceptClaim("url0", users, amounts);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(users.length, finishedClaims[1][0][0].length);
      assert.equal(amounts.length, finishedClaims[1][0][1].length);

      assert.equal(12, finishedClaims[1][0][1][0]);
      assert.equal(12, finishedClaims[1][0][1][1]);
      assert.equal(12, finishedClaims[1][0][1][2]);

      assert.equal(ALICE, finishedClaims[1][0][0][0]);
      assert.equal(RON, finishedClaims[1][0][0][1]);
      assert.equal(BOB, finishedClaims[1][0][0][2]);

      assert.equal(1, finishedClaims[1][0][2]);
    });

    it("should accept claim when user's amounts is [66, 33, 1]", async () => {
      await dexe.transfer(insurance.address, toBN(1000000).times(toBN(10).pow(decimal)), { from: POOL });
      await insurance.receiveDexeFromPools(1000000, { from: POOL });

      const users = [ALICE, RON, BOB];
      const amounts = [66, 33, 1];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(Math.floor(amounts[0] + amounts[0] / insuranceFactor), finishedClaims[1][0][1][0]);
      assert.equal(Math.floor(amounts[1] + amounts[1] / insuranceFactor), finishedClaims[1][0][1][1]);
      assert.equal(Math.floor(amounts[2] + amounts[2] / insuranceFactor), finishedClaims[1][0][1][2]);

      assert.equal(ALICE, finishedClaims[1][0][0][0]);
      assert.equal(RON, finishedClaims[1][0][0][1]);
      assert.equal(BOB, finishedClaims[1][0][0][2]);

      assert.equal(balanceAlice.plus(finishedClaims[1][0][1][0]).toFixed(), (await dexe.balanceOf(ALICE)).toFixed());
      assert.equal(balanceRon.plus(finishedClaims[1][0][1][1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(finishedClaims[1][0][1][2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());

      assert.equal(1, finishedClaims[1][0][2]);
    });

    it("should accept claim when user's amounts is [66, 33, 1] and total amount is 100", async () => {
      await dexe.transfer(insurance.address, 100, { from: POOL });
      await insurance.receiveDexeFromPools(100, { from: POOL });

      const users = [ALICE, RON, BOB];
      const amounts = [66, 33, 1];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(23, finishedClaims[1][0][1][0]);
      assert.equal(11, finishedClaims[1][0][1][1]);
      assert.equal(0, finishedClaims[1][0][1][2]); // chech this assert

      assert.equal(ALICE, finishedClaims[1][0][0][0]);
      assert.equal(RON, finishedClaims[1][0][0][1]);
      assert.equal(BOB, finishedClaims[1][0][0][2]);

      assert.equal(balanceAlice.plus(finishedClaims[1][0][1][0]).toFixed(), (await dexe.balanceOf(ALICE)).toFixed());
      assert.equal(balanceRon.plus(finishedClaims[1][0][1][1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(finishedClaims[1][0][1][2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());

      assert.equal(1, finishedClaims[1][0][2]);
    });

    it("should correctly pay when user's amounts is [60, 20, 0]", async () => {
      await dexe.transfer(insurance.address, 10000, { from: POOL });
      await insurance.receiveDexeFromPools(10000, { from: POOL });

      const users = [ALICE, RON, BOB];
      const amounts = [60, 20, 0];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(Math.floor(amounts[0] + amounts[0] / insuranceFactor), finishedClaims[1][0][1][0]);
      assert.equal(Math.floor(amounts[1] + amounts[1] / insuranceFactor), finishedClaims[1][0][1][1]);
      assert.equal(0, finishedClaims[1][0][1][2]);

      assert.equal(ALICE, finishedClaims[1][0][0][0]);
      assert.equal(RON, finishedClaims[1][0][0][1]);
      assert.equal(BOB, finishedClaims[1][0][0][2]);

      assert.equal(balanceAlice.plus(finishedClaims[1][0][1][0]).toFixed(), (await dexe.balanceOf(ALICE)).toFixed());
      assert.equal(balanceRon.plus(finishedClaims[1][0][1][1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(finishedClaims[1][0][1][2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());

      assert.equal(1, finishedClaims[1][0][2]);
    });

    it("should rever when try to accept unproposed claim", async () => {
      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];
      await truffleAssert.reverts(insurance.acceptClaim("url10", users, amounts), "Insurance: invalid claim url");
    });
  });

  describe("rejectClaim", async () => {
    const baseURL = "url";
    const deposit = toBN(wei("100"));

    before("set accounts", async () => {
      ALICE = await accounts(7);
      RON = await accounts(8);
      BOB = await accounts(9);
    });

    beforeEach("make ongoing claim", async () => {
      await dexe.mint(ALICE, deposit);
      await dexe.mint(RON, deposit);
      await dexe.mint(BOB, deposit);

      await dexe.approve(insurance.address, deposit, { from: ALICE });
      await dexe.approve(insurance.address, deposit, { from: RON });
      await dexe.approve(insurance.address, deposit, { from: BOB });

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.buyInsurance(deposit, { from: ALICE });
      await insurance.buyInsurance(deposit, { from: RON });
      await insurance.buyInsurance(deposit, { from: BOB });

      for (i = 0; i < 10; i++) {
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);
        await insurance.proposeClaim(baseURL + i, { from: SECOND });
      }
    });

    it("should reject claim", async () => {
      await insurance.rejectClaim("url0");

      let finishedClaims = await insurance.listFinishedClaims(0, 100);

      assert.equal(0, finishedClaims[1][0][0].length);
      assert.equal(0, finishedClaims[1][0][1].length);

      assert.equal(2, finishedClaims[1][0][2]);
    });

    it("should revert when try to reject unongoing url", async () => {
      await truffleAssert.reverts(insurance.rejectClaim("url10"), "Insurance: url is not ongoing");
    });
  });

  describe("listFinishedClaims", async () => {
    const len = 10;
    const baseURL = "url";
    const deposit = toBN(wei("100"));
    let ALICE;
    let RON;
    let BOB;

    before("set accounts", async () => {
      ALICE = await accounts(7);
      RON = await accounts(8);
      BOB = await accounts(9);
    });

    beforeEach("make finished claims", async () => {
      await dexe.mint(ALICE, deposit);
      await dexe.mint(RON, deposit);
      await dexe.mint(BOB, deposit);

      await dexe.approve(insurance.address, deposit, { from: ALICE });
      await dexe.approve(insurance.address, deposit, { from: RON });
      await dexe.approve(insurance.address, deposit, { from: BOB });

      await insurance.buyInsurance(deposit, { from: SECOND });
      await insurance.buyInsurance(deposit, { from: ALICE });
      await insurance.buyInsurance(deposit, { from: RON });
      await insurance.buyInsurance(deposit, { from: BOB });

      for (i = 0; i < len; i++) {
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY);
        await insurance.proposeClaim(baseURL + i, { from: SECOND });
      }

      await dexe.transfer(insurance.address, toBN(1000000).times(toBN(10).pow(decimal)), { from: POOL });
      await insurance.receiveDexeFromPools(1000000, { from: POOL });
      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      for (i = 0; i < len / 2; i++) {
        await insurance.acceptClaim(baseURL + i, users, amounts);
      }

      for (i = len / 2; i < len; i++) {
        await insurance.rejectClaim(baseURL + i);
      }
    });

    it("should correctly return list", async () => {
      let finishedClaims = await insurance.listFinishedClaims(0, len);

      assert.equal(await insurance.finishedClaimsCount(), len);
      assert.equal(finishedClaims[0].length, len);
      assert.equal(finishedClaims[1].length, len);
      assert.equal(finishedClaims[0][0], baseURL + 0);
      assert.equal(finishedClaims[0][len - 1], baseURL + (len - 1));
    });

    it("should return first 5 elements", async () => {
      localLen = 5;
      let finishedClaims = await insurance.listFinishedClaims(0, localLen);

      assert.equal(finishedClaims[0].length, localLen);
      assert.equal(finishedClaims[1].length, localLen);
      assert.equal(finishedClaims[0][0], baseURL + 0);
      assert.equal(finishedClaims[0][localLen - 1], baseURL + (localLen - 1));
    });

    it("should return first 5 elements", async () => {
      localLen = 5;
      let finishedClaims = await insurance.listFinishedClaims(localLen, len);

      assert.equal(finishedClaims[0].length, localLen);
      assert.equal(finishedClaims[1].length, localLen);
      assert.equal(finishedClaims[0][0], baseURL + localLen);
      assert.equal(finishedClaims[0][localLen - 1], baseURL + (len - 1));
    });
  });
});
