const BigNumber = require("bignumber.js");

const toBN = (value) => new BigNumber(value);

const wei = web3.utils.toWei;
const fromWei = web3.utils.fromWei;

const accounts = async (index) => {
  return (await web3.eth.getAccounts())[index];
};

module.exports = {
  toBN,
  accounts,
  wei,
  fromWei,
};
