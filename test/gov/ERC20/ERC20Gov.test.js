const { assert } = require("chai");
const { accounts, wei } = require("../../../scripts/utils/utils");
const { ZERO_ADDR } = require("../../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const Reverter = require("../../helpers/reverter");

const ERC20Gov = artifacts.require("ERC20Gov");

ERC20Gov.numberFormat = "BigNumber";

describe("ERC20Gov", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let GOV_ADDRESS;

  let DEFAULT_PARAMS;

  let erc20Gov;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    GOV_ADDRESS = await accounts(3);

    erc20Gov = await ERC20Gov.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  beforeEach(async () => {
    DEFAULT_PARAMS = {
      govAddress: GOV_ADDRESS,
      constructorParameters: {
        name: "ERC20GovMocked",
        symbol: "ERC20GM",
        users: [SECOND, THIRD, GOV_ADDRESS],
        cap: wei(20),
        mintedTotal: wei(10),
        amounts: [wei(2), wei(3), 0],
      },
    };
  });

  describe("initializer", () => {
    it("should revert if gov address is zero", async () => {
      DEFAULT_PARAMS.govAddress = ZERO_ADDR;

      await truffleAssert.reverts(
        erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Gov: govAddress is zero",
      );
    });

    it("should revert if mintedTotal greater than cap", async () => {
      DEFAULT_PARAMS.constructorParameters.mintedTotal = wei(30);

      await truffleAssert.reverts(
        erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Gov: mintedTotal should not be greater than cap",
      );
    });

    it("should revert if arrays length are not equal", async () => {
      DEFAULT_PARAMS.constructorParameters.users = [];

      await truffleAssert.reverts(
        erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Gov: users and amounts lengths mismatch",
      );
    });

    it("should revert if the sum of amounts is greater than totalMinted", async () => {
      DEFAULT_PARAMS.constructorParameters.amounts = [wei(10), wei(10), 0];

      await truffleAssert.reverts(
        erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters),
        "ERC20Gov: overminting",
      );
    });

    it("should deploy properly if all conditions are met", async () => {
      await erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters);

      assert.equal((await erc20Gov.balanceOf(DEFAULT_PARAMS.constructorParameters.users[0])).toFixed(), wei(2));
      assert.equal((await erc20Gov.balanceOf(DEFAULT_PARAMS.constructorParameters.users[1])).toFixed(), wei(3));
      assert.equal((await erc20Gov.balanceOf(DEFAULT_PARAMS.govAddress)).toFixed(), wei(5));
    });

    it("should not initialize twice", async () => {
      await erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters);

      await truffleAssert.reverts(
        erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters),
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("functionality", () => {
    beforeEach(async () => {
      await erc20Gov.__ERC20Gov_init(DEFAULT_PARAMS.govAddress, DEFAULT_PARAMS.constructorParameters);
    });

    describe("mint", () => {
      it("should not mint if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Gov.mint(OWNER, wei(1)), "ERC20Gov: not a Gov contract");
      });

      it("should not mint if the cap is reached", async () => {
        await truffleAssert.reverts(erc20Gov.mint(OWNER, wei(100), { from: GOV_ADDRESS }), "ERC20Capped: cap exceeded");
      });

      it("should mint if all conditions are met", async () => {
        assert.equal((await erc20Gov.balanceOf(OWNER)).toFixed(), "0");

        await erc20Gov.mint(OWNER, wei(1), { from: GOV_ADDRESS });

        assert.equal((await erc20Gov.balanceOf(OWNER)).toFixed(), wei(1));
      });
    });

    describe("pause", () => {
      it("should not pause if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Gov.pause(), "ERC20Gov: not a Gov contract");
      });

      it("should not mint if erc20Gov is paused", async () => {
        await erc20Gov.pause({ from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Gov.mint(OWNER, wei(1), { from: GOV_ADDRESS }),
          "ERC20Pausable: token transfer while paused",
        );
      });

      it("should not transfer if erc20Gov is paused", async () => {
        await erc20Gov.pause({ from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Gov.transfer(THIRD, wei(1), { from: SECOND }),
          "ERC20Pausable: token transfer while paused",
        );
      });
    });

    describe("unpause", () => {
      beforeEach(async () => {
        await erc20Gov.pause({ from: GOV_ADDRESS });
        await erc20Gov.unpause({ from: GOV_ADDRESS });
      });

      it("should not unpause if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Gov.unpause(), "ERC20Gov: not a Gov contract");
      });

      it("should mint if erc20Gov is unpaused", async () => {
        assert.equal((await erc20Gov.balanceOf(SECOND)).toFixed(), wei(2));

        await erc20Gov.mint(SECOND, wei(1), { from: GOV_ADDRESS });

        assert.equal((await erc20Gov.balanceOf(SECOND)).toFixed(), wei(3));
      });

      it("should transfer if erc20Gov is unpaused", async () => {
        assert.equal((await erc20Gov.balanceOf(SECOND)).toFixed(), wei(2));
        assert.equal((await erc20Gov.balanceOf(THIRD)).toFixed(), wei(3));

        await erc20Gov.transfer(THIRD, wei(1), { from: SECOND });

        assert.equal((await erc20Gov.balanceOf(SECOND)).toFixed(), wei(1));
        assert.equal((await erc20Gov.balanceOf(THIRD)).toFixed(), wei(4));
      });

      it("should blacklist if erc20Gov is unpaused", async () => {
        assert.ok(await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS }));
      });
    });

    describe("blacklist", () => {
      it("should not blacklist if caller is not govPool", async () => {
        await truffleAssert.reverts(erc20Gov.blacklist([SECOND], true), "ERC20Gov: not a Gov contract");
      });

      it("should blacklist if caller is govPool", async () => {
        assert.equal(await erc20Gov.totalBlacklistAccounts(), 0);

        await erc20Gov.blacklist([SECOND, THIRD], true, { from: GOV_ADDRESS });

        assert.equal(await erc20Gov.totalBlacklistAccounts(), 2);
      });

      it("should unblacklist if caller is govPool", async () => {
        await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS });

        assert.equal(await erc20Gov.totalBlacklistAccounts(), 1);

        await erc20Gov.blacklist([SECOND], false, { from: GOV_ADDRESS });

        assert.equal(await erc20Gov.totalBlacklistAccounts(), 0);
      });

      it("should not revert if account is already blacklisted", async () => {
        await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS });

        await truffleAssert.passes(erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS }));

        assert.equal(await erc20Gov.totalBlacklistAccounts(), 1);
      });

      it("should not revert if account is not blacklisted", async () => {
        await truffleAssert.passes(erc20Gov.blacklist([SECOND], false, { from: GOV_ADDRESS }));
      });

      it("should not mint if the account is blacklisted", async () => {
        await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Gov.mint(SECOND, wei(1), { from: GOV_ADDRESS }),
          "ERC20Gov: account is blacklisted",
        );
      });

      it("should not transfer if the account is blacklisted", async () => {
        await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS });

        await truffleAssert.reverts(
          erc20Gov.transfer(GOV_ADDRESS, wei(1), { from: SECOND }),
          "ERC20Gov: account is blacklisted",
        );
      });
    });

    describe("getBlacklistTokens", () => {
      it("should return empty array if no accounts are blacklisted", async () => {
        assert.deepEqual(await erc20Gov.getBlacklistAccounts(0, 10), []);
      });

      it("should return array of blacklisted accounts", async () => {
        await erc20Gov.blacklist([SECOND], true, { from: GOV_ADDRESS });

        assert.deepEqual(await erc20Gov.getBlacklistAccounts(0, 10), [SECOND]);
      });
    });
  });
});
