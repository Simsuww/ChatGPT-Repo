/**
 * Hand — card collection with value calculation.
 * Handles soft/hard distinction and optimal ace usage.
 * Engine layer: no DOM, no side effects.
 */

export class Hand {
  constructor() {
    /** @type {import('./Card.js').Card[]} */
    this.cards = [];
  }

  addCard(card) { this.cards.push(card); }

  /**
   * Best total ≤ 21 counting only face-up cards.
   * Used during player turn (dealer hole card excluded).
   */
  get value() { return this._calcValue(false); }

  /**
   * Total counting ALL cards including face-down.
   * Used for dealer logic and payout comparison.
   */
  get totalValue() { return this._calcValue(true); }

  _calcValue(includeHidden) {
    let total = 0;
    let aces = 0;
    for (const card of this.cards) {
      if (!includeHidden && card.faceDown) continue;
      if (card.isAce) { aces++; total += 11; }
      else { total += card.values[0]; }
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  /**
   * True if there's an ace counting as 11 without busting.
   * Counts only visible cards.
   */
  get isSoft() {
    let total = 0;
    let aces = 0;
    for (const card of this.cards) {
      if (card.faceDown) continue;
      if (card.isAce) { aces++; total += 11; }
      else { total += card.values[0]; }
    }
    return aces > 0 && total <= 21;
  }

  /** Natural blackjack: exactly 2 face-up cards, Ace + ten-value. */
  get isBlackjack() {
    const visible = this.cards.filter(c => !c.faceDown);
    if (visible.length !== 2) return false;
    return visible.some(c => c.isAce) && visible.some(c => c.isTenValue);
  }

  get isBust()  { return this.value > 21; }
  get is21()    { return this.value === 21; }

  /** Pair: exactly 2 visible cards of same rank. */
  get isPair() {
    const visible = this.cards.filter(c => !c.faceDown);
    return visible.length === 2 && visible[0].rank === visible[1].rank;
  }

  get isPairOfAces() { return this.isPair && this.cards[0].isAce; }

  /** Reveal all face-down cards in place. */
  revealAll() {
    this.cards = this.cards.map(c => c.faceDown ? c.reveal() : c);
  }

  /** Human-readable label for display. */
  get label() {
    if (this.isBlackjack) return 'Blackjack!';
    if (this.isBust)      return `Bust (${this.value})`;
    const prefix = this.isSoft && this.value < 21 ? 'Soft' : 'Hard';
    return `${prefix} ${this.value}`;
  }

  clear() { this.cards = []; }
}
