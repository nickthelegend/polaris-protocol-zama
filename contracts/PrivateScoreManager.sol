// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivateScoreManager
 * @notice Confidential credit score management using Zama FHEVM.
 *         Scores are stored encrypted on-chain and only decryptable by the user.
 *         No one — not even the protocol owner — can see a user's score without
 *         the user's explicit EIP-712 re-encryption consent.
 *
 *         Score range: 300–850 (FICO-like)
 *         - Repayment bonus: +5 per event (encrypted addition)
 *         - Liquidation penalty: -50 per event (encrypted subtraction)
 */
contract PrivateScoreManager is ZamaEthereumConfig {

    // ── Constants ────────────────────────────────────────────────────────────
    uint64 public constant MIN_SCORE = 300;
    uint64 public constant MAX_SCORE = 850;
    uint64 public constant REPAYMENT_BONUS = 5;
    uint64 public constant LIQUIDATION_PENALTY = 50;

    // ── Storage ──────────────────────────────────────────────────────────────
    /// @dev Encrypted credit scores. Only the user can decrypt their own score.
    mapping(address => euint64) private encryptedScores;

    /// @dev Whether a user has been initialized (has a score at all).
    mapping(address => bool) public isInitialized;

    /// @dev Contracts authorized to call recordRepayment / recordLiquidation.
    mapping(address => bool) public authorizedCallers;

    /// @dev Protocol owner for access control.
    address public owner;

    // ── Events ───────────────────────────────────────────────────────────────
    event ScoreInitialized(address indexed user);
    event RepaymentRecorded(address indexed user);
    event LiquidationRecorded(address indexed user);
    event CallerAuthorized(address indexed caller);
    event CallerRevoked(address indexed caller);
    event OwnershipTransferred(address indexed prev, address indexed next_);

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit CallerRevoked(caller);
    }

    // ── Core Logic ─────────────────────────────────────────────────────────

    /**
     * @notice Initialize a user's encrypted score to MIN_SCORE (300).
     *         Can be called by anyone for themselves, or by authorized callers
     *         for any user. Idempotent — does nothing if already initialized.
     */
    function initializeScore(address user) public {
        if (isInitialized[user]) return;

        euint64 initialScore = FHE.asEuint64(MIN_SCORE);
        encryptedScores[user] = initialScore;
        isInitialized[user] = true;

        // Grant access: contract itself + the user
        FHE.allowThis(initialScore);
        FHE.allow(initialScore, user);

        emit ScoreInitialized(user);
    }

    /**
     * @notice Record a successful repayment → encrypted score += REPAYMENT_BONUS.
     *         Capped at MAX_SCORE via branchless FHE.select.
     * @param user The borrower who repaid.
     */
    function recordRepayment(address user) external onlyAuthorized {
        _ensureInitialized(user);

        euint64 current = encryptedScores[user];
        euint64 bonus = FHE.asEuint64(REPAYMENT_BONUS);
        euint64 maxScore = FHE.asEuint64(MAX_SCORE);

        // new = current + bonus
        euint64 uncapped = FHE.add(current, bonus);

        // cap at MAX_SCORE: result = uncapped <= max ? uncapped : max
        ebool withinCap = FHE.le(uncapped, maxScore);
        euint64 finalScore = FHE.select(withinCap, uncapped, maxScore);

        encryptedScores[user] = finalScore;
        FHE.allowThis(finalScore);
        FHE.allow(finalScore, user);

        emit RepaymentRecorded(user);
    }

    /**
     * @notice Record a liquidation → encrypted score -= LIQUIDATION_PENALTY.
     *         Floored at MIN_SCORE via branchless FHE.select.
     * @param user The borrower who was liquidated.
     */
    function recordLiquidation(address user) external onlyAuthorized {
        _ensureInitialized(user);

        euint64 current = encryptedScores[user];
        euint64 penalty = FHE.asEuint64(LIQUIDATION_PENALTY);
        euint64 minScore = FHE.asEuint64(MIN_SCORE);

        // Check if current >= minScore + penalty (i.e., subtraction won't underflow below min)
        euint64 safeThreshold = FHE.add(minScore, penalty);
        ebool canSubtract = FHE.ge(current, safeThreshold);

        // If can subtract: new = current - penalty, else: new = minScore
        euint64 subtracted = FHE.sub(current, penalty);
        euint64 finalScore = FHE.select(canSubtract, subtracted, minScore);

        encryptedScores[user] = finalScore;
        FHE.allowThis(finalScore);
        FHE.allow(finalScore, user);

        emit LiquidationRecorded(user);
    }

    /**
     * @notice Manually set a user's score (encrypted). Owner only, for bootstrapping.
     * @param user The target user.
     * @param encryptedScore The encrypted score value.
     * @param inputProof Proof of encryption.
     */
    function setScore(
        address user,
        externalEuint64 encryptedScore,
        bytes calldata inputProof
    ) external onlyOwner {
        euint64 score = FHE.fromExternal(encryptedScore, inputProof);
        encryptedScores[user] = score;
        isInitialized[user] = true;

        FHE.allowThis(score);
        FHE.allow(score, user);

        emit ScoreInitialized(user);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the encrypted score handle for a user.
     *         Only the user themselves can decrypt this via EIP-712 re-encryption.
     */
    function getEncryptedScore(address user) external view returns (euint64) {
        return encryptedScores[user];
    }

    /**
     * @notice Check if a user has been initialized.
     */
    function hasScore(address user) external view returns (bool) {
        return isInitialized[user];
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _ensureInitialized(address user) internal {
        if (!isInitialized[user]) {
            initializeScore(user);
        }
    }
}
