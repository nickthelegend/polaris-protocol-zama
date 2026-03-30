// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";

contract PrivateSwapUSDC is GatewayCaller {
    IERC20 public immutable token;
    
    mapping(address => euint64) private encryptedBalances;
    mapping(address => bool) public hasBalance;
    
    event DepositEncrypted(address indexed user);
    event WithdrawEncrypted(address indexed user, uint256 amount);
    event SwapExecuted(address indexed user);
    
    constructor(address _token) {
        token = IERC20(_token);
    }
    
    function depositEncrypted(einput encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        
        TFHE.allowThis(amount);
        TFHE.allow(amount, msg.sender);
        
        if (hasBalance[msg.sender]) {
            encryptedBalances[msg.sender] = TFHE.add(encryptedBalances[msg.sender], amount);
        } else {
            encryptedBalances[msg.sender] = amount;
            hasBalance[msg.sender] = true;
        }
        
        emit DepositEncrypted(msg.sender);
    }
    
    function withdrawEncrypted(einput encryptedAmount, bytes calldata inputProof) external {
        require(hasBalance[msg.sender], "No balance");
        
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        
        euint64 newBalance = TFHE.sub(encryptedBalances[msg.sender], amount);
        encryptedBalances[msg.sender] = newBalance;
        
        TFHE.allowThis(newBalance);
        TFHE.allow(newBalance, msg.sender);
        
        emit WithdrawEncrypted(msg.sender, 0);
    }
    
    function getEncryptedBalance() external view returns (euint64) {
        require(hasBalance[msg.sender], "No balance");
        return encryptedBalances[msg.sender];
    }
    
    function swapEncrypted(
        einput encryptedAmountIn,
        bytes calldata inputProof,
        address targetToken
    ) external {
        require(hasBalance[msg.sender], "No balance");
        
        euint64 amountIn = TFHE.asEuint64(encryptedAmountIn, inputProof);
        
        euint64 newBalance = TFHE.sub(encryptedBalances[msg.sender], amountIn);
        encryptedBalances[msg.sender] = newBalance;
        
        TFHE.allowThis(newBalance);
        TFHE.allow(newBalance, msg.sender);
        
        emit SwapExecuted(msg.sender);
    }
}
