/**
 * Basic Strategy + Count-Based Deviations
 *
 * Basic strategy encoded for 6-deck S17 DAS (also applies to Evolution/Pragmatic S17 tables).
 * For H17 tables, key differences are noted.
 *
 * Action codes:
 *   H  = Hit
 *   S  = Stand
 *   D  = Double (if not allowed, Hit)
 *   Ds = Double if allowed, else Stand
 *   P  = Split
 *   Ph = Split if DAS, else Hit
 *   Pd = Split if DAS, else Double
 *   Rh = Surrender if allowed, else Hit
 *   Rs = Surrender if allowed, else Stand
 *   Rp = Surrender if allowed, else Split
 *
 * Illustrious 18 deviations (most impactful count-based plays).
 * Fab 4 surrenders included.
 *
 * Index interpretation: play the deviation when TC >= index (for >= plays)
 * or TC <= index (for <= plays).
 */

'use strict';

const Strategy = (() => {

  // Dealer upcard columns: 2 3 4 5 6 7 8 9 T A
  // Row = player total or hand type

  // ── Hard totals ──────────────────────────────────────────────────────────
  const HARD = {
  //         2     3     4     5     6     7     8     9     T     A
     8:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
     9:  ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
    10:  ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
    11:  ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
    12:  ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    13:  ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    14:  ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    15:  ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh','H'],
    16:  ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh','Rh','Rh'],
    17:  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'],
    18:  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  };

  // ── Soft totals (Ace + X) ─────────────────────────────────────────────────
  // Key = non-ace card value (so soft 13 = A+2, key '2')
  const SOFT = {
  //         2     3     4     5     6     7     8     9     T     A
    13:  ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  // A+2
    14:  ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  // A+3
    15:  ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  // A+4
    16:  ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  // A+5
    17:  ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  // A+6
    18:  ['Ds','Ds','Ds','Ds','Ds','S', 'S', 'H', 'H', 'H'],   // A+7
    19:  ['S', 'S', 'S', 'S', 'Ds','S', 'S', 'S', 'S', 'S'],  // A+8
    20:  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // A+9
  };

  // ── Pairs ─────────────────────────────────────────────────────────────────
  const PAIRS = {
  //         2     3     4     5     6     7     8     9     T     A
    'A':  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    '2':  ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    '3':  ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    '4':  ['H', 'H', 'H', 'Ph','Ph','H', 'H', 'H', 'H', 'H'],
    '5':  ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],  // treat as hard 10
    '6':  ['Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
    '7':  ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    '8':  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'Rp'],
    '9':  ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
    'T':  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  };

  // Dealer upcard index mapping (0-based position in the tables above)
  const UPCARD_INDEX = {
    '2': 0, '3': 1, '4': 2, '5': 3, '6': 4,
    '7': 5, '8': 6, '9': 7,
    'T': 8, 'J': 8, 'Q': 8, 'K': 8, '10': 8,
    'A': 9
  };

  // ── Illustrious 18 + Fab 4 deviations ────────────────────────────────────
  // Format: { hand, dealer, action, index, direction }
  // direction: '>=' means "play this action when TC >= index"
  //            '<=' means "play this action when TC <= index"
  // action is the DEVIATION action (different from basic strategy)
  //
  // The most important deviations by EV impact:
  const DEVIATIONS = [
    // Illustrious 18 (ordered by impact)
    { desc: 'Insurance',        hand: 'INS',    dealer: 'A',  action: 'Take',  index: 3,  dir: '>=' },
    { desc: '16 vs T',          hand: 16,       dealer: 'T',  action: 'S',     index: 0,  dir: '>=' },
    { desc: '15 vs T',          hand: 15,       dealer: 'T',  action: 'S',     index: 4,  dir: '>=' },
    { desc: '10 vs T',          hand: 10,       dealer: 'T',  action: 'D',     index: 4,  dir: '>=' },
    { desc: '10 vs A',          hand: 10,       dealer: 'A',  action: 'D',     index: 4,  dir: '>=' },
    { desc: '12 vs 3',          hand: 12,       dealer: '3',  action: 'S',     index: 2,  dir: '>=' },
    { desc: '12 vs 2',          hand: 12,       dealer: '2',  action: 'S',     index: 3,  dir: '>=' },
    { desc: '11 vs A',          hand: 11,       dealer: 'A',  action: 'D',     index: 1,  dir: '>=' },
    { desc: '9 vs 2',           hand: 9,        dealer: '2',  action: 'D',     index: 1,  dir: '>=' },
    { desc: '9 vs 7',           hand: 9,        dealer: '7',  action: 'D',     index: 3,  dir: '>=' },
    { desc: '16 vs 9',          hand: 16,       dealer: '9',  action: 'S',     index: 5,  dir: '>=' },
    { desc: '13 vs 2',          hand: 13,       dealer: '2',  action: 'S',     index: -1, dir: '>=' },
    { desc: '12 vs 4',          hand: 12,       dealer: '4',  action: 'S',     index: 0,  dir: '>=' },
    { desc: '12 vs 5',          hand: 12,       dealer: '5',  action: 'H',     index: -2, dir: '<=' },
    { desc: '12 vs 6',          hand: 12,       dealer: '6',  action: 'H',     index: -1, dir: '<=' },
    { desc: '13 vs 3',          hand: 13,       dealer: '3',  action: 'H',     index: -2, dir: '<=' },
    // Fab 4 surrenders
    { desc: '14 vs T (Sur)',     hand: 14,       dealer: 'T',  action: 'R',     index: 3,  dir: '>=' },
    { desc: '15 vs 9 (Sur)',     hand: 15,       dealer: '9',  action: 'R',     index: 2,  dir: '>=' },
    { desc: '15 vs A (Sur)',     hand: 15,       dealer: 'A',  action: 'R',     index: 1,  dir: '>=' },
    { desc: '14 vs A (Sur)',     hand: 'soft14', dealer: 'A',  action: 'R',     index: 3,  dir: '>=' },
  ];

  /**
   * Normalise upcard to a standard key for table lookup.
   */
  function normaliseUpcard(card) {
    const s = String(card).toUpperCase().trim();
    if (['T','J','Q','K','10'].includes(s)) return 'T';
    return s;
  }

  /**
   * Look up basic strategy action.
   * @param {Object} hand   { total, soft, pair, pairCard }
   * @param {string} upcard dealer's visible card
   * @param {boolean} das   double after split allowed
   * @returns {string} action code
   */
  function basicStrategy(hand, upcard, das = true) {
    const norm = normaliseUpcard(upcard);
    const idx = UPCARD_INDEX[norm];
    if (idx === undefined) return 'H';

    // Pairs first
    if (hand.pair) {
      const pairKey = ['T','J','Q','K'].includes(hand.pairCard?.toUpperCase()) ? 'T' : hand.pairCard?.toUpperCase();
      const row = PAIRS[pairKey];
      if (row) {
        let action = row[idx];
        // Handle DAS restrictions
        if (action === 'Ph' && !das) action = 'H';
        if (action === 'Pd' && !das) action = 'D';
        return action;
      }
    }

    // Soft hands
    if (hand.soft && hand.total >= 13 && hand.total <= 21) {
      const row = SOFT[hand.total];
      if (row) return row[idx];
    }

    // Hard hands
    if (hand.total <= 8)  return 'H';
    if (hand.total >= 18) return 'S';
    const row = HARD[hand.total];
    return row ? row[idx] : 'S';
  }

  /**
   * Get count-based deviation if applicable.
   * Returns the deviation action if TC crosses the index, else null.
   *
   * @param {Object} hand   { total, soft, pair }
   * @param {string} upcard
   * @param {number} trueCount
   * @returns {{ action: string, desc: string, deviation: Object } | null}
   */
  function getDeviation(hand, upcard, trueCount) {
    const norm = normaliseUpcard(upcard);
    const tc = trueCount;

    for (const dev of DEVIATIONS) {
      // Match dealer upcard
      const devDealer = normaliseUpcard(dev.dealer);
      if (devDealer !== norm) continue;

      // Insurance special case
      if (dev.hand === 'INS') {
        if (norm === 'A' && dev.dir === '>=' && tc >= dev.index) {
          return { action: dev.action, desc: dev.desc, deviation: dev };
        }
        continue;
      }

      // Match hand total
      if (hand.total !== dev.hand) continue;

      // Check soft restriction (soft14 etc.)
      if (typeof dev.hand === 'string' && dev.hand.startsWith('soft') && !hand.soft) continue;

      // Check TC threshold
      if (dev.dir === '>=' && tc >= dev.index) {
        return { action: dev.action, desc: dev.desc, deviation: dev };
      }
      if (dev.dir === '<=' && tc <= dev.index) {
        return { action: dev.action, desc: dev.desc, deviation: dev };
      }
    }
    return null;
  }

  /**
   * Get the recommended action combining basic strategy + deviations.
   * @param {Object} hand   { total, soft, pair, pairCard }
   * @param {string} upcard
   * @param {number} trueCount
   * @param {Object} rules  { das, surrender, h17 }
   * @returns {{
   *   action: string,
   *   actionFull: string,
   *   isDeviation: boolean,
   *   deviationDesc: string | null,
   *   insurance: boolean
   * }}
   */
  function recommend(hand, upcard, trueCount = 0, rules = { das: true, surrender: true, h17: false }) {
    // Insurance check (before playing hand)
    if (normaliseUpcard(upcard) === 'A' && trueCount >= 3) {
      return {
        action: 'INS',
        actionFull: 'Take Insurance',
        isDeviation: true,
        deviationDesc: 'TC ≥ 3 — Insurance is +EV',
        insurance: true
      };
    }

    // Check for deviation first
    const dev = getDeviation(hand, upcard, trueCount);
    if (dev) {
      const actionFull = expandAction(dev.action, rules);
      return {
        action: dev.action,
        actionFull,
        isDeviation: true,
        deviationDesc: `${dev.desc} @ TC ${dev.deviation.dir} ${dev.deviation.index}`,
        insurance: false
      };
    }

    // Basic strategy
    const baseAction = basicStrategy(hand, upcard, rules.das);
    return {
      action: baseAction,
      actionFull: expandAction(baseAction, rules),
      isDeviation: false,
      deviationDesc: null,
      insurance: false
    };
  }

  function expandAction(code, rules = { surrender: true }) {
    const map = {
      'H':  'Hit',
      'S':  'Stand',
      'D':  'Double',
      'Ds': 'Double (else Stand)',
      'P':  'Split',
      'Ph': 'Split (else Hit)',
      'Pd': 'Split (else Double)',
      'Rh': rules.surrender ? 'Surrender' : 'Hit',
      'Rs': rules.surrender ? 'Surrender' : 'Stand',
      'Rp': rules.surrender ? 'Surrender' : 'Split',
      'R':  rules.surrender ? 'Surrender' : 'Stand',
      'Take': 'Take Insurance',
      'INS': 'Take Insurance'
    };
    return map[code] ?? code;
  }

  /**
   * Helper: Build a hand object from a card array.
   * @param {string[]} cards  e.g. ['A', '7'] or ['8', '8']
   * @returns {{ total: number, soft: boolean, pair: boolean, pairCard: string|null, bust: boolean }}
   */
  function buildHand(cards) {
    let total = 0;
    let aces = 0;

    for (const c of cards) {
      const norm = c.toUpperCase().trim();
      if (['T','J','Q','K','10'].includes(norm)) {
        total += 10;
      } else if (norm === 'A') {
        total += 11;
        aces++;
      } else {
        total += parseInt(norm, 10) || 0;
      }
    }

    // Reduce aces if bust
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    const soft = aces > 0 && total <= 21;
    const pair = cards.length === 2 &&
      normaliseCardForPair(cards[0]) === normaliseCardForPair(cards[1]);

    return {
      total,
      soft,
      pair,
      pairCard: pair ? normaliseCardForPair(cards[0]) : null,
      bust: total > 21,
      cards
    };
  }

  function normaliseCardForPair(card) {
    const s = card.toUpperCase().trim();
    if (['T','J','Q','K','10'].includes(s)) return 'T';
    return s;
  }

  return {
    basicStrategy,
    getDeviation,
    recommend,
    buildHand,
    expandAction,
    DEVIATIONS
  };
})();

if (typeof module !== 'undefined') module.exports = Strategy;
