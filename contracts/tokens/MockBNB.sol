// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockBNB is ERC20, Ownable {
    uint256 public constant MAX_FAUCET = 100_000_000 ether; // 10% of 1B = 100M max per call

    constructor() ERC20("Wrapped BNB", "BNB") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Request a custom amount, capped at 100M BNB
    function faucet(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(amount <= MAX_FAUCET, "Exceeds 10% max (100M BNB)");
        _mint(msg.sender, amount);
    }
}
