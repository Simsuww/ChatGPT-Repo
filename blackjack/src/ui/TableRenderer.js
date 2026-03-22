/**
 * TableRenderer — renders the shared dealer + seat hand sections.
 *
 * Reads from a snapshot, outputs DOM.
 * UI layer.
 */

import { AnimationController } from './AnimationController.js';
import { Phase } from '../engine/Rules.js';

const PHASE_LABELS = {
  [Phase.IDLE]:        '',
  [Phase.BETTING]:     'Place Your Bets',
  [Phase.DEALING]:     'Dealing',
  [Phase.INSURANCE]:   'Insurance?',
  [Phase.DECISIONS]:   "Players' Turn",
  [Phase.DEALER_TURN]: "Dealer's Turn",
  [Phase.PAYOUT]:      'Payout',
};

export class TableRenderer {
  constructor() {
    this._dealerCards  = document.getElementById('dealer-cards');
    this._dealerValue  = document.getElementById('dealer-value');
    this._seatCards    = document.getElementById('seat-cards');
    this._seatValue    = document.getElementById('seat-value');
    this._phaseBanner  = document.getElementById('phase-banner');
    this._shoeFill     = document.getElementById('shoe-fill');
    this._roundLabel   = document.getElementById('round-label');
    this._prevPhase    = null;
    this._prevDealerCount = 0;
    this._prevSeatCount = 0;
  }

  /**
   * Full render pass from snapshot.
   * @param {object} snap - RoundManager.snapshot
   */
  render(snap) {
    this._renderPhase(snap.phase);
    this._renderShoe(snap.shoePen);
    this._renderRound(snap.round);
    this._renderDealerCards(snap.dealer, snap.phase);
    this._renderSeatCards(snap.seat, snap.phase);
  }

  _renderPhase(phase) {
    const label = PHASE_LABELS[phase] ?? phase;
    if (label) {
      this._phaseBanner.textContent = label;
      this._phaseBanner.classList.add('visible');
    } else {
      this._phaseBanner.classList.remove('visible');
    }
  }

  _renderShoe(penetration) {
    const pct = Math.round((1 - penetration) * 100);
    if (this._shoeFill) this._shoeFill.style.width = `${pct}%`;
  }

  _renderRound(round) {
    if (this._roundLabel) this._roundLabel.textContent = round ? `Round ${round}` : '';
  }

  _renderDealerCards(dealer, phase) {
    const cards = dealer.cards ?? [];
    // Only re-render if card count changed (avoid flickering)
    if (cards.length === this._prevDealerCount && phase === this._prevPhase) return;
    this._prevDealerCount = cards.length;

    this._dealerCards.innerHTML = '';
    let delay = 0;
    for (const card of cards) {
      const el = AnimationController.buildCardEl(card, delay);
      this._dealerCards.appendChild(el);
      delay += 120;
    }

    // Value display
    if (phase === Phase.BETTING || phase === Phase.IDLE || cards.length === 0) {
      this._dealerValue.textContent = '';
    } else if (phase === Phase.DECISIONS || phase === Phase.INSURANCE) {
      // Show only up-card value
      const upCard = dealer.upCard;
      this._dealerValue.textContent = upCard ? upCard.values[0] : '';
    } else {
      this._dealerValue.textContent = dealer.label;
    }
  }

  _renderSeatCards(seat, phase) {
    const cards = seat.cards ?? [];
    if (cards.length === this._prevSeatCount && phase === this._prevPhase) {
      this._prevPhase = phase;
      return;
    }
    this._prevSeatCount = cards.length;
    this._prevPhase = phase;

    this._seatCards.innerHTML = '';
    let delay = 60;
    for (const card of cards) {
      const el = AnimationController.buildCardEl(card, delay);
      this._seatCards.appendChild(el);
      delay += 120;
    }

    if (phase === Phase.BETTING || phase === Phase.IDLE || cards.length === 0) {
      this._seatValue.textContent = '';
    } else {
      this._seatValue.textContent = seat.label;
    }
  }

  /** Force re-render on next call (e.g. after dealer hole card flip). */
  invalidate() {
    this._prevDealerCount = -1;
    this._prevSeatCount = -1;
    this._prevPhase = null;
  }
}
