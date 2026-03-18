/**
 * Hi-Lo Card Counting System
 * The industry-standard balanced counting system.
 * 2-6  → +1 (low cards favour dealer, removing them helps player)
 * 7-9  → 0  (neutral)
 * T-A  → -1 (high cards favour player)
 */

'use strict';

const HiLo = (() => {
  const CARD_VALUES = {
    '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
    '7': 0, '8': 0, '9': 0,
    'T': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
    '10': -1  // alias
  };

  function normaliseCard(raw) {
    const s = String(raw).toUpperCase().trim();
    if (s === '10' || s === 'T' || s === 'J' || s === 'Q' || s === 'K') return 'T';
    if (s === 'A') return 'A';
    if (['2','3','4','5','6','7','8','9'].includes(s)) return s;
    return null; // unknown
  }

  function countValue(card) {
    const norm = normaliseCard(card);
    if (norm === null) return null;
    return CARD_VALUES[norm] ?? 0;
  }

  function createShoe(numDecks = 6) {
    return {
      numDecks,
      totalCards: numDecks * 52,
      runningCount: 0,
      cardsDealt: 0,
      handsPlayed: 0,
      history: [],        // [{card, norm, countDelta, rcAfter}]
      handHistory: []     // per-hand summaries
    };
  }

  function addCard(shoe, rawCard) {
    const norm = normaliseCard(rawCard);
    if (norm === null) return { shoe, error: `Unknown card: "${rawCard}"` };

    const delta = CARD_VALUES[norm];
    const newRC = shoe.runningCount + delta;
    const entry = { card: rawCard, norm, countDelta: delta, rcAfter: newRC };

    return {
      shoe: {
        ...shoe,
        runningCount: newRC,
        cardsDealt: shoe.cardsDealt + 1,
        history: [...shoe.history, entry]
      },
      entry
    };
  }

  function undoLastCard(shoe) {
    if (shoe.history.length === 0) return shoe;
    const last = shoe.history[shoe.history.length - 1];
    return {
      ...shoe,
      runningCount: shoe.runningCount - last.countDelta,
      cardsDealt: shoe.cardsDealt - 1,
      history: shoe.history.slice(0, -1)
    };
  }

  function getDecksRemaining(shoe) {
    const cardsLeft = shoe.totalCards - shoe.cardsDealt;
    return Math.max(0.5, cardsLeft / 52); // floor at 0.5 to avoid division issues
  }

  function getTrueCount(shoe) {
    return shoe.runningCount / getDecksRemaining(shoe);
  }

  /** Rounded true count (integer, used for strategy deviations) */
  function getTrueCountInt(shoe) {
    return Math.round(getTrueCount(shoe));
  }

  function getPenetration(shoe) {
    return shoe.cardsDealt / shoe.totalCards;
  }

  function resetShoe(shoe) {
    return createShoe(shoe.numDecks);
  }

  function getStats(shoe) {
    const tc = getTrueCount(shoe);
    const decksLeft = getDecksRemaining(shoe);
    return {
      runningCount: shoe.runningCount,
      trueCount: parseFloat(tc.toFixed(2)),
      trueCountInt: Math.round(tc),
      decksRemaining: parseFloat(decksLeft.toFixed(2)),
      cardsDealt: shoe.cardsDealt,
      totalCards: shoe.totalCards,
      penetrationPct: parseFloat((getPenetration(shoe) * 100).toFixed(1)),
      handsPlayed: shoe.handsPlayed
    };
  }

  return {
    normaliseCard,
    countValue,
    createShoe,
    addCard,
    undoLastCard,
    getTrueCount,
    getTrueCountInt,
    getDecksRemaining,
    getPenetration,
    resetShoe,
    getStats
  };
})();

if (typeof module !== 'undefined') module.exports = HiLo;
