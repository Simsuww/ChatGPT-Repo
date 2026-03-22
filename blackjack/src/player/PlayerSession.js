/**
 * PlayerSession — one player's seat at the Infinite Blackjack table.
 *
 * Manages:
 *  - Bankroll and bet
 *  - Their diverged hand tree (normally 1, up to 4 after splits)
 *  - Insurance decision
 *  - Active hand pointer for turn management
 *
 * Player layer.
 */

import { PlayerHand } from './PlayerHand.js';
import { Rules } from '../engine/Rules.js';

let _nextId = 1;

export class PlayerSession {
  /**
   * @param {string} name
   * @param {number} bankroll
   */
  constructor(name, bankroll = Rules.STARTING_BANKROLL) {
    this.id           = String(_nextId++);
    this.name         = name;
    this.bankroll     = bankroll;
    this.pendingBet   = 0;
    this.insuranceBet = 0;
    this.insuranceDecided = false;

    /** @type {PlayerHand[]} */
    this.hands        = [];
    this._activeIdx   = 0;
    this.isActive     = false; // True if playing this round (placed a bet)
    this.isSittingOut = false;
  }

  // ─── Bet management ───────────────────────────────────────────────────────

  placeBet(amount) {
    this.setPendingBet(amount);
  }

  setPendingBet(amount) {
    if (amount > this.bankroll) throw new Error('Insufficient bankroll');
    this.pendingBet = Math.min(amount, Rules.MAX_BET);
  }

  clearBet() {
    this.pendingBet = 0;
  }

  /** Deduct the pending bet from bankroll and lock it in. */
  commitBet() {
    if (this.pendingBet < Rules.MIN_BET) throw new Error('Bet too small');
    this.bankroll -= this.pendingBet;
    this.isActive = true;
  }

  sitOut() {
    this.isActive = false;
    this.isSittingOut = true;
  }

  // ─── Hand initialisation (called after deal) ──────────────────────────────

  /**
   * Copy seat cards into this player's opening hand.
   * @param {import('../engine/Card.js').Card[]} seatCards
   */
  initHand(seatCards) {
    this.hands     = [new PlayerHand(this.pendingBet, seatCards)];
    this._activeIdx = 0;
  }

  // ─── Insurance ────────────────────────────────────────────────────────────

  takeInsurance() {
    const amount = Math.floor(this.hands[0].bet / 2);
    if (amount > this.bankroll) throw new Error('Insufficient bankroll for insurance');
    this.insuranceBet = amount;
    this.bankroll -= amount;
    this.insuranceDecided = true;
  }

  declineInsurance() {
    this.insuranceBet = 0;
    this.insuranceDecided = true;
  }

  // ─── During DECISIONS ─────────────────────────────────────────────────────

  /** The hand currently awaiting a decision. */
  get activeHand() {
    return this.hands[this._activeIdx] ?? null;
  }

  /** Total number of hands (increases with splits). */
  get handCount() {
    return this.hands.length;
  }

  /** True when the player has no more hands to act on. */
  get isComplete() {
    return this._activeIdx >= this.hands.length;
  }

  /**
   * Move to the next hand in the split tree (or mark complete).
   */
  advanceHand() {
    if (this.activeHand) this.activeHand.stood = true;
    this._activeIdx++;
  }

  /**
   * Double down the active hand.
   * @param {import('../engine/Card.js').Card} card
   */
  doubleDown(card) {
    const hand = this.activeHand;
    if (hand.bet > this.bankroll) throw new Error('Insufficient bankroll to double');
    this.bankroll -= hand.bet; // extra bet equals original
    hand.doubleDown(card);
  }

  /**
   * Split the active hand into two.
   * @param {import('../engine/Card.js').Card} card1 - New card for left hand
   * @param {import('../engine/Card.js').Card} card2 - New card for right hand
   */
  split(card1, card2) {
    const original = this.activeHand;
    if (original.bet > this.bankroll) throw new Error('Insufficient bankroll to split');
    this.bankroll -= original.bet; // pay for the second hand

    const [c1, c2] = original.cards;

    const left  = new PlayerHand(original.bet, [c1, card1]);
    const right = new PlayerHand(original.bet, [c2, card2]);

    this.hands.splice(this._activeIdx, 1, left, right);
    // _activeIdx stays the same — now points to `left`
  }

  /**
   * Surrender the active hand — return half bet immediately.
   */
  surrender() {
    const hand = this.activeHand;
    const refund = Math.floor(hand.bet / 2);
    this.bankroll += refund;
    hand.surrender(refund);
  }

  // ─── Payout ───────────────────────────────────────────────────────────────

  setOutcome(outcome, credit) {
    if (this.activeHand) {
      this.activeHand.outcome  = outcome;
      this.activeHand.resolved = true;
    }
    this.credit(credit);
  }

  credit(amount) {
    this.bankroll += amount;
  }

  get isBankrupt() {
    return this.bankroll < Rules.MIN_BET;
  }

  // ─── Round reset ──────────────────────────────────────────────────────────

  resetForNewRound() {
    this.hands            = [];
    this._activeIdx       = 0;
    this.pendingBet       = 0;
    this.insuranceBet     = 0;
    this.insuranceDecided = false;
    this.isActive         = false;
    this.isSittingOut     = false;
  }

  // ─── Snapshot ─────────────────────────────────────────────────────────────

  get snapshot() {
    return {
      id:           this.id,
      name:         this.name,
      bankroll:     this.bankroll,
      pendingBet:   this.pendingBet,
      insuranceBet: this.insuranceBet,
      insuranceDecided: this.insuranceDecided,
      hands:        this.hands.map(h => h.snapshot),
      activeHandIndex: this._activeIdx,
      isActive:     this.isActive,
      isComplete:   this.isComplete,
      isBankrupt:   this.isBankrupt,
    };
  }
}
