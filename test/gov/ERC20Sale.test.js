const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const { ZERO_ADDR } = require("../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const Reverter = require("../helpers/reverter");

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

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    SALE_ADDRESS = await accounts(3);
    GOV_ADDRESS = await accounts(4);

    erc20Sale = await ERC20Sale.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

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

  describe("initializer", () => {
    it("should revert if gov address is zero", async () => {
      DEFAULT_PARAMS.govAddress = ZERO_ADDR;

      await truffleAssert.reverts(
        erc20Sale.__ERC20Sale_init(
          DEFAULT_PARAMS.govAddress,
          DEFAULT_PARAMS.saleAddress,
          DEFAULT_PARAMS.constructorParameters
        ),
        "ERC20Sale: govAddress is zero"
      );
    });

    it("should revert if mintedTotal greater than cap", async () => {
      DEFAULT_PARAMS.constructorParameters.mintedTotal = wei(30);

      await truffleAssert.reverts(
        erc20Sale.__ERC20Sale_init(
          DEFAULT_PARAMS.govAddress,
          DEFAULT_PARAMS.saleAddress,
          DEFAULT_PARAMS.constructorParameters
        ),
        "ERC20Sale: mintedTotal should not be greater than cap"
      );
    });

    it("should revert if arrays length are not equal", async () => {
      DEFAULT_PARAMS.constructorParameters.users = [];

      await truffleAssert.reverts(
        erc20Sale.__ERC20Sale_init(
          DEFAULT_PARAMS.govAddress,
          DEFAULT_PARAMS.saleAddress,
          DEFAULT_PARAMS.constructorParameters
        ),
        "ERC20Sale: users and amounts lengths mismatch"
      );
    });

    it("should revert if the sum of amounts is greater than totalMinted", async () => {
      DEFAULT_PARAMS.constructorParameters.amounts = [wei(10), wei(10)];

      await truffleAssert.reverts(
        erc20Sale.__ERC20Sale_init(
          DEFAULT_PARAMS.govAddress,
          DEFAULT_PARAMS.saleAddress,
          DEFAULT_PARAMS.constructorParameters
        ),
        "ERC20Sale: overminting"
      );
    });

    it("should deploy properly if all conditions are met", async () => {
      await erc20Sale.__ERC20Sale_init(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );

      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[0])).toFixed(), wei(2));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.constructorParameters.users[1])).toFixed(), wei(3));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.saleAddress)).toFixed(), wei(1));
      assert.equal((await erc20Sale.balanceOf(DEFAULT_PARAMS.govAddress)).toFixed(), wei(4));
    });

    it("should not initialize twice", async () => {
      await erc20Sale.__ERC20Sale_init(
        DEFAULT_PARAMS.govAddress,
        DEFAULT_PARAMS.saleAddress,
        DEFAULT_PARAMS.constructorParameters
      );

      await truffleAssert.reverts(
        erc20Sale.__ERC20Sale_init(
          DEFAULT_PARAMS.govAddress,
          DEFAULT_PARAMS.saleAddress,
          DEFAULT_PARAMS.constructorParameters
        ),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionality", () => {
    beforeEach(async () => {
      await erc20Sale.__ERC20Sale_init(
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

      it("should not blacklist if erc20Sale is paused", async () => {
        await erc20Sale.pause({ from: GOV_ADDRESS });

        await truffleAssert.reverts(erc20Sale.blacklist([THIRD], true), "Pausable: paused");
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

      it("should blacklist if erc20Sale is unpaused", async () => {
        assert.ok(await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS }));
      });
    });

    describe("blacklist", () => {
      it("should not blacklist if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Sale.blacklist([SECOND], true), "ERC20Sale: not a Gov contract");
      });

      it("should blacklist if caller is govPool", async () => {
        assert.equal(await erc20Sale.totalBlacklistAccounts(), 0);

        await erc20Sale.blacklist([SECOND, THIRD], true, { from: GOV_ADDRESS });

        assert.equal(await erc20Sale.totalBlacklistAccounts(), 2);
      });

      it("should unblacklist if caller is govPool", async () => {
        await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS });

        assert.equal(await erc20Sale.totalBlacklistAccounts(), 1);

        await erc20Sale.blacklist([SECOND], false, { from: GOV_ADDRESS });

        assert.equal(await erc20Sale.totalBlacklistAccounts(), 0);
      });

      it("should not revert if account is already blacklisted", async () => {
        await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS });

        assert.isOk(await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS }));

        assert.equal(await erc20Sale.totalBlacklistAccounts(), 1);
      });

      it("should not revert if account is not blacklisted", async () => {
        assert.isOk(erc20Sale.blacklist([SECOND], false, { from: GOV_ADDRESS }));
      });

      it("should not mint if the account is blacklisted", async () => {
        await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Sale.mint(SECOND, wei(1), { from: GOV_ADDRESS }),
          "ERC20Sale: account is blacklisted"
        );
      });

      it("should not transfer if the account is blacklisted", async () => {
        await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Sale.transfer(GOV_ADDRESS, wei(1), { from: SECOND }),
          "ERC20Sale: account is blacklisted"
        );
      });
    });

    describe("getBlacklistTokens", () => {
      it("should return empty array if no accounts are blacklisted", async () => {
        assert.deepEqual(await erc20Sale.getBlacklistAccounts(0, 10), []);
      });

      it("should return array of blacklisted accounts", async () => {
        await erc20Sale.blacklist([SECOND], true, { from: GOV_ADDRESS });

        assert.deepEqual(await erc20Sale.getBlacklistAccounts(0, 10), [SECOND]);
      });
    });
  });
});
