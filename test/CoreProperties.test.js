const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

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

describe("CoreProperties", () => {
  let OWNER;
  let SECOND;
  let NOTHING;

  let coreProperties;
  let DEXE;
  let USD;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    NOTHING = await accounts(9);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _coreProperties = await CoreProperties.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);

    await contractsRegistry.addContract(await contractsRegistry.INSURANCE_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);

    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
  });

  describe("tokens", () => {
    it("should set and return whitelist tokens", async () => {
      await coreProperties.addWhitelistTokens([USD.address, DEXE.address, DEXE.address]);

      assert.equal((await coreProperties.totalWhitelistTokens()).toFixed(), "2");
      assert.deepEqual(await coreProperties.getWhitelistTokens(0, 10), [USD.address, DEXE.address]);
    });

    it("should set and remove blacklist tokens", async () => {
      await coreProperties.addBlacklistTokens([USD.address, DEXE.address]);
      await coreProperties.removeBlacklistTokens([USD.address]);

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

      assert.deepEqual(positions, [OWNER, NOTHING, SECOND, coreProperties.address]);
    });
  });
});
