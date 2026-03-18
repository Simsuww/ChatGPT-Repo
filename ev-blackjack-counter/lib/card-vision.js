/**
 * Card Vision Module — tuned for Pragmatic Play Live Blackjack
 *
 * Pragmatic Play card characteristics (720p stream):
 *  • White/cream cards on a dark green felt background
 *  • Cards are roughly 80–130px wide, 110–185px tall at 720p
 *  • Rank character sits in top-left ~28% W × 30% H of card
 *  • Red suits (hearts/diamonds) have coloured rank text
 *  • Green background: R < 90, G 100–160, B < 90 — helps confirm boundaries
 *
 * Two detection methods:
 *  1. AUTO-SCAN  — Periodically grabs a video frame, finds white card
 *                  rectangles, extracts rank via pixel projection analysis.
 *  2. CLICK-READ — User clicks on a card in the video; extension reads
 *                  that region and identifies the rank.
 */

'use strict';

const CardVision = (() => {

  // ── Config (tuned for Pragmatic Play 720p stream) ────────────────────
  const CFG = {
    scanIntervalMs:   600,   // grab a frame every 600ms (PP deals ~2s per card)
    brightnessThresh: 200,   // PP cards are bright white/cream
    darkThresh:       90,    // ink threshold (PP uses slightly thicker fonts)
    minCardArea:      5000,  // PP cards ~80×110 = 8800px² min; raised to filter chip text
    maxCardArea:      60000, // large cards at high zoom
    minAspect:        1.25,  // cards are clearly portrait; chips are circular (~1.0) — filter them
    maxAspect:        2.0,   // allow for slight angle
    minFillRatio:     0.72,  // fraction of bounding box that must be white; circle=0.785 < rect≈1.0
                             // threshold at 0.72 still rejects circular chips with noisy BFS
    rankFracW:        0.28,  // PP rank corner occupies ~28% of card width
    rankFracH:        0.30,  // and ~30% of card height
    dedupeMs:         2000,  // PP deals slower — 2s dedup window
    // Background colour check: PP felt is dark green — used to validate card edges
    bgMaxR: 110, bgMaxG: 170, bgMaxB: 110,  // pixels outside this range = not PP felt
  };

  // ── State ────────────────────────────────────────────────────────────
  let scanTimer       = null;
  let onCardCallback  = null;
  let lastCards       = [];     // {rank, ts} for deduplication
  let canvas          = null;
  let ctx             = null;
  let clickModeActive = false;

  // ── Public API ───────────────────────────────────────────────────────

  function init(onCard) {
    onCardCallback = onCard;
    canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    document.body?.appendChild(canvas);
  }

  function startAutoScan() {
    if (scanTimer) return;
    scanTimer = setInterval(scanFrame, CFG.scanIntervalMs);
    console.log('[CV] Auto-scan started');
  }

  function stopAutoScan() {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  function enableClickMode() {
    clickModeActive = true;
    document.addEventListener('click', onPageClick, true);
    console.log('[CV] Click-to-read mode enabled — click on any card');
  }

  function disableClickMode() {
    clickModeActive = false;
    document.removeEventListener('click', onPageClick, true);
  }

  // ── Frame scanning ───────────────────────────────────────────────────

  function scanFrame() {
    const video = findVideoElement();
    if (!video) return;

    try {
      canvas.width  = video.videoWidth  || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      if (canvas.width < 50 || canvas.height < 50) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const regions   = findCardRegions(imageData);

      for (const region of regions) {
        const rank = identifyRank(imageData, region);
        if (rank) emitCard(rank, 'video-scan');
      }
    } catch (e) {
      // Cross-origin video will throw — silently skip
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────

  function onPageClick(e) {
    // Find video under or near cursor
    const video = findVideoElement();
    if (!video) return;

    try {
      const vRect = video.getBoundingClientRect();
      const scaleX = (video.videoWidth  || video.clientWidth)  / vRect.width;
      const scaleY = (video.videoHeight || video.clientHeight) / vRect.height;

      // Map click coordinates to video pixel space
      const vx = (e.clientX - vRect.left)  * scaleX;
      const vy = (e.clientY - vRect.top)   * scaleY;

      if (vx < 0 || vy < 0 || vx > canvas.width || vy > canvas.height) return;

      canvas.width  = video.videoWidth  || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Find card region closest to click point
      const regions = findCardRegions(imageData);
      let best = null, bestDist = Infinity;
      for (const r of regions) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const d  = Math.hypot(cx - vx, cy - vy);
        if (d < bestDist) { bestDist = d; best = r; }
      }

      if (best) {
        const rank = identifyRank(imageData, best);
        if (rank) {
          emitCard(rank, 'click');
          e.stopPropagation();
          e.preventDefault();
          flashClickIndicator(e.clientX, e.clientY, rank);
        }
      }
    } catch (_) {}
  }

  // ── Card region finder ────────────────────────────────────────────────

  /**
   * Returns an array of {x, y, w, h} bounding boxes for detected cards.
   * Algorithm: raster scan looking for bright rectangular blobs.
   */
  function findCardRegions(imageData) {
    const { width, height, data } = imageData;
    const visited = new Uint8Array(width * height);
    const regions = [];

    // Stride for performance (don't check every pixel)
    const stride = 4;

    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const i = (y * width + x) * 4;
        if (visited[y * width + x]) continue;

        const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
        if (brightness < CFG.brightnessThresh) continue;

        // BFS flood-fill to find extent of bright region
        const region = floodFill(imageData, x, y, visited, stride);
        if (!region) continue;

        const area   = region.w * region.h;
        const aspect = region.h / region.w;

        if (area   < CFG.minCardArea  || area   > CFG.maxCardArea)  continue;
        if (aspect < CFG.minAspect    || aspect > CFG.maxAspect)    continue;

        // Fill-ratio check: cards are solid rectangles; chips/circles have lower fill.
        // count is stride-sampled pixels; compare to stride-grid over the bounding box.
        const stridedW  = Math.ceil(region.w / stride) + 1;
        const stridedH  = Math.ceil(region.h / stride) + 1;
        const fillRatio = region.count / (stridedW * stridedH);
        if (fillRatio < CFG.minFillRatio) continue;

        // Green felt surround: pixels just outside the bounding box should be felt-coloured.
        // This rejects bright UI elements, bet-spot circles, chip highlights, etc.
        if (!hasFeltSurround(imageData, region)) continue;

        regions.push(region);
      }
    }

    return regions;
  }

  /**
   * Sample pixels in a narrow strip around the outside of a bounding box.
   * Returns true if ≥30% of sampled pixels match the Pragmatic Play green felt.
   */
  function hasFeltSurround(imageData, region) {
    const { width, height, data } = imageData;
    const margin = 10;
    const step   = 6;
    const x1 = Math.max(0, region.x - margin);
    const y1 = Math.max(0, region.y - margin);
    const x2 = Math.min(width  - 1, region.x + region.w + margin);
    const y2 = Math.min(height - 1, region.y + region.h + margin);

    let green = 0, total = 0;

    function sample(sx, sy) {
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
      // Skip pixels that are inside the card region
      if (sx >= region.x && sx <= region.x + region.w &&
          sy >= region.y && sy <= region.y + region.h) return;
      const i = (sy * width + sx) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      // Dark green felt: green channel dominant, overall dark
      if (g > r + 10 && g > b + 10 && g > 60 && g < 185 && r < 130 && b < 130) green++;
      total++;
    }

    for (let x = x1; x <= x2; x += step) { sample(x, y1); sample(x, y2); }
    for (let y = y1; y <= y2; y += step) { sample(x1, y); sample(x2, y); }

    return total > 0 && (green / total) >= 0.30;
  }

  function floodFill(imageData, startX, startY, visited, stride) {
    const { width, height, data } = imageData;
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    const queue = [[startX, startY]];
    let count = 0;

    while (queue.length > 0 && count < 5000) {
      const [x, y] = queue.pop();
      const idx = y * width + x;
      if (visited[idx]) continue;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      const i = idx * 4;
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
      if (brightness < CFG.brightnessThresh - 20) continue;

      visited[idx] = 1;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x + stride < width)  queue.push([x + stride, y]);
      if (x - stride >= 0)     queue.push([x - stride, y]);
      if (y + stride < height) queue.push([x, y + stride]);
      if (y - stride >= 0)     queue.push([x, y - stride]);
    }

    if (count < 10) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count };
  }

  // ── Rank identification ───────────────────────────────────────────────

  /**
   * Extract the rank from the top-left corner of a card region.
   *
   * Strategy:
   *  1. Extract rank corner pixels.
   *  2. Compute horizontal and vertical projections (dark pixel density per row/col).
   *  3. Derive features: total dark ratio, is-wide (for '10'), vertical stripe count.
   *  4. Map features to rank category.
   *
   * This is approximate. For Hi-Lo we only need 3 categories.
   */
  function identifyRank(imageData, region) {
    const { width, data } = imageData;
    const rw = Math.max(1, Math.floor(region.w * CFG.rankFracW));
    const rh = Math.max(1, Math.floor(region.h * CFG.rankFracH));
    const rx = region.x;
    const ry = region.y;

    // Extract dark pixel map for rank corner
    const darkMap = [];
    let totalDark = 0;

    for (let y = ry; y < ry + rh; y++) {
      const row = [];
      for (let x = rx; x < rx + rw; x++) {
        const i   = (y * width + x) * 4;
        const lum = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        const dark = lum < CFG.darkThresh ? 1 : 0;
        row.push(dark);
        totalDark += dark;
      }
      darkMap.push(row);
    }

    const totalPixels = rw * rh;
    const darkRatio   = totalDark / totalPixels;

    // Too few dark pixels → likely blank / card back
    if (darkRatio < 0.02) return null;

    // Horizontal projection: dark pixels per column (normalised)
    const colProj = new Array(rw).fill(0);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        colProj[x] += darkMap[y][x];
      }
    }
    const colMax = Math.max(...colProj) || 1;
    const normCol = colProj.map(v => v / colMax);

    // Count "stripes" — contiguous dark columns (detect '10' vs single char)
    let stripes = 0, inStripe = false;
    for (const v of normCol) {
      if (v > 0.3 && !inStripe) { stripes++; inStripe = true; }
      if (v < 0.1)               inStripe = false;
    }

    // Vertical projection
    const rowProj = darkMap.map(row => row.reduce((a, b) => a + b, 0));
    const rowMax  = Math.max(...rowProj) || 1;
    const normRow = rowProj.map(v => v / rowMax);

    // Feature: symmetry — does darkMap look symmetric vertically (like 'A', '0', '8')
    const topHalf = normRow.slice(0, Math.floor(rh / 2));
    const botHalf = normRow.slice(Math.ceil(rh / 2)).reverse();
    const symScore = topHalf.reduce((sum, v, i) => sum + Math.abs(v - (botHalf[i] ?? 0)), 0) / topHalf.length;

    // ── Rule-based classifier ──────────────────────────────────────────
    // For Hi-Lo we must distinguish:
    //   LOW  2,3,4,5,6  → +1
    //   MID  7,8,9      → 0
    //   HIGH T,J,Q,K,A  → -1

    // '10' is distinctive: two vertical stripes, wider
    if (stripes >= 2 && rw > 10) return 'T';

    // Highly symmetric with mid horizontal bar → likely '8' or 'A'
    // 'A' has a diagonal + crossbar; '8' is two loops
    // Rough split: 'A' has more top-heavy weight
    if (symScore < 0.25 && darkRatio > 0.15) {
      // Could be 8 or 0 → both are HIGH/MID respectively
      // Lean on overall dark ratio:
      return darkRatio > 0.25 ? '8' : 'A';
    }

    // 'J', 'Q', 'K' tend to have more complex patterns → higher dark ratio
    if (darkRatio > 0.20 && stripes === 1) return 'T'; // face card

    // Numbers 2-9: use dark ratio ranges
    // Lower ratio = simpler numeral (1,2,7), higher = complex (3,4,5,6,8,9)
    if (darkRatio < 0.07) return 'A';   // Ace is very open
    if (darkRatio < 0.11) return '7';
    if (darkRatio < 0.14) return '2';
    if (darkRatio < 0.17) return '3';
    if (darkRatio < 0.19) return '6';
    if (darkRatio < 0.22) return '5';
    if (darkRatio < 0.25) return '4';
    return '9';
  }

  // ── Card emit with deduplication ──────────────────────────────────────

  function emitCard(rank, source) {
    const now = Date.now();
    // Remove old entries
    lastCards = lastCards.filter(c => now - c.ts < CFG.dedupeMs);

    // Check if same rank was recently emitted
    if (lastCards.some(c => c.rank === rank)) return;

    lastCards.push({ rank, ts: now });
    if (onCardCallback) onCardCallback(rank, source);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  // Pragmatic Play known iframe src patterns
  const PP_PATTERNS = [
    'pragmaticplaylive', 'pragmaticplay', 'ppgames',
    'pragmatic-play', 'viplive', 'live.pragmatic'
  ];

  function findVideoElement() {
    // 1. Search inside Pragmatic Play iframes first (same-origin only)
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const src = (iframe.src || '').toLowerCase();
        const isPP = PP_PATTERNS.some(p => src.includes(p));
        const doc  = iframe.contentDocument;
        if (!doc) continue;
        let best = null, bestArea = 0;
        for (const v of doc.querySelectorAll('video')) {
          if (v.readyState < 2) continue;
          const area = v.videoWidth * v.videoHeight;
          if (area > bestArea) { best = v; bestArea = area; }
        }
        // Prefer PP iframe video; also accept any iframe with a large video
        if (best && (isPP || bestArea > 100000)) return best;
      } catch (_) { /* cross-origin — skip */ }
    }

    // 2. Fallback: largest video in main document
    let best = null, bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      if (v.readyState < 2) continue;
      const area = v.videoWidth * v.videoHeight;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }

  function flashClickIndicator(cx, cy, rank) {
    const el = document.createElement('div');
    el.style.cssText = `
      all:initial;position:fixed;z-index:2147483647;pointer-events:none;
      left:${cx - 22}px;top:${cy - 22}px;width:44px;height:44px;
      border-radius:50%;background:rgba(59,130,246,0.3);
      border:2px solid #3b82f6;display:flex;align-items:center;justify-content:center;
      font-family:monospace;font-size:16px;font-weight:900;color:white;
      animation:evBjPulse 0.6s ease-out forwards;
    `;
    el.textContent = rank;

    // Add keyframe animation via style tag
    if (!document.getElementById('ev-bj-anim')) {
      const s = document.createElement('style');
      s.id = 'ev-bj-anim';
      s.textContent = '@keyframes evBjPulse{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}';
      document.head?.appendChild(s);
    }

    document.body?.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  return { init, startAutoScan, stopAutoScan, enableClickMode, disableClickMode };
})();

if (typeof module !== 'undefined') module.exports = CardVision;
