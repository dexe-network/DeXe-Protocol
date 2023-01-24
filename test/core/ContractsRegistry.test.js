const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC20MockUpgraded = artifacts.require("ERC20MockUpgraded");

ContractsRegistry.numberFormat = "BigNumber";

ERC20Mock.numberFormat = "BigNumber";

describe("ContractsRegistry", () => {
  let OWNER;

  let contractsRegistry;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);

    contractsRegistry = await ContractsRegistry.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("contract management", () => {
    it("should add and remove the contract", async () => {
      const USD = await ERC20Mock.new("USD", "USD", 18);

      await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);

      assert.equal(await contractsRegistry.getUSDContract(), USD.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.USD_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.USD_NAME());

      await truffleAssert.reverts(contractsRegistry.getUSDContract(), "ContractsRegistry: This mapping doesn't exist");
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

      await contractsRegistry.justAddProxyContract(await contractsRegistry.USD_NAME(), _USD.address);

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
});
