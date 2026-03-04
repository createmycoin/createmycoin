// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CreateMyCoinToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {

    // 添加一个事件，记录铸造
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
        // 铸造初始供应量
        _mint(owner_, initialSupply_);

        // 👇 显式触发 Transfer 事件（虽然 _mint 内部已经触发，但再触发一次更保险）
        emit Transfer(address(0), owner_, initialSupply_);
        emit TokensMinted(owner_, initialSupply_);

        // 根据参数启用/禁用功能
        if (pausable_) {
            // 如果支持暂停，默认 unpaused
            _unpause();
        }
    }

    // 暂停功能
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // 铸造功能（仅owner）
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    // 批量铸造
    function batchMint(address[] calldata to, uint256[] calldata amounts) public onlyOwner {
        require(to.length == amounts.length, "数组长度不匹配");
        for (uint i = 0; i < to.length; i++) {
            _mint(to[i], amounts[i]);
            emit TokensMinted(to[i], amounts[i]);
        }
    }

    // 重写 _update 以支持暂停
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }

    // 以下函数用于查询
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