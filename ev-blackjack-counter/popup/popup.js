'use strict';

// ── Default settings ────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  numDecks: 6,
  ruleKey: '6_S17_DAS',
  bankroll: 1000,
  minBet: 5,
  maxBet: 500,
  kellyFraction: 0.25,
  das: true,
  surrender: true,
  h17: false
};

let currentSettings = { ...DEFAULT_SETTINGS };
let tcHistory = []; // array of true count snapshots for distribution chart

// ── Tab switching ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
  });
});

// ── Load settings ─────────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get('bjSettings', (data) => {
    if (data.bjSettings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...data.bjSettings };
    }
    applySettingsToForm(currentSettings);
    updateCounter();
  });
}

function applySettingsToForm(s) {
  document.getElementById('set-numDecks').value = s.numDecks;
  document.getElementById('set-ruleKey').value = s.ruleKey;
  document.getElementById('set-bankroll').value = s.bankroll;
  document.getElementById('set-minBet').value = s.minBet;
  document.getElementById('set-maxBet').value = s.maxBet;
  document.getElementById('set-kellyFraction').value = s.kellyFraction;
  document.getElementById('set-das').checked = s.das;
  document.getElementById('set-surrender').checked = s.surrender;
  document.getElementById('set-h17').checked = s.h17;
}

// ── Save settings ─────────────────────────────────────────────────────────
document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const newSettings = {
    numDecks: parseInt(document.getElementById('set-numDecks').value),
    ruleKey: document.getElementById('set-ruleKey').value,
    bankroll: parseFloat(document.getElementById('set-bankroll').value),
    minBet: parseFloat(document.getElementById('set-minBet').value),
    maxBet: parseFloat(document.getElementById('set-maxBet').value),
    kellyFraction: parseFloat(document.getElementById('set-kellyFraction').value),
    das: document.getElementById('set-das').checked,
    surrender: document.getElementById('set-surrender').checked,
    h17: document.getElementById('set-h17').checked
  };

  chrome.storage.sync.set({ bjSettings: newSettings }, () => {
    currentSettings = newSettings;

    // Notify content scripts
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_UPDATED',
          settings: newSettings
        }).catch(() => {}); // tab may not have content script
      }
    });

    const indicator = document.getElementById('save-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      setTimeout(() => indicator.style.display = 'none', 2000);
    }
  });
});

// ── Toggle overlay ────────────────────────────────────────────────────────
document.getElementById('btn-toggle-overlay')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
    }
  });
});

// ── Reset shoe ────────────────────────────────────────────────────────────
document.getElementById('btn-reset')?.addEventListener('click', () => {
  chrome.storage.session.remove('bjShoe', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_SHOE' }).catch(() => {});
      }
    });
    updateCounter();
  });
});

// ── Update counter display ────────────────────────────────────────────────
function updateCounter() {
  chrome.storage.session.get('bjShoe', (data) => {
    const shoe = data.bjShoe || HiLo.createShoe(currentSettings.numDecks);
    const stats = HiLo.getStats(shoe);
    const betRec = EV.getBetRecommendation(
      stats.trueCount,
      currentSettings.bankroll,
      currentSettings.minBet,
      currentSettings.maxBet,
      currentSettings.ruleKey
    );

    // Running count
    const rc = stats.runningCount;
    setStatValue('stat-rc', rc > 0 ? '+' + rc : String(rc),
      rc > 0 ? 'positive' : rc < 0 ? 'negative' : 'neutral');

    // True count
    const tc = stats.trueCount;
    setStatValue('stat-tc', tc >= 0 ? '+' + tc.toFixed(1) : tc.toFixed(1),
      tc >= 2 ? 'positive' : tc < 0 ? 'negative' : 'neutral');

    // Decks remaining
    setStatValue('stat-dr', stats.decksRemaining.toFixed(1), 'neutral');

    // Edge
    setStatValue('stat-edge', betRec.edgePct,
      betRec.edge > 0.005 ? 'positive' : betRec.edge > 0 ? 'warning' : 'negative');

    // Bet
    const betLabel = betRec.edge > 0
      ? `${betRec.multiplier}× (€${betRec.recommendedBet})`
      : `Min (€${currentSettings.minBet})`;
    setStatValue('stat-bet', betLabel, betRec.edge > 0 ? 'warning' : 'neutral');

    // EV
    const ev = betRec.evPerHand;
    setStatValue('stat-ev', (ev >= 0 ? '+' : '') + '€' + ev,
      ev >= 0 ? 'positive' : 'negative');

    // TC distribution
    renderTCDistribution(shoe);
  });
}

function setStatValue(id, text, colorClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'stat-value ' + (colorClass || 'neutral');
}

// ── TC Distribution Chart ─────────────────────────────────────────────────
function renderTCDistribution(shoe) {
  const container = document.getElementById('tc-distribution');
  if (!container) return;

  // Build distribution from history
  const buckets = { '≤-3': 0, '-2': 0, '-1': 0, '0': 0, '+1': 0, '+2': 0, '+3': 0, '≥+4': 0 };
  const total = shoe.history.length;

  if (total === 0) {
    container.innerHTML = '<div style="text-align:center;color:#334155;font-size:11px;padding:8px">No cards dealt yet</div>';
    return;
  }

  // Reconstruct TC at each point in history
  let tempShoe = HiLo.createShoe(shoe.numDecks);
  for (const entry of shoe.history) {
    const res = HiLo.addCard(tempShoe, entry.card);
    tempShoe = res.shoe;
    const tc = Math.round(HiLo.getTrueCount(tempShoe));
    if (tc <= -3) buckets['≤-3']++;
    else if (tc === -2) buckets['-2']++;
    else if (tc === -1) buckets['-1']++;
    else if (tc === 0) buckets['0']++;
    else if (tc === 1) buckets['+1']++;
    else if (tc === 2) buckets['+2']++;
    else if (tc === 3) buckets['+3']++;
    else buckets['≥+4']++;
  }

  const maxCount = Math.max(...Object.values(buckets), 1);

  const colors = {
    '≤-3': '#ef4444', '-2': '#f87171', '-1': '#fca5a5',
    '0': '#94a3b8',
    '+1': '#86efac', '+2': '#4ade80', '+3': '#22c55e', '≥+4': '#16a34a'
  };

  container.innerHTML = Object.entries(buckets).map(([label, count]) => `
    <div class="tc-bar-row">
      <span class="tc-bar-label">${label}</span>
      <div class="tc-bar-wrap">
        <div class="tc-bar-fill" style="width:${Math.round(count / maxCount * 100)}%;background:${colors[label]};"></div>
      </div>
      <span class="tc-bar-count">${count}</span>
    </div>
  `).join('');
}

// ── Deviations table ──────────────────────────────────────────────────────
function renderDeviationsTable() {
  const tbody = document.getElementById('dev-table-body');
  if (!tbody) return;

  tbody.innerHTML = Strategy.DEVIATIONS.map(dev => {
    const dirLabel = dev.dir === '>=' ? 'TC ≥' : 'TC ≤';
    return `
      <tr>
        <td>${formatHand(dev.hand)}</td>
        <td>${dev.dealer}</td>
        <td>${expandDevAction(dev.action)}</td>
        <td><span class="index-badge">${dirLabel} ${dev.index}</span></td>
      </tr>
    `;
  }).join('');
}

function formatHand(hand) {
  if (hand === 'INS') return 'Insurance';
  if (typeof hand === 'string' && hand.startsWith('soft')) return 'Soft ' + hand.replace('soft', '');
  return 'Hard ' + hand;
}

function expandDevAction(action) {
  const map = { 'H':'Hit','S':'Stand','D':'Double','R':'Surrender','P':'Split','Take':'Take' };
  return map[action] ?? action;
}

// ── Init ─────────────────────────────────────────────────────────────────
loadSettings();
renderDeviationsTable();

// Refresh counter every 2s while popup is open
setInterval(updateCounter, 2000);
