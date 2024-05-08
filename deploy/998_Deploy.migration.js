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

  await deployer.deploy(ContractsRegistry); // 0x3B4a1CD362ba5dCEd8C06FD723f2487FE9AE6f63
  await deployer.deploy(PoolFactory); // 0x752eEbb4b0a40DB2F51de1f7B27Ac1a8921A2721
  await deployer.deploy(GovPool); // 0xc4aE9E07e4D78fC588D32Ca7736C9Ab8D8d6ef7A
  await deployer.deploy(GovUserKeeper); // 0x372Cb8375F63444cD06F98f8f0b6073Be464D43C
  await deployer.deploy(DistributionProposal); // 0xa104915E5729681075E308F8bB133213C839fe93
  await deployer.deploy(TokenSaleProposal); // 0xd6FF3566ddF1Ef2431e2f61Df1545C2AD570a69f
};
