// Deploys MockPHP + AmbagVault, sets the agent role, creates the demo collection,
// verifies on BscScan and writes deployments/<network>.json.
//
// Usage: npx hardhat run scripts/deploy.js --network bscTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const P = (n) => ethers.parseEther(String(n));
const ADVISER_THRESHOLD = P(1000); // ₱1,000

async function main() {
  const net = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${hre.network.name} (chainId ${net.chainId})`);
  console.log(`Deployer/admin: ${deployer.address}`);

  // Only BSC Testnet (97) or a local Hardhat chain (31337). Never mainnet.
  if (net.chainId !== 97n && net.chainId !== 31337n) {
    throw new Error("Refusing to deploy: not BSC Testnet (chain 97) or a local chain.");
  }

  // 1. Token
  const token = await (await ethers.getContractFactory("MockPHP")).deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`MockPHP (tPHP): ${tokenAddr}`);

  // 2. Vault
  const vault = await (await ethers.getContractFactory("AmbagVault")).deploy(
    tokenAddr,
    ADVISER_THRESHOLD,
    deployer.address
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`AmbagVault: ${vaultAddr}`);

  // 3. Roles from .env (optional here; grant-role.js can do it later)
  const roles = [
    ["AGENT_ROLE", process.env.AGENT_ADDRESS],
    ["TREASURER_ROLE", process.env.TREASURER_ADDRESS],
    ["ADVISER_ROLE", process.env.ADVISER_ADDRESS],
  ];
  for (const [name, addr] of roles) {
    if (addr && ethers.isAddress(addr)) {
      await (await vault.grantRole(await vault[name](), addr)).wait();
      console.log(`Granted ${name} → ${addr}`);
    }
  }

  // 4. Demo collection
  const deadline = Math.floor(new Date("2026-11-30T23:59:59+08:00").getTime() / 1000);
  await (
    await vault.createCollection(
      "Org Fee · 1st Sem",
      P(150),
      deadline,
      ["Printing", "Food", "Shirts"],
      [P(2000), P(3000), P(1500)]
    )
  ).wait();
  console.log(`Created collection 0: Org Fee · 1st Sem (₱150)`);

  // 5. Save addresses
  const out = {
    network: hre.network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    MockPHP: tokenAddr,
    AmbagVault: vaultAddr,
    adviserThreshold: ADVISER_THRESHOLD.toString(),
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hre.network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Saved deployments/${hre.network.name}.json`);

  // 6. Verify (testnet only)
  if (hre.network.name === "bscTestnet") {
    console.log("Waiting a few blocks before verifying…");
    await vault.deploymentTransaction().wait(5);
    const jobs = [
      { address: tokenAddr, constructorArguments: [] },
      { address: vaultAddr, constructorArguments: [tokenAddr, ADVISER_THRESHOLD.toString(), deployer.address] },
    ];
    for (const job of jobs) {
      try {
        await hre.run("verify:verify", job);
      } catch (e) {
        console.log(`Verify failed for ${job.address}: ${e.message}`);
        console.log(`Retry: npx hardhat verify --network bscTestnet ${job.address} ${job.constructorArguments.join(" ")}`);
      }
    }
    console.log(`\nBscScan:\n  https://testnet.bscscan.com/address/${tokenAddr}\n  https://testnet.bscscan.com/address/${vaultAddr}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
