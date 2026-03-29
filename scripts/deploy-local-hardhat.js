/**
 * Deploy FHE Private Lending contracts to a local Hardhat node.
 *
 * Run with:
 *   npx hardhat run scripts/deploy-local-hardhat.js --network localhost
 *
 * Writes deployed addresses to deployments-local-hardhat.json.
 *
 * Deployment order (dependency chain):
 *   1. PrivateCollateralVault   (no deps)
 *   2. PrivateLendingPool       (no deps)
 *   3. PrivateBorrowManager     (needs PrivateCollateralVault address)
 *   4. PrivateLiquidationEngine (needs PrivateCollateralVault + PrivateBorrowManager)
 *
 * Wiring:
 *   - PrivateCollateralVault.authorizeContract(PrivateBorrowManager)
 *   - PrivateCollateralVault.authorizeContract(PrivateLiquidationEngine)
 *   - PrivateBorrowManager.setLendingPool(PrivateLendingPool)
 *   - PrivateBorrowManager.authorizeContract(PrivateLiquidationEngine)
 *   - PrivateLendingPool.setBorrowManager(PrivateBorrowManager)
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // ── 1. PrivateCollateralVault ──────────────────────────────────────────────
  console.log("\nDeploying PrivateCollateralVault...");
  const CollateralVaultFactory = await ethers.getContractFactory(
    "PrivateCollateralVault"
  );
  const collateralVault = await CollateralVaultFactory.deploy();
  await collateralVault.waitForDeployment();
  const collateralVaultAddress = await collateralVault.getAddress();
  console.log("  PrivateCollateralVault:", collateralVaultAddress);

  // ── 2. PrivateLendingPool ──────────────────────────────────────────────────
  console.log("Deploying PrivateLendingPool...");
  const LendingPoolFactory = await ethers.getContractFactory(
    "PrivateLendingPool"
  );
  const lendingPool = await LendingPoolFactory.deploy();
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("  PrivateLendingPool:", lendingPoolAddress);

  // ── 3. PrivateBorrowManager ────────────────────────────────────────────────
  console.log("Deploying PrivateBorrowManager...");
  const BorrowManagerFactory = await ethers.getContractFactory(
    "PrivateBorrowManager"
  );
  const borrowManager = await BorrowManagerFactory.deploy(collateralVaultAddress);
  await borrowManager.waitForDeployment();
  const borrowManagerAddress = await borrowManager.getAddress();
  console.log("  PrivateBorrowManager:", borrowManagerAddress);

  // ── 4. PrivateLiquidationEngine ────────────────────────────────────────────
  console.log("Deploying PrivateLiquidationEngine...");
  const LiquidationEngineFactory = await ethers.getContractFactory(
    "PrivateLiquidationEngine"
  );
  const liquidationEngine = await LiquidationEngineFactory.deploy(
    collateralVaultAddress,
    borrowManagerAddress
  );
  await liquidationEngine.waitForDeployment();
  const liquidationEngineAddress = await liquidationEngine.getAddress();
  console.log("  PrivateLiquidationEngine:", liquidationEngineAddress);

  // ── Wiring ─────────────────────────────────────────────────────────────────
  console.log("\nWiring contracts together...");

  // Allow BorrowManager to read collateral handles
  let tx = await collateralVault.authorizeContract(borrowManagerAddress);
  await tx.wait();
  console.log("  CollateralVault.authorizeContract(BorrowManager) ✓");

  // Allow LiquidationEngine to read collateral handles
  tx = await collateralVault.authorizeContract(liquidationEngineAddress);
  await tx.wait();
  console.log("  CollateralVault.authorizeContract(LiquidationEngine) ✓");

  // Tell BorrowManager which pool it lends from
  tx = await borrowManager.setLendingPool(lendingPoolAddress);
  await tx.wait();
  console.log("  BorrowManager.setLendingPool(LendingPool) ✓");

  // Allow LiquidationEngine to read debt handles
  tx = await borrowManager.authorizeContract(liquidationEngineAddress);
  await tx.wait();
  console.log("  BorrowManager.authorizeContract(LiquidationEngine) ✓");

  // Tell LendingPool which borrow manager it works with
  tx = await lendingPool.setBorrowManager(borrowManagerAddress);
  await tx.wait();
  console.log("  LendingPool.setBorrowManager(BorrowManager) ✓");

  // ── Write addresses ────────────────────────────────────────────────────────
  const deployments = {
    network: "localhost",
    chainId: 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PRIVATE_COLLATERAL_VAULT: collateralVaultAddress,
      PRIVATE_BORROW_MANAGER: borrowManagerAddress,
      PRIVATE_LENDING_POOL: lendingPoolAddress,
      PRIVATE_LIQUIDATION_ENGINE: liquidationEngineAddress,
    },
  };

  const outputPath = path.join(__dirname, "..", "deployments-local-hardhat.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployments, null, 2));
  console.log("\nDeployments written to deployments-local-hardhat.json");
  console.log(JSON.stringify(deployments.contracts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
