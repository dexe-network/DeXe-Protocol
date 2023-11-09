const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const { DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const CoreProperties = artifacts.require("CoreProperties");
const ERC20Mock = artifacts.require("ERC20Mock");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");

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
    const _sphereXEngine = await SphereXEngineMock.new();

    await contractsRegistry.__MultiOwnableContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), _sphereXEngine.address);

    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);

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
        "MultiOwnable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setDEXECommissionPercentages(10, { from: SECOND }),
        "MultiOwnable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setTokenSaleProposalCommissionPercentage(0, { from: SECOND }),
        "MultiOwnable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setVoteRewardsPercentages(0, 0, { from: SECOND }),
        "MultiOwnable: caller is not the owner"
      );

      await truffleAssert.reverts(
        coreProperties.setGovVotesLimit(20, { from: SECOND }),
        "MultiOwnable: caller is not the owner"
      );
    });
  });

  describe("simple setters", () => {
    it("should core parameters", async () => {
      await truffleAssert.passes(coreProperties.setCoreParameters(DEFAULT_CORE_PROPERTIES), "passes");
    });

    it("should set dexe commission percentages", async () => {
      await coreProperties.setDEXECommissionPercentages(10);

      const commissions = await coreProperties.getDEXECommissionPercentages();

      assert.equal(toBN(commissions[0]).toFixed(), "10");
    });

    it("should set token sale proposal commission percentage", async () => {
      await coreProperties.setTokenSaleProposalCommissionPercentage(1);

      assert.equal(toBN(await coreProperties.getTokenSaleProposalCommissionPercentage()).toFixed(), "1");
    });

    it("should set vote rewards percentage", async () => {
      await coreProperties.setVoteRewardsPercentages(1, 2);

      assert.equal(toBN((await coreProperties.getVoteRewardsPercentages())[0]).toFixed(), "1");
      assert.equal(toBN((await coreProperties.getVoteRewardsPercentages())[1]).toFixed(), "2");
    });

    it("should set gov votes limit", async () => {
      await coreProperties.setGovVotesLimit(20);

      assert.equal(toBN(await coreProperties.getGovVotesLimit()).toFixed(), "20");
    });
  });
});
