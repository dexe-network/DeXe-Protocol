const TruffleDeployer = require("@truffle/deployer");
const TruffleReporter = require("@truffle/reporters").migrationsV5;

class Deployer {
  async startMigration(confirmations = 0) {
    try {
      let chainId = await web3.eth.getChainId();
      let networkType = await web3.eth.net.getNetworkType();

      this.reporter = new TruffleReporter();
      this.deployer = new TruffleDeployer({
        logger: console,
        confirmations: confirmations,
        provider: web3.currentProvider,
        networks: { chainId: networkType },
        network: "",
        network_id: chainId,
      });

      this.reporter.confirmations = confirmations;
      this.reporter.setMigration({ dryRun: false });
      this.reporter.setDeployer(this.deployer);

      this.reporter.preMigrate({
        isFirst: true,
        file: "Contracts:",
        network: networkType,
        networkId: chainId,
        blockLimit: (await web3.eth.getBlock("latest")).gasLimit,
      });

      this.reporter.listen();
      this.deployer.start();
    } catch (e) {
      console.log(e);
    }
  }

  async link(Library, ...Contracts) {
    try {
      const library = await Library.deployed();

      Contracts.forEach(async (Contract) => await Contract.link(library));
    } catch (e) {
      console.log(e);
    }
  }

  async deploy(Instance, ...args) {
    try {
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
