// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint128, externalEuint128, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { PrivateCollateralVault } from "./PrivateCollateralVault.sol";

/**
 * @title PrivateBorrowManager
 * @notice Confidential debt management using Zama FHEVM
 */
contract PrivateBorrowManager is ZamaEthereumConfig {
    PrivateCollateralVault public collateralVault;
    
    // Mapping of user to their debt amount (encrypted)
    mapping(address => euint128) private debtAmounts;
    
    // Config: Fixed collateral requirement ratio of 1.5x (150%)
    uint128 constant COLLATERAL_RATIO = 150;

    event Borrowed(address indexed user);
    event Repaid(address indexed user);

    constructor(address _collateralVault) {
        collateralVault = PrivateCollateralVault(_collateralVault);
    }

    /**
     * @notice Borrow tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function borrow(externalEuint128 encryptedAmount, bytes calldata inputProof) external {
        euint128 amountToBorrow = FHE.fromExternal(encryptedAmount, inputProof);
        euint128 currentDebt = debtAmounts[msg.sender];
        euint128 collateral = collateralVault.getCollateralAmount(msg.sender);
        
        // Calculate new debt
        euint128 newDebt = FHE.add(currentDebt, amountToBorrow);
        
        // Check health factor: collateral >= newDebt * 1.5
        // -> collateral * 100 >= newDebt * 150
        euint128 weightedCollateral = FHE.mul(collateral, FHE.asEuint128(100));
        euint128 requiredCollateral = FHE.mul(newDebt, FHE.asEuint128(COLLATERAL_RATIO));
        
        ebool isHealthy = FHE.ge(weightedCollateral, requiredCollateral);
        
        // Only update debt if it's healthy (branchless)
        debtAmounts[msg.sender] = FHE.select(isHealthy, newDebt, currentDebt);

        // Access control
        FHE.allowThis(debtAmounts[msg.sender]);
        FHE.allow(debtAmounts[msg.sender], msg.sender);

        emit Borrowed(msg.sender);
    }

    /**
     * @notice Repay tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function repay(externalEuint128 encryptedAmount, bytes calldata inputProof) external {
        euint128 amountToRepay = FHE.fromExternal(encryptedAmount, inputProof);
        euint128 currentDebt = debtAmounts[msg.sender];
        
        ebool hasDebt = FHE.le(amountToRepay, currentDebt);
        
        // amountToSubtract = hasDebt ? amountToRepay : currentDebt (for full repayment if they overpay?)
        // Or just allow them to repay whatever, and cap at currentDebt.
        euint128 amountToSubtract = FHE.select(hasDebt, amountToRepay, currentDebt);
        
        debtAmounts[msg.sender] = FHE.sub(currentDebt, amountToSubtract);

        // Access control
        FHE.allowThis(debtAmounts[msg.sender]);
        FHE.allow(debtAmounts[msg.sender], msg.sender);

        emit Repaid(msg.sender);
    }

    /**
     * @notice Get encrypted debt amount of the user
     * @param user The user address
     */
    function getDebtAmount(address user) external view returns (euint128) {
        return debtAmounts[user];
    }
}
