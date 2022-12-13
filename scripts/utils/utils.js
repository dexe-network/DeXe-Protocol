const BigNumber = require("bignumber.js");
const { PRECISION } = require("./constants");

const toBN = (value) => new BigNumber(value);

const wei = (value, decimal = 18) => {
  return toBN(value).times(toBN(10).pow(decimal)).toFixed();
};

const fromWei = (value, decimal = 18) => {
  return toBN(value).div(toBN(10).pow(decimal)).toFixed();
};

const toPercent = (value) => {
  return PRECISION.times(value).toFixed();
};

const accounts = async (index) => {
  return (await web3.eth.getAccounts())[index];
};

module.exports = {
  toBN,
  accounts,
  wei,
  toPercent,
  fromWei,
};
