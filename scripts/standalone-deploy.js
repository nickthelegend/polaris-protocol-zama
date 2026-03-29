const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("----------------------------------------------------------");
  console.log("Standalone Deployment to Hardhat Node (Port 8545)");
  console.log("Account:", wallet.address);
  console.log("----------------------------------------------------------\n");

  const loadArtifact = (name) => {
    const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  };

  // 1. Deploy PrivateCollateralVault
  console.log("[1/4] Deploying PrivateCollateralVault...");
  const vaultArtifact = loadArtifact("PrivateCollateralVault");
  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, wallet);
  const collateralVault = await vaultFactory.deploy();
  await collateralVault.waitForDeployment();
  const collateralVaultAddress = await collateralVault.getAddress();
  console.log(`- Deployed at: ${collateralVaultAddress}`);

  // 2. Deploy PrivateLendingPool
  console.log("[2/4] Deploying PrivateLendingPool...");
  const poolArtifact = loadArtifact("PrivateLendingPool");
  const poolFactory = new ethers.ContractFactory(poolArtifact.abi, poolArtifact.bytecode, wallet);
  const lendingPool = await poolFactory.deploy();
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log(`- Deployed at: ${lendingPoolAddress}`);

  // 3. Deploy PrivateBorrowManager
  console.log("[3/4] Deploying PrivateBorrowManager...");
  const managerArtifact = loadArtifact("PrivateBorrowManager");
  const managerFactory = new ethers.ContractFactory(managerArtifact.abi, managerArtifact.bytecode, wallet);
  const borrowManager = await managerFactory.deploy(collateralVaultAddress);
  await borrowManager.waitForDeployment();
  const borrowManagerAddress = await borrowManager.getAddress();
  console.log(`- Deployed at: ${borrowManagerAddress}`);

  // 4. Deploy PrivateLiquidationEngine
  console.log("[4/4] Deploying PrivateLiquidationEngine...");
  const engineArtifact = loadArtifact("PrivateLiquidationEngine");
  const engineFactory = new ethers.ContractFactory(engineArtifact.abi, engineArtifact.bytecode, wallet);
  const liquidationEngine = await engineFactory.deploy(collateralVaultAddress, borrowManagerAddress);
  await liquidationEngine.waitForDeployment();
  const liquidationEngineAddress = await liquidationEngine.getAddress();
  console.log(`- Deployed at: ${liquidationEngineAddress}`);

  // 5. Configuration & Wiring
  console.log("\n[5/5] Wiring Dependencies...");
  
  const tx1 = await borrowManager.setLendingPool(lendingPoolAddress);
  await tx1.wait();
  console.log("- PrivateBorrowManager linked to PrivateLendingPool");

  const tx2 = await lendingPool.setBorrowManager(borrowManagerAddress);
  await tx2.wait();
  console.log("- PrivateLendingPool linked to PrivateBorrowManager");

  const deploymentData = {
    PrivateLendingPool: lendingPoolAddress,
    PrivateCollateralVault: collateralVaultAddress,
    PrivateBorrowManager: borrowManagerAddress,
    PrivateLiquidationEngine: liquidationEngineAddress,
    network: "localhost",
    deployer: wallet.address,
    timestamp: new Date().toISOString()
  };

  // Store addresses in config file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  fs.writeFileSync(
    path.join(deploymentsDir, "localhost.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log(`\nDeployment saved to: polaris-protocol/deployments/localhost.json`);
}

main().catch(console.error);
