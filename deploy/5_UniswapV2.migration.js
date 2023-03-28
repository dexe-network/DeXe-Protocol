const config = require("./config/config.json");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), config.uniswapV2.router),
    "Add UniswapV2Router"
  );

  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), config.uniswapV2.factory),
    "Add UniswapV2Factory"
  );
};
