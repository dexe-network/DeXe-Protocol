const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const { ZERO_ADDR } = require("../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");

const ERC20Sale = artifacts.require("ERC20Sale");

ERC20Sale.numberFormat = "BigNumber";

describe("ERC20Sale", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let SALE_ADDRESS;
  let GOV_ADDRESS;

  let DEFAULT_PARAMS;

  let erc20Sale;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    SALE_ADDRESS = await accounts(3);
    GOV_ADDRESS = await accounts(4);
  });

  beforeEach(async () => {
    DEFAULT_PARAMS = {
      govAddress: GOV_ADDRESS,
      saleAddress: SALE_ADDRESS,
      constructorParameters: {
        name: "ERC20SaleMocked",
        symbol: "ERC20SM",
        users: [SECOND, THIRD],
        saleAmount: wei(1),
        cap: wei(20),
        mintedTotal: wei(10),
        amounts: [wei(2), wei(3)],
      },
    };
  });

  describe("constructor", () => {
    it("should revert if gov address is zero", async () => {
      DEFAULT_PARAMS.govAddress = ZERO_ADDR;

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: govAddress is zero"
      );
    });

    it("should revert if mintedTotal greater than cap", async () => {
      DEFAULT_PARAMS.constructorParameters.mintedTotal = wei(30);

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: mintedTotal should not be greater than cap"
      );
    });

    it("should revert if arrays length are not equal", async () => {
      DEFAULT_PARAMS.constructorParameters.users = [];

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: users and amounts lengths mismatch"
      );
    });

    it("should revert if the sum of amounts is greater than totalMinted", async () => {
      DEFAULT_PARAMS.constructorParameters.amounts = [wei(10), wei(10)];

      await truffleAssert.reverts(
        ERC20Sale.new(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.saleAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Sale: overminting"
      );
    });

    it("should deploy properly if all conditions are met", async () => {
      erc20Sale = await ERC20Sale.new(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );

      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[0])).toFixed(), wei(2));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[1])).toFixed(), wei(3));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.saleAddress)).toFixed(), wei(1));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.govAddress)).toFixed(), wei(4));
    });
  });

  describe("functionality", () => {
    beforeEach(async () => {
      erc20Sale = await ERC20Sale.new(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );
    });

    describe("mint", () => {
      it("should not mint if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Sale.mint(SALE_ADDRESS, wei(1)), "ERC20Sale: not a Gov contract");
      });

      it("should not mint if the cap is reached", async () => {
        await truffleAssert.reverts(
          erc20Sale.mint(OWNER, wei(100), { from: GOV_ADDRESS }),
          "ERC20Capped: cap exceeded"
        );
      });

      it("should mint if all conditions are met", async () => {
        assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), "0");

        await erc20Sale.mint(OWNER, wei(1), { from: GOV_ADDRESS });

        assert.equal((await erc20Sale.balanceOf(OWNER)).toFixed(), wei(1));
      });
    });

    describe("burn", () => {
      it("should not burn if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Sale.burn(SALE_ADDRESS, wei(1)), "ERC20Sale: not a Gov contract");
      });

      it("should not burn if not enough balance", async () => {
        await truffleAssert.reverts(
          erc20Sale.burn(SALE_ADDRESS, wei(100), { from: GOV_ADDRESS }),
          "ERC20: burn amount exceeds balance"
        );
      });

      it("should not burn all conditions are met", async () => {
        assert.equal((await erc20Sale.balanceOf(SALE_ADDRESS)).toFixed(), wei(1));

        await erc20Sale.burn(SALE_ADDRESS, wei(1), { from: GOV_ADDRESS });

        assert.equal((await erc20Sale.balanceOf(SALE_ADDRESS)).toFixed(), "0");
      });
    });

    describe("pause", () => {
      it("should not pause if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Sale.pause(), "ERC20Sale: not a Gov contract");
      });

      it("should not mint if erc20Sale is paused", async () => {
        await erc20Sale.pause({ from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Sale.mint(OWNER, wei(1), { from: GOV_ADDRESS }),
          "ERC20Pausable: token transfer while paused"
        );
      });

      it("should not transfer if erc20Sale is paused", async () => {
        await erc20Sale.pause({ from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Sale.transfer(THIRD, wei(1), { from: SECOND }),
          "ERC20Pausable: token transfer while paused"
        );
      });
    });

    describe("unpause", () => {
      beforeEach(async () => {
        await erc20Sale.pause({ from: GOV_ADDRESS });
        await erc20Sale.unpause({ from: GOV_ADDRESS });
      });

      it("should not unpause if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Sale.unpause(), "ERC20Sale: not a Gov contract");
      });

      it("should mint if erc20Sale is unpaused", async () => {
        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(2));

        await erc20Sale.mint(SECOND, wei(1), { from: GOV_ADDRESS });

        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(3));
      });

      it("should transfer if erc20Sale is unpaused", async () => {
        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(2));
        assert.equal((await erc20Sale.balanceOf(THIRD)).toFixed(), wei(3));

        await erc20Sale.transfer(THIRD, wei(1), { from: SECOND });

        assert.equal((await erc20Sale.balanceOf(SECOND)).toFixed(), wei(1));
        assert.equal((await erc20Sale.balanceOf(THIRD)).toFixed(), wei(4));
      });
    });
  });
});
