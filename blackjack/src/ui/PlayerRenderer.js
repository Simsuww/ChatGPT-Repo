/**
 * PlayerRenderer — renders the per-player panels.
 *
 * Creates/updates player panel DOM from snapshot data.
 * Each panel is keyed by player ID and updated in-place to preserve animations.
 * UI layer.
 */

import { AnimationController } from './AnimationController.js';
import { Phase, Action, Rules } from '../engine/Rules.js';
import { outcomeLabel } from '../player/Payouts.js';
import { getHint } from '../strategy/BasicStrategy.js';

export class PlayerRenderer {
  /**
   * @param {HTMLElement} container - #players-area
   * @param {function(string, string): void} onAction - (playerId, action) callback
   * @param {function(): void} onAddPlayer - callback for Add Player button
   */
  constructor(container, onAction, onAddPlayer) {
    this._container  = container;
    this._onAction   = onAction;
    this._onAddPlayer = onAddPlayer;
    this._panels     = new Map(); // playerId → HTMLElement
    this._showHints  = false;
  }

  set showHints(v) { this._showHints = v; }

  /**
   * Full render pass for all players.
   * @param {object} snap - RoundManager.snapshot
   */
  render(snap) {
    const { players, phase, dealer } = snap;
    const playerIds = players.map(p => p.id);

    // Remove panels for players who left
    for (const [id, el] of this._panels) {
      if (!playerIds.includes(id)) {
        el.remove();
        this._panels.delete(id);
      }
    }

    // Update or create panels
    for (const player of players) {
      if (this._panels.has(player.id)) {
        this._updatePanel(this._panels.get(player.id), player, phase, dealer);
      } else {
        const el = this._createPanel(player, phase, dealer);
        this._panels.set(player.id, el);
        // Insert before add-player button
        const addBtn = document.getElementById('add-player-btn');
        this._container.insertBefore(el, addBtn);
      }
    }

    // Show/hide add player button
    const addBtn = document.getElementById('add-player-btn');
    if (addBtn) {
      addBtn.style.display = (phase === Phase.BETTING || phase === Phase.IDLE) && players.length < Rules.MAX_PLAYERS
        ? 'flex' : 'none';
    }
  }

  _createPanel(player, phase, dealer) {
    const el = document.createElement('div');
    el.className = 'player-panel';
    el.dataset.playerId = player.id;
    this._updatePanel(el, player, phase, dealer);
    return el;
  }

  _updatePanel(el, player, phase, dealer) {
    const isActivePlayer = phase === Phase.DECISIONS && player.isActive && !player.isComplete;
    el.className = `player-panel${isActivePlayer ? ' active-player' : ''}${player.isSittingOut ? ' sitting-out' : ''}`;

    el.innerHTML = '';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'player-header';
    header.innerHTML = `
      <span class="player-name">${this._esc(player.name)}</span>
      <span class="player-bankroll">$${player.bankroll.toLocaleString()}</span>
    `;

    // Remove player button (only between rounds)
    if (phase === Phase.BETTING || phase === Phase.IDLE) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-secondary';
      removeBtn.style.cssText = 'padding:2px 8px;font-size:11px;margin-left:6px;';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove player';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        this._onAction(player.id, 'REMOVE');
      });
      header.appendChild(removeBtn);
    }

    el.appendChild(header);

    // ── Bet area / chip selection ──
    if ((phase === Phase.BETTING) && player.isActive !== false) {
      el.appendChild(this._buildBetArea(player));
    } else if (player.isActive && player.hands.length > 0) {
      const betRow = document.createElement('div');
      betRow.className = 'player-bet-row';
      betRow.innerHTML = `Bet: <span class="player-bet-amount">$${player.pendingBet || (player.hands[0]?.bet ?? 0)}</span>`;
      el.appendChild(betRow);
    }

    // ── Insurance ──
    if (phase === Phase.INSURANCE && player.isActive && !player.insuranceDecided) {
      el.appendChild(this._buildInsuranceButtons(player));
    } else if (player.insuranceBet > 0) {
      const ins = document.createElement('div');
      ins.className = 'player-bet-row text-muted';
      ins.innerHTML = `Insurance: <span class="player-bet-amount">$${player.insuranceBet}</span>`;
      el.appendChild(ins);
    }

    // ── Hands ──
    const handArea = document.createElement('div');
    handArea.className = 'player-hand-area';

    if (player.hands.length === 0 && (phase === Phase.BETTING || phase === Phase.IDLE)) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'font-size:12px;color:var(--text-muted);text-align:center;padding:10px 0;';
      placeholder.textContent = player.pendingBet >= Rules.MIN_BET ? `Bet placed: $${player.pendingBet}` : 'No bet placed';
      handArea.appendChild(placeholder);
    }

    player.hands.forEach((hand, idx) => {
      handArea.appendChild(this._buildHandEl(hand, idx, player, phase, dealer));
    });

    el.appendChild(handArea);

    // ── Strategy hint ──
    if (this._showHints && isActivePlayer && player.hands.length > 0) {
      const activeHand = player.hands[player.activeHandIndex];
      if (activeHand && !activeHand.resolved) {
        const hint = getHint(
          activeHand,
          dealer.upCard,
          true, true, true
        );
        const badge = document.createElement('div');
        badge.className = 'hint-badge';
        badge.textContent = `Hint: ${hint.label}`;
        el.appendChild(badge);
      }
    }
  }

  _buildBetArea(player) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '6px';

    const betDisplay = document.createElement('div');
    betDisplay.className = 'player-bet-row';
    betDisplay.innerHTML = `Bet: <span class="player-bet-amount" id="bet-display-${player.id}">$${player.pendingBet || 0}</span>`;

    const chips = document.createElement('div');
    chips.className = 'chip-row';

    const denomLabels = { 5: '5', 25: '25', 100: '100', 500: '500', 1000: '1K' };
    for (const denom of Rules.CHIP_DENOMINATIONS) {
      const chip = document.createElement('button');
      chip.className = `chip c${denom}`;
      chip.title = `+$${denom}`;
      chip.textContent = denomLabels[denom];
      chip.addEventListener('click', () => this._onAction(player.id, `BET_CHIP:${denom}`));
      chips.appendChild(chip);
    }

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn-secondary';
    clearBtn.style.cssText = 'font-size:11px;padding:3px 8px;align-self:center;';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => this._onAction(player.id, 'BET_CLEAR'));

    wrap.append(betDisplay, chips, clearBtn);
    return wrap;
  }

  _buildInsuranceButtons(player) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;justify-content:center;font-size:12px;align-items:center;';

    const label = document.createElement('span');
    label.style.color = 'var(--gold)';
    label.textContent = 'Insurance?';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn-action';
    yesBtn.textContent = 'Yes';
    yesBtn.style.background = 'rgba(39,174,96,0.3)';
    yesBtn.addEventListener('click', () => this._onAction(player.id, 'INSURANCE_YES'));

    const noBtn = document.createElement('button');
    noBtn.className = 'btn-action';
    noBtn.textContent = 'No';
    noBtn.style.background = 'rgba(231,76,60,0.3)';
    noBtn.addEventListener('click', () => this._onAction(player.id, 'INSURANCE_NO'));

    wrap.append(label, yesBtn, noBtn);
    return wrap;
  }

  _buildHandEl(hand, handIdx, player, phase, dealer) {
    const wrap = document.createElement('div');
    wrap.className = 'player-hand';

    // Cards row
    const cardsRow = document.createElement('div');
    cardsRow.className = 'player-hand-cards';
    hand.cards.forEach((card, ci) => {
      const cardEl = AnimationController.buildCardEl(card, ci * 60, true);
      // Apply outcome glow after payout
      if (phase === Phase.PAYOUT && hand.outcome) {
        AnimationController.applyOutcomeGlow(cardsRow, hand.outcome);
      }
      cardsRow.appendChild(cardEl);
    });
    wrap.appendChild(cardsRow);

    // Label row
    const labelRow = document.createElement('div');
    labelRow.className = 'hand-label';

    if (hand.resolved && hand.outcome) {
      const badge = document.createElement('span');
      badge.className = `outcome-badge outcome-${hand.outcome}`;
      badge.textContent = outcomeLabel(hand.outcome);
      labelRow.appendChild(badge);
      const creditNote = document.createElement('span');
      creditNote.style.cssText = 'font-size:10px;color:var(--text-muted);margin-left:4px;';
      labelRow.appendChild(creditNote);
    } else {
      labelRow.textContent = hand.label;
    }
    wrap.appendChild(labelRow);

    // Action buttons for the currently active hand
    const isThisHandActive = phase === Phase.DECISIONS
      && player.isActive
      && !player.isComplete
      && handIdx === player.activeHandIndex;

    if (isThisHandActive) {
      wrap.appendChild(this._buildActionButtons(player, hand, dealer));
    }

    return wrap;
  }

  _buildActionButtons(player, hand, dealer) {
    const row = document.createElement('div');
    row.className = 'action-buttons';

    const canDouble    = hand.cards.length === 2 && hand.bet <= player.bankroll;
    const canSplit     = hand.isPair && player.hands.length < Rules.MAX_SPLIT_HANDS && hand.bet <= player.bankroll;
    const canSurrender = hand.cards.length === 2 && player.hands.length === 1;

    const buttons = [
      { id: Action.HIT,       label: 'Hit',     cls: 'hit',       enabled: true },
      { id: Action.STAND,     label: 'Stand',   cls: 'stand',     enabled: true },
      { id: Action.DOUBLE,    label: 'Dbl',     cls: 'double',    enabled: canDouble },
      { id: Action.SPLIT,     label: 'Split',   cls: 'split',     enabled: canSplit },
      { id: Action.SURRENDER, label: 'Surr',    cls: 'surrender', enabled: canSurrender },
    ];

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = `btn-action ${btn.cls}`;
      el.textContent = btn.label;
      el.disabled = !btn.enabled;
      if (btn.enabled) {
        el.addEventListener('click', () => this._onAction(player.id, btn.id));
      }
      row.appendChild(el);
    }

    return row;
  }

  _esc(str) {
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
}
