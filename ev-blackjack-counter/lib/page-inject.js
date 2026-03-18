/**
 * Page-context injected script.
 * Runs inside the page (not content-script sandbox) so it can patch
 * WebSocket and read live game events.
 *
 * Communicates back to the content script via window.postMessage.
 */
(function () {
  'use strict';

  if (window.__evBjInjected) return;
  window.__evBjInjected = true;

  // ── Rank normalisation ────────────────────────────────────────────────
  // Map any casino's card notation to our standard: 2-9, T, A
  function normaliseRank(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).toUpperCase().trim();

    // Numeric ranks
    if (s === '1' || s === '14') return 'A';  // ace-high numeric
    if (s === '11') return 'J';
    if (s === '12') return 'Q';
    if (s === '13') return 'K';
    if (s === '10' || s === 'T' || s === '0') return 'T';
    if (['J', 'JACK'].includes(s))   return 'T';
    if (['Q', 'QUEEN'].includes(s))  return 'T';
    if (['K', 'KING'].includes(s))   return 'T';
    if (['A', 'ACE', '1'].includes(s)) return 'A';
    if (['2','3','4','5','6','7','8','9'].includes(s)) return s;

    // Compact notation like "Ah", "2s", "Tc", "Kd"
    if (s.length === 2 && ['H','D','C','S'].includes(s[1])) {
      return normaliseRank(s[0]);
    }
    // e.g. "10h"
    if (s.length === 3 && ['H','D','C','S'].includes(s[2])) {
      return normaliseRank(s.slice(0, 2));
    }
    return null;
  }

  function emit(card) {
    if (!card) return;
    window.postMessage({ __evBj: true, type: 'CARD_DETECTED', card, source: 'websocket' }, '*');
  }

  // ── Deep search for card data in a parsed JSON object ─────────────────
  const CARD_KEYS   = ['rank', 'cardrank', 'cardvalue', 'value', 'rank_id', 'rankid', 'card', 'cardid'];
  const PARENT_KEYS = ['card', 'cards', 'hand', 'dealt', 'newcard', 'playercard',
                       'dealercard', 'initialcard', 'communitycard', 'dealtcard'];

  function searchForCards(obj, depth) {
    if (depth > 8 || obj === null || typeof obj !== 'object') return;

    // Array of card objects
    if (Array.isArray(obj)) {
      obj.forEach(item => searchForCards(item, depth + 1));
      return;
    }

    // Try to read rank directly from this object
    for (const key of CARD_KEYS) {
      const val = obj[key.toLowerCase()] ?? obj[key];
      if (val !== undefined) {
        const norm = normaliseRank(val);
        if (norm) { emit(norm); return; }
      }
    }

    // Recurse into known parent keys
    for (const key of Object.keys(obj)) {
      const lk = key.toLowerCase();
      if (PARENT_KEYS.some(pk => lk.includes(pk))) {
        searchForCards(obj[key], depth + 1);
      }
    }
  }

  function tryParseMessage(data) {
    if (typeof data !== 'string') return;

    // Try full JSON parse
    try {
      const json = JSON.parse(data);
      searchForCards(json, 0);
      return;
    } catch (_) {}

    // Try extracting JSON fragments
    const matches = data.match(/\{[^{}]{5,}\}/g) || [];
    for (const frag of matches) {
      try {
        searchForCards(JSON.parse(frag), 0);
      } catch (_) {}
    }

    // Try compact card notation patterns: "2h", "Ah", "10s", "Kd" etc.
    const cardPattern = /\b(10|[2-9AKQJT])[hdcs]\b/gi;
    let m;
    while ((m = cardPattern.exec(data)) !== null) {
      const norm = normaliseRank(m[1]);
      if (norm) emit(norm);
    }
  }

  // ── Patch WebSocket ────────────────────────────────────────────────────
  const OrigWS = window.WebSocket;
  function PatchedWS(url, protocols) {
    const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

    // Log URL so we know which WS endpoints the game uses
    window.postMessage({ __evBj: true, type: 'WS_CONNECTED', url }, '*');

    ws.addEventListener('message', (evt) => {
      tryParseMessage(evt.data);
    });

    return ws;
  }
  PatchedWS.prototype = OrigWS.prototype;
  Object.defineProperty(PatchedWS, 'CONNECTING', { value: 0 });
  Object.defineProperty(PatchedWS, 'OPEN',       { value: 1 });
  Object.defineProperty(PatchedWS, 'CLOSING',    { value: 2 });
  Object.defineProperty(PatchedWS, 'CLOSED',     { value: 3 });
  window.WebSocket = PatchedWS;

  // ── Patch fetch (some casinos use long-poll) ───────────────────────────
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch(...args);
    try {
      const clone = res.clone();
      const text  = await clone.text();
      tryParseMessage(text);
    } catch (_) {}
    return res;
  };

  // ── Patch XHR ────────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      try { tryParseMessage(this.responseText); } catch (_) {}
    });
    return origOpen.apply(this, args);
  };

  console.log('[EV BJ] Page-inject active — intercepting WebSocket/fetch/XHR');
})();
