/**
 * Expected Value (EV) Engine
 *
 * Base house edges (standard rules per number of decks):
 *   6-deck  S17  DAS  RSA  Peek  3:2 BJ ≈ 0.40%
 *   8-deck  S17  DAS  RSA  Peek  3:2 BJ ≈ 0.57%
 *
 * Hi-Lo true count effect:
 *   Each +1 true count ≈ +0.50% player edge shift
 *
 * Betting via Kelly Criterion (fractional Kelly recommended):
 *   Full Kelly bet = edge / variance   (variance ≈ 1.3 for blackjack)
 *   Recommended: quarter to half Kelly for risk management
 */

'use strict';

const EV = (() => {

  // Base house edges for common rule sets
  const BASE_EDGE = {
    '6_S17_DAS': 0.0040,
    '6_H17_DAS': 0.0060,
    '8_S17_DAS': 0.0057,
    '8_H17_DAS': 0.0077,
    '6_S17_NODAS': 0.0065,
    '8_S17_NODAS': 0.0082
  };

  // Edge change per true count point (~0.50%)
  const EDGE_PER_TC = 0.005;

  // Blackjack hand variance (standard BJ ~1.3)
  const BJ_VARIANCE = 1.3;

  /**
   * Get base house edge from rule string key.
   * Falls back to 6-deck S17 DAS if key not found.
   */
  function getBaseEdge(ruleKey) {
    return BASE_EDGE[ruleKey] ?? BASE_EDGE['6_S17_DAS'];
  }

  /**
   * Calculate player edge at current true count.
   * Positive value = player advantage.
   * Negative value = house advantage.
   *
   * @param {number} trueCount
   * @param {string} ruleKey  e.g. '6_S17_DAS'
   * @returns {number} edge as a decimal (0.01 = 1%)
   */
  function playerEdge(trueCount, ruleKey = '6_S17_DAS') {
    const base = getBaseEdge(ruleKey);
    // Player edge = TC effect - base house edge
    return (trueCount * EDGE_PER_TC) - base;
  }

  /**
   * Kelly Criterion optimal bet size.
   *
   * @param {number} edge       player edge (decimal)
   * @param {number} bankroll   total bankroll
   * @param {number} kellyFraction  0.25 = quarter Kelly (conservative), 0.5 = half Kelly
   * @returns {number} recommended bet amount
   */
  function kellyBet(edge, bankroll, kellyFraction = 0.25) {
    if (edge <= 0) return 0; // never bet at negative EV with Kelly
    const fullKelly = edge / BJ_VARIANCE;
    return bankroll * fullKelly * kellyFraction;
  }

  /**
   * Betting spread recommendation based on true count.
   * Returns a multiplier of the table minimum bet.
   *
   * Standard card counter spread (1-12 spread on 6-deck):
   * TC ≤ 1  → 1 unit (min bet)
   * TC  2   → 2 units
   * TC  3   → 4 units
   * TC  4   → 8 units
   * TC  5+  → 12 units (max comfortable spread)
   *
   * @param {number} trueCount
   * @returns {{ multiplier: number, rationale: string }}
   */
  function bettingSpread(trueCount) {
    const tc = Math.round(trueCount);
    if (tc <= 1)  return { multiplier: 1,  rationale: 'Min bet — neutral/negative count' };
    if (tc === 2) return { multiplier: 2,  rationale: 'Slight edge — small raise' };
    if (tc === 3) return { multiplier: 4,  rationale: 'Moderate edge — medium bet' };
    if (tc === 4) return { multiplier: 8,  rationale: 'Strong edge — large bet' };
    return          { multiplier: 12, rationale: 'Very strong edge — max spread bet' };
  }

  /**
   * Compute recommended bet given bankroll and table limits.
   *
   * @param {number} trueCount
   * @param {number} bankroll
   * @param {number} minBet   table minimum
   * @param {number} maxBet   table maximum
   * @param {string} ruleKey
   * @returns {{
   *   edge: number,
   *   edgePct: string,
   *   recommendedBet: number,
   *   multiplier: number,
   *   rationale: string,
   *   kellyBet: number,
   *   evPerHand: number
   * }}
   */
  function getBetRecommendation(trueCount, bankroll, minBet, maxBet, ruleKey = '6_S17_DAS') {
    const edge = playerEdge(trueCount, ruleKey);
    const { multiplier, rationale } = bettingSpread(trueCount);

    // Spread-based bet, clamped to table limits
    const spreadBet = Math.min(Math.max(minBet * multiplier, minBet), maxBet);

    // Kelly-based bet (clamped to table limits)
    const kelly = edge > 0
      ? Math.min(Math.max(kellyBet(edge, bankroll), minBet), maxBet)
      : 0;

    // Use the lower of spread bet and Kelly to stay safe
    const recommendedBet = edge > 0
      ? Math.min(spreadBet, kelly > 0 ? kelly : spreadBet)
      : minBet;

    const roundedBet = parseFloat(recommendedBet.toFixed(2));

    return {
      edge,
      edgePct: (edge * 100).toFixed(2) + '%',
      recommendedBet: roundedBet,
      multiplier: edge > 0 ? multiplier : 1,
      rationale,
      kellyBet: parseFloat(kelly.toFixed(2)),
      evPerHand: parseFloat((edge * roundedBet).toFixed(4))
    };
  }

  /**
   * Running session EV tracker.
   */
  function createSession(bankroll, minBet, maxBet, ruleKey = '6_S17_DAS') {
    return {
      bankroll,
      startBankroll: bankroll,
      minBet,
      maxBet,
      ruleKey,
      handsPlayed: 0,
      totalWagered: 0,
      totalWon: 0,     // net won (negative = lost)
      expectedValue: 0
    };
  }

  function recordHandResult(session, betAmount, result, trueCount) {
    // result: 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'
    const multipliers = { win: 1, blackjack: 1.5, loss: -1, push: 0, surrender: -0.5 };
    const payout = betAmount * (multipliers[result] ?? 0);
    const edge = playerEdge(trueCount, session.ruleKey);

    return {
      ...session,
      bankroll: session.bankroll + payout,
      handsPlayed: session.handsPlayed + 1,
      totalWagered: session.totalWagered + betAmount,
      totalWon: session.totalWon + payout,
      expectedValue: session.expectedValue + (edge * betAmount)
    };
  }

  function getSessionStats(session) {
    const actualReturn = session.handsPlayed > 0
      ? (session.totalWon / session.totalWagered * 100).toFixed(2) + '%'
      : 'N/A';

    return {
      handsPlayed: session.handsPlayed,
      bankroll: parseFloat(session.bankroll.toFixed(2)),
      netPnL: parseFloat(session.totalWon.toFixed(2)),
      totalWagered: parseFloat(session.totalWagered.toFixed(2)),
      expectedValue: parseFloat(session.expectedValue.toFixed(2)),
      actualReturn,
      roi: parseFloat(((session.bankroll - session.startBankroll) / session.startBankroll * 100).toFixed(2))
    };
  }

  return {
    playerEdge,
    kellyBet,
    bettingSpread,
    getBetRecommendation,
    createSession,
    recordHandResult,
    getSessionStats,
    BASE_EDGE,
    EDGE_PER_TC
  };
})();

if (typeof module !== 'undefined') module.exports = EV;
