// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ProtocolFunds
 * @dev Stores and manages protocol fees collected from loans using Zama FHEVM.
 */
contract ProtocolFunds is Ownable, ZamaEthereumConfig {
    mapping(address => euint64) private tokenBalances;
    
    event FundsDeposited(address indexed token);
    event FundsWithdrawn(address indexed token, address indexed to);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Record a deposit of protocol fees (Encrypted).
     */
    function deposit(address token, euint64 amount) external {
        if (FHE.isInitialized(tokenBalances[token])) {
            tokenBalances[token] = FHE.add(tokenBalances[token], amount);
        } else {
            tokenBalances[token] = amount;
        }
        FHE.allowThis(tokenBalances[token]);
        emit FundsDeposited(token);
    }

    /**
     * @dev Withdraw funds (Encrypted check).
     */
    function withdraw(address token, euint64 amount, address to) external onlyOwner {
        euint64 balance = tokenBalances[token];
        ebool hasBalance = FHE.ge(balance, amount);
        euint64 actualAmount = FHE.select(hasBalance, amount, balance);
        
        tokenBalances[token] = FHE.sub(balance, actualAmount);
        FHE.allowThis(tokenBalances[token]);
        
        emit FundsWithdrawn(token, to);
    }

    function getTokenBalance(address token) external view returns (euint64) {
        return tokenBalances[token];
    }
}


