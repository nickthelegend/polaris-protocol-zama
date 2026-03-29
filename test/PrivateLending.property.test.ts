import "@fhevm/hardhat-plugin";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "ethers";
import * as fc from "fast-check";
import hre from "hardhat";

// Feature: fhe-private-lending, Property 1: Collateral deposit round-trip

describe("FHE Private Lending - Property Tests", function () {
  // Increase timeout for FHE operations
  this.timeout(300_000);

  before(async function () {
    if (!hre.fhevm.isMock) {
      this.skip();
    }
  });

  /**
   * Property 1: Collateral Deposit Round-Trip
   *
   * For any valid uint64 amount, depositing that amount into PrivateCollateralVault
   * and then performing a user-decryption of the collateral handle should return
   * the deposited amount.
   *
   * Validates: Requirements 2.1, 2.3, 8.3
   */
  it("Property 1: Collateral deposit round-trip - for any uint64 amount, deposit then decrypt returns the same amount", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 4_294_967_295n }),
        async (amount) => {
          const user = signers[1];

          const FreshVaultFactory = await hre.ethers.getContractFactory("PrivateCollateralVault");
          const freshVault = await FreshVaultFactory.connect(user).deploy();
          await freshVault.waitForDeployment();
          const freshVaultAddress = await freshVault.getAddress();

          const input = hre.fhevm.createEncryptedInput(freshVaultAddress, user.address);
          input.add64(amount);
          const encryptedInput = await input.encrypt();

          const tx = await freshVault.connect(user).depositCollateral(encryptedInput.handles[0], encryptedInput.inputProof);
          await tx.wait();

          const collateralHandle = await freshVault.getCollateralAmount(user.address);
          const decrypted = await hre.fhevm.userDecryptEuint(FhevmType.euint64, collateralHandle, freshVaultAddress, user);

          expect(decrypted).to.equal(amount);
        },
      ),
      { numRuns: 10, verbose: true },
    );
  });

  /**
   * Property 2: Borrow Round-Trip
   *
   * For any valid collateral C and borrow B where C * 100 >= B * 150 (healthy),
   * depositing C as collateral and borrowing B should result in a user-decryption
   * of the debt handle returning B.
   *
   * Feature: fhe-private-lending, Property 2: Borrow round-trip
   * Validates: Requirements 3.1, 3.5, 8.4
   */
  it("Property 2: Borrow round-trip - for any healthy (collateral, borrow) pair, borrow then decrypt returns borrow amount", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        // Generate borrow amount B in [1, 1000], then collateral C = ceil(B * 150 / 100) to guarantee health
        fc.bigInt({ min: 1n, max: 1_000n }).chain((borrow) => {
          const minCollateral = (borrow * 150n + 99n) / 100n; // ceil(borrow * 1.5)
          return fc.tuple(
            fc.bigInt({ min: minCollateral, max: minCollateral + 10_000n }),
            fc.constant(borrow),
          );
        }),
        async ([collateral, borrow]) => {
          const user = signers[2];

          // Deploy fresh vault and borrow manager
          const VaultFactory = await hre.ethers.getContractFactory("PrivateCollateralVault");
          const vault = await VaultFactory.connect(user).deploy();
          await vault.waitForDeployment();
          const vaultAddress = await vault.getAddress();

          const BorrowFactory = await hre.ethers.getContractFactory("PrivateBorrowManager");
          const borrowManager = await BorrowFactory.connect(user).deploy(vaultAddress);
          await borrowManager.waitForDeployment();
          const borrowAddress = await borrowManager.getAddress();

          // Authorize borrow manager to use collateral handles in FHE ops
          await (await vault.connect(user).authorizeContract(borrowAddress)).wait();

          // Deposit collateral
          const collateralInput = hre.fhevm.createEncryptedInput(vaultAddress, user.address);
          collateralInput.add64(collateral);
          const encCollateral = await collateralInput.encrypt();
          const depositTx = await vault.connect(user).depositCollateral(encCollateral.handles[0], encCollateral.inputProof);
          await depositTx.wait();

          // Borrow
          const borrowInput = hre.fhevm.createEncryptedInput(borrowAddress, user.address);
          borrowInput.add64(borrow);
          const encBorrow = await borrowInput.encrypt();
          const borrowTx = await borrowManager.connect(user).borrow(encBorrow.handles[0], encBorrow.inputProof);
          await borrowTx.wait();

          // Decrypt debt and verify
          const debtHandle = await borrowManager.getDebtAmount(user.address);
          const decryptedDebt = await hre.fhevm.userDecryptEuint(FhevmType.euint64, debtHandle, borrowAddress, user);

          expect(decryptedDebt).to.equal(borrow);
        },
      ),
      { numRuns: 10, verbose: true },
    );
  });

  /**
   * Property 6: Health Factor Enforcement
   *
   * For any collateral C and borrow B where C * 100 < B * 150 (unhealthy),
   * after attempting to borrow B, the debt handle should decrypt to 0
   * (the borrow was silently rejected).
   *
   * Feature: fhe-private-lending, Property 6: Health factor enforcement
   * Validates: Requirements 3.2, 8.7
   */
  it("Property 6: Health factor enforcement - undercollateralized borrow is silently rejected (debt stays 0)", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        // Generate borrow B in [2, 1000], then collateral C < ceil(B * 150 / 100)
        fc.bigInt({ min: 2n, max: 1_000n }).chain((borrow) => {
          const maxCollateral = (borrow * 150n) / 100n - 1n; // strictly less than required
          // Ensure maxCollateral >= 1
          if (maxCollateral < 1n) return fc.tuple(fc.constant(1n), fc.constant(borrow));
          return fc.tuple(
            fc.bigInt({ min: 1n, max: maxCollateral }),
            fc.constant(borrow),
          );
        }),
        async ([collateral, borrow]) => {
          const user = signers[3];

          const VaultFactory = await hre.ethers.getContractFactory("PrivateCollateralVault");
          const vault = await VaultFactory.connect(user).deploy();
          await vault.waitForDeployment();
          const vaultAddress = await vault.getAddress();

          const BorrowFactory = await hre.ethers.getContractFactory("PrivateBorrowManager");
          const borrowManager = await BorrowFactory.connect(user).deploy(vaultAddress);
          await borrowManager.waitForDeployment();
          const borrowAddress = await borrowManager.getAddress();

          // Authorize borrow manager to use collateral handles in FHE ops
          await (await vault.connect(user).authorizeContract(borrowAddress)).wait();

          // Deposit (insufficient) collateral
          const collateralInput = hre.fhevm.createEncryptedInput(vaultAddress, user.address);
          collateralInput.add64(collateral);
          const encCollateral = await collateralInput.encrypt();
          const depositTx = await vault.connect(user).depositCollateral(encCollateral.handles[0], encCollateral.inputProof);
          await depositTx.wait();

          // Attempt borrow (should be silently rejected)
          const borrowInput = hre.fhevm.createEncryptedInput(borrowAddress, user.address);
          borrowInput.add64(borrow);
          const encBorrow = await borrowInput.encrypt();
          const borrowTx = await borrowManager.connect(user).borrow(encBorrow.handles[0], encBorrow.inputProof);
          await borrowTx.wait();

          // Decrypt debt — should be 0 (borrow rejected)
          const debtHandle = await borrowManager.getDebtAmount(user.address);
          const decryptedDebt = await hre.fhevm.userDecryptEuint(FhevmType.euint64, debtHandle, borrowAddress, user);

          expect(decryptedDebt).to.equal(0n);
        },
      ),
      { numRuns: 10, verbose: true },
    );
  });

  /**
   * Property 3: Supply Round-Trip
   *
   * For any valid uint64 amount, supplying that amount into PrivateLendingPool
   * and then performing a user-decryption of the supplied balance handle should
   * return the supplied amount.
   *
   * Feature: fhe-private-lending, Property 3: Supply round-trip
   * Validates: Requirements 4.1, 4.5, 8.5
   */
  it("Property 3: Supply round-trip - for any uint64 amount, supply then decrypt returns the same amount", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 4_294_967_295n }),
        async (amount) => {
          const user = signers[5];

          const PoolFactory = await hre.ethers.getContractFactory("PrivateLendingPool");
          const pool = await PoolFactory.connect(user).deploy();
          await pool.waitForDeployment();
          const poolAddress = await pool.getAddress();

          const input = hre.fhevm.createEncryptedInput(poolAddress, user.address);
          input.add64(amount);
          const encryptedInput = await input.encrypt();

          const tx = await (pool as any).connect(user).supply(encryptedInput.handles[0], encryptedInput.inputProof);
          await tx.wait();

          const suppliedHandle = await (pool as any).getSuppliedAmount(user.address);
          const decrypted = await hre.fhevm.userDecryptEuint(FhevmType.euint64, suppliedHandle, poolAddress, user);

          expect(decrypted).to.equal(amount);
        },
      ),
      { numRuns: 10, verbose: true },
    );
  });

  /**
   * Property 4: Repay Round-Trip
   *
   * For any valid (collateral C, borrow B, repay R) where the borrow is healthy
   * and R <= B, after depositing C, borrowing B, and repaying R, a user-decryption
   * of the debt handle should return B - R.
   *
   * Feature: fhe-private-lending, Property 4: Repay round-trip
   * Validates: Requirements 3.3, 3.5
   */
  it("Property 4: Repay round-trip - after borrow then repay, debt equals borrow minus repay", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        // Generate borrow B in [1, 500], repay R in [0, B], collateral >= ceil(B * 1.5)
        fc.bigInt({ min: 1n, max: 500n }).chain((borrow) => {
          const minCollateral = (borrow * 150n + 99n) / 100n;
          return fc.tuple(
            fc.bigInt({ min: minCollateral, max: minCollateral + 5_000n }),
            fc.constant(borrow),
            fc.bigInt({ min: 0n, max: borrow }),
          );
        }),
        async ([collateral, borrow, repay]) => {
          const user = signers[4];

          const VaultFactory = await hre.ethers.getContractFactory("PrivateCollateralVault");
          const vault = await VaultFactory.connect(user).deploy();
          await vault.waitForDeployment();
          const vaultAddress = await vault.getAddress();

          const BorrowFactory = await hre.ethers.getContractFactory("PrivateBorrowManager");
          const borrowManager = await BorrowFactory.connect(user).deploy(vaultAddress);
          await borrowManager.waitForDeployment();
          const borrowAddress = await borrowManager.getAddress();

          // Authorize borrow manager to use collateral handles in FHE ops
          await (await vault.connect(user).authorizeContract(borrowAddress)).wait();

          // Deposit collateral
          const collateralInput = hre.fhevm.createEncryptedInput(vaultAddress, user.address);
          collateralInput.add64(collateral);
          const encCollateral = await collateralInput.encrypt();
          await (await vault.connect(user).depositCollateral(encCollateral.handles[0], encCollateral.inputProof)).wait();

          // Borrow
          const borrowInput = hre.fhevm.createEncryptedInput(borrowAddress, user.address);
          borrowInput.add64(borrow);
          const encBorrow = await borrowInput.encrypt();
          await (await borrowManager.connect(user).borrow(encBorrow.handles[0], encBorrow.inputProof)).wait();

          // Repay
          const repayInput = hre.fhevm.createEncryptedInput(borrowAddress, user.address);
          repayInput.add64(repay);
          const encRepay = await repayInput.encrypt();
          await (await borrowManager.connect(user).repay(encRepay.handles[0], encRepay.inputProof)).wait();

          // Decrypt debt and verify it equals borrow - repay
          const debtHandle = await borrowManager.getDebtAmount(user.address);
          const decryptedDebt = await hre.fhevm.userDecryptEuint(FhevmType.euint64, debtHandle, borrowAddress, user);

          expect(decryptedDebt).to.equal(borrow - repay);
        },
      ),
      { numRuns: 10, verbose: true },
    );
  });

  /**
   * Property 5: Liquidation Correctness
   *
   * For any collateral C and debt D where C * 100 < D * 125 (undercollateralized),
   * after calling auditHealth and resolveAudit with the correct decryption proof,
   * isLiquidatable[user] should be true.
   *
   * Feature: fhe-private-lending, Property 5: Liquidation correctness
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   */
  it("Property 5: Liquidation correctness - undercollateralized position is marked liquidatable after audit+resolve", async function () {
    const signers = await hre.ethers.getSigners();

    await fc.assert(
      fc.asyncProperty(
        // Generate debt D in [2, 500], collateral C where C * 100 < D * 125
        // i.e. C < D * 1.25, so C <= floor(D * 125 / 100) - 1
        fc.bigInt({ min: 2n, max: 500n }).chain((debt) => {
          const maxCollateral = (debt * 125n) / 100n - 1n;
          if (maxCollateral < 1n) return fc.tuple(fc.constant(1n), fc.constant(debt));
          return fc.tuple(
            fc.bigInt({ min: 1n, max: maxCollateral }),
            fc.constant(debt),
          );
        }),
        async ([collateral, debt]) => {
          const user = signers[6];
          const liquidator = signers[7];

          // Deploy fresh contracts
          const VaultFactory = await hre.ethers.getContractFactory("PrivateCollateralVault");
          const vault = await VaultFactory.connect(user).deploy();
          await vault.waitForDeployment();
          const vaultAddress = await vault.getAddress();

          const BorrowFactory = await hre.ethers.getContractFactory("PrivateBorrowManager");
          const borrowManager = await BorrowFactory.connect(user).deploy(vaultAddress);
          await borrowManager.waitForDeployment();
          const borrowAddress = await borrowManager.getAddress();

          const LiqFactory = await hre.ethers.getContractFactory("PrivateLiquidationEngine");
          const liqEngine = await LiqFactory.connect(user).deploy(vaultAddress, borrowAddress);
          await liqEngine.waitForDeployment();
          const liqAddress = await liqEngine.getAddress();

          // Authorize borrow manager to read collateral handles
          await (await vault.connect(user).authorizeContract(borrowAddress)).wait();
          // Authorize liquidation engine to read collateral and debt handles
          await (await vault.connect(user).authorizeContract(liqAddress)).wait();
          await (await borrowManager.connect(user).authorizeContract(liqAddress)).wait();

          // To create an undercollateralized position:
          // 1. Deposit enough collateral to borrow `debt` (requires collateral >= debt * 1.5)
          // 2. Borrow `debt`
          // 3. Withdraw collateral down to `collateral` (leaving collateral * 100 < debt * 125)
          const minCollateralForBorrow = (debt * 150n + 99n) / 100n;

          const depositInput = hre.fhevm.createEncryptedInput(vaultAddress, user.address);
          depositInput.add64(minCollateralForBorrow);
          const encDeposit = await depositInput.encrypt();
          await (await vault.connect(user).depositCollateral(encDeposit.handles[0], encDeposit.inputProof)).wait();

          // Borrow `debt`
          const borrowInput = hre.fhevm.createEncryptedInput(borrowAddress, user.address);
          borrowInput.add64(debt);
          const encBorrow = await borrowInput.encrypt();
          await (await borrowManager.connect(user).borrow(encBorrow.handles[0], encBorrow.inputProof)).wait();

          // Withdraw collateral down to `collateral` (leaving position undercollateralized)
          const withdrawAmt = minCollateralForBorrow - collateral;
          if (withdrawAmt > 0n) {
            const withdrawInput = hre.fhevm.createEncryptedInput(vaultAddress, user.address);
            withdrawInput.add64(withdrawAmt);
            const encWithdraw = await withdrawInput.encrypt();
            await (await vault.connect(user).withdrawCollateral(encWithdraw.handles[0], encWithdraw.inputProof)).wait();
          }

          // Audit health
          await (await liqEngine.connect(liquidator).auditHealth(user.address)).wait();

          // Get the pending health check handle and perform public decryption
          const pendingHandle = await liqEngine.getPendingHealthCheck(user.address);
          const handleHex = ethers.toBeHex(ethers.toBigInt(pendingHandle), 32);
          const publicDecryptResult = await hre.fhevm.publicDecrypt([handleHex]);

          // Resolve audit with the decryption proof
          await (await liqEngine.connect(liquidator).resolveAudit(
            user.address,
            publicDecryptResult.abiEncodedClearValues,
            publicDecryptResult.decryptionProof,
          )).wait();

          // Assert: user is now marked as liquidatable
          const liquidatable = await liqEngine.isLiquidatable(user.address);
          expect(liquidatable).to.equal(true);
        },
      ),
      { numRuns: 5, verbose: true },
    );
  });
});
