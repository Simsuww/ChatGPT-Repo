/**
 * SeatHand — the shared opening two cards that all players start from.
 *
 * This is the core mechanic of Infinite Blackjack: every player at the table
 * sees the SAME two initial cards. The SeatHand is read-only after the deal.
 * Players diverge into their own PlayerHand the moment they make a decision.
 *
 * Table layer.
 */

import { Hand } from '../engine/Hand.js';

export class SeatHand {
  constructor() {
    this._hand = new Hand();
  }

  /** Add a card to the shared seat (called during DEALING phase only). */
  addCard(card) {
    this._hand.addCard(card);
  }

  /** The two shared starting cards. Treat as read-only after deal. */
  get cards() { return [...this._hand.cards]; }

  /** Visible value of the seat hand (for display during dealing). */
  get value() { return this._hand.value; }

  get label() { return this._hand.label; }
  get isBlackjack() { return this._hand.isBlackjack; }
  get isPair() { return this._hand.isPair; }
  get isPairOfAces() { return this._hand.isPairOfAces; }

  /** Reset for a new round. */
  reset() { this._hand.clear(); }
}
