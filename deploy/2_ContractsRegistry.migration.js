const { getBytesContractsRegistryInit } = require("./config/utils.js");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deploy(ContractsRegistry);

  await deployer.deploy(ERC1967Proxy, [contractsRegistry.address, getBytesContractsRegistryInit()], { name: "proxy" });
};
