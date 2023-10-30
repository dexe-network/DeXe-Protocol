const config = require("./config/config.json");

const { accounts } = require("../scripts/utils/utils");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const SphereXEngine = artifacts.require("SphereXEngine");

module.exports = async (deployer) => {
  const DEPLOYER = await accounts(0);

  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const sphereXEngine = await deployer.deploy(SphereXEngine, [0, DEPLOYER, config.spherex.operator]);
  const poolSphereXEngine = await deployer.deploy(SphereXEngine, [0, DEPLOYER, config.spherex.operator]);

  await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), sphereXEngine.address);
  await contractsRegistry.addContract(await contractsRegistry.POOL_SPHEREX_ENGINE_NAME(), poolSphereXEngine.address);

  await sphereXEngine.grantRole(await sphereXEngine.SENDER_ADDER_ROLE(), contractsRegistry.address);
};
