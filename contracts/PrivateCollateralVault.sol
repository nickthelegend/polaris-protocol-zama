// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint128, externalEuint128, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivateCollateralVault
 * @notice Confidential collateral management using Zama FHEVM
 */
contract PrivateCollateralVault is ZamaEthereumConfig {
    // Mapping of user to their collateral amount (encrypted)
    mapping(address => euint128) private collateralAmounts;
    
    // Authorization for other protocol contracts (e.g. BorrowManager)
    mapping(address => bool) private authorizedVaultManagers;

    event CollateralDeposited(address indexed user);
    event CollateralWithdrawn(address indexed user);

    constructor() {}

    /**
     * @notice Deposit collateral privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function depositCollateral(externalEuint128 encryptedAmount, bytes calldata inputProof) external {
        euint128 amount = FHE.fromExternal(encryptedAmount, inputProof);
        
        if (FHE.isInitialized(collateralAmounts[msg.sender])) {
            collateralAmounts[msg.sender] = FHE.add(collateralAmounts[msg.sender], amount);
        } else {
            collateralAmounts[msg.sender] = amount;
        }

        // Access control
        FHE.allowThis(collateralAmounts[msg.sender]);
        FHE.allow(collateralAmounts[msg.sender], msg.sender);

        emit CollateralDeposited(msg.sender);
    }

    /**
     * @notice Withdraw collateral privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function withdrawCollateral(externalEuint128 encryptedAmount, bytes calldata inputProof) external {
        euint128 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint128 currentCollateral = collateralAmounts[msg.sender];
        
        // Check if they have enough balance (confidential)
        ebool hasCollateral = FHE.le(amount, currentCollateral);
        
        // This is where things get tricky: withdrawal of collateral should also check health factor.
        // For now, we perform a basic subtraction and let the BorrowManager check HF.
        
        euint128 amountToSubtract = FHE.select(hasCollateral, amount, FHE.asEuint128(0));
        collateralAmounts[msg.sender] = FHE.sub(currentCollateral, amountToSubtract);

        // Access control
        FHE.allowThis(collateralAmounts[msg.sender]);
        FHE.allow(collateralAmounts[msg.sender], msg.sender);

        emit CollateralWithdrawn(msg.sender);
    }

    /**
     * @notice Get encrypted collateral amount of the user
     * @param user The user address
     */
    function getCollateralAmount(address user) external view returns (euint128) {
        return collateralAmounts[user];
    }
}
