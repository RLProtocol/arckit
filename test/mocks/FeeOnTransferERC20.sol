// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// ERC20 that burns `feeBps` of every wallet-to-wallet transfer.
/// Mints and burns are exempt so tests can fund accounts precisely.
contract FeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 _feeBps) ERC20("Tax Token", "TAX") {
        require(_feeBps < 10_000, "fee too high");
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * feeBps) / 10_000;
        super._update(from, address(0), fee); // burn the tax
        super._update(from, to, value - fee);
    }
}
