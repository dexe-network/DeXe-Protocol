const dotenv = require("dotenv");
dotenv.config();

function dexeDaoName() {
  return process.env.DEXE_DAO_NAME !== undefined ? process.env.DEXE_DAO_NAME : "DEXE DAO";
}

module.exports = { dexeDaoName };
