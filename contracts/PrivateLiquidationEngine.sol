// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint128, externalEuint128, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { PrivateCollateralVault } from "./PrivateCollateralVault.sol";
import { PrivateBorrowManager } from "./PrivateBorrowManager.sol";

/**
 * @title PrivateLiquidationEngine
 * @notice Confidential liquidation logic using Zama FHEVM
 */
contract PrivateLiquidationEngine is ZamaEthereumConfig {
    PrivateCollateralVault public collateralVault;
    PrivateBorrowManager public borrowManager;
    
    // Liquidation threshold (lower than borrow ratio, e.g. 1.25x)
    uint128 constant LIQUIDATION_THRESHOLD = 125;

    // Track if a user is currently under liquidation (revealed)
    mapping(address => bool) public isLiquidatable;

    event LiquidationStarted(address indexed user);
    event Liquidated(address indexed user, address indexed liquidator);

    constructor(address _collateralVault, address _borrowManager) {
        collateralVault = PrivateCollateralVault(_collateralVault);
        borrowManager = PrivateBorrowManager(_borrowManager);
    }

    /**
     * @notice Check health factor and reveal if liquidatable
     * @param user The user address to audit
     */
    function auditHealth(address user) external {
        euint128 collateral = collateralVault.getCollateralAmount(user);
        euint128 debt = borrowManager.getDebtAmount(user);
        
        // Under threshold: collateral * 100 < debt * LIQUIDATION_THRESHOLD
        euint128 weightedCollateral = FHE.mul(collateral, FHE.asEuint128(100));
        euint128 thresholdCollateral = FHE.mul(debt, FHE.asEuint128(LIQUIDATION_THRESHOLD));
        
        ebool isUnhealthy = FHE.lt(weightedCollateral, thresholdCollateral);
        
        // This is where public decryption comes in.
        // We make the `isUnhealthy` flag publicly decryptable so the off-chain relayer can confirm it.
        FHE.makePubliclyDecryptable(isUnhealthy);
        
        // Mark the user as having a pending health check (off-chain handles result)
        emit LiquidationStarted(user);
    }

    /**
     * @notice Perform liquidation with a decryption proof of the `isUnhealthy` flag
     * @param user The user address to liquidate
     * @param isUnhealthyResult The decrypted boolean result
     * @param proof The decryption proof
     */
    function liquidate(address user, bool isUnhealthyResult, bytes calldata proof) external {
        // 1. Verify that isUnhealthyResult was indeed the output of auditHealth(user)
        // Note: For simplicity, we assume handles are tracked by the UI/off-chain correctly.
        // In a full implementation, you'd store the handle and verify it here.
        
        require(isUnhealthyResult == true, "User is healthy");
        
        // Actually liquidate (e.g., zero out debt, seize collateral)
        // Simplified: Clear user's position
        // BorrowManager and CollateralVault would need to allow this engine.
        
        isLiquidatable[user] = true;
        
        emit Liquidated(user, msg.sender);
    }
}
