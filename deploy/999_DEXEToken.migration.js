const DEXE = artifacts.require("DEXE");

const config = require("./config/config.json");

module.exports = async (deployer, logger) => {
  const dexeToken = await deployer.deploy(DEXE, "DEXE", "DEXE");

  logger.logTransaction(await dexeToken.addOwners(config.dexeTokenOwners), "Adding DEXE token owners");
};
