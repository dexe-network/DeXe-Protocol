const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR } = require("../../scripts/utils/constants");
const { impersonate } = require("../helpers/impersonator");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC20MockUpgraded = artifacts.require("ERC20MockUpgraded");
const ProtectedTransparentProxy = artifacts.require("ProtectedTransparentProxy");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");
const SphereXCalleeMock = artifacts.require("SphereXCalleeMock");

ContractsRegistry.numberFormat = "BigNumber";

ERC20Mock.numberFormat = "BigNumber";

describe("ContractsRegistry", () => {
  let OWNER;
  let SECOND;

  let contractsRegistry;

  let sphereXEngine;
  let sphereXCallee;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    contractsRegistry = await ContractsRegistry.new();
    sphereXEngine = await SphereXEngineMock.new();
    sphereXCallee = await SphereXCalleeMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("proxy functionality", () => {
    let implementation;
    let proxyRegistry;

    beforeEach(async () => {
      implementation = await ContractsRegistry.new();

      proxyRegistry = await ContractsRegistry.at((await ERC1967Proxy.new(implementation.address, "0x")).address);

      await proxyRegistry.__OwnableContractsRegistry_init();
    });

    it("should upgrade if all conditions are met", async () => {
      await truffleAssert.passes(proxyRegistry.upgradeTo(implementation.address), "upgrades if caller is the owner");
    });

    it("should not upgrade if caller is not the owner", async () => {
      await truffleAssert.reverts(
        proxyRegistry.upgradeTo(implementation.address, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("contract management", () => {
    it("should add and remove the contract", async () => {
      const USD = await ERC20Mock.new("USD", "USD", 18);

      await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);

      assert.equal(await contractsRegistry.getUSDContract(), USD.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      await truffleAssert.reverts(contractsRegistry.getUSDContract(), "ContractsRegistry: this mapping doesn't exist");
      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));
    });

    it("should add and remove the proxy contract", async () => {
      const _USD = await ERC20Mock.new("USD", "USD", 18);

      await contractsRegistry.addProxyContract(await contractsRegistry.USD_NAME(), _USD.address);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));
    });

    it("should just add and remove the proxy contract", async () => {
      const _USD = await ERC20Mock.new("USD", "USD", 18);

      await contractsRegistry.addProxyContract(await contractsRegistry.USD_NAME(), _USD.address);

      const USD = await contractsRegistry.getUSDContract();

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      await contractsRegistry.justAddProxyContract(await contractsRegistry.USD_NAME(), USD);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));
    });
  });

  describe("contract upgrades", () => {
    let _USD;
    let _USD2;

    let USD;

    beforeEach("setup", async () => {
      _USD = await ERC20Mock.new("USD", "USD", 18);
      _USD2 = await ERC20MockUpgraded.new("USD", "USD", 18);

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
        ["42"]
      );

      await contractsRegistry.upgradeContractAndCall(await contractsRegistry.USD_NAME(), _USD2.address, data);

      assert.equal(toBN(await USD.importantVariable()).toFixed(), "42");
    });
  });

  describe("SphereX", () => {
    let sphereXCalleeProxy;
    let transparentProxy;
    let protectedMethodSelector;

    beforeEach(async () => {
      protectedMethodSelector = web3.eth.abi.encodeFunctionSignature("protectedMethod()");

      await contractsRegistry.addProxyContract(await contractsRegistry.USER_REGISTRY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.POOL_FACTORY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), sphereXCallee.address);
      await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), sphereXCallee.address);

      sphereXCalleeProxy = await SphereXCalleeMock.at(await contractsRegistry.getUserRegistryContract());
      transparentProxy = await ProtectedTransparentProxy.at(sphereXCalleeProxy.address);

      await impersonate(contractsRegistry.address);
    });

    it("should protect when sphereXEngine and selector are on", async () => {
      await contractsRegistry.setSphereXEngine(sphereXEngine.address);
      await transparentProxy.addProtectedFuncSigs([protectedMethodSelector], { from: contractsRegistry.address });

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());

      await sphereXEngine.toggleRevert();

      await truffleAssert.reverts(sphereXCalleeProxy.protectedMethod(), "SphereXEngineMock: malicious tx");
    });

    it("should not protect when selector is off", async () => {
      await contractsRegistry.setSphereXEngine(sphereXEngine.address);

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not protect when sphereXEngine is off", async () => {
      await contractsRegistry.setSphereXEngine(sphereXEngine.address);
      await contractsRegistry.setSphereXEngine(ZERO_ADDR);
      await transparentProxy.addProtectedFuncSigs([protectedMethodSelector], { from: contractsRegistry.address });

      await sphereXEngine.toggleRevert();

      await truffleAssert.passes(sphereXCalleeProxy.protectedMethod());
    });

    it("should not set engine if not an operator", async () => {
      await truffleAssert.reverts(
        contractsRegistry.setSphereXEngine(sphereXEngine.address, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });
});
