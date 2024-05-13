const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const NetworkProperties = artifacts.require("BSCProperties");
const ETHProperties = artifacts.require("ETHProperties");
const DevProperties = artifacts.require("DevProperties");
const NetworkPropertiesMock = artifacts.require("NetworkPropertiesMock");
const WethMock = artifacts.require("WETHMock");

NetworkProperties.numberFormat = "BigNumber";
ETHProperties.numberFormat = "BigNumber";
WethMock.numberFormat = "BigNumber";

describe("Network Properties", () => {
  let OWNER;
  let networkProperties;
  let weth;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    let implementation = await NetworkProperties.new();
    networkProperties = await NetworkProperties.at((await ERC1967Proxy.new(implementation.address, "0x")).address);
    weth = await WethMock.new();
    await networkProperties.__NetworkProperties_init(weth.address);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("upgradeability", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        networkProperties.__NetworkProperties_init(weth.address),
        "Initializable: contract is already initialized",
      );
    });

    it("could not upgrade if not owner", async () => {
      await truffleAssert.reverts(
        networkProperties.upgradeTo(networkProperties.address, { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );
    });

    it("could upgrade if owner", async () => {
      let networkPropertiesMock = await NetworkPropertiesMock.new();

      await networkProperties.upgradeTo(networkPropertiesMock.address);

      networkPropertiesMock = await NetworkPropertiesMock.at(networkProperties.address);
      await networkPropertiesMock.changeWeth(weth.address);
    });
  });

  describe("eth total supply", () => {
    it("bsc network", async () => {
      assert.equal((await networkProperties.getNativeSupply()).toFixed(), wei("150000000"));
    });

    it("eth network", async () => {
      let ethProperties = await ETHProperties.new();
      await networkProperties.upgradeTo(ethProperties.address);

      assert.equal((await networkProperties.getNativeSupply()).toFixed(), wei("120000000"));
      assert.equal(await networkProperties.weth(), weth.address);
    });

    it("any dev network", async () => {
      let devProperties = await DevProperties.new();
      await networkProperties.upgradeTo(devProperties.address);

      assert.equal((await networkProperties.getNativeSupply()).toFixed(), wei("100"));
    });
  });
});
