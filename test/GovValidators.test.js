const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const GovValidators = artifacts.require("GovValidators");
const GovValidatorsToken = artifacts.require("GovValidatorsToken");

GovValidators.numberFormat = "BigNumber";
GovValidatorsToken.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);

describe("GovValidators", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let validators;
  let validatorsToken;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    validators = await GovValidators.new();

    await validators.__GovValidators_init(
      "Validator Token",
      "VT",
      500,
      PRECISION.times("51").toFixed(),
      [SECOND, THIRD],
      [wei("100"), wei("200")]
    );

    validatorsToken = await GovValidatorsToken.at(await validators.govValidatorsToken());
  });

  describe("ValidatorsToken", () => {
    it("should revert on transfer", async () => {
      await truffleAssert.reverts(
        validatorsToken.transfer(THIRD, "10", { from: SECOND }),
        "ValidatorsToken: caller is not the validator"
      );
    });

    it("only owner should call mint(), burn(), snapshot()", async () => {
      await truffleAssert.reverts(
        validatorsToken.mint(SECOND, "10", { from: SECOND }),
        "ValidatorsToken: caller is not the validator"
      );
      await truffleAssert.reverts(
        validatorsToken.burn(SECOND, "10", { from: SECOND }),
        "ValidatorsToken: caller is not the validator"
      );
      await truffleAssert.reverts(
        validatorsToken.snapshot({ from: SECOND }),
        "ValidatorsToken: caller is not the validator"
      );
    });
  });
});
