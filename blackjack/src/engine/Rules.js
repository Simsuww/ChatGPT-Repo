/**
 * Rules — all game constants and enumerations.
 * Change rule variants here without touching game logic.
 * Engine layer: pure constants.
 */

export const Rules = Object.freeze({
  NUM_DECKS:             6,
  CUT_CARD_AT:           75,      // Reshuffle when this many cards remain
  BLACKJACK_PAYS:        1.5,     // 3:2
  WIN_PAYS:              1,       // 1:1
  INSURANCE_PAYS:        2,       // 2:1
  DEALER_HITS_SOFT_17:   true,
  DEALER_STAND_VALUE:    17,
  DOUBLE_ANY_TWO:        true,
  DOUBLE_AFTER_SPLIT:    true,
  MAX_SPLIT_HANDS:       4,
  RESPLIT_ACES:          false,
  ONE_CARD_ON_SPLIT_ACE: true,
  SURRENDER:             true,    // Late surrender
  INSURANCE:             true,
  STARTING_BANKROLL:     1000,
  MIN_BET:               5,
  MAX_BET:               5000,
  MAX_PLAYERS:           6,
  CHIP_DENOMINATIONS:    [5, 25, 100, 500, 1000],
  INSURANCE_TIMEOUT_MS:  15000,   // 15s to decide insurance
  DECISION_TIMEOUT_MS:   0,       // 0 = no timeout (local game)
});

/** Round phases — explicit state machine. */
export const Phase = Object.freeze({
  IDLE:        'IDLE',
  BETTING:     'BETTING',
  DEALING:     'DEALING',
  INSURANCE:   'INSURANCE',
  DECISIONS:   'DECISIONS',
  DEALER_TURN: 'DEALER_TURN',
  PAYOUT:      'PAYOUT',
});

/** Hand outcome after payout comparison. */
export const Outcome = Object.freeze({
  WIN:        'WIN',
  LOSE:       'LOSE',
  PUSH:       'PUSH',
  BLACKJACK:  'BLACKJACK',
  SURRENDER:  'SURRENDER',
  BUST:       'BUST',
});

/** Actions a player can take during DECISIONS phase. */
export const Action = Object.freeze({
  HIT:               'HIT',
  STAND:             'STAND',
  DOUBLE:            'DOUBLE',
  SPLIT:             'SPLIT',
  SURRENDER:         'SURRENDER',
  INSURANCE:         'INSURANCE',
  DECLINE_INSURANCE: 'DECLINE_INSURANCE',
});
