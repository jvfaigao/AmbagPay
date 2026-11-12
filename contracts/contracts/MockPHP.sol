// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockPHP (tPHP)
/// @notice Test peso stablecoin for the AmbagPay demo on BSC Testnet. No real value.
///         Supports EIP-2612 permit so members can pay in one transaction.
contract MockPHP is ERC20, ERC20Permit, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000e18; // ₱1,000 test balance
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    constructor() ERC20("Test Philippine Peso", "tPHP") ERC20Permit("Test Philippine Peso") Ownable(msg.sender) {}

    /// @notice Anyone can get ₱1,000 test pesos once a day.
    function faucet() external {
        uint256 availableAt = lastFaucetAt[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucetAt[msg.sender] != 0 && block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner can mint test pesos to seed demo accounts.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
