const BigNumber = require("bignumber.js");
const Decimal = require("decimal.js");

const toBN = (value) => new BigNumber(value);

const wei = (value, decimal = 18) => {
  return toBN(value).times(toBN(10).pow(decimal)).toFixed();
};

const fromWei = (value, decimal = 18) => {
  return toBN(value).div(toBN(10).pow(decimal)).toFixed();
};

const accounts = async (index) => {
  return (await web3.eth.getAccounts())[index];
};

const toPower = (base, exponent, p) => {
  Decimal.set({ precision: 80 });
  let n = new Decimal(base).pow(exponent);
  n = n.times(new Decimal(10).pow(p)).floor().toFixed();
  return toBN(n);
};

module.exports = {
  toBN,
  accounts,
  wei,
  fromWei,
  toPower,
};
