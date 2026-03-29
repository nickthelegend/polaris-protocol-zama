// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

type euint128 is uint256;
type ebool is uint256;
type externalEuint128 is uint256;

library FHE {
    function asEuint128(uint256 v) internal pure returns (euint128) {
        return euint128.wrap(v);
    }
    function asEbool(bool b) internal pure returns (ebool) {
        return ebool.wrap(b ? 1 : 0);
    }
    function allowThis(euint128 v) internal pure {}
    function allow(euint128 v, address a) internal pure {}
    function fromExternal(externalEuint128 v, bytes calldata proof) internal pure returns (euint128) {
        return euint128.wrap(externalEuint128.unwrap(v));
    }
    function isInitialized(euint128 v) internal pure returns (bool) {
        return euint128.unwrap(v) != 0;
    }
    function select(ebool b, euint128 v1, euint128 v2) internal pure returns (euint128) {
        return ebool.unwrap(b) == 1 ? v1 : v2;
    }
    function lt(euint128 a, euint128 b) internal pure returns (ebool) {
        return ebool.wrap(euint128.unwrap(a) < euint128.unwrap(b) ? 1 : 0);
    }
    function le(euint128 a, euint128 b) internal pure returns (ebool) {
        return ebool.wrap(euint128.unwrap(a) <= euint128.unwrap(b) ? 1 : 0);
    }
    function add(euint128 a, euint128 b) internal pure returns (euint128) {
        return euint128.wrap(euint128.unwrap(a) + euint128.unwrap(b));
    }
    function sub(euint128 a, euint128 b) internal pure returns (euint128) {
        return euint128.wrap(euint128.unwrap(a) - euint128.unwrap(b));
    }
    function eq(euint128 a, euint128 b) internal pure returns (ebool) {
        return ebool.wrap(euint128.unwrap(a) == euint128.unwrap(b) ? 1 : 0);
    }
}
