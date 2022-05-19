const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");

const ERC721Power = artifacts.require("ERC721Power");
const ERC20Mock = artifacts.require("ERC20Mock");

const PRECISION = toBN(10).pow(25);

describe("ERC721Power", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let token;
  let nft;

  let startTime;
  let DEFAULT_AMOUNT = wei("10000");

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    startTime = await getCurrentBlockTime();
    nft = await ERC721Power.new("NFTMock", "NFTM", startTime + 1000);

    await token.mint(SECOND, DEFAULT_AMOUNT);
    await token.mint(THIRD, DEFAULT_AMOUNT);
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: SECOND });
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: THIRD });
  });

  function toPercent(num) {
    return PRECISION.times(num);
  }

  describe("setReductionPercent()", () => {
    it("should correctly set reduction percent", async () => {
      await setTime(startTime + 100);

      await nft.setReductionPercent(toPercent("1").toFixed());
      assert.equal(await nft.reductionPercent(), toPercent("1").toFixed());
    });

    it("should revert if try to set reduction percent to zero", async () => {
      await setTime(startTime + 200);

      await truffleAssert.reverts(nft.setReductionPercent("0"), "NftToken: reduction percent can't be a zero");
    });

    it("should revert if try to set reduction percent to 100%", async () => {
      await setTime(startTime + 300);

      await truffleAssert.reverts(
        nft.setReductionPercent(toPercent("100")),
        "NftToken: reduction percent can't be a 100%"
      );
    });

    it("should revert if try to set reduction percent after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setReductionPercent("1"), "NftToken: power calculation already begun");
    });
  });

  describe("setMaxPower()", async () => {
    it("should correctly set max power", async () => {
      await setTime(startTime + 100);

      await nft.setMaxPower("1");
      assert.equal(await nft.maxPower(), "1");
    });

    it("should revert if try to set max power to zero", async () => {
      await setTime(startTime + 200);

      await truffleAssert.reverts(nft.setMaxPower("0"), "NftToken: max power can't be zero (1)");
    });

    it("should revert if try to set max power after calculation start", async () => {
      await setTime(startTime + 999);

      await truffleAssert.reverts(nft.setMaxPower("1"), "NftToken: power calculation already begun");
    });
  });

  describe("setNftMaxPower()", async () => {
    it("should correctly set max power", async () => {
      await setTime(startTime + 100);

      await nft.setNftMaxPower("10", "1");
      assert.equal((await nft.nftInfos("1")).maxPower, "10");
    });

    it("should revert if try to set max power to zero", async () => {
      await setTime(startTime + 200);

      await truffleAssert.reverts(nft.setNftMaxPower("0", "1"), "NftToken: max power can't be zero (2)");
    });

    it("should revert if try to set max power for nft after calculation start", async () => {
      await setTime(startTime + 999);

      await truffleAssert.reverts(nft.setNftMaxPower("10", "1"), "NftToken: power calculation already begun");
    });
  });

  describe("setRequiredCollateral()", () => {
    it("should correctly set required collateral amount", async () => {
      await setTime(startTime + 100);

      await nft.setRequiredCollateral("1");
      assert.equal(await nft.requiredCollateral(), "1");
    });

    it("should revert if try to set required collateral amount to zero", async () => {
      await setTime(startTime + 998);

      await truffleAssert.reverts(
        nft.setRequiredCollateral("0"),
        "NftToken: required collateral amount can't be zero (1)"
      );
    });

    it("should revert if try to set required collateral amount after calculation start", async () => {
      await setTime(startTime + 999);

      await truffleAssert.reverts(nft.setRequiredCollateral("0"), "NftToken: power calculation already begun");
    });
  });

  describe("setNftRequiredCollateral()", async () => {
    it("should correctly set required collateral amount for nft", async () => {
      await setTime(startTime + 100);

      await nft.setNftRequiredCollateral("100", "1");
      assert.equal((await nft.nftInfos("1")).requiredCollateral, "100");
    });

    it("should revert if try to set required collateral amount for nft to zero", async () => {
      await setTime(startTime + 998);

      await truffleAssert.reverts(
        nft.setNftRequiredCollateral("0", "1"),
        "NftToken: required collateral amount can't be zero (2)"
      );
    });

    it("should revert if try to set required collateral amount after calculation start", async () => {
      await setTime(startTime + 999);

      await truffleAssert.reverts(nft.setNftRequiredCollateral("10", "1"), "NftToken: power calculation already begun");
    });
  });

  describe("safeMint()", async () => {
    it("should correctly mint mock20s and increase total power", async () => {
      await setTime(startTime + 100);
      await nft.setMaxPower("100");
      await nft.setRequiredCollateral("100");

      assert.equal(await nft.totalSupply(), "0");

      await nft.safeMint(SECOND, 1);
      assert.equal(await nft.totalSupply(), "1");
      assert.equal(await nft.ownerOf("1"), SECOND);
    });

    it("should revert if try to mint mock20s when max power is zero", async () => {
      await setTime(startTime + 998);
      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "NftToken: max power for nft isn't set");
    });

    it("should revert if try to mint mock20s when max power is zero", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "NftToken: power calculation already begun");
    });
  });

  describe("setBaseUri()", async () => {
    it("should correctly set base uri", async () => {
      await nft.setBaseUri("placeholder");
      assert.equal(await nft.baseURI(), "placeholder");
    });
  });

  describe("recalculateNftPower()", async () => {
    beforeEach(async () => {
      await nft.setCollateralToken(token.address);

      await nft.setRequiredCollateral("540");
      await nft.setMaxPower(toPercent("90"));

      await nft.safeMint(SECOND, 1);
      await nft.safeMint(SECOND, 2);
      await nft.safeMint(THIRD, 3);

      await nft.setReductionPercent(toPercent("0.01"));
    });

    it("should correctly recalculate nft power", async () => {
      await setTime(startTime + 900);

      await nft.recalculateNftPower("1");
      let infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate, "0");
      assert.equal(infos.currentPower, "0");
      assert.equal(infos.currentCollateral, "0");

      await setTime(startTime + 1000);
      await nft.recalculateNftPower("1");
      infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate.toString(), startTime + 1001);
      assert.equal(toBN(infos.currentPower).toString(), toPercent("89.991").toString());
      assert.equal(infos.currentCollateral.toString(), "0");
    });
  });

  describe("addCollateral()", async () => {
    beforeEach(async () => {
      await nft.setCollateralToken(token.address);

      await nft.setRequiredCollateral(wei("500"));
      await nft.setMaxPower(toPercent("110"));

      await nft.safeMint(SECOND, "1");

      await nft.setReductionPercent(toPercent("0.01"));
    });

    it("should add collateral", async () => {
      await setTime(startTime + 900);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      assert.equal(await token.balanceOf(nft.address), wei("400"));
      assert.equal((await nft.nftInfos("1")).currentCollateral.toString(), wei("400"));
    });

    it("should recalculate nft power", async () => {
      await setTime(startTime + 1000);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });
      infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate.toString(), startTime + 1001);
      assert.equal(infos.currentCollateral.toString(), wei("200"));
    });

    it("should revert if try to add collateral from not a nft pwner", async () => {
      await truffleAssert.reverts(
        nft.addCollateral("1", "1", { from: THIRD }),
        "NftToken: sender isn't an nft owner (1)"
      );
    });
  });

  describe("removeCollateral()", async () => {
    beforeEach(async () => {
      await nft.setCollateralToken(token.address);

      await nft.setRequiredCollateral(wei("500"));
      await nft.setMaxPower(toPercent("110"));

      await nft.safeMint(SECOND, 1);

      await nft.setReductionPercent(toPercent("0.01"));
    });

    it("should remove collateral", async () => {
      await setTime(startTime + 900);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await nft.removeCollateral(wei("150"), "1", { from: SECOND });

      assert.equal((await token.balanceOf(nft.address)).toString(), wei("50"));
      assert.equal(toBN(await token.balanceOf(SECOND)).toString(), toBN(DEFAULT_AMOUNT).minus(wei("50")).toString());
    });

    it("should recalculate nft power", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await setTime(startTime + 1000);
      await nft.removeCollateral(wei("100"), "1", { from: SECOND });
      infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate.toString(), startTime + 1001);
      assert.equal(infos.currentCollateral.toString(), wei("100"));
    });

    it("should revert if try to remove collateral from not a nft owner", async () => {
      await truffleAssert.reverts(nft.removeCollateral("1", "1"), "NftToken: sender isn't an nft owner (2)");
    });
  });

  describe("withdrawStuckERC20()", async () => {
    beforeEach(async () => {
      await nft.setCollateralToken(token.address);

      await nft.setRequiredCollateral(wei("500"));
      await nft.setMaxPower(toPercent("110"));

      await nft.safeMint(SECOND, 1);

      await nft.setReductionPercent(toPercent("0.01"));
    });

    it("should withdraw another erc20", async () => {
      const anotherERC20 = await ERC20Mock.new("Mock", "Mock", 18);

      await anotherERC20.mint(nft.address, wei("300"));
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await nft.withdrawStuckERC20(anotherERC20.address, SECOND);

      assert.equal((await anotherERC20.balanceOf(SECOND)).toString(), wei("300"));
    });

    it("should withdraw collateral token", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });
      await token.mint(nft.address, wei("500"));

      await nft.withdrawStuckERC20(token.address, SECOND);
      assert.equal(await token.balanceOf(nft.address), wei("200"));
    });

    it("should revert when try to withdraw with zero bakance", async () => {
      const anotherERC20 = await ERC20Mock.new("Mock", "Mock", 18);

      await truffleAssert.reverts(
        nft.withdrawStuckERC20(anotherERC20.address, SECOND),
        "NftToken: nothing to withdraw"
      );
    });
  });
});
