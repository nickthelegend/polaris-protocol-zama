const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Confidential Lending Suite with account:", deployer.address);

  // 1. Deploy CollateralVault
  const PrivateCollateralVault = await ethers.getContractFactory("PrivateCollateralVault");
  const collateralVault = await PrivateCollateralVault.deploy();
  await collateralVault.waitForDeployment();
  const collateralVaultAddress = await collateralVault.getAddress();
  console.log("PrivateCollateralVault deployed to:", collateralVaultAddress);

  // 2. Deploy LendingPool
  const PrivateLendingPool = await ethers.getContractFactory("PrivateLendingPool");
  const lendingPool = await PrivateLendingPool.deploy();
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("PrivateLendingPool deployed to:", lendingPoolAddress);

  // 3. Deploy BorrowManager
  const PrivateBorrowManager = await ethers.getContractFactory("PrivateBorrowManager");
  const borrowManager = await PrivateBorrowManager.deploy(collateralVaultAddress);
  await borrowManager.waitForDeployment();
  const borrowManagerAddress = await borrowManager.getAddress();
  console.log("PrivateBorrowManager deployed to:", borrowManagerAddress);

  // 4. Deploy LiquidationEngine
  const PrivateLiquidationEngine = await ethers.getContractFactory("PrivateLiquidationEngine");
  const liquidationEngine = await PrivateLiquidationEngine.deploy(collateralVaultAddress, borrowManagerAddress);
  await liquidationEngine.waitForDeployment();
  const liquidationEngineAddress = await liquidationEngine.getAddress();
  console.log("PrivateLiquidationEngine deployed to:", liquidationEngineAddress);

  console.log("\nSummary of Deployed Confidential Contracts (Sepolia Only):");
  console.log("----------------------------------------------------------");
  console.log(`PrivateLendingPool:     ${lendingPoolAddress}`);
  console.log(`PrivateCollateralVault: ${collateralVaultAddress}`);
  console.log(`PrivateBorrowManager:   ${borrowManagerAddress}`);
  console.log(`PrivateLiquidationEngine: ${liquidationEngineAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
