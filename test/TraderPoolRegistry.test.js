const { assert } = require("chai");
const { toBN, accounts } = require("./helpers/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

ContractsRegistry.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";

describe("TraderPoolRegistry", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let traderPoolRegistry;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.TRADER_POOL_FACTORY_NAME(), SECOND);

    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );

    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

    await traderPoolRegistry.__TraderPoolRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
  });

  describe("add and list pools", () => {
    let BASIC_NAME;
    let RISKY_NAME;
    let INVEST_NAME;

    let POOL_1;
    let POOL_2;
    let POOL_3;

    beforeEach("setup", async () => {
      BASIC_NAME = await traderPoolRegistry.BASIC_POOL_NAME();
      RISKY_NAME = await traderPoolRegistry.RISKY_POOL_NAME();
      INVEST_NAME = await traderPoolRegistry.INVEST_POOL_NAME();

      POOL_1 = await accounts(3);
      POOL_2 = await accounts(4);
      POOL_3 = await accounts(5);
    });

    it("should successfully add and get implementation", async () => {
      await traderPoolRegistry.addImplementation(BASIC_NAME, POOL_1);

      assert.equal(await traderPoolRegistry.getImplementation(BASIC_NAME), POOL_1);
    });

    it("should successfully add new pools", async () => {
      await traderPoolRegistry.addPool(OWNER, BASIC_NAME, POOL_1, { from: SECOND });
      await traderPoolRegistry.addPool(OWNER, BASIC_NAME, POOL_2, { from: SECOND });

      assert.equal((await traderPoolRegistry.countPools(BASIC_NAME)).toFixed(), "2");
      assert.equal((await traderPoolRegistry.countPools(RISKY_NAME)).toFixed(), "0");

      assert.equal((await traderPoolRegistry.countUserPools(OWNER, BASIC_NAME)).toFixed(), "2");
      assert.equal((await traderPoolRegistry.countUserPools(OWNER, RISKY_NAME)).toFixed(), "0");

      assert.isFalse(await traderPoolRegistry.isPool(POOL_3));
      assert.isTrue(await traderPoolRegistry.isPool(POOL_2));
    });

    it("should list added pools", async () => {
      await traderPoolRegistry.addPool(OWNER, BASIC_NAME, POOL_1, { from: SECOND });
      await traderPoolRegistry.addPool(OWNER, BASIC_NAME, POOL_2, { from: SECOND });

      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listPools(BASIC_NAME, 2, 0), []);
      assert.deepEqual(await traderPoolRegistry.listPools(RISKY_NAME, 0, 2), []);

      assert.deepEqual(await traderPoolRegistry.listUserPools(OWNER, BASIC_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listUserPools(OWNER, BASIC_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listUserPools(OWNER, BASIC_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await traderPoolRegistry.listUserPools(OWNER, BASIC_NAME, 2, 0), []);
      assert.deepEqual(await traderPoolRegistry.listUserPools(OWNER, RISKY_NAME, 0, 2), []);
    });
  });
});
