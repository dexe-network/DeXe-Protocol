const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");
const NetworkProperties = artifacts.require("BSCProperties");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

const PoolFactory = artifacts.require("PoolFactory");
const PoolRegistry = artifacts.require("PoolRegistry");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");

const contractsRegistryAddress = "0x46B46629B674b4C0b48B111DEeB0eAfd9F84A1c0";

const contractsRegistryImplementationAddress = "0x181c9cc020aFc98d1D1d50dfE281c586A39AfbBB";
const poolFactoryImplementationAddress = "0xFe97B4fA71B73C8e75Bb13bE34B1E4d0cEe8fB1A";
const govPoolImplementationAddress = "0xBaDE4D8d8b3D93F7904c305964aBD098617553a2";
const userKeeperImplementationAddress = "0xF88542C0DfEc822dc4F788D8b81fA50E79B0D1c1";
const distributionImplementationAddress = "0xe6d2D0E65970c4362Faeb4A832393De1F6256E67";
const tokenSaleImplementationAddress = "0x0CD3B582afDce232De54F87bb832d1e261aC0191";

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at(contractsRegistryAddress);
  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  await contractsRegistry.upgradeTo(contractsRegistryImplementationAddress);

  await contractsRegistry.addContracts(
    [await contractsRegistry.WETH_NAME(), await contractsRegistry.NETWORK_PROPERTIES_NAME()],
    [config.tokens.WBNB, config.NETWORK_PROPERTIES],
  );

  await contractsRegistry.upgradeContract(
    await contractsRegistry.POOL_FACTORY_NAME(),
    poolFactoryImplementationAddress,
  );

  await poolRegistry.setNewImplementations(
    [
      await poolRegistry.GOV_POOL_NAME(),
      await poolRegistry.USER_KEEPER_NAME(),
      await poolRegistry.DISTRIBUTION_PROPOSAL_NAME(),
      await poolRegistry.TOKEN_SALE_PROPOSAL_NAME(),
    ],
    [
      govPoolImplementationAddress,
      userKeeperImplementationAddress,
      distributionImplementationAddress,
      tokenSaleImplementationAddress,
    ],
  );

  const govPoolNumber = await poolRegistry.countPools(await poolRegistry.GOV_POOL_NAME());

  let i = 0;
  while (i < govPoolNumber) {
    await poolRegistry.injectDependenciesToExistingPools(await poolRegistry.GOV_POOL_NAME(), i, 100);
    i += 100;
  }
};
