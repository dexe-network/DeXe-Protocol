const TruffleDeployer = require("@truffle/deployer");
const TruffleReporter = require("@truffle/reporters").migrationsV5;

class Deployer {
  async startMigration(confirmations = 0) {
    try {
      this.reporter = new TruffleReporter();
      this.deployer = new TruffleDeployer({
        logger: console,
        confirmations: confirmations,
        provider: web3.currentProvider,
        networks: {},
        network: "",
        network_id: await web3.eth.getChainId(),
      });

      this.reporter.confirmations = confirmations;
      this.reporter.setMigration({ dryRun: false });
      this.reporter.setDeployer(this.deployer);

      this.reporter.preMigrate({
        isFirst: true,
        file: "Contracts:",
        network: await web3.eth.net.getNetworkType(),
        networkId: await web3.eth.getChainId(),
        blockLimit: (await web3.eth.getBlock("latest")).gasLimit,
      });

      this.reporter.listen();
      this.deployer.start();
    } catch (e) {
      console.log(e);
    }
  }

  async deploy(name, ...args) {
    try {
      const Instance = artifacts.require(name);
      const instance = await this.deployer.deploy(Instance, ...args);

      Instance.setAsDeployed(instance);

      return instance;
    } catch (e) {
      console.log(e);
    }
  }

  async finishMigration() {
    try {
      this.deployer.finish();
      this.reporter.postMigrate({
        isLast: true,
      });
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = Deployer;
