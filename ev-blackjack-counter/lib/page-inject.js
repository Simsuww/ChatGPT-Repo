/**
 * Page-context injected script.
 * Runs inside the page (not content-script sandbox) so it can patch
 * WebSocket and read live game events.
 *
 * Communicates back to the content script via window.postMessage.
 *
 * Improvements over v1:
 *  - Handles binary WebSocket frames (ArrayBuffer / Blob)
 *  - Deduplication: same rank emitted at most once per 60 ms window
 *  - Pragmatic Play {rank:N, suit:N} and cardId (0-51) patterns
 *  - Nested JSON-string extraction (PP sometimes wraps JSON inside JSON)
 *  - Intercepts message handlers added to pre-existing WS instances
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

    // Numeric ranks (Pragmatic Play sends 1-13)
    if (s === '1' || s === '14') return 'A';
    if (s === '11') return 'T';   // Jack
    if (s === '12') return 'T';   // Queen
    if (s === '13') return 'T';   // King
    if (s === '10' || s === 'T' || s === '0') return 'T';
    if (['J', 'JACK'].includes(s))   return 'T';
    if (['Q', 'QUEEN'].includes(s))  return 'T';
    if (['K', 'KING'].includes(s))   return 'T';
    if (['A', 'ACE'].includes(s))    return 'A';
    if (['2','3','4','5','6','7','8','9'].includes(s)) return s;

    // Compact suit notation: "Ah", "2s", "Tc", "Kd"
    if (s.length === 2 && ['H','D','C','S'].includes(s[1])) {
      return normaliseRank(s[0]);
    }
    // "10h", "10s"
    if (s.length === 3 && ['H','D','C','S'].includes(s[2])) {
      return normaliseRank(s.slice(0, 2));
    }
    return null;
  }

  // Decode integer card ID (0-51) → rank
  // Pragmatic Play encoding: rank = floor(id/4)+1 (1-13), suit = id%4
  function decodeCardId(id) {
    const n = parseInt(id, 10);
    if (isNaN(n) || n < 0 || n > 55) return null;
    return normaliseRank(String(Math.floor(n / 4) + 1));
  }

  // ── Deduplication ─────────────────────────────────────────────────────
  // Prevent emitting the same rank twice within a short window.
  // One WebSocket message can produce duplicate parses from JSON fragments.
  const DEDUP_MS = 60;
  const recentEmits = []; // [{card, t}]

  function emit(card, source) {
    if (!card) return;
    const now = Date.now();
    // Expire old entries
    while (recentEmits.length && now - recentEmits[0].t > DEDUP_MS) recentEmits.shift();
    // Skip if already emitted this rank in the window
    if (recentEmits.some(e => e.card === card)) return;
    recentEmits.push({ card, t: now });
    window.postMessage({ __evBj: true, type: 'CARD_DETECTED', card, source: source || 'websocket' }, '*');
  }

  // ── Deep search for card data in a parsed JSON object ─────────────────
  const CARD_KEYS = [
    'rank', 'cardrank', 'cardvalue', 'value', 'rank_id', 'rankid',
    'card', 'cardid', 'card_id', 'rankvalue', 'facevalue', 'face'
  ];

  // Keys that never contain card data — skip them to avoid false positives
  // and unnecessary deep recursion.
  const SKIP_KEYS = new Set([
    'timestamp', 'time', 'created', 'updated', 'date',
    'sessionid', 'session_id', 'userid', 'user_id', 'playerid', 'player_id',
    'tableid', 'table_id', 'gameid', 'game_id', 'roundid', 'round_id',
    'token', 'auth', 'jwt', 'signature', 'hash', 'checksum',
    'url', 'uri', 'href', 'src', 'path', 'endpoint',
    'version', 'build', 'revision',
    'width', 'height', 'x', 'y', 'z', 'color', 'colour',
    'balance', 'bet', 'wager', 'payout', 'win', 'loss',
    'currency', 'amount', 'total',
    'name', 'title', 'label', 'description', 'message', 'text',
    'status', 'state', 'phase', 'stage', 'step',
    'type', 'event', 'action', 'cmd', 'command',
    'error', 'code', 'reason'
  ]);

  // Try to identify a single object as a card and emit it.
  // Returns true if a card was found in this object.
  function tryEmitCard(obj) {
    // Pragmatic Play primary pattern: {rank: N, suit: N}
    if (typeof obj.rank === 'number' && obj.suit !== undefined) {
      const norm = normaliseRank(String(obj.rank));
      if (norm) { emit(norm); return true; }
    }

    // Integer card ID
    const idVal = obj.cardId ?? obj.card_id ?? obj.cardID;
    if (typeof idVal === 'number') {
      const norm = decodeCardId(idVal);
      if (norm) { emit(norm); return true; }
    }

    // Rank-like string/number keys
    for (const key of CARD_KEYS) {
      const val = obj[key] ?? obj[key.toLowerCase()];
      if (val !== undefined) {
        const norm = normaliseRank(val);
        if (norm) { emit(norm); return true; }
      }
    }

    return false;
  }

  // Fully recursive search — visits every nested object/array so that
  // cards belonging to ALL players at the table are counted, regardless
  // of what key their hand is stored under (seats, players, hands, etc.)
  function searchForCards(obj, depth) {
    if (depth > 10 || obj === null || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(item => searchForCards(item, depth + 1));
      return;
    }

    // If this object looks like a card, emit it and stop descending into it.
    if (tryEmitCard(obj)) return;

    // Otherwise recurse into every value that is an object or array,
    // skipping keys that are known to be irrelevant metadata.
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || typeof val !== 'object') continue;
      if (SKIP_KEYS.has(key.toLowerCase())) continue;
      searchForCards(val, depth + 1);
    }
  }

  // Recursively look for string values that contain embedded JSON
  function extractNestedJSON(obj, depth) {
    if (!obj || depth > 4) return;
    if (typeof obj === 'string' && obj.length > 10) {
      const trimmed = obj.trim();
      if (trimmed[0] === '{' || trimmed[0] === '[') {
        try { searchForCards(JSON.parse(trimmed), 0); } catch (_) {}
      }
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(v => extractNestedJSON(v, depth + 1));
    }
  }

  function tryParseMessage(data) {
    if (typeof data !== 'string' || data.length < 5) return;

    // Full JSON parse
    try {
      const json = JSON.parse(data);
      searchForCards(json, 0);
      extractNestedJSON(json, 0);
      return;
    } catch (_) {}

    // Extract JSON fragments (handles concatenated or partially-framed messages)
    const frags = data.match(/\{[\s\S]{3,}\}/g) || [];
    for (const frag of frags) {
      try { searchForCards(JSON.parse(frag), 0); } catch (_) {}
    }

    // Compact card notation fallback: "2h", "Ah", "10s", "Kd"
    const cardRe = /\b(10|[2-9AKQJT])[hdcs]\b/gi;
    let m;
    while ((m = cardRe.exec(data)) !== null) {
      const norm = normaliseRank(m[1]);
      if (norm) emit(norm);
    }
  }

  // Decode binary WebSocket frames to text
  async function binaryToText(data) {
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
    return null;
  }

  // ── Patch WebSocket ────────────────────────────────────────────────────
  const OrigWS = window.WebSocket;
  // Keep a ref to the real addEventListener so our own listener bypasses
  // the prototype patch we apply below for pre-existing WS instances.
  const _origAddEL = EventTarget.prototype.addEventListener;

  function attachWSListener(ws) {
    _origAddEL.call(ws, 'message', async (evt) => {
      const { data } = evt;
      if (typeof data === 'string') {
        tryParseMessage(data);
      } else {
        const text = await binaryToText(data).catch(() => null);
        if (text) tryParseMessage(text);
      }
    });
  }

  function PatchedWS(url, protocols) {
    const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    window.postMessage({ __evBj: true, type: 'WS_CONNECTED', url }, '*');
    attachWSListener(ws);
    return ws;
  }
  PatchedWS.prototype = OrigWS.prototype;
  Object.defineProperty(PatchedWS, 'CONNECTING', { value: 0 });
  Object.defineProperty(PatchedWS, 'OPEN',       { value: 1 });
  Object.defineProperty(PatchedWS, 'CLOSING',    { value: 2 });
  Object.defineProperty(PatchedWS, 'CLOSED',     { value: 3 });
  window.WebSocket = PatchedWS;

  // ── Intercept message listeners on pre-existing WS instances ──────────
  // If the game script opened a WebSocket before our patch ran, we hook its
  // addEventListener so that when the game attaches its own 'message' handler
  // we piggyback a parser onto the same socket.
  const _patchedSockets = new WeakSet();
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'message' && this instanceof OrigWS && !_patchedSockets.has(this)) {
      _patchedSockets.add(this);
      attachWSListener(this);
      window.postMessage({ __evBj: true, type: 'WS_CONNECTED', url: this.url }, '*');
    }
    return _origAddEL.call(this, type, listener, options);
  };

  // ── Patch fetch (some casinos use long-poll) ───────────────────────────
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch(...args);
    try {
      const text = await res.clone().text();
      tryParseMessage(text);
    } catch (_) {}
    return res;
  };

  // ── Patch XHR ─────────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      try { tryParseMessage(this.responseText); } catch (_) {}
    });
    return origOpen.apply(this, args);
  };

  console.log('[EV BJ] Page-inject v2 active — intercepting WebSocket/fetch/XHR');
})();
