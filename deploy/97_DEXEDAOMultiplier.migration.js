const { Reporter } = require("@solarity/hardhat-migrate");

const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const DexeMultiplier = artifacts.require("DexeERC721Multiplier");

module.exports = async (deployer) => {
  // Empty transactions to account for nonces on BSC mainnet
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "nonce0");
  await deployer.sendNative("0x0000000000000000000000000000000000000000", 0, "nonce1");

  let dexeMultiplier = await deployer.deploy(DexeMultiplier);
  await deployer.deploy(ERC1967Proxy, [dexeMultiplier.address, "0x"], { name: "multiplierProxy" });

  dexeMultiplier = await deployer.deployed(DexeMultiplier, "multiplierProxy");

  await dexeMultiplier.__ERC721Multiplier_init("DeXe Multiplier NFT", "DEXE MULTNFT");
  await dexeMultiplier.transferOwnership(deployer.dexeDaoAddress);

  Reporter.reportContracts(["DEXE MULTIPLIER NFT", dexeMultiplier.address]);
};
