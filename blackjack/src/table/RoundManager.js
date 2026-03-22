/**
 * RoundManager — the table's state machine and single source of truth.
 *
 * Orchestrates:
 *  - SeatHand (shared cards)
 *  - DealerHand
 *  - All PlayerSessions
 *
 * The UI only reads from RoundManager's snapshot and calls its action methods.
 * State changes fire the `onChange` callback with the current snapshot.
 *
 * Table layer.
 */

import { Shoe }          from '../engine/Shoe.js';
import { Rules, Phase, Outcome, Action } from '../engine/Rules.js';
import { SeatHand }      from './SeatHand.js';
import { DealerHand }    from './DealerHand.js';
import { PlayerSession } from '../player/PlayerSession.js';
import { evaluateHand, evaluateInsurance } from '../player/Payouts.js';

export class RoundManager {
  /**
   * @param {function(object): void} onChange - Called with snapshot on every state change.
   */
  constructor(onChange) {
    this._shoe     = new Shoe(Rules.NUM_DECKS, Rules.CUT_CARD_AT);
    this._seat     = new SeatHand();
    this._dealer   = new DealerHand();
    /** @type {PlayerSession[]} */
    this._players  = [];
    this._phase    = Phase.IDLE;
    this._round    = 0;
    this._onChange = onChange ?? (() => {});
  }

  // ─── Public read-only snapshot ────────────────────────────────────────────

  /** Immutable snapshot of the current game state for the UI. */
  get snapshot() {
    return {
      phase:       this._phase,
      round:       this._round,
      seat:        { cards: this._seat.cards, value: this._seat.value, label: this._seat.label },
      dealer:      { cards: this._dealer.cards, value: this._dealer.value, label: this._dealer.label, upCard: this._dealer.upCard },
      players:     this._players.map(p => p.snapshot),
      shoeRemaining: this._shoe.remaining,
      shoePen:     this._shoe.penetration,
    };
  }

  get phase()   { return this._phase; }
  get players() { return [...this._players]; }

  // ─── Player Management (BETTING phase or IDLE) ────────────────────────────

  /**
   * Add a new player to the table.
   * @param {string} name
   * @param {number} [bankroll]
   * @returns {PlayerSession}
   */
  addPlayer(name, bankroll = Rules.STARTING_BANKROLL) {
    if (this._phase !== Phase.IDLE && this._phase !== Phase.BETTING) {
      throw new Error('Players can only join between rounds');
    }
    if (this._players.length >= Rules.MAX_PLAYERS) {
      throw new Error(`Maximum ${Rules.MAX_PLAYERS} players at the table`);
    }
    const player = new PlayerSession(name, bankroll);
    this._players.push(player);
    this._emit();
    return player;
  }

  /**
   * Remove a player (only between rounds).
   * @param {string} playerId
   */
  removePlayer(playerId) {
    if (this._phase !== Phase.IDLE && this._phase !== Phase.BETTING) {
      throw new Error('Players can only leave between rounds');
    }
    this._players = this._players.filter(p => p.id !== playerId);
    this._emit();
  }

  // ─── Phase: IDLE → BETTING ────────────────────────────────────────────────

  startBetting() {
    if (this._players.length === 0) throw new Error('Need at least one player');
    this._setPhase(Phase.BETTING);
  }

  /**
   * Set a player's bet for this round.
   * @param {string} playerId
   * @param {number} amount
   */
  placeBet(playerId, amount) {
    this._requirePhase(Phase.BETTING);
    const player = this._getPlayer(playerId);
    player.placeBet(amount);
    this._emit();
  }

  /**
   * Adjust bet by a chip denomination (positive = add, negative = remove).
   * @param {string} playerId
   * @param {number} chipValue
   */
  adjustBet(playerId, chipValue) {
    this._requirePhase(Phase.BETTING);
    const player = this._getPlayer(playerId);
    const newBet = Math.max(0, player.pendingBet + chipValue);
    player.setPendingBet(newBet);
    this._emit();
  }

  clearBet(playerId) {
    this._requirePhase(Phase.BETTING);
    this._getPlayer(playerId).clearBet();
    this._emit();
  }

  // ─── Phase: BETTING → DEALING ─────────────────────────────────────────────

  /**
   * Deal the opening hand.
   * Deducts bets from all players' bankrolls and distributes cards.
   */
  deal() {
    this._requirePhase(Phase.BETTING);
    const bettingPlayers = this._players.filter(p => p.pendingBet >= Rules.MIN_BET);
    if (bettingPlayers.length === 0) throw new Error('At least one player must place a bet');

    this._round++;
    this._seat.reset();
    this._dealer.reset();

    // Commit bets
    for (const player of bettingPlayers) {
      player.commitBet();
    }

    // Classic deal order: seat card 1, dealer up, seat card 2, dealer hole
    this._seat.addCard(this._shoe.draw());
    this._dealer.addCard(this._shoe.draw());
    this._seat.addCard(this._shoe.draw());
    this._dealer.addCard(this._shoe.draw(true)); // hole card face down

    // Initialise each betting player's hand from the seat cards
    for (const player of bettingPlayers) {
      player.initHand(this._seat.cards);
    }

    // Players who didn't bet sit out this round
    for (const player of this._players.filter(p => !bettingPlayers.includes(p))) {
      player.sitOut();
    }

    this._setPhase(Phase.DEALING);
    this._afterDeal();
  }

  _afterDeal() {
    // Check if insurance should be offered
    if (Rules.INSURANCE && this._dealer.showsAce) {
      this._setPhase(Phase.INSURANCE);
      return;
    }
    // Check for dealer BJ (peek if shows ten)
    if (this._dealer.showsTen) {
      this._dealer.revealHoleCard();
      if (this._dealer.hasBlackjack) {
        this._resolveDealerBlackjack();
        return;
      }
    }
    this._beginDecisions();
  }

  // ─── Phase: INSURANCE ────────────────────────────────────────────────────

  /**
   * Record a player's insurance decision.
   * @param {string} playerId
   * @param {boolean} takeInsurance
   */
  decideInsurance(playerId, takeInsurance) {
    this._requirePhase(Phase.INSURANCE);
    const player = this._getPlayer(playerId);
    if (takeInsurance) {
      player.takeInsurance();
    } else {
      player.declineInsurance();
    }
    this._emit();

    // Once all active players have decided, proceed
    if (this._activePlayers().every(p => p.insuranceDecided)) {
      this._resolveInsurance();
    }
  }

  _resolveInsurance() {
    this._dealer.revealHoleCard();
    const dealerBJ = this._dealer.hasBlackjack;

    for (const player of this._activePlayers()) {
      const credit = evaluateInsurance(player.insuranceBet, dealerBJ);
      if (credit > 0) player.credit(credit);
    }

    if (dealerBJ) {
      this._resolveDealerBlackjack();
    } else {
      this._beginDecisions();
    }
  }

  _resolveDealerBlackjack() {
    // All players without BJ lose; players with BJ push
    for (const player of this._activePlayers()) {
      const result = evaluateHand(player.activeHand, this._dealer, true);
      player.setOutcome(result.outcome, result.credit);
    }
    this._setPhase(Phase.PAYOUT);
  }

  // ─── Phase: DECISIONS ────────────────────────────────────────────────────

  _beginDecisions() {
    // Check if seat was BJ — players with unmodified hands push/win immediately
    if (this._seat.isBlackjack) {
      for (const player of this._activePlayers()) {
        const result = evaluateHand(player.activeHand, this._dealer, false);
        player.setOutcome(result.outcome, result.credit);
      }
      this._beginDealerTurn();
      return;
    }
    this._setPhase(Phase.DECISIONS);
  }

  /**
   * Process a player action during DECISIONS phase.
   * @param {string} playerId
   * @param {string} action  - One of Action.*
   */
  playerAction(playerId, action) {
    this._requirePhase(Phase.DECISIONS);
    const player = this._getPlayer(playerId);

    if (player.isComplete) throw new Error('Player has already finished their turn');

    switch (action) {
      case Action.HIT:       this._hit(player);       break;
      case Action.STAND:     this._stand(player);     break;
      case Action.DOUBLE:    this._double(player);    break;
      case Action.SPLIT:     this._split(player);     break;
      case Action.SURRENDER: this._surrender(player); break;
      default: throw new Error(`Unknown action: ${action}`);
    }

    this._emit();
    this._checkAllDecisionsComplete();
  }

  _hit(player) {
    const card = this._shoe.draw();
    player.activeHand.addCard(card);
    if (player.activeHand.isBust || player.activeHand.is21) {
      player.advanceHand();
    }
  }

  _stand(player) {
    player.advanceHand();
  }

  _double(player) {
    if (!this._canDouble(player)) throw new Error('Cannot double here');
    const card = this._shoe.draw();
    player.doubleDown(card);
    player.advanceHand();
  }

  _split(player) {
    if (!this._canSplit(player)) throw new Error('Cannot split here');
    const c1 = this._shoe.draw();
    const c2 = this._shoe.draw();

    // Special: only one card each if splitting aces
    const splitAces = player.activeHand.isPairOfAces;
    player.split(c1, c2);

    if (splitAces && Rules.ONE_CARD_ON_SPLIT_ACE) {
      // Auto-stand both ace hands after one card
      player.activeHand.splitAceLocked = true;
      player.advanceHand();
      if (!player.isComplete) {
        player.activeHand.splitAceLocked = true;
        player.advanceHand();
      }
    }
  }

  _surrender(player) {
    if (!Rules.SURRENDER) throw new Error('Surrender not allowed');
    if (player.activeHand.cards.length !== 2) throw new Error('Can only surrender on first two cards');
    player.surrender();
    player.advanceHand();
  }

  _canDouble(player) {
    const hand = player.activeHand;
    const isFirstTwoCards = hand.cards.length === 2;
    const afterSplit = player.handCount > 1;
    if (!isFirstTwoCards) return false;
    if (afterSplit && !Rules.DOUBLE_AFTER_SPLIT) return false;
    if (hand.bet > player.bankroll) return false;
    return true;
  }

  _canSplit(player) {
    const hand = player.activeHand;
    if (!hand.isPair) return false;
    if (player.handCount >= Rules.MAX_SPLIT_HANDS) return false;
    if (hand.isPairOfAces && !Rules.RESPLIT_ACES && player.handCount > 1) return false;
    if (hand.bet > player.bankroll) return false;
    return true;
  }

  _checkAllDecisionsComplete() {
    if (this._activePlayers().every(p => p.isComplete)) {
      this._beginDealerTurn();
    }
  }

  // ─── Phase: DEALER_TURN ───────────────────────────────────────────────────

  _beginDealerTurn() {
    this._dealer.revealHoleCard();
    // If all active players busted/surrendered, dealer doesn't need to play
    const anyStanding = this._activePlayers().some(
      p => p.hands.some(h => !h.isBust && !h.isSurrendered && !h.isResolved)
    );
    if (anyStanding) {
      while (this._dealer.mustHit) {
        this._dealer.addCard(this._shoe.draw());
      }
    }
    this._setPhase(Phase.DEALER_TURN);
    this._payout();
  }

  // ─── Phase: PAYOUT ────────────────────────────────────────────────────────

  _payout() {
    const dealerBJ = this._dealer.hasBlackjack;
    for (const player of this._activePlayers()) {
      for (const hand of player.hands) {
        if (!hand.isResolved) {
          const result = evaluateHand(hand, this._dealer, dealerBJ);
          hand.outcome  = result.outcome;
          hand.resolved = true;
          player.credit(result.credit);
        }
      }
    }
    this._setPhase(Phase.PAYOUT);
  }

  // ─── Phase: PAYOUT → BETTING (new round) ─────────────────────────────────

  nextRound() {
    if (this._phase !== Phase.PAYOUT) throw new Error('Round not complete');
    // Remove bankrupt players
    this._players = this._players.filter(p => !p.isBankrupt);
    if (this._players.length === 0) {
      this._setPhase(Phase.IDLE);
      return;
    }
    for (const player of this._players) player.resetForNewRound();
    this._seat.reset();
    this._dealer.reset();
    this._setPhase(Phase.BETTING);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _activePlayers() {
    return this._players.filter(p => p.isActive);
  }

  _getPlayer(id) {
    const p = this._players.find(p => p.id === id);
    if (!p) throw new Error(`Player ${id} not found`);
    return p;
  }

  _requirePhase(phase) {
    if (this._phase !== phase) {
      throw new Error(`Action not valid in phase ${this._phase}, expected ${phase}`);
    }
  }

  _setPhase(phase) {
    this._phase = phase;
    this._emit();
  }

  _emit() {
    this._onChange(this.snapshot);
  }

  /** Available actions for a given player in the current phase. */
  availableActions(playerId) {
    if (this._phase !== Phase.DECISIONS) return [];
    const player = this._players.find(p => p.id === playerId);
    if (!player || player.isComplete) return [];
    const hand = player.activeHand;
    if (!hand) return [];

    const actions = [Action.HIT, Action.STAND];
    if (this._canDouble(player)) actions.push(Action.DOUBLE);
    if (this._canSplit(player))  actions.push(Action.SPLIT);
    if (Rules.SURRENDER && hand.cards.length === 2 && player.handCount === 1) {
      actions.push(Action.SURRENDER);
    }
    return actions;
  }
}
