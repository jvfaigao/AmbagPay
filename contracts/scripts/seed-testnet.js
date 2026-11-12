// BSC TESTNET ONLY: gives the agent wallet gas and makes a few throwaway members pay,
// so the vault has funds for the demo. Run once, right after deploy.js.
//
// Usage: npx hardhat run scripts/seed-testnet.js --network bscTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const MEMBERS = 8; // 8 × ₱150 = ₱1,200 in the vault; live demo payments add the rest
const MEMBER_GAS = ethers.parseEther("0.001"); // approve + pay, with room to spare
const AGENT_GAS = ethers.parseEther("0.02"); // ~a hundred proposeExpense calls

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 97n) throw new Error("seed-testnet.js is for BSC Testnet (chain 97) only.");

  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { AmbagVault, MockPHP } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vault = await ethers.getContractAt("AmbagVault", AmbagVault);
  const token = await ethers.getContractAt("MockPHP", MockPHP);
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} tBNB`);

  const agent = process.env.AGENT_ADDRESS;
  if (agent && ethers.isAddress(agent) && (await ethers.provider.getBalance(agent)) < AGENT_GAS / 2n) {
    await (await deployer.sendTransaction({ to: agent, value: AGENT_GAS })).wait();
    console.log(`Agent ${agent} funded with ${ethers.formatEther(AGENT_GAS)} tBNB`);
  }

  const { amountPerMember } = await vault.getCollection(0);
  for (let i = 0; i < MEMBERS; i++) {
    const member = ethers.Wallet.createRandom().connect(ethers.provider);
    await (await deployer.sendTransaction({ to: member.address, value: MEMBER_GAS })).wait();
    await (await token.mint(member.address, amountPerMember)).wait();
    await (await token.connect(member).approve(AmbagVault, amountPerMember)).wait();
    await (await vault.connect(member).pay(0)).wait();
    console.log(`Member ${i + 1}/${MEMBERS} paid (${member.address})`);
  }

  const c = await vault.getCollection(0);
  console.log(`Collection 0: ${c.payerCount} paid, ₱${ethers.formatEther(c.totalCollected)} collected`);
  console.log(`Deployer balance left: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} tBNB`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
