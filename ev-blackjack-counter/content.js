/**
 * EV Blackjack Counter — Content Script
 *
 * Injected into Evolution Gaming / Pragmatic Play casino pages.
 * Renders a draggable floating overlay with:
 *  - Running count + True count (Hi-Lo)
 *  - Player edge %
 *  - Bet recommendation (spread-based + Kelly)
 *  - Basic strategy + Illustrious 18 deviations
 *  - Keyboard-driven card entry
 *  - Shoe management
 */

(function () {
  'use strict';

  // ── Prevent double injection ────────────────────────────────────────────
  if (document.getElementById('ev-bj-overlay')) return;

  // ── State ────────────────────────────────────────────────────────────────
  let shoe = HiLo.createShoe(8);
  let session = EV.createSession(1000, 5, 500, '8_S17_DAS');

  // Auto-detect state
  let autoMode = 'off'; // 'off' | 'ws' | 'scan' | 'click'
  let wsCardsDetected = 0;

  // Input mode: 'shoe' (count all cards), 'player' (player hand), 'dealer' (dealer upcard)
  let inputMode = 'shoe';
  let playerCards = [];
  let dealerUpcard = null;

  // Settings loaded from storage (defaults)
  let settings = {
    numDecks: 8,
    ruleKey: '8_S17_DAS',
    bankroll: 1000,
    minBet: 5,
    maxBet: 500,
    kellyFraction: 0.25,
    das: true,
    surrender: true,
    h17: false
  };

  // ── Load settings from chrome.storage ──────────────────────────────────
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get('bjSettings', (data) => {
        if (data.bjSettings) {
          settings = { ...settings, ...data.bjSettings };
          shoe = HiLo.createShoe(settings.numDecks);
          session = EV.createSession(
            settings.bankroll, settings.minBet,
            settings.maxBet, settings.ruleKey
          );
          render();
        }
      });
    }
  }

  // ── Persist shoe state ──────────────────────────────────────────────────
  function saveShoeState() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.session.set({ bjShoe: shoe });
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  // Cards: 2-9 → number keys, T/0 → ten-value, A → ace, J/Q/K → also ten-value
  // Ctrl+Z → undo last card
  // Ctrl+N → new hand (clear player/dealer display)
  // Ctrl+R → reset shoe
  // Ctrl+` → toggle overlay visibility

  function handleKeydown(e) {
    // Don't intercept typing in input fields
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

    const key = e.key.toUpperCase();

    if (e.ctrlKey || e.metaKey) {
      if (key === 'Z') { undoCard(); e.preventDefault(); return; }
      if (key === 'N') { newHand(); e.preventDefault(); return; }
      if (key === 'R') { resetShoe(); e.preventDefault(); return; }
      if (e.key === '`') { toggleVisibility(); e.preventDefault(); return; }
      return;
    }

    // Card keys
    const cardMap = {
      '2':'2','3':'3','4':'4','5':'5','6':'6',
      '7':'7','8':'8','9':'9',
      '0':'T','T':'T','J':'T','Q':'T','K':'T',
      'A':'A'
    };

    if (cardMap[key]) {
      addCard(cardMap[key]);
      e.preventDefault();
    }
  }

  // ── Card management ──────────────────────────────────────────────────────
  function addCard(card) {
    const result = HiLo.addCard(shoe, card);
    if (result.error) return;
    shoe = result.shoe;

    if (inputMode === 'player') {
      playerCards.push(card);
    } else if (inputMode === 'dealer') {
      dealerUpcard = card;
      inputMode = 'player'; // auto-switch after dealer upcard
    }

    saveShoeState();
    render();
  }

  function undoCard() {
    shoe = HiLo.undoLastCard(shoe);
    // If in player mode, also pop last player card
    if (inputMode === 'player' && playerCards.length > 0) {
      playerCards.pop();
    }
    saveShoeState();
    render();
  }

  function newHand() {
    playerCards = [];
    dealerUpcard = null;
    inputMode = 'dealer'; // next card entered = dealer upcard
    render();
  }

  function resetShoe() {
    shoe = HiLo.resetShoe(shoe);
    playerCards = [];
    dealerUpcard = null;
    inputMode = 'shoe';
    saveShoeState();
    render();
  }

  function toggleVisibility() {
    const overlay = document.getElementById('ev-bj-overlay');
    if (overlay) overlay.classList.toggle('hidden');
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    const stats = HiLo.getStats(shoe);
    const tc = stats.trueCount;
    const tcInt = stats.trueCountInt;

    const betRec = EV.getBetRecommendation(
      tc, settings.bankroll, settings.minBet,
      settings.maxBet, settings.ruleKey
    );

    // Strategy recommendation (only if we have dealer upcard + player cards)
    let stratRec = null;
    if (dealerUpcard && playerCards.length >= 2) {
      const hand = Strategy.buildHand(playerCards);
      stratRec = Strategy.recommend(hand, dealerUpcard, tc, {
        das: settings.das,
        surrender: settings.surrender,
        h17: settings.h17
      });
    } else if (dealerUpcard && playerCards.length === 0) {
      // Insurance check
      if (HiLo.normaliseCard(dealerUpcard) === 'A' && tc >= 3) {
        stratRec = {
          action: 'INS',
          actionFull: 'Take Insurance',
          isDeviation: true,
          deviationDesc: `TC ${tc.toFixed(1)} ≥ 3 — Insurance is +EV`,
          insurance: true
        };
      }
    }

    updateDisplay(stats, betRec, stratRec, tc);
  }

  function updateDisplay(stats, betRec, stratRec, tc) {
    const overlay = document.getElementById('ev-bj-overlay');
    if (!overlay) return;

    // ── True count badge ──────────────────────────────────────
    const tcBadge = overlay.querySelector('.ev-bj-tc-badge');
    if (tcBadge) {
      tcBadge.textContent = stats.trueCountInt >= 0 ? '+' + stats.trueCountInt : stats.trueCountInt;
      tcBadge.className = 'ev-bj-tc-badge';
      if (tc >= 2) tcBadge.classList.add('tc-hot');
      else if (tc <= -1) tcBadge.classList.add('tc-cold');
    }

    // ── Running count ─────────────────────────────────────────
    const rcVal = overlay.querySelector('[data-field="rc"]');
    if (rcVal) {
      const rc = stats.runningCount;
      rcVal.textContent = rc > 0 ? '+' + rc : rc;
      rcVal.className = 'ev-bj-value ' + (rc > 0 ? 'positive' : rc < 0 ? 'negative' : 'neutral');
    }

    // ── True count text ───────────────────────────────────────
    const tcVal = overlay.querySelector('[data-field="tc"]');
    if (tcVal) {
      tcVal.textContent = tc >= 0 ? '+' + tc.toFixed(1) : tc.toFixed(1);
      tcVal.className = 'ev-bj-value ' + (tc >= 2 ? 'positive' : tc < 0 ? 'negative' : 'neutral');
    }

    // ── Decks remaining ───────────────────────────────────────
    const drVal = overlay.querySelector('[data-field="dr"]');
    if (drVal) drVal.textContent = stats.decksRemaining.toFixed(1);

    // ── Edge % ────────────────────────────────────────────────
    const edgeVal = overlay.querySelector('[data-field="edge"]');
    if (edgeVal) {
      edgeVal.textContent = betRec.edgePct;
      edgeVal.className = 'ev-bj-value ' +
        (betRec.edge > 0.005 ? 'positive' : betRec.edge > 0 ? 'warning' : 'negative');
    }

    // ── Penetration bar ───────────────────────────────────────
    const bar = overlay.querySelector('.ev-bj-progress-bar');
    if (bar) bar.style.width = stats.penetrationPct + '%';

    const penLabel = overlay.querySelector('[data-field="pen"]');
    if (penLabel) penLabel.textContent = stats.penetrationPct + '%';

    // ── Bet recommendation ────────────────────────────────────
    const betAmt = overlay.querySelector('.ev-bj-bet-amount');
    if (betAmt) {
      if (betRec.edge > 0) {
        betAmt.textContent = `${betRec.multiplier}× (€${betRec.recommendedBet})`;
        betAmt.style.color = '#fbbf24';
      } else {
        betAmt.textContent = `Min Bet (€${settings.minBet})`;
        betAmt.style.color = '#64748b';
      }
    }

    const betNote = overlay.querySelector('[data-field="bet-note"]');
    if (betNote) {
      betNote.textContent = betRec.rationale;
    }

    const evNote = overlay.querySelector('[data-field="ev-per-hand"]');
    if (evNote) {
      const sign = betRec.evPerHand >= 0 ? '+' : '';
      evNote.textContent = `EV/hand: ${sign}€${betRec.evPerHand}`;
      evNote.className = 'ev-bj-value ' + (betRec.evPerHand >= 0 ? 'positive' : 'negative');
      evNote.style.fontSize = '11px';
    }

    // ── Strategy recommendation ───────────────────────────────
    const stratBox = overlay.querySelector('.ev-bj-strategy-box');
    const stratAction = overlay.querySelector('.ev-bj-strategy-action');
    const stratNote = overlay.querySelector('.ev-bj-strategy-note');

    if (stratBox && stratAction && stratNote) {
      if (stratRec) {
        stratBox.style.display = 'block';
        stratBox.classList.toggle('deviation', stratRec.isDeviation);
        stratAction.textContent = stratRec.actionFull;
        stratNote.textContent = stratRec.isDeviation
          ? `⚡ Deviation: ${stratRec.deviationDesc}`
          : 'Basic strategy';
      } else {
        stratBox.style.display = 'none';
      }
    }

    // ── Hand display ──────────────────────────────────────────
    updateHandDisplay(overlay);

    // Notify background to update badge
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'COUNT_UPDATE', trueCount: tc }).catch(() => {});
    }

    // ── Mode buttons ──────────────────────────────────────────
    overlay.querySelectorAll('.ev-bj-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === inputMode);
    });
  }

  function updateHandDisplay(overlay) {
    const dealerSlot = overlay.querySelector('[data-display="dealer"]');
    const playerSlot = overlay.querySelector('[data-display="player"]');

    if (dealerSlot) {
      dealerSlot.innerHTML = '';
      if (dealerUpcard) {
        dealerSlot.appendChild(makeCardChip(dealerUpcard));
        dealerSlot.appendChild(makeCardChip('?'));
      } else {
        dealerSlot.textContent = '—';
        dealerSlot.style.color = '#334155';
      }
    }

    if (playerSlot) {
      playerSlot.innerHTML = '';
      if (playerCards.length > 0) {
        playerCards.forEach(c => playerSlot.appendChild(makeCardChip(c)));
        const hand = Strategy.buildHand(playerCards);
        const total = document.createElement('span');
        total.style.cssText = 'all:initial;font-family:monospace;font-size:11px;color:#64748b;margin-left:4px;';
        total.textContent = hand.soft && hand.total !== 21
          ? `(${hand.total - 10}/${hand.total})`
          : `(${hand.total})`;
        playerSlot.appendChild(total);
      } else {
        playerSlot.textContent = '—';
        playerSlot.style.color = '#334155';
      }
    }
  }

  function makeCardChip(card) {
    const chip = document.createElement('span');
    chip.className = 'ev-bj-card-chip';
    chip.textContent = card === '?' ? '?' : card;
    const redCards = ['H', 'D']; // hearts/diamonds (visual only)
    const isRed = ['A','2','3','4','5','6','7'].includes(card.toUpperCase());
    if (isRed) chip.classList.add('red');
    if (card === '?') {
      chip.style.cssText += 'background:#1e293b;color:#475569;border-color:#334155;';
    }
    return chip;
  }

  // ── Build overlay HTML ───────────────────────────────────────────────────
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'ev-bj-overlay';

    overlay.innerHTML = `
      <div id="ev-bj-header">
        <span id="ev-bj-title">EV BJ Counter</span>
        <div class="ev-bj-header-btns">
          <span class="ev-bj-icon-btn" id="ev-bj-collapse" title="Collapse">━</span>
          <span class="ev-bj-icon-btn" id="ev-bj-close" title="Hide (Ctrl+\`)">✕</span>
        </div>
      </div>

      <div id="ev-bj-body">

        <!-- True count + running count -->
        <div class="ev-bj-section">
          <div class="ev-bj-row">
            <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
              <div class="ev-bj-row">
                <span class="ev-bj-label">Running Count</span>
                <span class="ev-bj-value neutral" data-field="rc">0</span>
              </div>
              <div class="ev-bj-row">
                <span class="ev-bj-label">True Count</span>
                <span class="ev-bj-value neutral" data-field="tc">0.0</span>
              </div>
              <div class="ev-bj-row">
                <span class="ev-bj-label">Decks Left</span>
                <span class="ev-bj-value neutral" data-field="dr">6.0</span>
              </div>
              <div class="ev-bj-row">
                <span class="ev-bj-label">Player Edge</span>
                <span class="ev-bj-value negative" data-field="edge">-0.40%</span>
              </div>
            </div>
            <span class="ev-bj-tc-badge">0</span>
          </div>

          <!-- Shoe penetration -->
          <div class="ev-bj-row" style="margin-top:6px;">
            <span class="ev-bj-label">Penetration</span>
            <span class="ev-bj-value neutral" style="font-size:11px;" data-field="pen">0%</span>
          </div>
          <div class="ev-bj-progress-wrap">
            <div class="ev-bj-progress-bar" style="width:0%"></div>
          </div>
        </div>

        <div class="ev-bj-divider"></div>

        <!-- Bet recommendation -->
        <div class="ev-bj-bet-box">
          <span class="ev-bj-bet-label">Recommended Bet</span>
          <span class="ev-bj-bet-amount">Min Bet</span>
          <span class="ev-bj-bet-label" data-field="bet-note" style="color:#475569;font-size:9px;margin-top:2px;"></span>
        </div>
        <div class="ev-bj-row">
          <span class="ev-bj-label">EV / hand</span>
          <span class="ev-bj-value neutral" data-field="ev-per-hand">€0.00</span>
        </div>

        <div class="ev-bj-divider"></div>

        <!-- Strategy box -->
        <div class="ev-bj-strategy-box" style="display:none;">
          <span class="ev-bj-strategy-action">—</span>
          <span class="ev-bj-strategy-note"></span>
        </div>

        <!-- Hand display -->
        <div class="ev-bj-section" style="margin-top:6px;">
          <div class="ev-bj-row" style="margin-bottom:2px;">
            <span class="ev-bj-label">Dealer</span>
            <div class="ev-bj-hand-display" data-display="dealer">—</div>
          </div>
          <div class="ev-bj-row">
            <span class="ev-bj-label">Player</span>
            <div class="ev-bj-hand-display" data-display="player">—</div>
          </div>
        </div>

        <div class="ev-bj-divider"></div>

        <!-- Card input -->
        <div class="ev-bj-card-input">

          <!-- Mode selector -->
          <div class="ev-bj-mode-row">
            <span class="ev-bj-mode-btn" data-mode="shoe">Shoe</span>
            <span class="ev-bj-mode-btn" data-mode="dealer">Dealer</span>
            <span class="ev-bj-mode-btn" data-mode="player">Player</span>
          </div>

          <!-- Low cards (green) -->
          <div class="ev-bj-input-row">
            <span class="ev-bj-card-btn low" data-card="2">2</span>
            <span class="ev-bj-card-btn low" data-card="3">3</span>
            <span class="ev-bj-card-btn low" data-card="4">4</span>
            <span class="ev-bj-card-btn low" data-card="5">5</span>
            <span class="ev-bj-card-btn low" data-card="6">6</span>
          </div>
          <!-- Mid/high cards -->
          <div class="ev-bj-input-row">
            <span class="ev-bj-card-btn mid" data-card="7">7</span>
            <span class="ev-bj-card-btn mid" data-card="8">8</span>
            <span class="ev-bj-card-btn mid" data-card="9">9</span>
            <span class="ev-bj-card-btn high" data-card="T">T</span>
            <span class="ev-bj-card-btn high" data-card="A">A</span>
          </div>

          <!-- Actions -->
          <div class="ev-bj-action-row">
            <span class="ev-bj-action-btn" id="ev-bj-undo" title="Ctrl+Z">↩ Undo</span>
            <span class="ev-bj-action-btn primary" id="ev-bj-newhand" title="Ctrl+N">New Hand</span>
            <span class="ev-bj-action-btn danger" id="ev-bj-reset" title="Ctrl+R">Reset</span>
          </div>

          <div class="ev-bj-hotkey-hint">
            Keys: <kbd>2</kbd>–<kbd>9</kbd> <kbd>T</kbd> <kbd>A</kbd> &nbsp;
            <kbd>Ctrl+Z</kbd> undo &nbsp; <kbd>Ctrl+N</kbd> new hand
          </div>
        </div>

        <div class="ev-bj-divider"></div>

        <!-- Auto-detect controls -->
        <div class="ev-bj-section">
          <div class="ev-bj-row" style="margin-bottom:5px;">
            <span class="ev-bj-label">Auto-Detect</span>
            <span id="ev-bj-auto-status" style="font-size:10px;color:#94a3b8;">Off</span>
          </div>
          <div class="ev-bj-mode-row">
            <span class="ev-bj-auto-btn ev-bj-mode-btn" data-auto="off">Off</span>
            <span class="ev-bj-auto-btn ev-bj-mode-btn" data-auto="ws" title="Intercept WebSocket game data">WS</span>
            <span class="ev-bj-auto-btn ev-bj-mode-btn active" data-auto="scan" title="Scan video frames for cards">Video</span>
            <span class="ev-bj-auto-btn ev-bj-mode-btn" data-auto="click" title="Click on cards to read them">Click</span>
          </div>
        </div>

      </div>
    `;

    return overlay;
  }

  // ── Wire up events ───────────────────────────────────────────────────────
  function attachEvents(overlay) {
    // Card buttons
    overlay.querySelectorAll('.ev-bj-card-btn').forEach(btn => {
      btn.addEventListener('click', () => addCard(btn.dataset.card));
    });

    // Input mode buttons (Shoe / Dealer / Player) — exclude auto-detect buttons
    overlay.querySelectorAll('.ev-bj-mode-btn:not(.ev-bj-auto-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        inputMode = btn.dataset.mode;
        if (inputMode === 'dealer') {
          dealerUpcard = null;
          playerCards = [];
        }
        render();
      });
    });

    // Auto-detect buttons
    overlay.querySelectorAll('.ev-bj-auto-btn').forEach(btn => {
      btn.addEventListener('click', () => setAutoMode(btn.dataset.auto));
    });

    // Action buttons
    overlay.querySelector('#ev-bj-undo')?.addEventListener('click', undoCard);
    overlay.querySelector('#ev-bj-newhand')?.addEventListener('click', newHand);
    overlay.querySelector('#ev-bj-reset')?.addEventListener('click', () => {
      if (confirm('Reset the entire shoe? This clears all counts.')) resetShoe();
    });

    // Collapse button
    overlay.querySelector('#ev-bj-collapse')?.addEventListener('click', () => {
      overlay.classList.toggle('collapsed');
      const btn = overlay.querySelector('#ev-bj-collapse');
      if (btn) btn.textContent = overlay.classList.contains('collapsed') ? '▼' : '━';
    });

    // Close button
    overlay.querySelector('#ev-bj-close')?.addEventListener('click', toggleVisibility);

    // Drag to reposition
    makeDraggable(overlay, overlay.querySelector('#ev-bj-header'));
  }

  // ── Draggable ────────────────────────────────────────────────────────────
  function makeDraggable(el, handle) {
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = startLeft + dx + 'px';
        el.style.top = startTop + dy + 'px';
        el.style.right = 'auto';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Auto-detect: inject page script ─────────────────────────────────────
  function injectPageScript() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('lib/page-inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Auto-detect: listen for messages from page-inject.js ─────────────────
  function listenForPageMessages() {
    window.addEventListener('message', (evt) => {
      if (!evt.data?.__evBj) return;

      if (evt.data.type === 'CARD_DETECTED') {
        const card = evt.data.card;
        if (!card) return;
        wsCardsDetected++;
        addCard(card);
        updateAutoStatus(`WS: ${wsCardsDetected} cards`);
      }

      if (evt.data.type === 'WS_CONNECTED') {
        updateAutoStatus(`WS connected`);
      }
    });
  }

  function updateAutoStatus(text) {
    const el = document.getElementById('ev-bj-auto-status');
    if (el) el.textContent = text;
  }

  function setAutoMode(mode) {
    // Tear down previous mode
    if (autoMode === 'scan') CardVision.stopAutoScan();
    if (autoMode === 'click') CardVision.disableClickMode();

    autoMode = mode;

    if (mode === 'ws') {
      // WebSocket is always active once page-inject is loaded
      updateAutoStatus('Listening for WS data…');
    } else if (mode === 'scan') {
      CardVision.startAutoScan();
      updateAutoStatus('Scanning video…');
    } else if (mode === 'click') {
      CardVision.enableClickMode();
      updateAutoStatus('Click on a card');
    } else {
      CardVision.stopAutoScan();
      CardVision.disableClickMode();
      updateAutoStatus('Manual');
    }

    // Update buttons
    document.querySelectorAll('.ev-bj-auto-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.auto === mode);
    });
  }

  // ── Inject CSS ───────────────────────────────────────────────────────────
  function injectCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles/overlay.css');
    (document.head || document.documentElement).appendChild(link);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectCSS();

    const overlay = createOverlay();
    (document.body || document.documentElement).appendChild(overlay);
    attachEvents(overlay);

    document.addEventListener('keydown', handleKeydown, true);

    // Listen for settings updates from popup
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATED') {
          settings = { ...settings, ...msg.settings };
          shoe = HiLo.createShoe(settings.numDecks);
          session = EV.createSession(
            settings.bankroll, settings.minBet,
            settings.maxBet, settings.ruleKey
          );
          render();
        }
        if (msg.type === 'TOGGLE_OVERLAY') toggleVisibility();
      });
    }

    // ── Auto-detect setup ─────────────────────────────────────────────
    // 1. Inject page script for WebSocket interception
    injectPageScript();
    listenForPageMessages();

    // 2. Init CardVision (video scan + click-to-read)
    CardVision.init((rank, source) => {
      addCard(rank);
      updateAutoStatus(`${source}: ${rank}`);
    });

    // Default: WS mode on (page-inject always active, no extra cost)
    setAutoMode('scan');

    loadSettings();
    render();

    console.log('[EV BJ Counter] Loaded. Shortcuts: 2-9/T/A=cards, Ctrl+Z=undo, Ctrl+N=new hand, Ctrl+R=reset, Ctrl+`=toggle');

    // Reset shoe message from popup
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'RESET_SHOE') resetShoe();
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
