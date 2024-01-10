const { Reporter } = require("@solarity/hardhat-migrate");

const GovPool = artifacts.require("GovPool");
const PoolRegistry = artifacts.require("PoolRegistry");

const poolRegistryAddress = "0xFEB26AAB75638440B3CEFe8B10de6118972f9C6B";

// const govPoolVoteAddress = "0xB6909a416C25a2700aD8F0553B9d9fd9269ca70A";
const govPoolViewAddress = "0x8D3348eB45901F4290632D8C95dF4D2bAbc18829";
const govPoolUnlockAddress = "0x69274Eb01eA72E66bF8C7678295cfeAB3F626A0B";
const govPoolRewardsAddress = "0x9E5569A9BF1884bC45992eD95b44F6100eA02ee4";
const govPoolOffchainAddress = "0xD509804DF0Cd8868e373B61E1544b608e406e25a";
const govPoolMicropoolAddress = "0x8d421BE69101Df10762C0A2E7D511D71D799895a";
const govPoolExecuteAddress = "0x0484694cE778BF626bB03f93560C069C23253dF9";
const govPoolCreditAddress = "0x33dcd3927203eCb1e2c3e7f50050aDb2BeDB7e5f";
const govPoolCreateAddress = "0x7c658E2aF73439409698a29dF2ccf6f96365cc56";

module.exports = async (deployer) => {
  const govPool = await deployer.deploy(GovPool, {
    libraries: {
      GovPoolView: govPoolViewAddress,
      GovPoolUnlock: govPoolUnlockAddress,
      GovPoolRewards: govPoolRewardsAddress,
      GovPoolOffchain: govPoolOffchainAddress,
      GovPoolMicropool: govPoolMicropoolAddress,
      GovPoolExecute: govPoolExecuteAddress,
      GovPoolCredit: govPoolCreditAddress,
      GovPoolCreate: govPoolCreateAddress,
    },
  });

  Reporter.reportContracts(["implementation", govPool.address]);

  const poolRegistry = await PoolRegistry.at(poolRegistryAddress);

  const govPoolName = await poolRegistry.GOV_POOL_NAME();

  await poolRegistry.setNewImplementations([govPoolName], [govPool.address]);
};
