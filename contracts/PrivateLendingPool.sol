// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivateLendingPool
 * @notice Confidential asset supply and withdrawal using Zama FHEVM
 */
contract PrivateLendingPool is ZamaEthereumConfig {
    // Mapping of user to their supplied amount (encrypted)
    mapping(address => euint64) private suppliedAmounts;

    // Total liquidity in the pool (encrypted)
    euint64 private totalLiquidity;

    address public borrowManager;

    event Supplied(address indexed user);
    event Withdrawn(address indexed user);

    constructor() {
        totalLiquidity = FHE.asEuint64(0);
        FHE.allowThis(totalLiquidity);
    }

    function setBorrowManager(address _borrow) external {
        borrowManager = _borrow;
    }

    /**
     * @notice Supply tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function supply(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        if (FHE.isInitialized(suppliedAmounts[msg.sender])) {
            suppliedAmounts[msg.sender] = FHE.add(suppliedAmounts[msg.sender], amount);
        } else {
            suppliedAmounts[msg.sender] = amount;
        }

        totalLiquidity = FHE.add(totalLiquidity, amount);

        // Access control
        FHE.allowThis(suppliedAmounts[msg.sender]);
        FHE.allow(suppliedAmounts[msg.sender], msg.sender);
        FHE.allowThis(totalLiquidity);

        emit Supplied(msg.sender);
    }

    /**
     * @notice Withdraw tokens privately
     * @param encryptedAmount The encrypted amount handle
     * @param inputProof Proof of encryption
     */
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 currentBalance = suppliedAmounts[msg.sender];

        ebool hasBalance = FHE.le(amount, currentBalance);

        euint64 amountToSubtract = FHE.select(hasBalance, amount, currentBalance);

        suppliedAmounts[msg.sender] = FHE.sub(currentBalance, amountToSubtract);
        totalLiquidity = FHE.sub(totalLiquidity, amountToSubtract);

        // Access control
        FHE.allowThis(suppliedAmounts[msg.sender]);
        FHE.allow(suppliedAmounts[msg.sender], msg.sender);
        FHE.allowThis(totalLiquidity);

        emit Withdrawn(msg.sender);
    }

    /**
     * @notice Get encrypted supplied amount of the user
     * @param user The user address
     */
    function getSuppliedAmount(address user) external view returns (euint64) {
        return suppliedAmounts[user];
    }

    /**
     * @notice Get total liquidity (only accessible by protocol for now)
     */
    function getTotalLiquidity() external view returns (euint64) {
        return totalLiquidity;
    }
}
