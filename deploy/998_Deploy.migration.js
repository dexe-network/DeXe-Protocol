const { getBytesNetworkPropertiesInit } = require("./config/utils.js");
const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");
const NetworkProperties = artifacts.require("BSCProperties");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

const PoolFactory = artifacts.require("PoolFactory");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");

module.exports = async (deployer) => {
  // const contractsRegistry = await ContractsRegistry.at("0x46B46629B674b4C0b48B111DEeB0eAfd9F84A1c0");

  let networkProperties = await deployer.deploy(NetworkProperties);

  await deployer.deploy(ERC1967Proxy, [networkProperties.address, getBytesNetworkPropertiesInit(config.tokens.WBNB)], {
    name: "proxy",
  });

  networkProperties = await deployer.deployed(NetworkProperties, "proxy");

  const owners = config.owners;
  owners.push("0xB562127efDC97B417B3116efF2C23A29857C0F0B");

  await networkProperties.addOwners(owners);
  await networkProperties.renounceOwnership();

  await deployer.deploy(ContractsRegistry); // 0x34E1b947C6f46dC739304A9558E6C22377ABE100 0x3CB894f34C49a84b95B499051d9C0f48Fb2b8fCF
  await deployer.deploy(PoolFactory); // 0x9e87b4FeC2C17Bc823e48aEF01ee9aD12b589baf
  await deployer.deploy(GovPool); // 0xD39009d7ED9537d10cDbE3991C6d019C4847a6B7
  await deployer.deploy(GovUserKeeper); // 0x8DAa2190f7675Cb0649660890c0567BD74Ff90B0
  await deployer.deploy(TokenSaleProposal); // 0xBa50B4A19D423443E77C0a157A50D315d5Ef646A
};
