/**
 * Deploy mock ERC20 tokens for local testing.
 *
 * Run with:
 *   npx hardhat run scripts/deploy-tokens.js --network localhost
 *
 * Deploys: MockWETH, MockUSDC, MockWBTC, MockBNB
 * Mints initial supply to deployer and optional test wallets.
 * Writes addresses to polaris-protocol/deployments/localhost.json
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Test wallets to mint to (add more as needed)
const TEST_WALLETS = [
  // Hardhat default accounts 0-2
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const signers = await ethers.getSigners();

  // Use first 3 accounts as test wallets
  const testWallets = signers.slice(0, 3).map((s) => s.address);

  console.log("Deploying mock tokens with account:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // ── Deploy ─────────────────────────────────────────────────────────────────

  console.log("\nDeploying MockWETH...");
  const WETHFactory = await ethers.getContractFactory("MockWETH");
  const weth = await WETHFactory.deploy();
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("  MockWETH:", wethAddress);

  console.log("Deploying MockUSDC...");
  const USDCFactory = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDCFactory.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("  MockUSDC:", usdcAddress);

  console.log("Deploying MockWBTC...");
  const WBTCFactory = await ethers.getContractFactory("MockWBTC");
  const wbtc = await WBTCFactory.deploy();
  await wbtc.waitForDeployment();
  const wbtcAddress = await wbtc.getAddress();
  console.log("  MockWBTC:", wbtcAddress);

  console.log("Deploying MockBNB...");
  const BNBFactory = await ethers.getContractFactory("MockBNB");
  const bnb = await BNBFactory.deploy();
  await bnb.waitForDeployment();
  const bnbAddress = await bnb.getAddress();
  console.log("  MockBNB:", bnbAddress);

  // ── Mint to test wallets ───────────────────────────────────────────────────

  console.log("\nMinting tokens to test wallets...");

  for (const wallet of testWallets) {
    // 1 billion WETH (18 decimals)
    await (await weth.mint(wallet, ethers.parseEther("1000000000"))).wait();
    // 1 billion USDC (6 decimals)
    await (await usdc.mint(wallet, 1_000_000_000n * 10n ** 6n)).wait();
    // 1 billion WBTC (8 decimals)
    await (await wbtc.mint(wallet, 1_000_000_000n * 10n ** 8n)).wait();
    // 1 billion BNB (18 decimals)
    await (await bnb.mint(wallet, ethers.parseEther("1000000000"))).wait();

    console.log(`  Minted to ${wallet}:`);
    console.log(`    WETH: ${ethers.formatEther(await weth.balanceOf(wallet))}`);
    console.log(`    USDC: ${(await usdc.balanceOf(wallet)) / 10n ** 6n}`);
    console.log(`    WBTC: ${(await wbtc.balanceOf(wallet)) / 10n ** 8n}`);
    console.log(`    BNB:  ${ethers.formatEther(await bnb.balanceOf(wallet))}`);
  }

  // ── Save addresses ─────────────────────────────────────────────────────────

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const output = {
    network: "localhost",
    chainId: 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    WETH: wethAddress,
    USDC: usdcAddress,
    WBTC: wbtcAddress,
    BNB: bnbAddress,
  };

  const outputPath = path.join(deploymentsDir, "localhost.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("\nAddresses written to deployments/localhost.json");
  console.log(JSON.stringify({ WETH: wethAddress, USDC: usdcAddress, WBTC: wbtcAddress, BNB: bnbAddress }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
