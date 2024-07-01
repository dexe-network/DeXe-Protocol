const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");
const TokenAllocator = artifacts.require("TokenAllocator");
const NetworkProperties = artifacts.require(config.NETWORK_PROPERTIES_CONTRACT_NAME);

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");
  const networkProperties = await deployer.deployed(NetworkProperties, "NetworkPropertiesContract");
  const tokenAllocator = await deployer.deployed(TokenAllocator, "TokenAllocatorContract");

  await contractsRegistry.addContracts(
    [
      await contractsRegistry.NETWORK_PROPERTIES_NAME(),
      await contractsRegistry.WETH_NAME(),
      await contractsRegistry.TOKEN_ALLOCATOR_NAME(),
    ],
    [networkProperties.address, config.tokens.WBNB, tokenAllocator.address],
  );
};
