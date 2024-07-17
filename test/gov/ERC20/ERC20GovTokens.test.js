const { assert } = require("chai");
const { accounts, wei } = require("../../../scripts/utils/utils");
const { ZERO_ADDR } = require("../../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const Reverter = require("../../helpers/reverter");

const ERC20GovMinimal = artifacts.require("ERC20GovMinimal");
const ERC20GovBurnable = artifacts.require("ERC20GovBurnable");

ERC20GovMinimal.numberFormat = "BigNumber";
ERC20GovBurnable.numberFormat = "BigNumber";

const TOKEN_NAME = "Test token";
const TOKEN_SYMBOL = "TST";

describe.only("ERC20Gov", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let erc20GovMinimal, erc20GovBurnable;

  const reverter = new Reverter();

  before("setup", async () => {
    console.log("calls before");
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    erc20GovMinimal = await ERC20GovMinimal.new();
    erc20GovBurnable = await ERC20GovBurnable.new();

    await erc20GovMinimal.__ERC20GovMinimal_init(TOKEN_NAME, TOKEN_SYMBOL, [
      [SECOND, wei("2")],
      [THIRD, wei("3")],
    ]);
    await erc20GovBurnable.__ERC20GovBurnable_init(TOKEN_NAME, TOKEN_SYMBOL, [
      [SECOND, wei("2")],
      [THIRD, wei("3")],
    ]);

    INITIALIZABLE_LIST = [erc20GovMinimal, erc20GovBurnable];
    BURNABLE_LIST = [erc20GovBurnable];

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("Initialization", () => {
    it("cant initialize twice", async () => {
      await truffleAssert.reverts(
        erc20GovMinimal.__ERC20GovMinimal_init(TOKEN_NAME, TOKEN_SYMBOL, [
          [SECOND, wei("2")],
          [THIRD, wei("3")],
        ]),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovBurnable.__ERC20GovBurnable_init(TOKEN_NAME, TOKEN_SYMBOL, [
          [SECOND, wei("2")],
          [THIRD, wei("3")],
        ]),
        "Initializable: contract is already initialized",
      );
    });

    it("correct initialization", async () => {
      for (token of INITIALIZABLE_LIST) {
        assert.equal(await token.name(), TOKEN_NAME);
        assert.equal(await token.symbol(), TOKEN_SYMBOL);
        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("2"));
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("3"));
        assert.equal((await token.totalSupply()).toFixed(), wei("5"));
      }
    });
  });

  describe("Burnable", () => {
    it("could burn from itself", async () => {
      for (token of BURNABLE_LIST) {
        await token.burn(wei("1"), { from: SECOND });
        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("1"));
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("3"));
        assert.equal((await token.totalSupply()).toFixed(), wei("4"));
      }
    });
  });
});
