// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CreateMyCoinToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {

    event TokensMinted(address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address owner_,
        bool mintable_,
        bool burnable_,
        bool pausable_,
        bool permit_
    ) ERC20(name_, symbol_) Ownable(owner_) ERC20Permit(name_) {
        _mint(owner_, initialSupply_);
        emit Transfer(address(0), owner_, initialSupply_);
        emit TokensMinted(owner_, initialSupply_);

        if (pausable_) {
            _unpause();
        }
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function batchMint(address[] calldata to, uint256[] calldata amounts) public onlyOwner {
        require(to.length == amounts.length, "Array length mismatch");
        for (uint i = 0; i < to.length; i++) {
            _mint(to[i], amounts[i]);
            emit TokensMinted(to[i], amounts[i]);
        }
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }

    function getOwner() public view returns (address) {
        return owner();
    }

    function getTotalSupply() public view returns (uint256) {
        return totalSupply();
    }

    function getBalance(address account) public view returns (uint256) {
        return balanceOf(account);
    }
}