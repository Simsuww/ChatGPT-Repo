/**
 * PlayerHand — a player's private hand, diverged from the shared SeatHand.
 *
 * Wraps Hand with per-hand tracking: bet, doubled flag, surrender, outcome,
 * and split-tree metadata.
 *
 * Player layer.
 */

import { Hand } from '../engine/Hand.js';

export class PlayerHand extends Hand {
  /**
   * @param {number} bet
   * @param {import('../engine/Card.js').Card[]} [seedCards] - Starting cards (copied from seat)
   */
  constructor(bet, seedCards = []) {
    super();
    this.bet            = bet;
    this.isDoubled      = false;
    this.isSurrendered  = false;
    this.splitAceLocked = false; // Can't hit after split aces
    this.outcome        = null;  // Set during PAYOUT
    this.resolved       = false;

    for (const card of seedCards) this.cards.push(card);
  }

  get isBust()       { return super.isBust; }
  get isBlackjack()  { return super.isBlackjack; }
  get isSurrendered(){ return this._surrendered; }
  set isSurrendered(v){ this._surrendered = v; }

  /**
   * True if this hand has no further actions possible:
   * busted, stood (will be set by PlayerSession.advanceHand),
   * doubled (one card drawn), surrendered, or split-ace-locked.
   */
  get isStoodOrFinished() {
    return this._stood || this.isBust || this.isDoubled || this._surrendered || this.splitAceLocked;
  }

  set stood(v) { this._stood = v; }
  get stood()  { return this._stood || false; }

  /** Convenience: apply double-down card and mark hand. */
  doubleDown(card) {
    this.addCard(card);
    this.bet    *= 2;
    this.isDoubled = true;
  }

  /** Forfeit half bet. Marks hand as surrendered. */
  surrender(refundAmount) {
    this._surrendered = true;
    this.bet -= refundAmount; // bet now represents the forfeited portion
  }

  get label() {
    if (this._surrendered) return 'Surrendered';
    return super.label;
  }

  /** Snapshot for UI rendering. */
  get snapshot() {
    return {
      cards:      [...this.cards],
      value:      this.value,
      label:      this.label,
      bet:        this.bet,
      isDoubled:  this.isDoubled,
      isSurrendered: this._surrendered ?? false,
      isBust:     this.isBust,
      isBlackjack: this.isBlackjack,
      outcome:    this.outcome,
      resolved:   this.resolved,
    };
  }
}
