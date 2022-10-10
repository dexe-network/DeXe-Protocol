const { assert } = require("chai");
const { toBN } = require("../scripts/utils/utils");

const ShrinkableArrayMock = artifacts.require("ShrinkableArrayMock");

ShrinkableArrayMock.numberFormat = "BigNumber";

describe("ShrinkableArray", () => {
  let shArray;

  beforeEach("setup", async () => {
    shArray = await ShrinkableArrayMock.new();
  });

  describe("functionality", () => {
    it("should transform array", async () => {
      const arr = ["1", "2", "3"];

      const shArr = await shArray.transform(arr);

      assert.deepEqual(
        shArr[0].map((e) => toBN(e).toFixed()),
        arr
      );
      assert.equal(shArr[1], arr.length);
    });

    it("should create array", async () => {
      const length = 3;

      const shArr = await shArray.create(length);

      assert.deepEqual(
        shArr[0].map((e) => toBN(e).toFixed()),
        ["0", "0", "0"]
      );
      assert.equal(shArr[1], length);
    });

    it("should crop array", async () => {
      const shArr = {
        values: ["1", "2", "3"],
        length: "3",
      };

      const shArr2 = await shArray.crop(shArr, 2);

      assert.deepEqual(
        shArr2[0].map((e) => toBN(e).toFixed()),
        ["1", "2", "3"]
      );
      assert.equal(shArr2[1], 2);
    });
  });
});
