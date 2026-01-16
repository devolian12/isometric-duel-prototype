import { BOARD, SPELLS } from './data.js';

// --- Helpers ---

export function inBounds(x, y) {
    return x >= 0 && x < BOARD.cols && y >= 0 && y < BOARD.rows;
}

function getUnitAt(state, x, y) {
    if (state.units.P1.x === x && state.units.P1.y === y && state.units.P1.hp > 0) return state.units.P1;
    if (state.units.P2.x === x && state.units.P2.y === y && state.units.P2.hp > 0) return state.units.P2;
    return null;
}

function distManhattan(u1, u2) {
    return Math.abs(u1.x - u2.x) + Math.abs(u1.y - u2.y);
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function pushLog(state, msg) {
    state.log.push(msg);
    if (state.log.length > 12) state.log.shift();
}

// --- Validation Helpers ---

function canAct(state, playerId) {
    if (state.winner) return false;
    if (state.turn.currentPlayerId !== playerId) return false;
    if (state.turn.actionTaken) return false;
    return true;
}

// --- Action Logic ---

export function applyAction(state, action) {
    // Return same state if invalid
    if (!state || !action) return state;

    // Clone state to apply changes
    const next = clone(state);
    const { playerId, type } = action;

    // Basic validation
    if (next.winner) return state;
    if (next.turn.currentPlayerId !== playerId && type !== 'END_TURN') return state; // Only current can act (Phase 1 rule)

    if (next.turn.currentPlayerId !== playerId) return state;

    if (type !== 'END_TURN' && next.turn.actionTaken) {
        return state;
    }

    const me = next.units[playerId];
    const otherId = playerId === 'P1' ? 'P2' : 'P1';
    const enemy = next.units[otherId];

    // Logic per action type
    if (type === 'MOVE') {
        const tx = action.to.x;
        const ty = action.to.y;
        if (!inBounds(tx, ty)) return state;
        if (distManhattan({ x: me.x, y: me.y }, { x: tx, y: ty }) !== 1) return state; // Only 1 step
        if (getUnitAt(next, tx, ty)) return state; // Occupied

        // Execute Move
        me.x = tx;
        me.y = ty;
        next.turn.actionTaken = true;
        pushLog(next, `${playerId} moved to (${tx},${ty})`);

        // Turn ends automatically after action
        handleTurnEnd(next);
        return next;

    } else if (type === 'CAST') {
        const spellId = action.spellId;
        const target = action.target; // {x,y} or null check
        const spell = SPELLS[spellId];
        if (!spell) return state;

        // Check cooldown
        if (me.cooldowns[spellId] > 0) return state;

        // Validate target/logic
        if (spellId === 'STRIKE') {
            // Range 1, enemy tile only
            if (distManhattan({ x: me.x, y: me.y }, { x: target.x, y: target.y }) !== 1) return state;
            if (target.x !== enemy.x || target.y !== enemy.y) return state; // Must target enemy
            if (enemy.hp <= 0) return state; // Can't strike dead

            // Execute
            me.cooldowns.STRIKE = spell.cooldown; // 0
            next.turn.actionTaken = true;
            pushLog(next, `${playerId} casts STRIKE at (${target.x},${target.y})`);

            resolveDamage(next, me, enemy, spell.damage, 'MELEE');
            handleTurnEnd(next);
            return next;

        } else if (spellId === 'FORCE') {
            // Range 2, enemy tile only
            const d = distManhattan({ x: me.x, y: me.y }, { x: target.x, y: target.y });
            if (d > spell.range || d === 0) return state;
            if (target.x !== enemy.x || target.y !== enemy.y) return state;

            // Execute
            me.cooldowns.FORCE = spell.cooldown;
            next.turn.actionTaken = true;
            pushLog(next, `${playerId} casts FORCE at (${target.x},${target.y})`);

            // Damage 1 (FORCE is RANGED, no counter)
            resolveDamage(next, me, enemy, spell.damage, 'RANGED');

            // Push
            if (enemy.hp > 0) {
                resolvePush(next, me, enemy);
            }

            handleTurnEnd(next);
            return next;

        } else if (spellId === 'DASH') {
            const dx = target.x - me.x;
            const dy = target.y - me.y;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);

            // Straight check
            if (dx !== 0 && dy !== 0) return state; // Diagonal
            const dist = adx + ady;
            if (dist < 1 || dist > 2) return state;
            if (!inBounds(target.x, target.y)) return state;
            if (getUnitAt(next, target.x, target.y)) return state; // Dest occupied

            // If dist 2, check step 1
            if (dist === 2) {
                const stepX = me.x + Math.sign(dx);
                const stepY = me.y + Math.sign(dy);
                if (getUnitAt(next, stepX, stepY)) return state; // Path blocked
            }

            // Execute
            me.x = target.x;
            me.y = target.y;
            me.cooldowns.DASH = spell.cooldown;
            next.turn.actionTaken = true;
            pushLog(next, `${playerId} dashed to (${target.x},${target.y})`);

            handleTurnEnd(next);
            return next;

        } else if (spellId === 'GUARD') {
            // Target self
            if (target.x !== me.x || target.y !== me.y) return state;

            // Execute
            me.cooldowns.GUARD = spell.cooldown;
            me.status.guard = { value: 2 };
            next.turn.actionTaken = true;
            pushLog(next, `${playerId} casts GUARD`);

            handleTurnEnd(next);
            return next;
        }
    } else if (type === 'END_TURN') {
        pushLog(next, `${playerId} ends turn manually`);
        handleTurnEnd(next);
        return next;
    }

    return state;
}

function resolveDamage(state, attacker, defender, amount, type) {
    let dmg = amount;
    let countered = false;

    // Check Guard
    if (defender.status.guard) {
        // Reduce damage by 2 (min 0)
        const mitigation = defender.status.guard.value;
        dmg = Math.max(0, dmg - mitigation);

        // Guard consumed
        defender.status.guard = null;
        pushLog(state, `${defender.id} guard reduced damage`);

        // Counter if Melee
        if (type === 'MELEE') {
            countered = true;
        }
    }

    // Apply main damage
    defender.hp = Math.max(0, defender.hp - dmg);
    pushLog(state, `${defender.id} took ${dmg} damage (HP ${defender.hp})`);
    checkWin(state);

    // Counter-attack
    if (countered && defender.hp > 0 && attacker.hp > 0) {
        attacker.hp = Math.max(0, attacker.hp - 1);
        pushLog(state, `${attacker.id} hit by guard counter for 1 damage (HP ${attacker.hp})`);
        checkWin(state);
    }
}

function resolvePush(state, pusher, target) {
    const dx = target.x - pusher.x;
    const dy = target.y - pusher.y;
    let pushX = 0;
    let pushY = 0;

    // Deterministic push direction
    if (Math.abs(dx) > Math.abs(dy)) {
        pushX = Math.sign(dx);
    } else if (Math.abs(dy) > Math.abs(dx)) {
        pushY = Math.sign(dy);
    } else {
        // Tie
        if (dy !== 0) {
            pushY = Math.sign(dy);
        } else {
            pushX = Math.sign(dx);
        }
    }

    const tx = target.x + pushX;
    const ty = target.y + pushY;

    // Check OOB
    if (!inBounds(tx, ty)) {
        if (state.board.ringOut) {
            target.hp = 0;
            pushLog(state, `${target.id} pushed out of bounds!`);
            checkWin(state);
        }
        return;
    }

    // Check blocked
    if (getUnitAt(state, tx, ty)) {
        pushLog(state, `Push blocked by obstacle`);
        return;
    }

    // Move
    target.x = tx;
    target.y = ty;
    pushLog(state, `${target.id} pushed to (${tx},${ty})`);
}

function checkWin(state) {
    const p1Dead = state.units.P1.hp <= 0;
    const p2Dead = state.units.P2.hp <= 0;

    if (p1Dead && p2Dead) {
        state.winner = 'DRAW';
    } else if (p1Dead) {
        state.winner = 'P2';
    } else if (p2Dead) {
        state.winner = 'P1';
    }
}

function handleTurnEnd(state) {
    if (state.winner) return;

    // Advance turn
    const current = state.turn.currentPlayerId;
    const nextPlayer = current === 'P1' ? 'P2' : 'P1';

    state.turn.currentPlayerId = nextPlayer;
    if (nextPlayer === 'P1') state.turn.number++;

    state.turn.actionTaken = false;

    // Start-of-turn logic for nextPlayer
    // "At START of each player’s turn: ... expire guard on the player whose turn starts ... tick that player’s cooldowns"
    const pUnit = state.units[nextPlayer];

    // Expire Guard
    pUnit.status.guard = null;

    // Tick Cooldowns
    for (const key in pUnit.cooldowns) {
        pUnit.cooldowns[key] = Math.max(0, pUnit.cooldowns[key] - 1);
    }
}

// --- Read Viewers ---

export function getLegalMoves(state, playerId) {
    if (state.winner || state.turn.currentPlayerId !== playerId || state.turn.actionTaken) return [];

    const me = state.units[playerId];
    const moves = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dx, dy] of dirs) {
        const nx = me.x + dx;
        const ny = me.y + dy;
        if (inBounds(nx, ny) && !getUnitAt(state, nx, ny)) {
            moves.push({
                type: 'MOVE',
                playerId,
                turnNumber: state.turn.number,
                to: { x: nx, y: ny }
            });
        }
    }
    return moves;
}

export function getLegalTargets(state, playerId, spellId) {
    if (state.winner || state.turn.currentPlayerId !== playerId || state.turn.actionTaken) return [];

    const me = state.units[playerId];
    // Enemy ID? Logic inside applyAction uses generic logic but here we need it.
    const enemyId = playerId === 'P1' ? 'P2' : 'P1';
    const enemy = state.units[enemyId];

    const spell = SPELLS[spellId];
    if (!spell) return [];
    if (me.cooldowns[spellId] > 0) return [];

    const targets = [];

    if (spellId === 'STRIKE' || spellId === 'FORCE') {
        const d = distManhattan({ x: me.x, y: me.y }, { x: enemy.x, y: enemy.y });
        if (d > 0 && d <= spell.range) {
            targets.push({ x: enemy.x, y: enemy.y });
        }
    } else if (spellId === 'GUARD') {
        targets.push({ x: me.x, y: me.y });
    } else if (spellId === 'DASH') {
        // All empty tiles in straight line range 1..2
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of dirs) {
            // Dist 1
            const x1 = me.x + dx;
            const y1 = me.y + dy;
            if (inBounds(x1, y1) && !getUnitAt(state, x1, y1)) {
                targets.push({ x: x1, y: y1 });
                // Dist 2
                const x2 = x1 + dx;
                const y2 = y1 + dy;
                if (inBounds(x2, y2) && !getUnitAt(state, x2, y2)) {
                    targets.push({ x: x2, y: y2 });
                }
            }
        }
    }

    return targets;
}
