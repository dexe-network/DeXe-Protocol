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
        allocator.createAllocation(ZERO_ADDR, wei("1"), merkleTree.root),
        "TA: Zero token address",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(token.address, 0, merkleTree.root),
        "TA: Zero ammount to allocate",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(
          token.address,
          wei("1"),
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ),
        "TA: Zero Merkle root",
      );

      await truffleAssert.reverts(
        allocator.createAllocation(token.address, wei("1"), merkleTree.root),
        "ERC20: insufficient allowance",
      );
    });

    it("successful allocation increases id", async () => {
      assert.equal(await allocator.lastAllocationId(), 0);

      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(token.address, wei("1"), merkleTree.root);

      assert.equal(await allocator.lastAllocationId(), 1);
    });

    it("transfers tokens correctly", async () => {
      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("100"));
      assert.equal(await token.balanceOf(allocator.address), 0);

      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(token.address, wei("1"), merkleTree.root);

      assert.equal((await token.balanceOf(OWNER)).toFixed(), wei("99"));
      assert.equal((await token.balanceOf(allocator.address)).toFixed(), wei("1"));
    });

    it("returns correct data about proposal", async () => {
      await token.approve(allocator.address, wei("1"));
      await allocator.createAllocation(token.address, wei("1"), merkleTree.root);

      await truffleAssert.reverts(allocator.getAllocationInfo(2), "TA: invalid allocation id");

      const info = await allocator.getAllocationInfo(1);
      assert.equal(info.id, "1");
      assert.equal(info.isClosed, false);
      assert.equal(info.allocator, OWNER);
      assert.equal(info.token, token.address);
      assert.equal(info.currentBalance, wei("1"));
      assert.equal(info.merkleRoot, merkleTree.root);
    });

    it("could claim", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(token.address, wei("15"), merkleTree.root);

      assert.equal(await token.balanceOf(SECOND), 0);

      await allocator.claim(1, wei("10"), merkleTree.getProof(0), { from: SECOND });

      assert.equal(await token.balanceOf(SECOND), wei("10"));

      const info = await allocator.getAllocationInfo(1);
      assert.equal(info.currentBalance, wei("5"));
    });

    it("claim reverts", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(token.address, wei("15"), merkleTree.root);

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
      await allocator.createAllocation(token.address, wei("10"), newMerkleTree.root);

      await truffleAssert.reverts(
        allocator.claim(2, wei("15"), newMerkleTree.getProof(0), { from: SECOND }),
        "TA: insufficient funds",
      );
    });

    it("could close allocation", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(token.address, wei("15"), merkleTree.root);

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
      await allocator.createAllocation(token.address, wei("15"), newMerkleTree.root);

      await allocator.claim(1, wei("15"), newMerkleTree.getProof(0), { from: SECOND });

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), 0);

      await allocator.closeAllocation(1);

      assert.equal((await token.balanceOf(allocator.address)).toFixed(), 0);
    });

    it("close allocation reverts", async () => {
      await token.approve(allocator.address, wei("15"));
      await allocator.createAllocation(token.address, wei("15"), merkleTree.root);

      await truffleAssert.reverts(allocator.closeAllocation(2), "TA: invalid allocation id");

      await truffleAssert.reverts(allocator.closeAllocation(1, { from: SECOND }), "TA: wrong allocator");

      await allocator.closeAllocation(1);

      await truffleAssert.reverts(allocator.closeAllocation(1), "TA: already closed");
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
