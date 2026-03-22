/**
 * UIController — top-level orchestrator.
 *
 * Binds DOM events to RoundManager actions.
 * Manages the Add Player modal, keyboard shortcuts, and the render loop.
 * UI layer.
 */

import { RoundManager }    from '../table/RoundManager.js';
import { TableRenderer }   from './TableRenderer.js';
import { PlayerRenderer }  from './PlayerRenderer.js';
import { Statistics }      from '../stats/Statistics.js';
import { Phase, Action, Rules } from '../engine/Rules.js';

export class UIController {
  constructor() {
    this._manager       = new RoundManager(snap => this._onStateChange(snap));
    this._tableRenderer = new TableRenderer();
    this._playerRenderer = new PlayerRenderer(
      document.getElementById('players-area'),
      (pid, action) => this._handlePlayerAction(pid, action),
      () => this._showAddPlayerModal()
    );
    this._stats         = new Map(); // playerId → Statistics
    this._showHints     = false;

    this._bindDealButton();
    this._bindNextRoundButton();
    this._bindAddPlayer();
    this._bindKeyboard();
    this._bindHintsToggle();
    this._bindStatsButton();

    // Start on splash — auto-open betting once dismissed
    document.getElementById('splash-start-btn')
      ?.addEventListener('click', () => this._startSession());
  }

  // ─── Session start ────────────────────────────────────────────────────────

  _startSession() {
    document.getElementById('splash').classList.add('hidden');
    // Add a default Player 1
    const p = this._manager.addPlayer('Player 1');
    this._stats.set(p.id, new Statistics(p.id));
    this._manager.startBetting();
  }

  // ─── State change → render ────────────────────────────────────────────────

  _onStateChange(snap) {
    this._tableRenderer.render(snap);
    this._playerRenderer.showHints = this._showHints;
    this._playerRenderer.render(snap);
    this._updateTableButtons(snap);
    this._updateInsuranceBanner(snap);
  }

  _updateTableButtons(snap) {
    const dealBtn      = document.getElementById('deal-btn');
    const nextRoundBtn = document.getElementById('next-round-btn');
    const hintBtn      = document.getElementById('hints-btn');

    if (dealBtn) {
      dealBtn.disabled = snap.phase !== Phase.BETTING
        || !snap.players.some(p => p.pendingBet >= Rules.MIN_BET);
      dealBtn.style.display = snap.phase === Phase.PAYOUT ? 'none' : '';
    }
    if (nextRoundBtn) {
      nextRoundBtn.style.display = snap.phase === Phase.PAYOUT ? '' : 'none';
    }
    if (hintBtn) {
      hintBtn.textContent = this._showHints ? 'Hints: ON' : 'Hints: OFF';
    }
  }

  _updateInsuranceBanner(snap) {
    const banner = document.getElementById('insurance-banner');
    if (!banner) return;
    if (snap.phase === Phase.INSURANCE) {
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible');
    }
  }

  // ─── Player actions ───────────────────────────────────────────────────────

  _handlePlayerAction(playerId, action) {
    try {
      if (action === 'REMOVE') {
        this._manager.removePlayer(playerId);
        this._stats.delete(playerId);
        return;
      }

      if (action.startsWith('BET_CHIP:')) {
        const chip = parseInt(action.split(':')[1]);
        this._manager.adjustBet(playerId, chip);
        return;
      }

      if (action === 'BET_CLEAR') {
        this._manager.clearBet(playerId);
        return;
      }

      if (action === 'INSURANCE_YES') {
        this._manager.decideInsurance(playerId, true);
        return;
      }

      if (action === 'INSURANCE_NO') {
        this._manager.decideInsurance(playerId, false);
        return;
      }

      // Game actions: HIT, STAND, DOUBLE, SPLIT, SURRENDER
      this._manager.playerAction(playerId, action);

    } catch (err) {
      this._showError(err.message);
    }
  }

  // ─── Deal button ──────────────────────────────────────────────────────────

  _bindDealButton() {
    const btn = document.getElementById('deal-btn');
    btn?.addEventListener('click', () => {
      try {
        this._manager.deal();
      } catch (err) {
        this._showError(err.message);
      }
    });
  }

  // ─── Next round ───────────────────────────────────────────────────────────

  _bindNextRoundButton() {
    const btn = document.getElementById('next-round-btn');
    btn?.addEventListener('click', () => {
      try {
        this._manager.nextRound();
      } catch (err) {
        this._showError(err.message);
      }
    });
  }

  // ─── Add player modal ─────────────────────────────────────────────────────

  _bindAddPlayer() {
    const addBtn = document.createElement('button');
    addBtn.id = 'add-player-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add player';
    addBtn.addEventListener('click', () => this._showAddPlayerModal());
    document.getElementById('players-area').appendChild(addBtn);
  }

  _showAddPlayerModal() {
    const overlay = document.getElementById('add-player-modal');
    const input   = document.getElementById('new-player-name');
    if (!overlay || !input) return;
    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();
  }

  _bindAddPlayerModal() {
    const overlay   = document.getElementById('add-player-modal');
    const confirmBtn = document.getElementById('add-player-confirm');
    const cancelBtn = document.getElementById('add-player-cancel');
    const input     = document.getElementById('new-player-name');

    confirmBtn?.addEventListener('click', () => {
      const name = input?.value.trim() || `Player ${this._manager.players.length + 1}`;
      try {
        const p = this._manager.addPlayer(name);
        this._stats.set(p.id, new Statistics(p.id));
        overlay?.classList.add('hidden');
      } catch (err) {
        this._showError(err.message);
      }
    });

    cancelBtn?.addEventListener('click', () => overlay?.classList.add('hidden'));

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmBtn?.click();
      if (e.key === 'Escape') cancelBtn?.click();
    });
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;

      const snap = this._manager.snapshot;

      switch (e.key.toUpperCase()) {
        case ' ':
          e.preventDefault();
          if (snap.phase === Phase.BETTING) {
            document.getElementById('deal-btn')?.click();
          } else if (snap.phase === Phase.PAYOUT) {
            document.getElementById('next-round-btn')?.click();
          }
          break;

        case 'H': this._keyAction(Action.HIT);       break;
        case 'S': this._keyAction(Action.STAND);     break;
        case 'D': this._keyAction(Action.DOUBLE);    break;
        case 'P': this._keyAction(Action.SPLIT);     break;
        case 'R': this._keyAction(Action.SURRENDER); break;
        case '?': this._toggleHints();               break;

        case '1': this._keyBetChip(Rules.CHIP_DENOMINATIONS[0]); break;
        case '2': this._keyBetChip(Rules.CHIP_DENOMINATIONS[1]); break;
        case '3': this._keyBetChip(Rules.CHIP_DENOMINATIONS[2]); break;
        case '4': this._keyBetChip(Rules.CHIP_DENOMINATIONS[3]); break;
        case '5': this._keyBetChip(Rules.CHIP_DENOMINATIONS[4]); break;
      }
    });
  }

  _keyAction(action) {
    const snap = this._manager.snapshot;
    if (snap.phase !== Phase.DECISIONS) return;
    // Act for the first incomplete player
    const activePlayer = snap.players.find(p => p.isActive && !p.isComplete);
    if (activePlayer) {
      this._handlePlayerAction(activePlayer.id, action);
    }
  }

  _keyBetChip(denom) {
    const snap = this._manager.snapshot;
    if (snap.phase !== Phase.BETTING) return;
    // Apply chip to first player
    const p = snap.players[0];
    if (p) this._handlePlayerAction(p.id, `BET_CHIP:${denom}`);
  }

  // ─── Hints toggle ─────────────────────────────────────────────────────────

  _bindHintsToggle() {
    document.getElementById('hints-btn')?.addEventListener('click', () => this._toggleHints());
  }

  _toggleHints() {
    this._showHints = !this._showHints;
    // Force re-render
    this._onStateChange(this._manager.snapshot);
  }

  // ─── Stats panel ──────────────────────────────────────────────────────────

  _bindStatsButton() {
    document.getElementById('stats-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('stats-panel');
      panel?.classList.toggle('visible');
    });

    document.getElementById('stats-close')?.addEventListener('click', () => {
      document.getElementById('stats-panel')?.classList.remove('visible');
    });
  }

  // ─── Error toast ──────────────────────────────────────────────────────────

  _showError(message) {
    const toast = document.getElementById('error-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  /** Call after DOM is ready. */
  init() {
    this._bindAddPlayerModal();
  }
}
