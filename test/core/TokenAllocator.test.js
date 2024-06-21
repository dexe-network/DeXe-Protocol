const { assert } = require("chai");
const { accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");

const TokenAllocator = artifacts.require("TokenAllocator");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

TokenAllocator.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const DESCRIPTION_URL = "ipfs address";

describe("TokenAllocator", () => {
  let OWNER, SECOND, THIRD;
  let allocator, proxy;
  let merkleTree;
  let token;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    allocator = await TokenAllocator.new();
    token = await ERC20Mock.new("ERC20 Token", "ERC20", 18);

    await token.mint(OWNER, wei("100"));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("basic functionality", () => {
    beforeEach(async () => {
      merkleTree = StandardMerkleTree.of(
        [
          [SECOND, wei("10")],
          [THIRD, wei("5")],
        ],
        ["address", "uint256"],
      );
    });

    it("create allocation reverts on wrong data", async () => {
      await truffleAssert.reverts(
        allocator.createAllocation(OWNER, OWNER, ZERO_ADDR, wei("1"), merkleTree.root, DESCRIPTION_URL),
        "TA: Zero token address",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(OWNER, OWNER, token.address, 0, merkleTree.root, DESCRIPTION_URL),
        "TA: Zero ammount to allocate",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(
          OWNER,
          OWNER,
          token.address,
          wei("1"),
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          DESCRIPTION_URL,
        ),
        "TA: Zero Merkle root",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(OWNER, OWNER, token.address, wei("1"), merkleTree.root, DESCRIPTION_URL),
        "ERC20: insufficient allowance",
      );
    });

    it("successful allocation increases id", async () => {
      assert.equal(await allocator.lastAllocationId(), 0);

      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("1"), merkleTree.root, DESCRIPTION_URL);

      assert.equal(await allocator.lastAllocationId(), 1);
    });

    it("transfers tokens correctly", async () => {
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("100"));
      assert.equal(await token.balanceOf(allocator.address), 0);

      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("1"), merkleTree.root, DESCRIPTION_URL);

      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("99"));
      assert.equal((await token.balanceOf(allocator.address)).toFixed(), wei("1"));
    });

    it("returns correct data about proposal", async () => {
      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("1"), merkleTree.root, DESCRIPTION_URL);

      await truffleAssert.reverts(allocator.getAllocationInfo(2), "TA: invalid allocation id");

      const info = await allocator.getAllocationInfo(1);
      assert.equal(info.id, "1");
      assert.equal(info.isClosed, false);
      assert.equal(info.allocator, OWNER);
      assert.equal(info.token, token.address);
      assert.equal(info.currentBalance, wei("1"));
      assert.equal(info.merkleRoot, merkleTree.root);
      assert.equal(info.descriptionUrl, DESCRIPTION_URL);
    });

    it("could claim", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("15"), merkleTree.root, DESCRIPTION_URL);

      assert.equal(await token.balanceOf(SECOND), 0);
      assert.equal(await allocator.isClaimed(1, SECOND), false);

      await allocator.claim(1, wei("10"), merkleTree.getProof(0), { from: SECOND });

      assert.equal(await token.balanceOf(SECOND), wei("10"));
      assert.equal(await allocator.isClaimed(1, SECOND), true);

      const info = await allocator.getAllocationInfo(1);
      assert.equal(info.currentBalance, wei("5"));
    });

    it("claiming revert cases", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("15"), merkleTree.root, DESCRIPTION_URL);

      await truffleAssert.reverts(
        allocator.claim(2, wei("15"), merkleTree.getProof(0), { from: SECOND }),
        "TA: invalid allocation id",
      );

      const newMerkleTree = StandardMerkleTree.of([[SECOND, wei("15")]], ["address", "uint256"]);

      await truffleAssert.reverts(
        allocator.claim(1, wei("15"), newMerkleTree.getProof(0), { from: SECOND }),
        "TA: Invalid proof",
      );

      await allocator.claim(1, wei("10"), merkleTree.getProof(0), { from: SECOND });

      await truffleAssert.reverts(
        allocator.claim(1, wei("10"), merkleTree.getProof(0), { from: SECOND }),
        "TA: already claimed",
      );

      await token.approve(allocator.address, wei("10"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("10"), newMerkleTree.root, DESCRIPTION_URL);

      await truffleAssert.reverts(
        allocator.claim(2, wei("15"), newMerkleTree.getProof(0), { from: SECOND }),
        "TA: insufficient funds",
      );
    });

    it("could close allocation", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("15"), merkleTree.root, DESCRIPTION_URL);

      await allocator.claim(1, wei("5"), merkleTree.getProof(1), { from: THIRD });

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), wei("10"));
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("85"));
      assert.equal(await token.balanceOf(THIRD), wei("5"));

      await allocator.closeAllocation(1);

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), 0);
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("95"));
      assert.equal(await token.balanceOf(THIRD), wei("5"));

      await truffleAssert.reverts(
        allocator.claim(1, wei("10"), merkleTree.getProof(0), { from: SECOND }),
        "TA: allocation is closed",
      );
    });

    it("zero transfer case", async () => {
      const newMerkleTree = StandardMerkleTree.of([[SECOND, wei("15")]], ["address", "uint256"]);

      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("15"), newMerkleTree.root, DESCRIPTION_URL);

      await allocator.claim(1, wei("15"), newMerkleTree.getProof(0), { from: SECOND });

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), 0);

      await allocator.closeAllocation(1);

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), 0);
    });

    it("closing allocation revert cases", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(OWNER, OWNER, token.address, wei("15"), merkleTree.root, DESCRIPTION_URL);

      await truffleAssert.reverts(allocator.closeAllocation(2), "TA: invalid allocation id");

      await truffleAssert.reverts(allocator.closeAllocation(1, { from: SECOND }), "TA: wrong allocator");

      await allocator.closeAllocation(1);

      await truffleAssert.reverts(allocator.closeAllocation(1), "TA: already closed");
    });
  });

  describe("view functions", () => {
    let token0, token1;

    beforeEach(async () => {
      token0 = await ERC20Mock.new("ERC20 Token", "ERC20", 18);
      token1 = await ERC20Mock.new("ERC20 Token", "ERC20", 18);
    });

    it("correct number of alloctions in the view functions", async () => {
      await token0.mint(OWNER, wei("6"));
      await token0.approve(allocator.address, wei("6"));
      await token1.mint(OWNER, wei("8"));
      await token1.approve(allocator.address, wei("8"));

      let allocationsNumber = 2;

      for (creator of [SECOND, THIRD]) {
        for (currentToken of [token0, token1]) {
          for (let i = 0; i < allocationsNumber; i++) {
            await allocator.createAllocation(
              creator,
              OWNER,
              currentToken.address,
              wei("1"),
              merkleTree.root,
              DESCRIPTION_URL,
            );
          }
          allocationsNumber++;
        }
      }

      assert.equal((await token0.balanceOf(allocator.address)).toFixed(), wei("6"));
      assert.equal((await token1.balanceOf(allocator.address)).toFixed(), wei("8"));

      allocationsNumber = 2;
      for (creator of [SECOND, THIRD]) {
        for (currentToken of [token0, token1]) {
          for (let i = 0; i < allocationsNumber; i++) {
            assert.equal((await allocator.getAllocations(creator, currentToken.address)).length, allocationsNumber);
          }
          allocationsNumber++;
        }
      }

      assert.equal((await allocator.getAllocationsByTokenOrAllocator(SECOND, false)).length, 5);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(THIRD, false)).length, 9);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(token0.address, true)).length, 6);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(token1.address, true)).length, 8);

      await allocator.closeAllocation(14, { from: THIRD });

      assert.equal((await allocator.getAllocations(THIRD, token1.address)).length, 4);

      assert.equal((await allocator.getAllocationsByTokenOrAllocator(SECOND, false)).length, 5);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(THIRD, false)).length, 8);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(token0.address, true)).length, 6);
      assert.equal((await allocator.getAllocationsByTokenOrAllocator(token1.address, true)).length, 7);
    });
  });

  describe("basic functionality", () => {
    beforeEach(async () => {
      proxy = await TokenAllocator.at((await ERC1967Proxy.new(allocator.address, "0x")).address);
      await proxy.__TokenAllocator_init();
    });

    it("should not initialize twice", async () => {
      await truffleAssert.reverts(proxy.__TokenAllocator_init(), "Initializable: contract is already initialized");
    });

    it("could not upgrade if not owner", async () => {
      await truffleAssert.reverts(
        proxy.upgradeTo(allocator.address, { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );
    });

    it("could upgrade if owner", async () => {
      let allocatorNew = await TokenAllocator.new();

      await proxy.upgradeTo(allocatorNew.address);
    });
  });
});
