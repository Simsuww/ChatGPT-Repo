/**
 * BasicStrategy — optimal basic strategy lookup for H17, DAS, late surrender.
 *
 * Returns the best action given:
 *  - Player hand total (and soft/pair status)
 *  - Dealer up card rank
 *
 * Strategy layer. Source: Wizard of Odds H17 6-deck table.
 */

import { Action } from '../engine/Rules.js';

// Dealer up-card column index: A, 2, 3, 4, 5, 6, 7, 8, 9, 10
// Index 0 = Ace, 1 = 2, ..., 9 = 10/J/Q/K
const dealerIndex = { A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, J: 9, Q: 9, K: 9 };

const H = Action.HIT;
const S = Action.STAND;
const D = Action.DOUBLE;  // Double if allowed, else Hit
const Ds = 'Ds';          // Double if allowed, else Stand
const P = Action.SPLIT;
const R = Action.SURRENDER; // Surrender if allowed, else Hit

// ─── Hard totals (rows: player 8→21, cols: dealer A,2,3,4,5,6,7,8,9,10) ───

const HARD = {
  //         A  2  3  4  5  6  7  8  9  10
   8: [      H, H, H, H, H, H, H, H, H, H  ],
   9: [      H, D, D, D, D, D, H, H, H, H  ],
  10: [      D, D, D, D, D, D, D, D, H, H  ],
  11: [      D, D, D, D, D, D, D, D, D, D  ],
  12: [      H, H, H, S, S, S, H, H, H, H  ],
  13: [      H, S, S, S, S, S, H, H, H, H  ],
  14: [      H, S, S, S, S, S, H, H, H, H  ],
  15: [      R, S, S, S, S, S, H, H, H, R  ],
  16: [      R, S, S, S, S, S, H, H, R, R  ],
  17: [      R, S, S, S, S, S, S, S, S, S  ],
};

// ─── Soft totals (rows: player A2=13 → A9=20, cols: dealer A,2,3,4,5,6,7,8,9,10) ─

const SOFT = {
  //         A  2  3  4  5  6  7  8  9  10
  13: [      H, H, H, D, D, D, H, H, H, H  ],  // A,2
  14: [      H, H, H, D, D, D, H, H, H, H  ],  // A,3
  15: [      H, H, D, D, D, D, H, H, H, H  ],  // A,4
  16: [      H, H, D, D, D, D, H, H, H, H  ],  // A,5
  17: [      H, D, D, D, D, D, H, H, H, H  ],  // A,6
  18: [      S, Ds,Ds,Ds,Ds,Ds,S, S, H, H  ],  // A,7
  19: [      S, S, S, S, S, Ds,S, S, S, S  ],  // A,8
  20: [      S, S, S, S, S, S, S, S, S, S  ],  // A,9
};

// ─── Pairs (rows: rank, cols: dealer A,2,3,4,5,6,7,8,9,10) ─────────────────

const PAIRS = {
  //         A  2  3  4  5  6  7  8  9  10
  A:  [      P, P, P, P, P, P, P, P, P, P  ],
  '2':[      H, P, P, P, P, P, P, H, H, H  ],
  '3':[      H, P, P, P, P, P, P, H, H, H  ],
  '4':[      H, H, H, H, D, D, H, H, H, H  ],
  '5':[      D, D, D, D, D, D, D, D, H, H  ],
  '6':[      H, P, P, P, P, P, H, H, H, H  ],
  '7':[      H, P, P, P, P, P, P, H, H, H  ],
  '8':[      P, P, P, P, P, P, P, P, P, P  ],
  '9':[      S, P, P, P, P, P, S, P, P, S  ],
  '10':[     S, S, S, S, S, S, S, S, S, S  ],
  J:  [      S, S, S, S, S, S, S, S, S, S  ],
  Q:  [      S, S, S, S, S, S, S, S, S, S  ],
  K:  [      S, S, S, S, S, S, S, S, S, S  ],
};

/**
 * Get the optimal basic strategy action.
 *
 * @param {import('../player/PlayerHand.js').PlayerHand} hand
 * @param {import('../engine/Card.js').Card} dealerUpCard
 * @param {boolean} canDouble
 * @param {boolean} canSplit
 * @param {boolean} canSurrender
 * @returns {{ action: string, label: string }}
 */
export function getHint(hand, dealerUpCard, canDouble, canSplit, canSurrender) {
  if (!dealerUpCard) return { action: Action.STAND, label: 'S' };

  const di  = dealerIndex[dealerUpCard.rank] ?? 9;
  let raw;

  if (canSplit && hand.isPair) {
    const rank = hand.cards[0].rank;
    raw = PAIRS[rank]?.[di] ?? H;
  } else if (hand.isSoft) {
    raw = SOFT[hand.value]?.[di] ?? H;
  } else {
    raw = HARD[Math.min(hand.value, 17)]?.[di] ?? S;
  }

  // Resolve conditional actions
  let action = raw;
  if (raw === D)  action = canDouble ? Action.DOUBLE : Action.HIT;
  if (raw === Ds) action = canDouble ? Action.DOUBLE : Action.STAND;
  if (raw === R)  action = canSurrender ? Action.SURRENDER : Action.HIT;
  if (raw === P && !canSplit) action = Action.HIT;

  const shortLabels = {
    [Action.HIT]: 'H', [Action.STAND]: 'S',
    [Action.DOUBLE]: 'D', [Action.SPLIT]: 'P', [Action.SURRENDER]: 'R',
  };

  return { action, label: shortLabels[action] ?? '?' };
}
