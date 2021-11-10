const Deployer = require("@truffle/deployer");
const Reporter = require("@truffle/reporters").migrationsV5;

let reporter;
let deployer;

const start = async (confirmations = 0) => {
  try {
    reporter = new Reporter();

    deployer = new Deployer({
      logger: console,
      confirmations: confirmations,
      provider: web3.currentProvider,
      networks: {},
      network: "",
      network_id: await web3.eth.getChainId(),
    });

    reporter.confirmations = confirmations;
    reporter.setMigration({ dryRun: false });
    reporter.setDeployer(deployer);

    reporter.preMigrate({
      isFirst: true,
      file: "Contracts:",
      network: await web3.eth.net.getNetworkType(),
      networkId: await web3.eth.getChainId(),
      blockLimit: (await web3.eth.getBlock("latest")).gasLimit,
    });

    reporter.listen();

    deployer.start();
  } catch (e) {
    console.log(e);
  }
};

const deploy = async (name, ...args) => {
  try {
    const Instance = artifacts.require(name);
    const instance = await deployer.deploy(Instance, ...args);

    return instance;
  } catch (e) {
    console.log(e);
  }
};

const finish = async () => {
  try {
    deployer.finish();

    reporter.postMigrate({
      isLast: true,
    });
  } catch (e) {
    console.log(e);
  }
};

module.exports = {
  start,
  deploy,
  finish,
};
