const { assert } = require("chai");
const { accounts } = require("../scripts/helpers/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const GovPoolRegistry = artifacts.require("GovPoolRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
GovPoolRegistry.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("GovPoolRegistry", () => {
  let OWNER;
  let FACTORY;

  let token;
  let govPoolRegistry;

  before("setup", async () => {
    OWNER = await accounts(0);
    FACTORY = await accounts(1);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _govPoolRegistry = await GovPoolRegistry.new();
    token = await ERC20Mock.new("MOCK", "MOCK", 18);

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addProxyContract(
      await contractsRegistry.GOV_POOL_REGISTRY_NAME(),
      _govPoolRegistry.address
    );

    govPoolRegistry = await GovPoolRegistry.at(await contractsRegistry.getGovPoolRegistryContract());

    await govPoolRegistry.__PoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.GOV_POOL_REGISTRY_NAME());
  });

  describe("add and list pools", () => {
    let GOV_NAME;
    let USER_KEEPER_NAME;

    let POOL_1;
    let POOL_2;

    beforeEach("setup", async () => {
      GOV_NAME = await govPoolRegistry.GOV_POOL_NAME();
      USER_KEEPER_NAME = await govPoolRegistry.USER_KEEPER_NAME();

      POOL_1 = await accounts(3);
      POOL_2 = await accounts(4);
    });

    it("should successfully add and get implementation", async () => {
      await govPoolRegistry.setNewImplementations([GOV_NAME], [token.address]);

      assert.equal(await govPoolRegistry.getImplementation(GOV_NAME), token.address);
    });

    it("should successfully add new pools", async () => {
      await govPoolRegistry.addPool(GOV_NAME, POOL_1, { from: FACTORY });
      await govPoolRegistry.addPool(GOV_NAME, POOL_2, { from: FACTORY });

      assert.equal((await govPoolRegistry.countPools(GOV_NAME)).toFixed(), "2");
      assert.equal((await govPoolRegistry.countPools(USER_KEEPER_NAME)).toFixed(), "0");
    });

    it("should successfully associate owner pools", async () => {
      await govPoolRegistry.associateUserWithPool(OWNER, GOV_NAME, POOL_1, { from: FACTORY });
      await govPoolRegistry.associateUserWithPool(OWNER, GOV_NAME, POOL_2, { from: FACTORY });

      assert.equal((await govPoolRegistry.countOwnerPools(OWNER, GOV_NAME)).toFixed(), "2");
      assert.equal((await govPoolRegistry.countOwnerPools(OWNER, USER_KEEPER_NAME)).toFixed(), "0");
    });

    it("should list added pools", async () => {
      await govPoolRegistry.addPool(GOV_NAME, POOL_1, { from: FACTORY });
      await govPoolRegistry.addPool(GOV_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await govPoolRegistry.listPools(GOV_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await govPoolRegistry.listPools(GOV_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await govPoolRegistry.listPools(GOV_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await govPoolRegistry.listPools(GOV_NAME, 2, 0), []);
      assert.deepEqual(await govPoolRegistry.listPools(USER_KEEPER_NAME, 0, 2), []);
    });

    it("should list associated pools", async () => {
      await govPoolRegistry.associateUserWithPool(OWNER, GOV_NAME, POOL_1, { from: FACTORY });
      await govPoolRegistry.associateUserWithPool(OWNER, GOV_NAME, POOL_2, { from: FACTORY });

      assert.deepEqual(await govPoolRegistry.listOwnerPools(OWNER, GOV_NAME, 0, 2), [POOL_1, POOL_2]);
      assert.deepEqual(await govPoolRegistry.listOwnerPools(OWNER, GOV_NAME, 0, 10), [POOL_1, POOL_2]);
      assert.deepEqual(await govPoolRegistry.listOwnerPools(OWNER, GOV_NAME, 1, 1), [POOL_2]);
      assert.deepEqual(await govPoolRegistry.listOwnerPools(OWNER, GOV_NAME, 2, 0), []);
      assert.deepEqual(await govPoolRegistry.listOwnerPools(OWNER, USER_KEEPER_NAME, 0, 2), []);
    });
  });
});
