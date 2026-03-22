/**
 * Statistics — per-player session tracker, persisted to localStorage.
 *
 * Tracks: hands, wins, losses, pushes, BJs, surrenders, streaks, ROI.
 * Stats layer.
 */

import { Outcome } from '../engine/Rules.js';

const STORAGE_KEY = 'infiniteBJ_stats';

export class Statistics {
  /**
   * @param {string} playerId - Used as localStorage key suffix
   */
  constructor(playerId) {
    this.playerId = playerId;
    this._data = this._load();
  }

  _defaultData() {
    return {
      hands:       0,
      wins:        0,
      losses:      0,
      pushes:      0,
      blackjacks:  0,
      surrenders:  0,
      totalWagered:  0,
      totalProfit:   0,
      currentStreak: 0,
      bestWinStreak: 0,
      worstLossStreak: 0,
      biggestWin:  0,
      biggestLoss: 0,
    };
  }

  _load() {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}_${this.playerId}`);
      return raw ? { ...this._defaultData(), ...JSON.parse(raw) } : this._defaultData();
    } catch {
      return this._defaultData();
    }
  }

  _save() {
    try {
      localStorage.setItem(`${STORAGE_KEY}_${this.playerId}`, JSON.stringify(this._data));
    } catch { /* storage quota — silently ignore */ }
  }

  /**
   * Record the result of a completed hand.
   * @param {string} outcome - One of Outcome.*
   * @param {number} bet     - Amount wagered
   * @param {number} profit  - Net profit (positive = won, negative = lost)
   */
  record(outcome, bet, profit) {
    const d = this._data;
    d.hands++;
    d.totalWagered += bet;
    d.totalProfit  += profit;

    switch (outcome) {
      case Outcome.WIN:
      case Outcome.BLACKJACK:
        d.wins++;
        if (outcome === Outcome.BLACKJACK) d.blackjacks++;
        d.currentStreak = Math.max(1, d.currentStreak + 1);
        d.bestWinStreak = Math.max(d.bestWinStreak, d.currentStreak);
        if (profit > d.biggestWin) d.biggestWin = profit;
        break;

      case Outcome.LOSE:
      case Outcome.BUST:
        d.losses++;
        d.currentStreak = Math.min(-1, d.currentStreak - 1);
        d.worstLossStreak = Math.min(d.worstLossStreak, d.currentStreak);
        if (-profit > d.biggestLoss) d.biggestLoss = -profit;
        break;

      case Outcome.PUSH:
        d.pushes++;
        d.currentStreak = 0;
        break;

      case Outcome.SURRENDER:
        d.surrenders++;
        d.losses++;
        d.currentStreak = Math.min(-1, d.currentStreak - 1);
        break;
    }

    this._save();
  }

  /** ROI as a percentage. */
  get roi() {
    if (this._data.totalWagered === 0) return 0;
    return (this._data.totalProfit / this._data.totalWagered) * 100;
  }

  /** Win rate as a percentage (excludes pushes). */
  get winRate() {
    const decided = this._data.wins + this._data.losses;
    if (decided === 0) return 0;
    return (this._data.wins / decided) * 100;
  }

  /** Formatted streak: +4 or -2 or 0 */
  get streakLabel() {
    const s = this._data.currentStreak;
    return s > 0 ? `+${s}` : String(s);
  }

  get data() { return { ...this._data }; }

  reset() {
    this._data = this._defaultData();
    this._save();
  }

  /** Summary string for HUD. */
  summary() {
    const d = this._data;
    return `Hands: ${d.hands}  W/L/P: ${d.wins}/${d.losses}/${d.pushes}  BJ: ${d.blackjacks}  Streak: ${this.streakLabel}  ROI: ${this.roi.toFixed(1)}%`;
  }
}
