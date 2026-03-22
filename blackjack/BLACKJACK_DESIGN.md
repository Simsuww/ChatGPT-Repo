# Infinite Blackjack — Architecture & Design Document

## What "Infinite Blackjack" Actually Means

Pioneered by **Evolution Gaming**. The defining mechanic:

> All players at the table **share the same two starting cards** (the "Seat Hand").
> After the deal, each player **independently decides** Hit / Stand / Double / Split / Surrender.
> Players diverge into their own private hand from that point.
> There is **no seat limit** — infinite players can join the same round.

This is fundamentally different from standard multi-seat blackjack where each seat gets different cards.

### Round Flow

```
1. BETTING     — All players place bets (unlimited players welcome)
2. DEAL        — Two cards dealt to the shared Seat Hand, dealer gets up+hole card
3. INSURANCE   — Offered to all players simultaneously if dealer shows Ace
4. DECISIONS   — Each player makes their OWN choices independently:
                   • Stand  → finalise with the seat cards as-is
                   • Hit    → get a private card, keep making decisions
                   • Double → get one private card, hand finalised
                   • Split  → seat pair splits into two private hands per player
                   • Surrender → forfeit half bet, exit round
5. DEALER PLAY — Hole card revealed, dealer plays to H17
6. PAYOUT      — Each player's diverged hand compared independently to dealer
```

The "seat hand" is shared only for steps 1-3. From step 4 onward, each player
owns their own hand tree.

---

## Project Structure

```
blackjack/
├── BLACKJACK_DESIGN.md           ← This document
├── index.html                    ← Game shell
│
├── src/
│   ├── engine/                   ← Pure logic, zero DOM, fully testable
│   │   ├── Card.js               ← Immutable card (rank, suit, faceDown)
│   │   ├── Shoe.js               ← Standard 6-deck shoe with shuffle
│   │   ├── Hand.js               ← Hand evaluation (soft/hard, bust, BJ)
│   │   └── Rules.js              ← All rule constants + Phase/Outcome/Action enums
│   │
│   ├── table/                    ← Shared table state (one per game)
│   │   ├── SeatHand.js           ← The shared opening hand all players see
│   │   ├── DealerHand.js         ← Dealer's hand + H17 play-out logic
│   │   └── RoundManager.js       ← Orchestrates the round state machine,
│   │                                coordinates SeatHand + all PlayerSessions
│   │
│   ├── player/                   ← Per-player state (N instances per round)
│   │   ├── PlayerSession.js      ← One player at the table: bankroll, bet,
│   │   │                            their diverged hand tree, outcome
│   │   └── PlayerHand.js         ← A player's private hand after diverging
│   │                                from seat. Wraps Hand, tracks split tree.
│   │
│   ├── stats/
│   │   └── Statistics.js         ← Per-player session stats (localStorage)
│   │
│   ├── strategy/
│   │   └── BasicStrategy.js      ← Basic strategy table → hint per decision
│   │
│   └── ui/
│       ├── TableRenderer.js      ← Renders shared table state (seat, dealer)
│       ├── PlayerRenderer.js     ← Renders per-player panel + action buttons
│       ├── AnimationController.js← CSS animation sequencing
│       └── UIController.js       ← Input bindings, player management UI
│
└── styles/
    ├── main.css                  ← Table layout, felt, dealer, HUD
    ├── cards.css                 ← Card face rendering + animations
    └── player.css                ← Per-player panels, chips, outcomes
```

---

## Layer Responsibilities

### Engine (`src/engine/`) — Pure Logic

| Module | Responsibility |
|--------|---------------|
| `Card.js` | Immutable card value object. Rank, suit, faceDown flag. |
| `Shoe.js` | 6-deck shoe, Fisher-Yates shuffle, cut card at ~75% pen. |
| `Hand.js` | Card collection + value calculator (soft/hard, bust, BJ detection). |
| `Rules.js` | All constants (H17, 3:2, DAS, surrender) + enums (Phase, Outcome, Action). |

### Table (`src/table/`) — Shared Round State

| Module | Responsibility |
|--------|---------------|
| `SeatHand.js` | Wraps `Hand`. Holds the two cards ALL players start from. Read-only after deal. |
| `DealerHand.js` | Dealer hand + `mustHit` logic (H17). Exposes `upCard`, `holeCard`, `revealHoleCard()`. |
| `RoundManager.js` | **The state machine.** Owns SeatHand, DealerHand, array of PlayerSessions. Drives phase transitions. Emits events for UI. |

**Key insight:** `RoundManager` is the single source of truth. The UI only reads from it and calls its action methods.

### Player (`src/player/`) — Per-Player State

| Module | Responsibility |
|--------|---------------|
| `PlayerSession.js` | One seat participant: `id`, `name`, `bankroll`, `bet`, insurance bet, their `PlayerHand` root, final `outcome`. |
| `PlayerHand.js` | A node in a player's hand tree. Starts as a copy of the seat cards, then grows independently. Supports recursive split trees. Tracks `isActive`, `isComplete`. |

**Split tree example:**
```
PlayerHand (root — copied from seat)
├── PlayerHand (split left) ← active
└── PlayerHand (split right)
```

### Stats (`src/stats/`) — Session Tracking

Persisted to `localStorage` keyed by player name/id.

Tracks: hands played, wins, losses, pushes, BJs, surrender rate, current streak, biggest win, ROI%.

### Strategy (`src/strategy/`) — Hint Engine

Optional hint overlay. Reads `playerTotal`, `isSoft`, `isPair`, `dealerUpCard` → returns best action string (H/S/D/P/R).

### UI (`src/ui/`) — Presentation Only

| Module | Responsibility |
|--------|---------------|
| `TableRenderer.js` | Renders dealer hand, seat hand, phase banner, shoe indicator. |
| `PlayerRenderer.js` | For each `PlayerSession`: renders their panel, chips, diverged cards, action buttons, outcome badge. |
| `AnimationController.js` | Queues `requestAnimationFrame`-based animation steps (deal delay, card flip, bust shake). |
| `UIController.js` | Button/keyboard bindings. Manages "Add Player" flow. Delegates to `RoundManager`. |

---

## State Machine Phases

```
IDLE → BETTING → DEALING → [INSURANCE] → DECISIONS → DEALER_TURN → PAYOUT → BETTING
```

| Phase | Who acts | Description |
|-------|----------|-------------|
| `IDLE` | — | Splash screen |
| `BETTING` | All players | Each places/adjusts bet. "Deal" button when ready. |
| `DEALING` | RoundManager | 4-card deal animation: P1, D up, P2 (seat), D hole |
| `INSURANCE` | All players | Simultaneous yes/no if dealer shows Ace. Timed. |
| `DECISIONS` | Players sequentially or in parallel | Each player acts on their own hand. UI shows one player at a time in single-player mode; can show all simultaneously. |
| `DEALER_TURN` | RoundManager | Reveal hole, draw cards per H17. |
| `PAYOUT` | RoundManager | Evaluate each player's hand vs dealer, credit bankroll. |

---

## The Key Design Pattern: Seat → Player Divergence

```
SeatHand: [A♠, 7♥]  (visible to all)

Player 1 → Stands       → final hand: [A♠, 7♥]         → Soft 18
Player 2 → Hits         → private: [A♠, 7♥, 3♦]        → Soft 21
Player 3 → Doubles      → private: [A♠, 7♥, 5♣] × 2bet → Soft 23 bust
Player 4 → Surrenders   → exits for half bet back
```

`PlayerHand` is initialised as a **copy** of `SeatHand.cards` + the player's bet.
The moment a player makes ANY decision, their hand is independent.
The `SeatHand` itself is never mutated.

---

## Multi-Player Management

- Players are identified by a simple sequential ID + display name
- No networking in v1 — all players are local (pass-and-play or solo)
- Each player gets their own panel in the UI
- "Add Player" button available during BETTING phase
- Players can leave between rounds (not mid-round)
- Min: 1 player, Max: configurable (default 6 for screen space)

---

## Game Rules

| Rule | Setting |
|------|---------|
| Decks | 6 |
| Blackjack | 3:2 |
| Dealer | Hits Soft 17 (H17) |
| Double | Any two cards |
| Double After Split | Yes |
| Re-split Aces | No |
| Max Splits | 4 hands |
| Surrender | Late |
| Insurance | Yes |

---

## Keyboard Shortcuts (active player)

| Key | Action |
|-----|--------|
| `H` | Hit |
| `S` | Stand |
| `D` | Double Down |
| `P` | Split |
| `R` | Surrender |
| `Space` | Deal / Next Round |
| `1–5` | Chip: $5 / $25 / $100 / $500 / $1000 |
| `Tab` | Cycle active player view |
| `?` | Toggle strategy hints |

---

## UI Layout (single viewport)

```
┌─────────────────────────────────────────────────────┐
│  DEALER HAND          [Shoe: ████░░ 68%]  Round: 14 │
│  ┌───┐ ┌───┐                                        │
│  │ A │ │ ? │   Dealer: 11                           │
│  └───┘ └───┘                                        │
│─────────────────────────────────────────────────────│
│  SEAT HAND (shared start)                           │
│  ┌───┐ ┌───┐                                        │
│  │ 7 │ │ 9 │   Hard 16                              │
│  └───┘ └───┘                                        │
│─────────────────────────────────────────────────────│
│  PLAYERS                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ Alice  $980  │ │  Bob  $1,120 │ │ + Add Player│ │
│  │ Bet: $25     │ │ Bet: $100    │ │             │ │
│  │ ┌──┐┌──┐┌──┐│ │ ┌──┐┌──┐    │ │             │ │
│  │ │7 ││9 ││5 ││ │ │7 ││9 │    │ │             │ │
│  │ └──┘└──┘└──┘│ │ └──┘└──┘    │ │             │ │
│  │ Hard 21  WIN│ │ [H] [S] [D] │ │             │ │
│  └──────────────┘ └──────────────┘ └─────────────┘ │
│  Hint: HIT ↑                                        │
└─────────────────────────────────────────────────────┘
```

---

## Future Enhancements (out of scope v1)

- [ ] WebSocket multiplayer (real remote players)
- [ ] Side bets: Any Pair, 21+3, Bust It
- [ ] Sound design (chip clicks, card slides, win fanfare)
- [ ] Animated card dealing from shoe
- [ ] Mobile-first responsive layout
- [ ] Configurable rule sets per table
