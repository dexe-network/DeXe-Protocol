const { Reporter } = require("@solarity/hardhat-migrate");

const config = require("./config/utils.js").getConfig();

const { accounts } = require("../scripts/utils/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolFactory = artifacts.require("PoolFactory");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolFactory = await deployer.deployed(PoolFactory, await contractsRegistry.getPoolFactoryContract());

  const predictedGovAddresses = await poolFactory.predictGovAddresses(await accounts(0), config.DEXE_DAO_NAME);
  deployer.dexeDaoAddress = predictedGovAddresses.govPool;

  await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), deployer.dexeDaoAddress);

  const PARAMETERS = config.POOL_PARAMETERS;

  PARAMETERS.settingsParams.proposalSettings.push(config.DP_SETTINGS);
  PARAMETERS.settingsParams.additionalProposalExecutors.push(predictedGovAddresses.distributionProposal);

  PARAMETERS.settingsParams.proposalSettings.push(config.TOKENSALE_SETTINGS);
  PARAMETERS.settingsParams.additionalProposalExecutors.push(predictedGovAddresses.govTokenSale);

  await poolFactory.deployGovPool(PARAMETERS);

  Reporter.reportContracts(["DEXE DAO", deployer.dexeDaoAddress]);
};
