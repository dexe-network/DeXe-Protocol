const ethSigUtil = require("@metamask/eth-sig-util");
const { assert } = require("chai");
const { accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const UserRegistry = artifacts.require("UserRegistry");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");

ContractsRegistry.numberFormat = "BigNumber";
UserRegistry.numberFormat = "BigNumber";

describe("UserRegistry", () => {
  let OWNER;
  let SECOND;
  let OWNER_PRIVATE_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  let userRegistry;
  let userRegistryName;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    const contractsRegistry = await ContractsRegistry.new();
    const _userRegistry = await UserRegistry.new();
    const _sphereXEngine = await SphereXEngineMock.new();

    await contractsRegistry.__MultiOwnableContractsRegistry_init();

    userRegistryName = await contractsRegistry.USER_REGISTRY_NAME();

    await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), _sphereXEngine.address);
    await contractsRegistry.addProxyContract(userRegistryName, _userRegistry.address);

    userRegistry = await UserRegistry.at(await contractsRegistry.getUserRegistryContract());

    await userRegistry.__UserRegistry_init(userRegistryName);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  async function sign(hash, userPrivateKey) {
    const privateKey = Buffer.from(userPrivateKey, "hex");

    const EIP712Domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];

    const Agreement = [{ name: "documentHash", type: "bytes32" }];

    const domain = {
      name: userRegistryName,
      version: "1",
      chainId: 31337,
      verifyingContract: userRegistry.address,
    };

    const message = {
      documentHash: hash,
    };

    const data = {
      primaryType: "Agreement",
      types: { EIP712Domain, Agreement },
      domain: domain,
      message: message,
    };

    return ethSigUtil.signTypedData({
      privateKey,
      data: data,
      version: "V4",
    });
  }

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        userRegistry.__UserRegistry_init(userRegistryName),
        "Initializable: contract is already initialized"
      );
    });

    it("only owner should call these methods", async () => {
      const docHash = web3.utils.soliditySha3("Privacy Policy document content");

      await truffleAssert.reverts(
        userRegistry.setPrivacyPolicyDocumentHash(docHash, { from: SECOND }),
        "MultiOwnable: caller is not the owner"
      );
    });
  });

  describe("Privacy Policy signature", () => {
    it("should sign the privacy policy", async () => {
      const docHash = web3.utils.soliditySha3("Privacy Policy document content");
      const signature = await sign(docHash, OWNER_PRIVATE_KEY);

      assert.isFalse(await userRegistry.agreed(OWNER));

      await userRegistry.setPrivacyPolicyDocumentHash(docHash);
      await userRegistry.agreeToPrivacyPolicy(signature);

      assert.equal(await userRegistry.documentHash(), docHash);
      assert.isTrue(await userRegistry.agreed(OWNER));
    });

    it("should not agree to wrong policy", async () => {
      const docHash = web3.utils.soliditySha3("Privacy Policy document content");
      const wrongDocHash = web3.utils.soliditySha3("BAD DOC");
      const signature = await sign(wrongDocHash, OWNER_PRIVATE_KEY);

      await userRegistry.setPrivacyPolicyDocumentHash(docHash);
      await truffleAssert.reverts(userRegistry.agreeToPrivacyPolicy(signature), "UserRegistry: invalid signature");
    });

    it("should not agree if doc in not set", async () => {
      const docHash = web3.utils.soliditySha3("");
      const signature = await sign(docHash, OWNER_PRIVATE_KEY);

      await truffleAssert.reverts(
        userRegistry.agreeToPrivacyPolicy(signature),
        "UserRegistry: privacy policy is not set"
      );
    });

    it("should resign if a new doc has been set", async () => {
      let docHash = web3.utils.soliditySha3("Privacy Policy document content");
      let signature = await sign(docHash, OWNER_PRIVATE_KEY);

      assert.isFalse(await userRegistry.agreed(OWNER));

      await userRegistry.setPrivacyPolicyDocumentHash(docHash);
      await userRegistry.agreeToPrivacyPolicy(signature);

      assert.isTrue(await userRegistry.agreed(OWNER));

      docHash = web3.utils.soliditySha3("New privacy Policy document content");
      signature = await sign(docHash, OWNER_PRIVATE_KEY);

      await userRegistry.setPrivacyPolicyDocumentHash(docHash);
      assert.isFalse(await userRegistry.agreed(OWNER));

      await userRegistry.agreeToPrivacyPolicy(signature);
      assert.isTrue(await userRegistry.agreed(OWNER));
    });
  });

  describe("Profile", () => {
    it("should set new profile URL", async () => {
      assert.equal((await userRegistry.userInfos(OWNER)).profileURL, "");

      await userRegistry.changeProfile("example.com");

      assert.equal((await userRegistry.userInfos(OWNER)).profileURL, "example.com");
    });
  });

  describe("Profile & policy", () => {
    it("should set new profile and agree to policy", async () => {
      const docHash = web3.utils.soliditySha3("Privacy Policy document content");
      const signature = await sign(docHash, OWNER_PRIVATE_KEY);

      await userRegistry.setPrivacyPolicyDocumentHash(docHash);
      await userRegistry.changeProfileAndAgreeToPrivacyPolicy("example.com", signature);

      assert.isTrue(await userRegistry.agreed(OWNER));
      assert.equal((await userRegistry.userInfos(OWNER)).profileURL, "example.com");
    });
  });
});
