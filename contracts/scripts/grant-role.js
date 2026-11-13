// Grants ADMIN / TREASURER / ADVISER / AGENT roles to the addresses in .env.
// Run after officers log in once (so their Privy wallet addresses are known).
//
// Usage: npx hardhat run scripts/grant-role.js --network bscTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { AmbagVault } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vault = await ethers.getContractAt("AmbagVault", AmbagVault);

  const roles = [
    // Org president: creates and closes fees from /officer. For the demo this is the treasurer's wallet.
    ["ADMIN_ROLE", process.env.ADMIN_ADDRESS],
    ["TREASURER_ROLE", process.env.TREASURER_ADDRESS],
    ["ADVISER_ROLE", process.env.ADVISER_ADDRESS],
    ["AGENT_ROLE", process.env.AGENT_ADDRESS],
  ];

  for (const [name, addr] of roles) {
    if (!addr || !ethers.isAddress(addr)) {
      console.log(`Skip ${name}: no valid address in .env`);
      continue;
    }
    const role = await vault[name]();
    if (await vault.hasRole(role, addr)) {
      console.log(`${name} already granted → ${addr}`);
      continue;
    }
    await (await vault.grantRole(role, addr)).wait();
    console.log(`Granted ${name} → ${addr}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
