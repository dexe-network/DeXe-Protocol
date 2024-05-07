const { getBytesNetworkPropertiesInit } = require("./config/utils.js");
const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");
const NetworkProperties = artifacts.require("BSCProperties");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

const PoolFactory = artifacts.require("PoolFactory");
const GovPool = artifacts.require("GovPool");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");

module.exports = async (deployer) => {
  let networkProperties = await deployer.deploy(NetworkProperties);

  await deployer.deploy(ERC1967Proxy, [networkProperties.address, getBytesNetworkPropertiesInit(config.tokens.WBNB)], {
    name: "proxy",
  });

  networkProperties = await deployer.deployed(NetworkProperties, "proxy");

  const owners = config.owners;
  owners.push("0xB562127efDC97B417B3116efF2C23A29857C0F0B");

  await networkProperties.addOwners(owners);
  await networkProperties.renounceOwnership();

  await deployer.deploy(ContractsRegistry); //
  await deployer.deploy(PoolFactory); //
  await deployer.deploy(GovPool); //
  await deployer.deploy(GovUserKeeper); //
  await deployer.deploy(DistributionProposal); //
  await deployer.deploy(TokenSaleProposal); //
};
