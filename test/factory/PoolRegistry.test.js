const { assert } = require("chai");
const { accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const { impersonate } = require("../helpers/impersonator");
const { ZERO_ADDR } = require("../../scripts/utils/constants");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");
const UniswapPathFinderLib = artifacts.require("UniswapPathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const UniswapV3QuoterMock = artifacts.require("UniswapV3QuoterMock");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");
const SphereXCalleeMock = artifacts.require("SphereXCalleeMock");
const PoolBeacon = artifacts.require("PoolBeacon");
const ProtectedPublicBeaconProxy = artifacts.require("ProtectedPublicBeaconProxy");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
UniswapV3QuoterMock.numberFormat = "BigNumber";

describe("PoolRegistry", () => {
  let OWNER;
  let SECOND;
  let FACTORY;
  let NOTHING;

  let GOV_NAME;

  let DEXE;
  let poolRegistry;

  let sphereXEngine;
  let sphereXCallee;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    FACTORY = await accounts(2);
    NOTHING = await accounts(9);

    const uniswapPathFinderLib = await UniswapPathFinderLib.new();
    await PriceFeed.link(uniswapPathFinderLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _poolRegistry = await PoolRegistry.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 18);
    const BABT = await BABTMock.new();
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeed.new();
    const uniswapV2Router = await UniswapV2RouterMock.new();
    const uniswapV3Quoter = await UniswapV3QuoterMock.new();
    sphereXEngine = await SphereXEngineMock.new();
    sphereXCallee = await SphereXCalleeMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), BABT.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init([["0", uniswapV2Router.address, "0"]]);
    await poolRegistry.__OwnablePoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());

    GOV_NAME = await poolRegistry.GOV_POOL_NAME();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("only factory should call these methods", async () => {
      await truffleAssert.reverts(poolRegistry.addProxyPool(GOV_NAME, OWNER), "PoolRegistry: Caller is not a factory");
    });
  });

  describe("add and list pools", () => {
    let POOL_1;

    beforeEach("setup", async () => {
      POOL_1 = await accounts(3);
    });

    it("should successfully add new GOV pool", async () => {
      assert.isFalse(await poolRegistry.isGovPool(POOL_1));

      await poolRegistry.addProxyPool(GOV_NAME, POOL_1, { from: FACTORY });

      assert.equal((await poolRegistry.countPools(GOV_NAME)).toFixed(), "1");

      assert.isTrue(await poolRegistry.isGovPool(POOL_1));
    });
  });

  describe("SphereX", () => {
    let sphereXCalleeProxy;
    let poolBeaconProxy;
    let protectedPublicBeaconProxy;
    let protectedMethodSelector;

    beforeEach(async () => {
      protectedMethodSelector = web3.eth.abi.encodeFunctionSignature("protectedMethod()");

      await poolRegistry.setNewImplementations(
        [
          GOV_NAME,
          await poolRegistry.SETTINGS_NAME(),
          await poolRegistry.VALIDATORS_NAME(),
          await poolRegistry.USER_KEEPER_NAME(),
          await poolRegistry.DISTRIBUTION_PROPOSAL_NAME(),
          await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
          await poolRegistry.EXPERT_NFT_NAME(),
          await poolRegistry.NFT_MULTIPLIER_NAME(),
          await poolRegistry.LINEAR_POWER_NAME(),
          await poolRegistry.POLYNOMIAL_POWER_NAME(),
        ],
        [
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
          sphereXCallee.address,
        ]
      );

      poolBeaconProxy = await PoolBeacon.at(await poolRegistry.getProxyBeacon(GOV_NAME));

      protectedPublicBeaconProxy = await ProtectedPublicBeaconProxy.new(poolBeaconProxy.address, "0x");
      sphereXCalleeProxy = await SphereXCalleeMock.at(protectedPublicBeaconProxy.address);

      await impersonate(poolRegistry.address);
    });

    it("should protect when sphereXEngine and selector are on", async () => {
      await poolRegistry.setSphereXEngine(sphereXEngine.address);
      await poolBeaconProxy.addProtectedFuncSigs([protectedMethodSelector], { from: poolRegistry.address });

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());

      await sphereXEngine.toggleRevert();

      await truffleAssert.reverts(sphereXCalleeProxy.protectedMethod(), "SphereXEngineMock: malicious tx");
    });

    it("should not protect when selector is off", async () => {
      await poolRegistry.setSphereXEngine(sphereXEngine.address);

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not protect when sphereXEngine is off", async () => {
      await poolRegistry.setSphereXEngine(sphereXEngine.address);
      await poolRegistry.setSphereXEngine(ZERO_ADDR);
      await poolBeaconProxy.addProtectedFuncSigs([protectedMethodSelector], { from: poolRegistry.address });

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not set engine if not an operator", async () => {
      await truffleAssert.reverts(
        poolRegistry.setSphereXEngine(sphereXEngine.address, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });

    it("should return correct implementation", async () => {
      assert.equal(await protectedPublicBeaconProxy.implementation(), await sphereXCallee.address);
    });
  });
});
