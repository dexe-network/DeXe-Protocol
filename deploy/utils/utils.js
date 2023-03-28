const dotenv = require("dotenv");
dotenv.config();

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolFactory = artifacts.require("PoolFactory");

function getDexeDaoName() {
  return process.env.DEXE_DAO_NAME !== undefined ? process.env.DEXE_DAO_NAME : "DEXE DAO";
}

async function getDexeDaoAddress() {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);
  const poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());

  const deployerAddress = await contractsRegistry.owner();

  const govAddresses = await poolFactory.predictGovAddresses(deployerAddress, getDexeDaoName());

  return govAddresses[0];
}

module.exports = { getDexeDaoName, getDexeDaoAddress };
