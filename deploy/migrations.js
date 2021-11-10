const { start, deploy, finish } = require("./deployer");

async function migrate() {
  await start();

  const mock = await deploy("ERC20Mock", "Mock", "Mock", 18);
  const mock2 = await deploy("ERC20Mock", "Mock", "Mock", 18);

  await finish();
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
