/**
 * Run with Node.js to generate PNG icons from embedded SVG.
 * Requires: npm install sharp
 *
 * Usage: node generate-icons.js
 */
const fs = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#0f172a"/>
  <rect x="8" y="8" width="112" height="112" rx="18" fill="#1e3a5f" stroke="#3b82f6" stroke-width="3"/>
  <!-- Playing card shape -->
  <rect x="30" y="24" width="44" height="60" rx="6" fill="white"/>
  <rect x="54" y="44" width="44" height="60" rx="6" fill="#dc2626"/>
  <!-- EV text -->
  <text x="52" y="110" font-family="monospace" font-size="22" font-weight="900" fill="#fbbf24" text-anchor="middle">EV</text>
</svg>`;

try {
  const sharp = require('sharp');
  const buffer = Buffer.from(SVG);
  [16, 48, 128].forEach(size => {
    sharp(buffer).resize(size, size).png().toFile(
      path.join(__dirname, `icon${size}.png`),
      (err) => { if (err) console.error(err); else console.log(`icon${size}.png created`); }
    );
  });
} catch (e) {
  // Fallback: write SVG files named as PNG (browsers can sometimes handle this)
  console.log('sharp not available — writing SVG placeholder files');
  [16, 48, 128].forEach(size => {
    const svg = SVG.replace('viewBox="0 0 128 128"', `viewBox="0 0 128 128" width="${size}" height="${size}"`);
    fs.writeFileSync(path.join(__dirname, `icon${size}.png`), svg);
  });
  console.log('SVG placeholder icons written as .png files');
}
