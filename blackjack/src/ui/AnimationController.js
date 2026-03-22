/**
 * AnimationController — CSS animation sequencing.
 *
 * Keeps all animation timing in one place so the Renderer stays declarative.
 * UI layer.
 */

export class AnimationController {
  constructor() {
    this._queue = [];
    this._running = false;
  }

  /**
   * Create a card DOM element with staggered deal animation.
   * @param {import('../engine/Card.js').Card} card
   * @param {number} delayMs
   * @param {boolean} small - Use small card variant
   * @returns {HTMLElement}
   */
  static buildCardEl(card, delayMs = 0, small = false) {
    const el = document.createElement('div');
    el.className = `card${small ? ' small' : ''}${card.faceDown ? ' face-down' : ''}`;
    el.style.setProperty('--deal-delay', `${delayMs}ms`);

    const face = document.createElement('div');
    face.className = `card-face ${card.faceDown ? '' : card.colorClass}`;

    if (!card.faceDown) {
      const topCorner = document.createElement('div');
      topCorner.className = 'card-corner';
      topCorner.innerHTML = `<span class="card-corner-rank">${card.rank}</span><span class="card-corner-suit">${card.suit}</span>`;

      const center = document.createElement('div');
      center.className = 'card-center-suit';
      center.textContent = card.suit;

      const botCorner = document.createElement('div');
      botCorner.className = 'card-corner bottom-right';
      botCorner.innerHTML = `<span class="card-corner-rank">${card.rank}</span><span class="card-corner-suit">${card.suit}</span>`;

      face.append(topCorner, center, botCorner);
    }

    const back = document.createElement('div');
    back.className = 'card-back';

    el.append(face, back);
    return el;
  }

  /**
   * Flip a face-down card element to reveal it.
   * @param {HTMLElement} cardEl
   * @param {import('../engine/Card.js').Card} revealedCard
   * @returns {Promise}
   */
  static flipReveal(cardEl, revealedCard) {
    return new Promise(resolve => {
      cardEl.addEventListener('animationend', () => {
        // Update face content mid-flip
        cardEl.classList.remove('face-down');
        const face = cardEl.querySelector('.card-face');
        face.className = `card-face ${revealedCard.colorClass}`;

        const topCorner = document.createElement('div');
        topCorner.className = 'card-corner';
        topCorner.innerHTML = `<span class="card-corner-rank">${revealedCard.rank}</span><span class="card-corner-suit">${revealedCard.suit}</span>`;

        const center = document.createElement('div');
        center.className = 'card-center-suit';
        center.textContent = revealedCard.suit;

        const botCorner = document.createElement('div');
        botCorner.className = 'card-corner bottom-right';
        botCorner.innerHTML = `<span class="card-corner-rank">${revealedCard.rank}</span><span class="card-corner-suit">${revealedCard.suit}</span>`;

        face.append(topCorner, center, botCorner);
        resolve();
      }, { once: true });

      cardEl.classList.add('flip-reveal');
    });
  }

  /**
   * Apply bust shake to all cards in a container.
   * @param {HTMLElement} container
   */
  static bustShake(container) {
    container.querySelectorAll('.card').forEach(el => {
      el.classList.remove('bust-shake');
      void el.offsetWidth; // reflow
      el.classList.add('bust-shake');
    });
  }

  /**
   * Apply outcome glow to cards.
   * @param {HTMLElement} container
   * @param {string} outcome
   */
  static applyOutcomeGlow(container, outcome) {
    const cls = outcome === 'BLACKJACK' ? 'bj-glow' : outcome === 'WIN' ? 'win-glow' : null;
    if (!cls) return;
    container.querySelectorAll('.card').forEach(el => el.classList.add(cls));
  }

  /**
   * Wait for a given duration.
   * @param {number} ms
   * @returns {Promise}
   */
  static wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
