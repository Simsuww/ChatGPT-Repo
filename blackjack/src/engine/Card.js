/**
 * Card — immutable value object representing a single playing card.
 * Engine layer: no DOM, no side effects.
 */

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const RANK_VALUES = {
  A: [1, 11],
  '2': [2], '3': [3], '4': [4], '5': [5], '6': [6],
  '7': [7], '8': [8], '9': [9], '10': [10],
  J: [10], Q: [10], K: [10],
};

export class Card {
  /**
   * @param {string} rank  - One of RANKS
   * @param {string} suit  - One of SUITS
   * @param {boolean} faceDown
   */
  constructor(rank, suit, faceDown = false) {
    this.rank = rank;
    this.suit = suit;
    this.faceDown = faceDown;
    Object.freeze(this);
  }

  get values()      { return RANK_VALUES[this.rank]; }
  get isAce()       { return this.rank === 'A'; }
  get isTenValue()  { return this.values[0] === 10; }
  get isFaceCard()  { return ['J', 'Q', 'K'].includes(this.rank); }

  /** Returns a new face-up copy of this card. */
  reveal() { return new Card(this.rank, this.suit, false); }

  /** 'red' for ♥/♦, 'black' for ♠/♣ */
  get colorClass() {
    return (this.suit === '♥' || this.suit === '♦') ? 'red' : 'black';
  }

  toString() { return this.faceDown ? '??' : `${this.rank}${this.suit}`; }
}
