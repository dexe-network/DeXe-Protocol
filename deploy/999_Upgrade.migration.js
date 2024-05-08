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

const contractsRegistryImplementationAddress = "0x3B4a1CD362ba5dCEd8C06FD723f2487FE9AE6f63";
const poolFactoryImplementationAddress = "0x752eEbb4b0a40DB2F51de1f7B27Ac1a8921A2721";
const govPoolImplementationAddress = "0xc4aE9E07e4D78fC588D32Ca7736C9Ab8D8d6ef7A";
const userKeeperImplementationAddress = "0x372Cb8375F63444cD06F98f8f0b6073Be464D43C";
const distributionImplementationAddress = "0xa104915E5729681075E308F8bB133213C839fe93";
const tokenSaleImplementationAddress = "0xd6FF3566ddF1Ef2431e2f61Df1545C2AD570a69f";

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
