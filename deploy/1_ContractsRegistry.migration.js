const { getBytesContractsRegistryInit } = require("./config/utils.js");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deploy(ContractsRegistry);

  await deployer.deploy(ERC1967Proxy, [contractsRegistry.address, getBytesContractsRegistryInit()], { name: "proxy" });

  // Empty transactions to account for nonces on BSC mainnet
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "nonce0");
};
