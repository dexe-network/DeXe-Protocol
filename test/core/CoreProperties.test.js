const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const { SECONDS_IN_MONTH } = require("../../scripts/utils/constants");
const { ComissionPeriods, DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("CoreProperties", () => {
  let OWNER;
  let SECOND;
  let NOTHING;

  let coreProperties;
  let DEXE;
  let USD;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    NOTHING = await accounts(9);

    const contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);

    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES),
        "Initializable: contract is already initialized"
      );
    });

    it("should not set dependencies from non dependant", async () => {
      await truffleAssert.reverts(coreProperties.setDependencies(OWNER, "0x"), "Dependant: not an injector");
    });

    it("only owner should call these methods", async () => {
      await truffleAssert.reverts(
        coreProperties.setCoreParameters(DEFAULT_CORE_PROPERTIES, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setMaximumPoolInvestors(100, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setMaximumOpenPositions(100, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setTraderLeverageParams(3000, 10, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setCommissionInitTimestamp(100, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setCommissionDurations([10, 100, 1000], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setDEXECommissionPercentages(20, 10, [50, 25, 25], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setTokenSaleProposalCommissionPercentage(0, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setTraderCommissionPercentages(10, [20, 50, 90], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setDelayForRiskyPool(100, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setInsuranceParameters(
          {
            insuranceFactor: 10,
            maxInsurancePoolShare: 20,
            minInsuranceDeposit: 30,
            insuranceWithdrawalLock: 50,
          },
          { from: SECOND }
        ),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setGovVotesLimit(20, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.addWhitelistTokens([USD.address, DEXE.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.removeWhitelistTokens([USD.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.addBlacklistTokens([USD.address, DEXE.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.removeBlacklistTokens([USD.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("simple setters", () => {
    it("should core parameters", async () => {
      await truffleAssert.passes(coreProperties.setCoreParameters(DEFAULT_CORE_PROPERTIES), "passes");
    });

    it("should set maximum pool investors", async () => {
      await coreProperties.setMaximumPoolInvestors(100);

      assert.equal(toBN(await coreProperties.getMaximumPoolInvestors()).toFixed(), "100");
    });

    it("should set maximum open positions", async () => {
      await coreProperties.setMaximumOpenPositions(100);

      assert.equal(toBN(await coreProperties.getMaximumOpenPositions()).toFixed(), "100");
    });

    it("should set trader leverage params", async () => {
      await coreProperties.setTraderLeverageParams(3000, 10);

      assert.equal(toBN((await coreProperties.getTraderLeverageParams())[0]).toFixed(), "3000");
      assert.equal(toBN((await coreProperties.getTraderLeverageParams())[1]).toFixed(), "10");
    });

    it("should set commission init timestamp", async () => {
      await coreProperties.setCommissionInitTimestamp(100);

      assert.equal(toBN(await coreProperties.getCommissionInitTimestamp()).toFixed(), "100");
    });

    it("should set commission durations", async () => {
      await coreProperties.setCommissionDurations([10, 100, 1000]);

      assert.equal(toBN(await coreProperties.getCommissionDuration(ComissionPeriods.PERIOD_2)).toFixed(), "100");
    });

    it("should set dexe commission percentages", async () => {
      await coreProperties.setDEXECommissionPercentages(20, 10, [50, 25, 25]);

      const commissions = await coreProperties.getDEXECommissionPercentages();

      assert.equal(toBN(commissions[0]).toFixed(), "20");
      assert.equal(toBN(commissions[1]).toFixed(), "10");
      assert.deepEqual(
        commissions[2].map((e) => e.toFixed()),
        ["50", "25", "25"]
      );
    });

    it("should set token sale proposal commission percentage", async () => {
      await coreProperties.setTokenSaleProposalCommissionPercentage(1);

      assert.equal(toBN(await coreProperties.getTokenSaleProposalCommissionPercentage()).toFixed(), "1");
    });

    it("should set trader commission percentages", async () => {
      await coreProperties.setTraderCommissionPercentages(10, [20, 50, 90]);

      const commissions = await coreProperties.getTraderCommissions();

      assert.equal(toBN(commissions[0]).toFixed(), "10");
      assert.deepEqual(
        commissions[1].map((e) => e.toFixed()),
        ["20", "50", "90"]
      );
    });

    it("should set delay for risky pool", async () => {
      await coreProperties.setDelayForRiskyPool(100);

      assert.equal(toBN(await coreProperties.getDelayForRiskyPool()).toFixed(), "100");
    });

    it("should set insurance parameters", async () => {
      const params = {
        insuranceFactor: 10,
        maxInsurancePoolShare: 20,
        minInsuranceDeposit: 30,
        insuranceWithdrawalLock: 50,
      };

      await coreProperties.setInsuranceParameters(params);

      assert.equal(toBN(await coreProperties.getInsuranceFactor()).toFixed(), "10");
      assert.equal(toBN(await coreProperties.getMaxInsurancePoolShare()).toFixed(), "20");
      assert.equal(toBN(await coreProperties.getMinInsuranceDeposit()).toFixed(), "30");
      assert.equal(toBN(await coreProperties.getInsuranceWithdrawalLock()).toFixed(), "50");
    });

    it("should set gov votes limit", async () => {
      await coreProperties.setGovVotesLimit(20);

      assert.equal(toBN(await coreProperties.getGovVotesLimit()).toFixed(), "20");
    });
  });

  describe("tokens", () => {
    it("should set and return whitelist tokens", async () => {
      await coreProperties.addWhitelistTokens([USD.address, DEXE.address, DEXE.address]);
      await coreProperties.removeWhitelistTokens([DEXE.address]);

      assert.isTrue(await coreProperties.isWhitelistedToken(USD.address));
      assert.isFalse(await coreProperties.isWhitelistedToken(DEXE.address));

      assert.equal((await coreProperties.totalWhitelistTokens()).toFixed(), "1");
      assert.deepEqual(await coreProperties.getWhitelistTokens(0, 10), [USD.address]);
    });

    it("should set and remove blacklist tokens", async () => {
      await coreProperties.addBlacklistTokens([USD.address, DEXE.address]);
      await coreProperties.removeBlacklistTokens([USD.address]);

      assert.isTrue(await coreProperties.isBlacklistedToken(DEXE.address));
      assert.isFalse(await coreProperties.isBlacklistedToken(USD.address));

      assert.equal((await coreProperties.totalBlacklistTokens()).toFixed(), "1");
      assert.deepEqual(await coreProperties.getBlacklistTokens(0, 10), [DEXE.address]);
    });
  });

  describe("filter positions", () => {
    it("should filter positions 1", async () => {
      await coreProperties.addBlacklistTokens([USD.address]);

      const positions = await coreProperties.getFilteredPositions([OWNER, USD.address]);

      assert.deepEqual(positions, [OWNER]);
    });

    it("should filter positions 1", async () => {
      await coreProperties.addBlacklistTokens([USD.address]);

      const positions = await coreProperties.getFilteredPositions([]);

      assert.deepEqual(positions, []);
    });

    it("should filter positions 3", async () => {
      await coreProperties.addBlacklistTokens([USD.address]);

      const positions = await coreProperties.getFilteredPositions([USD.address, USD.address, USD.address]);

      assert.deepEqual(positions, []);
    });

    it("should filter positions 4", async () => {
      await coreProperties.addBlacklistTokens([USD.address, DEXE.address]);

      const positions = await coreProperties.getFilteredPositions([
        OWNER,
        USD.address,
        SECOND,
        DEXE.address,
        NOTHING,
        coreProperties.address,
      ]);

      assert.deepEqual(positions, [coreProperties.address, NOTHING, SECOND, OWNER]);
    });
  });

  describe("commission epochs", () => {
    it("should calculate commission epoch by timestamp", async () => {
      assert.equal(
        toBN(await coreProperties.getCommissionEpochByTimestamp(SECONDS_IN_MONTH, ComissionPeriods.PERIOD_1)).toFixed(),
        "2"
      );
      assert.equal(
        toBN(
          await coreProperties.getCommissionEpochByTimestamp(SECONDS_IN_MONTH * 10, ComissionPeriods.PERIOD_1)
        ).toFixed(),
        "11"
      );
      assert.equal(
        toBN(
          await coreProperties.getCommissionEpochByTimestamp(SECONDS_IN_MONTH - 1, ComissionPeriods.PERIOD_1)
        ).toFixed(),
        "1"
      );
    });

    it("should get end timestamp by commission epoch", async () => {
      assert.equal(
        toBN(await coreProperties.getCommissionTimestampByEpoch(1, ComissionPeriods.PERIOD_1)).toFixed(),
        toBN(SECONDS_IN_MONTH - 1).toFixed()
      );
      assert.equal(
        toBN(await coreProperties.getCommissionTimestampByEpoch(11, ComissionPeriods.PERIOD_1)).toFixed(),
        toBN(SECONDS_IN_MONTH * 11 - 1).toFixed()
      );
    });
  });
});
