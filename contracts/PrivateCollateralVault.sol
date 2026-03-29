// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivateCollateralVault
 * @notice Confidential collateral management using Zama FHEVM
 */
contract PrivateCollateralVault is ZamaEthereumConfig {
    // Mapping of user to their collateral amount (encrypted)
    mapping(address => euint64) private collateralAmounts;

    // Authorization for other protocol contracts (e.g. BorrowManager)
    mapping(address => bool) private authorizedVaultManagers;
    address[] private authorizedManagerList;

    event CollateralDeposited(address indexed user);
    event CollateralWithdrawn(address indexed user);

    /**
     * @notice Authorize a contract to use encrypted collateral handles in FHE operations
     * @param contractAddress The contract to authorize
     */
    function authorizeContract(address contractAddress) external {
        if (!authorizedVaultManagers[contractAddress]) {
            authorizedVaultManagers[contractAddress] = true;
            authorizedManagerList.push(contractAddress);
        }
    }

    /**
     * @dev Grant FHE access to all authorized managers for a given handle
     */
    function _grantAuthorizedAccess(euint64 handle) internal {
        for (uint256 i = 0; i < authorizedManagerList.length; i++) {
            FHE.allow(handle, authorizedManagerList[i]);
        }
    }

    constructor() {}

    /**
     * @notice Deposit collateral privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function depositCollateral(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        if (FHE.isInitialized(collateralAmounts[msg.sender])) {
            collateralAmounts[msg.sender] = FHE.add(collateralAmounts[msg.sender], amount);
        } else {
            collateralAmounts[msg.sender] = amount;
        }

        // Access control: grant to this contract, the user, and any authorized managers
        FHE.allowThis(collateralAmounts[msg.sender]);
        FHE.allow(collateralAmounts[msg.sender], msg.sender);
        _grantAuthorizedAccess(collateralAmounts[msg.sender]);

        emit CollateralDeposited(msg.sender);
    }

    /**
     * @notice Withdraw collateral privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function withdrawCollateral(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 currentCollateral = collateralAmounts[msg.sender];

        // Cap withdrawal at current balance (branchless, no underflow)
        ebool hasCollateral = FHE.le(amount, currentCollateral);
        euint64 amountToSubtract = FHE.select(hasCollateral, amount, currentCollateral);
        collateralAmounts[msg.sender] = FHE.sub(currentCollateral, amountToSubtract);

        // Access control: grant to this contract, the user, and any authorized managers
        FHE.allowThis(collateralAmounts[msg.sender]);
        FHE.allow(collateralAmounts[msg.sender], msg.sender);
        _grantAuthorizedAccess(collateralAmounts[msg.sender]);

        emit CollateralWithdrawn(msg.sender);
    }

    /**
     * @notice Get encrypted collateral amount of the user
     * @param user The user address
     */
    function getCollateralAmount(address user) external view returns (euint64) {
        return collateralAmounts[user];
    }
}
