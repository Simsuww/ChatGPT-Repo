/**
 * Payouts — pure functions for calculating hand outcomes and credits.
 * Player layer: no state mutation, no DOM.
 */

import { Rules, Outcome } from '../engine/Rules.js';

/**
 * Compare one PlayerHand against the dealer and return the outcome + credit.
 *
 * @param {import('./PlayerHand.js').PlayerHand} playerHand
 * @param {import('../table/DealerHand.js').DealerHand} dealer
 * @param {boolean} dealerHasBlackjack
 * @returns {{ outcome: string, credit: number }}
 */
export function evaluateHand(playerHand, dealer, dealerHasBlackjack) {
  const bet = playerHand.bet;

  if (playerHand._surrendered) {
    // Already refunded half at action time — no further credit
    return { outcome: Outcome.SURRENDER, credit: 0 };
  }

  if (playerHand.isBust) {
    return { outcome: Outcome.BUST, credit: 0 };
  }

  if (playerHand.isBlackjack) {
    if (dealerHasBlackjack) {
      return { outcome: Outcome.PUSH, credit: bet };
    }
    // BJ pays 3:2 — return bet + 1.5×bet
    return {
      outcome: Outcome.BLACKJACK,
      credit: bet + Math.floor(bet * Rules.BLACKJACK_PAYS),
    };
  }

  if (dealerHasBlackjack) {
    return { outcome: Outcome.LOSE, credit: 0 };
  }

  if (dealer.isBust) {
    return { outcome: Outcome.WIN, credit: bet * 2 };
  }

  const pv = playerHand.value;
  const dv = dealer.value;

  if (pv > dv) return { outcome: Outcome.WIN,  credit: bet * 2 };
  if (pv < dv) return { outcome: Outcome.LOSE, credit: 0 };
  return           { outcome: Outcome.PUSH, credit: bet };
}

/**
 * Resolve the insurance side bet.
 *
 * @param {number} insuranceBet
 * @param {boolean} dealerHasBlackjack
 * @returns {number} Credit amount (0 if lost, bet × 3 if won — returns original stake + 2:1 profit)
 */
export function evaluateInsurance(insuranceBet, dealerHasBlackjack) {
  if (!insuranceBet) return 0;
  return dealerHasBlackjack ? insuranceBet * (1 + Rules.INSURANCE_PAYS) : 0;
}

/**
 * Human-readable outcome label.
 * @param {string} outcome
 * @returns {string}
 */
export function outcomeLabel(outcome) {
  const labels = {
    [Outcome.WIN]:       'Win',
    [Outcome.LOSE]:      'Lose',
    [Outcome.PUSH]:      'Push',
    [Outcome.BLACKJACK]: 'Blackjack!',
    [Outcome.SURRENDER]: 'Surrender',
    [Outcome.BUST]:      'Bust',
  };
  return labels[outcome] ?? outcome;
}
