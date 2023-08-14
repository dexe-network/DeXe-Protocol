const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { SECONDS_IN_DAY } = require("../../scripts/utils/constants");
const { DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const { setTime, getCurrentBlockTime } = require("../helpers/block-helper");
const { assert } = require("chai");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";

describe("Insurance", () => {
  let OWNER;
  let SECOND;
  let ALICE;
  let BOB;
  let RON;
  let NOTHING;

  let insurance;
  let insuranceFactor;
  let dexe;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    ALICE = await accounts(4);
    RON = await accounts(5);
    BOB = await accounts(6);
    NOTHING = await accounts(9);

    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    const _coreProperties = await CoreProperties.new();
    dexe = await ERC20Mock.new("DEXE", "DEXE", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), dexe.address);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await insurance.__Insurance_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    insuranceFactor = await coreProperties.getInsuranceFactor();

    await dexe.mint(OWNER, wei("100000000"));
    await dexe.mint(SECOND, wei("1000"));

    await dexe.approve(insurance.address, wei("1000"), { from: SECOND });

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(insurance.__Insurance_init(), "Initializable: contract is already initialized");
    });

    it("should not set dependencies from non dependant", async () => {
      await truffleAssert.reverts(insurance.setDependencies(OWNER, "0x"), "Dependant: not an injector");
    });

    it("only owner should call these methods", async () => {
      await truffleAssert.reverts(
        insurance.acceptClaim("placeholder", [OWNER], [wei("1")], { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("buyInsurance", () => {
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

  describe("withdraw", () => {
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

  describe("acceptClaim", () => {
    const deposit = wei("100");

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
    });

    it("should accept claim", async () => {
      await dexe.transfer(insurance.address, 1000000);

      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      assert.equal((await insurance.getMaxTreasuryPayout()).toFixed(), 333333);

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(1, acceptedClaims.urls.length);

      assert.equal(amount + amount / insuranceFactor, acceptedClaims.info[0].amounts[0]);
      assert.equal(amount + amount / insuranceFactor, acceptedClaims.info[0].amounts[1]);
      assert.equal(amount + amount / insuranceFactor, acceptedClaims.info[0].amounts[2]);

      assert.equal(ALICE, acceptedClaims.info[0].claimers[0]);
      assert.equal(RON, acceptedClaims.info[0].claimers[1]);
      assert.equal(BOB, acceptedClaims.info[0].claimers[2]);

      assert.equal(
        balanceAlice.plus(acceptedClaims.info[0].amounts[0]).toFixed(),
        (await dexe.balanceOf(ALICE)).toFixed()
      );
      assert.equal(balanceRon.plus(acceptedClaims.info[0].amounts[1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(acceptedClaims.info[0].amounts[2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());
    });

    it("should not accept claim if length mismatches", async () => {
      await truffleAssert.reverts(insurance.acceptClaim("url0", [OWNER], []), "Insurance: length mismatch");
    });

    it("should accept claim when totalBalance is less than amounts", async () => {
      await dexe.transfer(insurance.address, 100);

      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(users.length, acceptedClaims.info[0].claimers.length);
      assert.equal(amounts.length, acceptedClaims.info[0].amounts.length);

      assert.equal(12, acceptedClaims.info[0].amounts[0]);
      assert.equal(12, acceptedClaims.info[0].amounts[1]);
      assert.equal(12, acceptedClaims.info[0].amounts[2]);
    });

    it("should accept claim when user's amounts is [66, 33, 1]", async () => {
      await dexe.transfer(insurance.address, wei("1000000"));

      const users = [ALICE, RON, BOB];
      const amounts = [66, 33, 1];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(Math.floor(amounts[0] + amounts[0] / insuranceFactor), acceptedClaims.info[0].amounts[0]);
      assert.equal(Math.floor(amounts[1] + amounts[1] / insuranceFactor), acceptedClaims.info[0].amounts[1]);
      assert.equal(Math.floor(amounts[2] + amounts[2] / insuranceFactor), acceptedClaims.info[0].amounts[2]);

      assert.equal(
        balanceAlice.plus(acceptedClaims.info[0].amounts[0]).toFixed(),
        (await dexe.balanceOf(ALICE)).toFixed()
      );
      assert.equal(balanceRon.plus(acceptedClaims.info[0].amounts[1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(acceptedClaims.info[0].amounts[2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());
    });

    it("should accept claim when user's amounts is [66, 33, 1] and total amount is 100", async () => {
      await dexe.transfer(insurance.address, 100);

      const users = [ALICE, RON, BOB];
      const amounts = [66, 33, 1];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(23, acceptedClaims.info[0].amounts[0]);
      assert.equal(11, acceptedClaims.info[0].amounts[1]);
      assert.equal(0, acceptedClaims.info[0].amounts[2]);

      assert.equal(
        balanceAlice.plus(acceptedClaims.info[0].amounts[0]).toFixed(),
        (await dexe.balanceOf(ALICE)).toFixed()
      );
      assert.equal(balanceRon.plus(acceptedClaims.info[0].amounts[1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(acceptedClaims.info[0].amounts[2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());
    });

    it("should correctly pay when user's amounts is [60, 20, 0]", async () => {
      await dexe.transfer(insurance.address, 10000);

      const users = [ALICE, RON, BOB];
      const amounts = [60, 20, 0];

      let balanceAlice = await dexe.balanceOf(ALICE);
      let balanceRon = await dexe.balanceOf(RON);
      let balanceBob = await dexe.balanceOf(BOB);

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(Math.floor(amounts[0] + amounts[0] / insuranceFactor), acceptedClaims.info[0].amounts[0]);
      assert.equal(Math.floor(amounts[1] + amounts[1] / insuranceFactor), acceptedClaims.info[0].amounts[1]);
      assert.equal(0, acceptedClaims.info[0].amounts[2]);

      assert.equal(
        balanceAlice.plus(acceptedClaims.info[0].amounts[0]).toFixed(),
        (await dexe.balanceOf(ALICE)).toFixed()
      );
      assert.equal(balanceRon.plus(acceptedClaims.info[0].amounts[1]).toFixed(), (await dexe.balanceOf(RON)).toFixed());
      assert.equal(balanceBob.plus(acceptedClaims.info[0].amounts[2]).toFixed(), (await dexe.balanceOf(BOB)).toFixed());
    });

    it("should accept claim even if user withdrew insurance", async () => {
      await dexe.transfer(insurance.address, wei("90"));

      const amount = wei("80");
      const users = [ALICE];
      const amounts = [amount];

      let balanceAlice = await dexe.balanceOf(ALICE);

      await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY + 10);

      await insurance.withdraw(wei("99"), { from: ALICE });

      assert.equal((await insurance.getMaxTreasuryPayout()).toFixed(), wei("29.99997"));

      await insurance.acceptClaim("url0", users, amounts);

      let acceptedClaims = await insurance.listAcceptedClaims(0, 100);

      assert.equal(1, acceptedClaims.urls.length);

      assert.equal(toBN(wei("29.99997")).plus(wei("1")).toFixed(), toBN(acceptedClaims.info[0].amounts[0]).toFixed());
      assert.equal(
        balanceAlice.plus(wei("99")).plus(acceptedClaims.info[0].amounts[0]).toFixed(),
        (await dexe.balanceOf(ALICE)).toFixed()
      );
    });

    it("should revert when accepting the same claim twice", async () => {
      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      await insurance.acceptClaim("url10", users, amounts);

      await truffleAssert.reverts(insurance.acceptClaim("url10", users, amounts), "Insurance: claim already accepted");
    });
  });

  describe("listAcceptedClaims", () => {
    const len = 10;
    const baseURL = "url";
    const deposit = toBN(wei("100"));

    beforeEach("setup", async () => {
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

      await dexe.transfer(insurance.address, wei("1000000"));

      const amount = 100;
      const users = [ALICE, RON, BOB];
      const amounts = [amount, amount, amount];

      for (i = 0; i < len; i++) {
        await insurance.acceptClaim(baseURL + i, users, amounts);
      }
    });

    it("should correctly return list", async () => {
      let acceptedClaims = await insurance.listAcceptedClaims(0, len);

      assert.equal(await insurance.acceptedClaimsCount(), len);

      assert.equal(acceptedClaims.urls.length, len);
      assert.equal(acceptedClaims.info.length, len);
      assert.equal(acceptedClaims.urls[0], baseURL + 0);
      assert.equal(acceptedClaims.urls[len - 1], baseURL + (len - 1));
    });

    it("should return first 5 elements", async () => {
      let acceptedClaims = await insurance.listAcceptedClaims(0, 5);

      assert.equal(acceptedClaims.urls.length, 5);
      assert.equal(acceptedClaims.info.length, 5);
      assert.equal(acceptedClaims.urls[0], baseURL + 0);
      assert.equal(acceptedClaims.urls[4], baseURL + 4);
    });

    it("should return an empty list", async () => {
      let acceptedClaims = await insurance.listAcceptedClaims(len, len);

      assert.equal(acceptedClaims.urls.length, 0);
      assert.equal(acceptedClaims.info.length, 0);
    });
  });
});
