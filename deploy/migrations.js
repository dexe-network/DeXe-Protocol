const { assert } = require("chai");
const deploy = require("./deployer");

const Instance = artifacts.require("HelloWorld");

const main = async () => {
  const contract = await deploy("HelloWorld", "123");
  const sanity = await Instance.deployed();

  assert.equal(contract.address, sanity.address);
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
