# Rules Engine - Phase 1

Deterministic, headless rules engine for a 1v1 tactical turn-based game.

## Game State

```js
{
  board: { cols: 6, rows: 7, ringOut: true },
  turn: { currentPlayerId: "P1", number: 1, actionTaken: false },
  units: {
    P1: { id: "P1", x: 2, y: 5, hp: 10, status: { guard: null }, cooldowns: {...} },
    P2: { id: "P2", x: 3, y: 1, hp: 10, status: { guard: null }, cooldowns: {...} }
  },
  winner: null, // "P1", "P2", or "DRAW"
  log: [] // Recent events
}
```

## Actions

The `applyAction(state, action)` function returns a strictly new state object.

### MOVE
Standard orthogonal movement (1 tile).
```js
{ type: "MOVE", playerId: "P1", to: { x: 2, y: 4 } }
```

### CAST
Cast a spell.
```js
{ type: "CAST", playerId: "P1", spellId: "STRIKE", target: { x: 3, y: 5 } }
```

### END_TURN
Skip turn (or end early, though actions currently auto-end turn).
```js
{ type: "END_TURN", playerId: "P1" }
```

## Spells

- **STRIKE** (Melee): Rng 1, Dmg 2, CD 0.
- **DASH** (Move): Move 2 straight, CD 2.
- **GUARD** (Buff): Reduce next dmg by 2. Counter 1 if melee hit. CD 3.
- **FORCE** (Ranged): Rng 2, Dmg 1, Push 1 tile. Ring-out kills. CD 3.

## Usage

```js
const { createInitialState } = require('./rules/data');
const { applyAction, getLegalMoves } = require('./rules/engine');

let state = createInitialState();
state = applyAction(state, { type: "MOVE", ... });
```
