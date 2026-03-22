/**
 * DealerHand — manages the dealer's hand and H17 play-out logic.
 * Table layer.
 */

import { Hand } from '../engine/Hand.js';
import { Rules } from '../engine/Rules.js';

export class DealerHand {
  constructor() {
    this._hand = new Hand();
  }

  addCard(card) { this._hand.addCard(card); }

  /** First face-up card — what players see. */
  get upCard() { return this._hand.cards.find(c => !c.faceDown) ?? null; }

  /** The hidden hole card. */
  get holeCard() { return this._hand.cards.find(c => c.faceDown) ?? null; }

  /** True if dealer shows an Ace (triggers insurance offer). */
  get showsAce() { return this.upCard?.isAce ?? false; }

  /** True if dealer shows a ten-value card. */
  get showsTen() { return this.upCard?.isTenValue ?? false; }

  /** Check for BJ after revealing hole card. */
  get hasBlackjack() { return this._hand.isBlackjack; }

  /** Flip the hole card face-up. Call at start of DEALER_TURN. */
  revealHoleCard() { this._hand.revealAll(); }

  /**
   * H17: dealer hits on soft 17 and any total below 17.
   * S17: dealer stands on soft 17.
   */
  get mustHit() {
    const v = this._hand.totalValue;
    if (v < Rules.DEALER_STAND_VALUE) return true;
    if (v === Rules.DEALER_STAND_VALUE && Rules.DEALER_HITS_SOFT_17 && this._hand.isSoft) return true;
    return false;
  }

  /** Dealer's full total (all cards, including previously hidden). */
  get value() { return this._hand.totalValue; }

  get isBust() { return this._hand.isBust; }
  get cards()  { return [...this._hand.cards]; }

  get label() {
    if (this.hasBlackjack) return 'Blackjack!';
    if (this.isBust)       return `Bust (${this.value})`;
    return `${this.value}`;
  }

  reset() { this._hand.clear(); }
}
