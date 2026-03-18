# EV Blackjack Counter

A Chrome/Edge browser extension for Hi-Lo card counting on live dealer blackjack tables from **Evolution Gaming** and **Pragmatic Play**.

## Features

- **Hi-Lo counting** — running count and true count (per-deck adjusted)
- **Player edge %** — real-time expected value based on true count
- **Betting spread** — 1–12× spread recommendations (Kelly Criterion)
- **EV per hand** — exact expected monetary value at current bankroll/bet
- **Basic strategy** — full 6/8-deck S17 DAS matrix
- **Illustrious 18 deviations** — count-based plays that override basic strategy
- **Fab 4 surrenders** — count-based late surrender plays
- **Insurance signal** — prompts when TC ≥ +3
- **Floating draggable overlay** — stays on screen while you play
- **Keyboard input** — enter cards without clicking
- **Shoe penetration bar** — visual indicator of decks remaining
- **TC distribution chart** — historical true count frequency in the popup
- **Settings** — configure decks, rules, bankroll, Kelly fraction

---

## Installation

1. Clone or download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the `ev-blackjack-counter/` folder
5. The extension icon appears in your toolbar

---

## Usage

### Overlay Controls

The overlay appears automatically on supported live casino sites.

| Button | Action |
|--------|--------|
| **Shoe** mode | Count every card as it appears (general counting) |
| **Dealer** mode | Next card entered becomes the dealer's upcard |
| **Player** mode | Cards entered build the player's hand |
| **↩ Undo** | Remove the last card entered |
| **New Hand** | Clear player/dealer for next round |
| **Reset** | Reset entire shoe (start of new shoe) |

### Keyboard Shortcuts

| Key | Card |
|-----|------|
| `2`–`9` | Face value cards |
| `T` or `0` | 10-value card (T, J, Q, K) |
| `A` | Ace |
| `Ctrl+Z` | Undo last card |
| `Ctrl+N` | New hand |
| `Ctrl+R` | Reset shoe |
| `Ctrl+`` ` | Toggle overlay visibility |
| `Ctrl+Shift+B` | Toggle overlay (global shortcut) |

### Workflow Per Hand

1. Press **New Hand** (`Ctrl+N`) at the start of each round
2. Enter the **dealer's upcard** first (switch to Dealer mode or use the button)
3. Enter your **player cards** (switch to Player mode)
4. The **strategy box** shows what action to take
5. Enter all other visible cards (other players, dealer's hole card after reveal)
6. Continue to next hand

---

## Countable Tables

### Evolution Gaming
| Table | Countable? | Notes |
|-------|-----------|-------|
| Classic Blackjack | **Yes** | 6–8 deck shoe, S17, DAS |
| Blackjack VIP | **Yes** | 8-deck shoe |
| Free Bet Blackjack | Partial | Modified payouts change EV |
| Infinite Blackjack | **No** | Continuous shuffle machine (CSM) |
| Lightning Blackjack | **No** | Random multipliers distort EV |

### Pragmatic Play
| Table | Countable? | Notes |
|-------|-----------|-------|
| Blackjack | **Yes** | 6–8 deck shoe, S17, DAS |
| VIP Blackjack | **Yes** | Higher limits, same rules |
| ONE Blackjack | **No** | Side bets dominate, CSM |

---

## Card Counting — Hi-Lo System

| Cards | Count |
|-------|-------|
| 2, 3, 4, 5, 6 | **+1** (low cards removed → favours player) |
| 7, 8, 9 | **0** (neutral) |
| 10, J, Q, K, A | **−1** (high cards removed → favours dealer) |

**True Count** = Running Count ÷ Decks Remaining

Each +1 true count point adds approximately **+0.5%** to player edge.

---

## Illustrious 18 Deviations

The 18 most valuable departures from basic strategy, ordered by EV impact:

| Hand | vs | Play | Index |
|------|----|------|-------|
| Insurance | A | Take | TC ≥ +3 |
| 16 | T | Stand | TC ≥ 0 |
| 15 | T | Stand | TC ≥ +4 |
| 10 | T | Double | TC ≥ +4 |
| 10 | A | Double | TC ≥ +4 |
| 12 | 3 | Stand | TC ≥ +2 |
| 12 | 2 | Stand | TC ≥ +3 |
| 11 | A | Double | TC ≥ +1 |
| 9 | 2 | Double | TC ≥ +1 |
| 9 | 7 | Double | TC ≥ +3 |
| ... | | | |

Full table viewable in the extension's **Deviations** tab.

---

## Betting Spread

| True Count | Bet Multiplier |
|------------|---------------|
| ≤ +1 | 1× (minimum) |
| +2 | 2× |
| +3 | 4× |
| +4 | 8× |
| +5 | 12× |

The extension also calculates a **Kelly Criterion** bet (configurable fraction — ¼ Kelly recommended for risk management).

---

## Settings

Configure via the extension popup → **Settings** tab:

- **Decks**: 1, 2, 4, 6, or 8
- **Rule Set**: S17/H17 + DAS combinations
- **Bankroll**: Your total session bankroll
- **Min/Max Bet**: Table limits
- **Kelly Fraction**: ¼ (conservative), ½ (moderate), Full (aggressive)
- **DAS / Surrender / H17**: Toggle individual rules

---

## Legal Notice

Card counting is a legal, skill-based technique. It is not cheating. Using counting software may violate a casino's Terms of Service, and casinos reserve the right to restrict your play. Use responsibly and in accordance with applicable laws and terms.
