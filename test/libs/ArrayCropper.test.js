const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ArrayCropperMock = artifacts.require("ArrayCropperMock");

ArrayCropperMock.numberFormat = "BigNumber";

describe("ArrayCropper", () => {
  let cropper;

  const reverter = new Reverter();

  before("setup", async () => {
    cropper = await ArrayCropperMock.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("functionality", () => {
    it("should crop uint array", async () => {
      const cropped = await cropper.cropUint(["1", "2", "3"], 2);

      assert.deepEqual(
        cropped.map((e) => toBN(e).toFixed()),
        ["1", "2"]
      );
    });

    it("should crop address array", async () => {
      const cropped = await cropper.cropAddress([await accounts(0), await accounts(1), await accounts(1)], 2);

      assert.deepEqual(cropped, [await accounts(0), await accounts(1)]);
    });

    it("should not crop", async () => {
      await truffleAssert.reverts(cropper.cropUint([], 1), "ArrayCropper: not crop");
      await truffleAssert.reverts(cropper.cropAddress([], 1), "ArrayCropper: not crop");
    });
  });
});
