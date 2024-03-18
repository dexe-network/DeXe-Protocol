const getConfig = () => {
  if (process.env.ENVIRONMENT == "PROD") {
    return require("./configs/prod.conf.js");
  }

  if (process.env.ENVIRONMENT == "STAGE") {
    return require("./configs/stage.conf.js");
  }

  if (process.env.ENVIRONMENT == "DEV") {
    return require("./configs/dev.conf.js");
  }

  if (process.env.ENVIRONMENT == "DEV_SEPOLIA") {
    return require("./configs/dev-sepolia.conf.js");
  }

  if (process.env.ENVIRONMENT == "DEV_MUMBAI") {
    return require("./configs/dev-mumbai.conf.js");
  }

  throw Error("No environment config specified");
};

const getBytesPolynomialPowerInit = (k1, k2, k3) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__PolynomialPower_init",
      type: "function",
      inputs: [
        {
          type: "uint256",
          name: "k1",
        },
        {
          type: "uint256",
          name: "k2",
        },
        {
          type: "uint256",
          name: "k3",
        },
      ],
    },
    [k1, k2, k3]
  );
};

module.exports = {
  getConfig,
  getBytesPolynomialPowerInit,
};
