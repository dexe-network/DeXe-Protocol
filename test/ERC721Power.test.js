const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/block-helper");
const { PRECISION, ZERO_ADDR } = require("../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");

const ERC721Power = artifacts.require("ERC721Power");
const ERC20Mock = artifacts.require("ERC20Mock");

ERC721Power.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

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
    startTime = await getCurrentBlockTime();

    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721Power.new("NFTMock", "NFTM", startTime + 1000);

    await token.mint(SECOND, DEFAULT_AMOUNT);
    await token.mint(THIRD, DEFAULT_AMOUNT);
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: SECOND });
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: THIRD });
  });

  function toPercent(num) {
    return PRECISION.times(num);
  }

  describe("access", () => {
    it("only owner should call these functions", async () => {
      await truffleAssert.reverts(
        nft.setReductionPercent(toPercent("1").toFixed(), { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(nft.setMaxPower("1", { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(nft.setNftMaxPower(1, 1, { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(
        nft.setCollateralToken(token.address, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(nft.setRequiredCollateral(1, { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(
        nft.setNftRequiredCollateral(1, 1, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(nft.safeMint(OWNER, 1, { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(nft.setBaseUri("", { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(
        nft.withdrawStuckERC20(OWNER, OWNER, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("ERC165", () => {
    it("should support these interfaces", async () => {
      assert.isTrue(await nft.supportsInterface("0x51b1433e"));
      assert.isTrue(await nft.supportsInterface("0x780e9d63"));
    });
  });

  describe("setReductionPercent()", () => {
    it("should correctly set reduction percent", async () => {
      await setTime(startTime + 100);

      await nft.setReductionPercent(toPercent("1").toFixed());
      assert.equal((await nft.reductionPercent()).toFixed(), toPercent("1").toFixed());
    });

    it("should revert if try to set reduction percent to zero", async () => {
      await setTime(startTime + 200);
      await truffleAssert.reverts(nft.setReductionPercent("0"), "ERC721Power: reduction percent can't be a zero");
    });

    it("should revert if try to set reduction percent to 100%", async () => {
      await setTime(startTime + 300);
      await truffleAssert.reverts(
        nft.setReductionPercent(toPercent("100")),
        "ERC721Power: reduction percent can't be a 100%"
      );
    });

    it("should revert if try to set reduction percent after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setReductionPercent("1"), "ERC721Power: power calculation already begun");
    });
  });

  describe("setMaxPower()", () => {
    it("should correctly set max power", async () => {
      await setTime(startTime + 100);

      await nft.setMaxPower("1");

      assert.equal(await nft.maxPower(), "1");
      assert.equal(await nft.getMaxPowerForNft(1), "1");
    });

    it("should revert if try to set max power to zero", async () => {
      await setTime(startTime + 200);
      await truffleAssert.reverts(nft.setMaxPower("0"), "ERC721Power: max power can't be zero (1)");
    });

    it("should revert if try to set max power after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setMaxPower("1"), "ERC721Power: power calculation already begun");
    });
  });

  describe("setNftMaxPower()", () => {
    it("should correctly set max power", async () => {
      await setTime(startTime + 100);

      await nft.setNftMaxPower("10", "1");

      assert.equal((await nft.nftInfos("1")).maxPower, "10");
      assert.equal(await nft.getMaxPowerForNft(1), "10");
    });

    it("should revert if try to set max power to zero", async () => {
      await setTime(startTime + 200);
      await truffleAssert.reverts(nft.setNftMaxPower("0", "1"), "ERC721Power: max power can't be zero (2)");
    });

    it("should revert if try to set max power for nft after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setNftMaxPower("10", "1"), "ERC721Power: power calculation already begun");
    });
  });

  describe("setRequiredCollateral()", () => {
    it("should correctly set required collateral amount", async () => {
      await setTime(startTime + 100);

      await nft.setRequiredCollateral("1");

      assert.equal(await nft.requiredCollateral(), "1");
      assert.equal(await nft.getRequiredCollateralForNft(1), "1");
    });

    it("should revert if try to set required collateral amount to zero", async () => {
      await setTime(startTime + 998);

      await truffleAssert.reverts(
        nft.setRequiredCollateral("0"),
        "ERC721Power: required collateral amount can't be zero (1)"
      );
    });

    it("should revert if try to set required collateral amount after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setRequiredCollateral("0"), "ERC721Power: power calculation already begun");
    });
  });

  describe("setNftRequiredCollateral()", () => {
    it("should correctly set required collateral amount for nft", async () => {
      await setTime(startTime + 100);

      await nft.setNftRequiredCollateral("100", "1");

      assert.equal((await nft.nftInfos("1")).requiredCollateral, "100");
      assert.equal(await nft.getRequiredCollateralForNft(1), "100");
    });

    it("should revert if try to set required collateral amount for nft to zero", async () => {
      await setTime(startTime + 998);

      await truffleAssert.reverts(
        nft.setNftRequiredCollateral("0", "1"),
        "ERC721Power: required collateral amount can't be zero (2)"
      );
    });

    it("should revert if try to set required collateral amount after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(
        nft.setNftRequiredCollateral("10", "1"),
        "ERC721Power: power calculation already begun"
      );
    });
  });

  describe("setCollateralToken", () => {
    it("should revert if token is address 0", async () => {
      await truffleAssert.reverts(nft.setCollateralToken(ZERO_ADDR), "ERC721Power: zero address");
    });

    it("should revert if setting after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(
        nft.setCollateralToken(token.address),
        "ERC721Power: power calculation already begun"
      );
    });
  });

  describe("safeMint()", () => {
    it("should correctly mint mock20s and increase total power", async () => {
      await setTime(startTime + 100);
      await nft.setMaxPower("100");
      await nft.setRequiredCollateral("100");

      assert.equal(await nft.totalSupply(), "0");

      await nft.safeMint(SECOND, 1);
      assert.equal(await nft.totalSupply(), "1");
      assert.equal(await nft.ownerOf("1"), SECOND);
    });

    it("should revert when max power is zero", async () => {
      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "ERC721Power: max power for nft isn't set");
    });

    it("should revert when max collateral is zero", async () => {
      await nft.setMaxPower("540");

      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "ERC721Power: required collateral amount for nft isn't set");
    });

    it("should revert when calculation already begun", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "ERC721Power: power calculation already begun");
    });
  });

  describe("setBaseUri()", () => {
    beforeEach(async () => {
      await nft.setRequiredCollateral("540");
      await nft.setMaxPower(toPercent("90"));

      await nft.safeMint(SECOND, 1);
    });

    it("should correctly set base uri", async () => {
      await nft.setBaseUri("placeholder");

      assert.equal(await nft.tokenURI(1), "placeholder1");
      assert.equal(await nft.baseURI(), "placeholder");
    });
  });

  describe("recalculateNftPower()", () => {
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
      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(toBN(infos.currentPower).toFixed(), toPercent("89.991").toFixed());
      assert.equal(infos.currentCollateral.toFixed(), "0");
    });
  });

  describe("addCollateral()", () => {
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
      assert.equal((await nft.nftInfos("1")).currentCollateral.toFixed(), wei("400"));
    });

    it("should recalculate nft power", async () => {
      await setTime(startTime + 1000);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      const infos = await nft.nftInfos("1");

      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(infos.currentCollateral.toFixed(), wei("200"));
    });

    it("nft power should not decrease", async () => {
      await setTime(startTime + 1000);
      await nft.addCollateral(wei("500"), "1", { from: SECOND });

      let power = (await nft.nftInfos("1")).currentPower.toFixed();

      await setTime(startTime + 2000);

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), power);
    });

    it("should revert if try to add collateral from not a nft owner", async () => {
      await truffleAssert.reverts(
        nft.addCollateral("1", "1", { from: THIRD }),
        "ERC721Power: sender isn't an nft owner (1)"
      );
    });
  });

  describe("removeCollateral()", () => {
    beforeEach("setup", async () => {
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

      assert.equal((await token.balanceOf(nft.address)).toFixed(), wei("50"));
      assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), toBN(DEFAULT_AMOUNT).minus(wei("50")).toFixed());

      await nft.removeCollateral(wei("50"), "1", { from: SECOND });
      await truffleAssert.reverts(
        nft.removeCollateral(wei("1"), "1", { from: SECOND }),
        "ERC721Power: nothing to remove"
      );
    });

    it("should recalculate nft power", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await setTime(startTime + 1000);
      await nft.removeCollateral(wei("100"), "1", { from: SECOND });

      const infos = await nft.nftInfos("1");

      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(infos.currentPower.toFixed(), toPercent("109.989").toFixed());
      assert.equal(infos.currentCollateral.toFixed(), wei("100"));
    });

    it("should decrease power slightly", async () => {
      await nft.addCollateral(wei("500"), "1", { from: SECOND });
      await setTime(startTime + 1000000);

      await nft.removeCollateral(wei("1"), "1", { from: SECOND });

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("110").toFixed());

      await nft.recalculateNftPower("1");

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("109.989").toFixed());
    });

    it("should not increase power", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await setTime(startTime + 3000);

      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("87.989").toFixed());

      await nft.recalculateNftPower("1");

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("87.989").toFixed());
    });

    it("should revert if try to remove collateral from not a nft owner", async () => {
      await truffleAssert.reverts(nft.removeCollateral("1", "1"), "ERC721Power: sender isn't an nft owner (2)");
    });
  });

  describe("withdrawStuckERC20()", () => {
    beforeEach("setup", async () => {
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

      assert.equal((await anotherERC20.balanceOf(SECOND)).toFixed(), wei("300"));
    });

    it("should withdraw collateral token", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });
      await token.mint(nft.address, wei("500"));

      await nft.withdrawStuckERC20(token.address, SECOND);
      assert.equal(await token.balanceOf(nft.address), wei("200"));
    });

    it("should revert when try to withdraw with zero balance", async () => {
      const anotherERC20 = await ERC20Mock.new("Mock", "Mock", 18);

      await truffleAssert.reverts(
        nft.withdrawStuckERC20(anotherERC20.address, SECOND),
        "ERC721Power: nothing to withdraw"
      );
    });
  });
});
