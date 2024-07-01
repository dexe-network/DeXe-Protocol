const { getBytesNetworkPropertiesInit, getBytesTokenAllocatorInit } = require("./config/utils.js");
const { accounts } = require("../scripts/utils/utils");
const config = require("./config/utils.js").getConfig();

const TokenAllocator = artifacts.require("TokenAllocator");
const NetworkProperties = artifacts.require(config.NETWORK_PROPERTIES_CONTRACT_NAME);
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

module.exports = async (deployer) => {
  await deployer.setSigner(await accounts(1));

  const networkProperties = await deployer.deploy(NetworkProperties);
  const tokenAllocator = await deployer.deploy(TokenAllocator);

  await deployer.deploy(ERC1967Proxy, [networkProperties.address, getBytesNetworkPropertiesInit(config.tokens.WBNB)], {
    name: "NetworkPropertiesContract",
  });
  await deployer.deploy(ERC1967Proxy, [tokenAllocator.address, getBytesTokenAllocatorInit()], {
    name: "TokenAllocatorContract",
  });

  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce0");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce1");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce2");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce3");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce4");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce5");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "auxiliaryNonce6");

  await deployer.setSigner(await accounts(0));
};
