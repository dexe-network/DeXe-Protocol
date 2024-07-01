const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { impersonate } = require("../helpers/impersonator");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC20MockUpgraded = artifacts.require("ERC20MockUpgraded");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");
const SphereXCalleeMock = artifacts.require("SphereXCalleeMock");

ContractsRegistry.numberFormat = "BigNumber";

ERC20Mock.numberFormat = "BigNumber";

describe("ContractsRegistry", () => {
  let SECOND;

  let contractsRegistry;

  let sphereXEngine;
  let sphereXCallee;

  const reverter = new Reverter();

  before("setup", async () => {
    SECOND = await accounts(1);

    contractsRegistry = await ContractsRegistry.new();
    sphereXEngine = await SphereXEngineMock.new();
    sphereXCallee = await SphereXCalleeMock.new();

    await contractsRegistry.__MultiOwnableContractsRegistry_init();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("proxy functionality", () => {
    let implementation;
    let proxyRegistry;

    beforeEach(async () => {
      implementation = await ContractsRegistry.new();

      proxyRegistry = await ContractsRegistry.at((await ERC1967Proxy.new(implementation.address, "0x")).address);

      await proxyRegistry.__MultiOwnableContractsRegistry_init();
    });

    it("should upgrade if all conditions are met", async () => {
      await truffleAssert.passes(proxyRegistry.upgradeTo(implementation.address), "upgrades if caller is the owner");
    });

    it("should not upgrade if caller is not the owner", async () => {
      await truffleAssert.reverts(
        proxyRegistry.upgradeTo(implementation.address, { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );
    });
  });

  describe("contract management", () => {
    it("should add and remove the contract", async () => {
      const USD = await ERC20Mock.new("USD", "USD", 18);
      const WETH = await ERC20Mock.new("WETH", "WETH", 18);

      await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);

      assert.equal(await contractsRegistry.getUSDContract(), USD.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      await truffleAssert.reverts(contractsRegistry.getUSDContract(), "ContractsRegistry: this mapping doesn't exist");
      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.addContracts(
        [await contractsRegistry.USD_NAME(), await contractsRegistry.WETH_NAME()],
        [USD.address, WETH.address],
      );

      assert.equal(await contractsRegistry.getUSDContract(), USD.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));
      assert.equal(await contractsRegistry.getWETHContract(), WETH.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.WETH_NAME()));
    });

    it("should not batch add if not owner", async () => {
      const USD = await ERC20Mock.new("USD", "USD", 18);
      const WETH = await ERC20Mock.new("WETH", "WETH", 18);

      await truffleAssert.reverts(
        contractsRegistry.addContracts(
          [await contractsRegistry.USD_NAME(), await contractsRegistry.WETH_NAME()],
          [USD.address, WETH.address],
          { from: SECOND },
        ),
        "MultiOwnable: caller is not the owner",
      );
    });

    it("should not batch inject if not owner", async () => {
      await truffleAssert.reverts(
        contractsRegistry.injectDependenciesBatch(
          [await contractsRegistry.PRICE_FEED_NAME(), await contractsRegistry.TOKEN_ALLOCATOR_NAME()],
          { from: SECOND },
        ),
        "MultiOwnable: caller is not the owner",
      );
    });

    it("should revert on names and addresses length mismatch", async () => {
      const USD = await ERC20Mock.new("USD", "USD", 18);

      await truffleAssert.reverts(
        contractsRegistry.addContracts(
          [await contractsRegistry.USD_NAME(), await contractsRegistry.WETH_NAME()],
          [USD.address],
        ),
        "Contracts Registry: names and addresses lengths don't match",
      );
    });

    it("should not add proxy contract without engine", async () => {
      const _USD = await ERC20Mock.new("USD", "USD", 18);

      await truffleAssert.reverts(
        contractsRegistry.addProxyContract(await contractsRegistry.USD_NAME(), _USD.address),
        "ContractsRegistry: this mapping doesn't exist",
      );
    });

    it("should add and remove the proxy contract", async () => {
      const _USD = await ERC20Mock.new("USD", "USD", 18);

      await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);

      await contractsRegistry.addProxyContract(await contractsRegistry.USD_NAME(), _USD.address);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));
    });

    it("should just add and remove the proxy contract", async () => {
      const _DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);

      await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);

      await contractsRegistry.addProxyContract(await contractsRegistry.DEXE_NAME(), _DEXE.address);

      const DEXE = await contractsRegistry.getDEXEContract();

      await contractsRegistry.removeContract(await contractsRegistry.DEXE_NAME());

      await contractsRegistry.justAddProxyContract(await contractsRegistry.DEXE_NAME(), DEXE);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.DEXE_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.DEXE_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.DEXE_NAME()));
    });
  });

  describe("contract upgrades", () => {
    let _USD;
    let _USD2;

    let USD;

    beforeEach("setup", async () => {
      _USD = await ERC20Mock.new("USD", "USD", 18);
      _USD2 = await ERC20MockUpgraded.new("USD", "USD", 18);

      await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);

      await contractsRegistry.addProxyContract(await contractsRegistry.USD_NAME(), _USD.address);

      USD = await ERC20MockUpgraded.at(await contractsRegistry.getUSDContract());
    });

    it("should upgrade the contract", async () => {
      await truffleAssert.reverts(USD.addedFunction());

      assert.equal(await contractsRegistry.getImplementation(await contractsRegistry.USD_NAME()), _USD.address);

      await contractsRegistry.upgradeContract(await contractsRegistry.USD_NAME(), _USD2.address);

      assert.equal(toBN(await USD.addedFunction()).toFixed(), "42");
    });

    it("should upgrade and call the contract", async () => {
      await truffleAssert.reverts(USD.addedFunction());

      let data = web3.eth.abi.encodeFunctionCall(
        {
          name: "doUpgrade",
          inputs: [
            {
              type: "uint256",
              name: "value",
            },
          ],
        },
        ["42"],
      );

      await contractsRegistry.upgradeContractAndCall(await contractsRegistry.USD_NAME(), _USD2.address, data);

      assert.equal(toBN(await USD.importantVariable()).toFixed(), "42");
    });
  });

  describe("SphereX", () => {
    let sphereXCalleeProxy;
    let protectedMethodSelector;
    let NAME;

    beforeEach(async () => {
      protectedMethodSelector = web3.eth.abi.encodeFunctionSignature("protectedMethod()");

      await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);

      await contractsRegistry.addProxyContract(await contractsRegistry.USER_REGISTRY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), sphereXCallee.address);

      NAME = await contractsRegistry.USER_REGISTRY_NAME();

      sphereXCalleeProxy = await SphereXCalleeMock.at(await contractsRegistry.getUserRegistryContract());

      await impersonate(contractsRegistry.address);
    });

    it("should protect when sphereXEngine and selector are on", async () => {
      await contractsRegistry.toggleSphereXEngine(true);
      await contractsRegistry.protectContractFunctions(NAME, [protectedMethodSelector]);

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());

      await sphereXEngine.toggleRevert();

      await truffleAssert.reverts(sphereXCalleeProxy.protectedMethod(), "SphereXEngineMock: malicious tx");

      await contractsRegistry.unprotectContractFunctions(NAME, [protectedMethodSelector]);

      await sphereXCalleeProxy.protectedMethod();
    });

    it("should not protect when selector is off", async () => {
      await contractsRegistry.toggleSphereXEngine(true);

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not protect when sphereXEngine is off", async () => {
      await contractsRegistry.toggleSphereXEngine(true);
      await contractsRegistry.toggleSphereXEngine(false);
      await contractsRegistry.protectContractFunctions(NAME, [protectedMethodSelector]);

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not work with engine if not an owner", async () => {
      await truffleAssert.reverts(
        contractsRegistry.toggleSphereXEngine(true, { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );

      await truffleAssert.reverts(
        contractsRegistry.protectContractFunctions(NAME, [protectedMethodSelector], { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );

      await truffleAssert.reverts(
        contractsRegistry.unprotectContractFunctions(NAME, [protectedMethodSelector], { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );
    });
  });
});
