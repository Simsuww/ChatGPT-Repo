/**
 * Shoe — standard multi-deck shoe with Fisher-Yates shuffle.
 * Triggers reshuffle at configurable penetration depth.
 * Engine layer: no DOM, no side effects.
 */

import { Card, SUITS, RANKS } from './Card.js';

export class Shoe {
  /**
   * @param {number} numDecks      - Number of decks (default 6)
   * @param {number} cutCardAt     - Reshuffle when this many cards remain (default 75)
   */
  constructor(numDecks = 6, cutCardAt = 75) {
    this.numDecks = numDecks;
    this.cutCardAt = cutCardAt;
    this._cards = [];
    this.shuffle();
  }

  /** Build and shuffle a fresh shoe. */
  shuffle() {
    this._cards = [];
    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this._cards.push(new Card(rank, suit));
        }
      }
    }
    // Fisher-Yates
    for (let i = this._cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._cards[i], this._cards[j]] = [this._cards[j], this._cards[i]];
    }
  }

  /**
   * Draw a single card.
   * @param {boolean} faceDown
   * @returns {Card}
   */
  draw(faceDown = false) {
    if (this._cards.length <= this.cutCardAt) {
      this.shuffle();
    }
    const card = this._cards.pop();
    return faceDown ? new Card(card.rank, card.suit, true) : card;
  }

  /**
   * Draw multiple cards.
   * @param {number} count
   * @param {boolean} faceDown
   * @returns {Card[]}
   */
  drawMany(count, faceDown = false) {
    return Array.from({ length: count }, () => this.draw(faceDown));
  }

  /** Cards remaining before the cut card. */
  get remaining() { return this._cards.length; }

  /** Penetration 0→1 (how deep into shoe we are). */
  get penetration() {
    return 1 - this._cards.length / (this.numDecks * 52);
  }
}
