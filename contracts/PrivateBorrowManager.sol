// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { PrivateCollateralVault } from "./PrivateCollateralVault.sol";

/**
 * @title PrivateBorrowManager
 * @notice Confidential debt management using Zama FHEVM
 */
contract PrivateBorrowManager is ZamaEthereumConfig {
    PrivateCollateralVault public collateralVault;
    address public lendingPool;

    // Mapping of user to their debt amount (encrypted)
    mapping(address => euint64) private debtAmounts;

    // Authorization for other protocol contracts (e.g. LiquidationEngine)
    mapping(address => bool) private authorizedManagers;
    address[] private authorizedManagerList;

    // Config: Fixed collateral requirement ratio of 1.5x (150%)
    uint64 constant COLLATERAL_RATIO = 150;

    event Borrowed(address indexed user);
    event Repaid(address indexed user);

    constructor(address _collateralVault) {
        collateralVault = PrivateCollateralVault(_collateralVault);
    }

    function setLendingPool(address _lendingPool) external {
        lendingPool = _lendingPool;
    }

    function setCollateralVault(address _vault) external {
        collateralVault = PrivateCollateralVault(_vault);
    }

    /**
     * @notice Authorize a contract to use encrypted debt handles in FHE operations
     * @param contractAddress The contract to authorize
     */
    function authorizeContract(address contractAddress) external {
        if (!authorizedManagers[contractAddress]) {
            authorizedManagers[contractAddress] = true;
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

    /**
     * @notice Borrow tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function borrow(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amountToBorrow = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 currentDebt = debtAmounts[msg.sender];
        euint64 collateral = collateralVault.getCollateralAmount(msg.sender);

        // Calculate new debt
        euint64 newDebt = FHE.add(currentDebt, amountToBorrow);

        // Check health factor: collateral >= newDebt * 1.5
        // -> collateral * 100 >= newDebt * 150
        euint64 weightedCollateral = FHE.mul(collateral, FHE.asEuint64(100));
        euint64 requiredCollateral = FHE.mul(newDebt, FHE.asEuint64(COLLATERAL_RATIO));

        ebool isHealthy = FHE.ge(weightedCollateral, requiredCollateral);

        // Only update debt if it's healthy (branchless)
        debtAmounts[msg.sender] = FHE.select(isHealthy, newDebt, currentDebt);

        // Access control
        FHE.allowThis(debtAmounts[msg.sender]);
        FHE.allow(debtAmounts[msg.sender], msg.sender);
        _grantAuthorizedAccess(debtAmounts[msg.sender]);

        emit Borrowed(msg.sender);
    }

    /**
     * @notice Repay tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function repay(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amountToRepay = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 currentDebt = debtAmounts[msg.sender];

        ebool hasDebt = FHE.le(amountToRepay, currentDebt);

        euint64 amountToSubtract = FHE.select(hasDebt, amountToRepay, currentDebt);

        debtAmounts[msg.sender] = FHE.sub(currentDebt, amountToSubtract);

        // Access control
        FHE.allowThis(debtAmounts[msg.sender]);
        FHE.allow(debtAmounts[msg.sender], msg.sender);
        _grantAuthorizedAccess(debtAmounts[msg.sender]);

        emit Repaid(msg.sender);
    }

    /**
     * @notice Get encrypted debt amount of the user
     * @param user The user address
     */
    function getDebtAmount(address user) external view returns (euint64) {
        return debtAmounts[user];
    }
}
