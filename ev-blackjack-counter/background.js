/**
 * EV Blackjack Counter — Background Service Worker (Manifest V3)
 *
 * Handles:
 * - Extension icon badge showing current true count
 * - Keyboard command to toggle the overlay
 * - State persistence across tab navigations
 */

'use strict';

// ── Badge update helper ──────────────────────────────────────────────────
function updateBadge(tabId, trueCount) {
  const tc = Math.round(trueCount);
  const text = tc === 0 ? '' : (tc > 0 ? '+' + tc : String(tc));

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({
    color: tc >= 3 ? '#22c55e'   // green — hot shoe
         : tc >= 1 ? '#f59e0b'   // amber — slightly positive
         : tc <= -2 ? '#ef4444'  // red — cold shoe
         : '#64748b',            // grey — neutral
    tabId
  });
}

// ── Listen for messages from content scripts ─────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'COUNT_UPDATE' && sender.tab) {
    updateBadge(sender.tab.id, msg.trueCount);
  }
  sendResponse({ ok: true });
  return false;
});

// ── Keyboard command: toggle overlay ─────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
      }
    });
  }
});

// ── On install: show welcome notification ────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);
  }
});
