const { Reporter } = require("@solarity/hardhat-migrate");
const config = require("./config/utils.js").getConfig();

const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const DexeMultiplier = artifacts.require("DexeERC721Multiplier.sol");

module.exports = async (deployer) => {
  let dexeMultiplier = await deployer.deploy(DexeMiltiplier);
  await deployer.deploy(ERC1967Proxy, [dexeMultiplier.address, "0x"], { name: "multiplierProxy" });

  dexeMultiplier = await deployer.deployed(DexeMiltiplier, "multiplierProxy");
  await dexeMultiplier.__ERC721Multiplier_init("DeXe Multiplier NFT", "DEXE MULTNFT");
  await dexeMultiplier.transferOwnership(deployer.dexeDaoAddress);

  Reporter.reportContracts(["DEXE MULTIPLIER NFT", dexeMultiplier.address]);
};
