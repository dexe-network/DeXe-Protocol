const BigNumber = require("bignumber.js");

const toBN = (value) => new BigNumber(value);

const accounts = async (index) => {
  return (await web3.eth.getAccounts())[index];
};

module.exports = {
  toBN,
  accounts,
};
