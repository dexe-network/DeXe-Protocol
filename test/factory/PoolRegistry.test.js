const { assert } = require("chai");
const { accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { DEFAULT_CORE_PROPERTIES } = require("../utils/constants");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");

ContractsRegistry.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";

describe("PoolRegistry", () => {
  let OWNER;
  let FACTORY;
  let NOTHING;

  let GOV_NAME;

  let DEXE;
  let poolRegistry;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    FACTORY = await accounts(1);
    NOTHING = await accounts(9);

    const contractsRegistry = await ContractsRegistry.new();
    const _poolRegistry = await PoolRegistry.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    const USD = await ERC20Mock.new("USD", "USD", 18);
    const BABT = await BABTMock.new();
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    const uniswapV2Router = await UniswapV2RouterMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), BABT.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), NOTHING);

    const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    const priceFeed = await PriceFeedMock.at(await contractsRegistry.getPriceFeedContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init();
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
});
