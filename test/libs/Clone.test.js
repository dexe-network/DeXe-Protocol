const { assert } = require("chai");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const CloneMock = artifacts.require("CloneMock");
const ERC20Gov = artifacts.require("ERC20Gov");

describe("Clone library", () => {
  let cloneFactory, token;

  const reverter = new Reverter();

  before("setup", async () => {
    cloneFactory = await CloneMock.new();
    token = await ERC20Gov.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("cloning", () => {
    it("could clone1", async () => {
      const tokenBytecode = await hre.network.provider.request({
        method: "eth_getCode",
        params: [token.address],
      });

      const clonedToken = await cloneFactory.clone.call(token.address);
      await cloneFactory.clone(token.address);

      const clonedBytecode = await hre.network.provider.request({
        method: "eth_getCode",
        params: [clonedToken],
      });

      assert.equal(tokenBytecode, clonedBytecode);
    });

    it("could clone2", async () => {
      const seed = "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

      const tokenBytecode = await hre.network.provider.request({
        method: "eth_getCode",
        params: [token.address],
      });

      await cloneFactory.clone2(token.address, seed);
      const clonedToken = await cloneFactory.predictClonedAddress(token.address, seed);

      const clonedBytecode = await hre.network.provider.request({
        method: "eth_getCode",
        params: [clonedToken],
      });

      assert.equal(tokenBytecode, clonedBytecode);
    });
  });
});
