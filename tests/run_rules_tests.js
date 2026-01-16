import { createInitialState, BOARD, SPELLS } from '../rules/data.js';
import { applyAction, getLegalMoves, getLegalTargets } from '../rules/engine.js';

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

function assertEqual(actual, expected, message) {
    const sActual = JSON.stringify(actual);
    const sExpected = JSON.stringify(expected);
    if (sActual !== sExpected) {
        console.error(`FAIL: ${message}\n  Expected: ${sExpected}\n  Actual:   ${sActual}`);
        process.exit(1);
    }
}

console.log("Running tests...");

// Test 1: P1 legal moves from start
{
    const state = createInitialState();
    // P1 valid moves: (2,4), (2,6), (1,5), (3,5)
    // All in bounds (6x7 => x:0..5, y:0..6).
    const moves = getLegalMoves(state, 'P1');
    assert(moves.length === 4, "Should have 4 legal moves from start");
    const targets = moves.map(m => `${m.to.x},${m.to.y}`).sort();
    assertEqual(targets, ["1,5", "2,4", "2,6", "3,5"], "Start moves match");
    console.log("PASS: P1 legal moves");
}

// Test 2: STRIKE only legal when adjacent
{
    const state = createInitialState();
    const strikes = getLegalTargets(state, 'P1', 'STRIKE');
    assert(strikes.length === 0, "STRIKE should have no targets if far");

    state.units.P2.x = 2;
    state.units.P2.y = 4;
    const strikes2 = getLegalTargets(state, 'P1', 'STRIKE');
    assert(strikes2.length === 1, "Should validly target adjacent enemy");
    assert(strikes2[0].x === 2 && strikes2[0].y === 4, "Target correct");
    console.log("PASS: STRIKE adjacency");
}

// Test 3: DASH cannot go through occupied
{
    let state = createInitialState();
    state.units.P2.x = 2;
    state.units.P2.y = 4;

    const dashes = getLegalTargets(state, 'P1', 'DASH');
    const has23 = dashes.some(t => t.x === 2 && t.y === 3);
    assert(!has23, "DASH cannot jump over unit");
    console.log("PASS: DASH collision");
}

// Test 4: GUARD reduces next STRIKE by 2 and counters for 1
{
    let state = createInitialState();
    const guardAct = { type: "CAST", playerId: "P1", spellId: "GUARD", target: { x: 2, y: 5 } };
    state = applyAction(state, guardAct);

    assert(state.units.P1.status.guard !== null, "P1 should be guarded");
    state.units.P2.x = 2;
    state.units.P2.y = 4;

    const strikeAct = { type: "CAST", playerId: "P2", spellId: "STRIKE", target: { x: 2, y: 5 } };
    const p1HpBefore = state.units.P1.hp;
    const p2HpBefore = state.units.P2.hp;

    state = applyAction(state, strikeAct);

    assert(state.units.P1.hp === p1HpBefore, "P1 took 0 damage due to guard");
    assert(state.units.P2.hp === p2HpBefore - 1, "P2 took 1 counter damage");
    assert(state.units.P1.status.guard === null, "Guard consumed");
    console.log("PASS: GUARD mechanics");
}

// Test 5: FORCE pushes correctly, ring-out
{
    let state = createInitialState();
    state.units.P2.x = 2;
    state.units.P2.y = 4;

    const forceAct = { type: "CAST", playerId: "P1", spellId: "FORCE", target: { x: 2, y: 4 } };
    state = applyAction(state, forceAct);

    assert(state.units.P2.x === 2 && state.units.P2.y === 3, `P2 pushed to (2,3)`);
    assert(state.units.P2.hp === 9, "P2 took 1 damage from FORCE");

    state.turn.currentPlayerId = "P1";
    state.turn.actionTaken = false;
    state.units.P1.x = 1;
    state.units.P1.y = 0;
    state.units.P1.cooldowns.FORCE = 0;
    state.units.P2.x = 0;
    state.units.P2.y = 0;
    state.units.P2.hp = 10;

    const ringOutAct = { type: "CAST", playerId: "P1", spellId: "FORCE", target: { x: 0, y: 0 } };
    state = applyAction(state, ringOutAct);

    assert(state.units.P2.hp === 0, "P2 should be dead from ring-out");
    assert(state.winner === "P1", "P1 should win via ring-out");
    console.log("PASS: FORCE & Ring-out");
}

// Test 6: Cooldowns tick on turn start
{
    let state = createInitialState();
    state = applyAction(state, { type: "CAST", playerId: "P1", spellId: "DASH", target: { x: 2, y: 3 } });
    assert(state.units.P1.cooldowns.DASH === 2, "CD set to 2");

    state = applyAction(state, { type: "END_TURN", playerId: "P2" });

    assert(state.turn.currentPlayerId === "P1", "Back to P1");
    // Cooldown ticks 2->1 at START of P1 turn
    assert(state.units.P1.cooldowns.DASH === 1, "CD ticked to 1");

    state = applyAction(state, { type: "END_TURN", playerId: "P1" });
    state = applyAction(state, { type: "END_TURN", playerId: "P2" });
    assert(state.units.P1.cooldowns.DASH === 0, "CD expired");
    console.log("PASS: Cooldowns tick");
}

// Test 7: Invalid action rejection
{
    const state = createInitialState();
    const jsonBefore = JSON.stringify(state);

    applyAction(state, { type: "MOVE", playerId: "P1", to: { x: -1, y: 5 } });
    const jsonAfter = JSON.stringify(state);

    assert(jsonBefore === jsonAfter, "State unchanged on invalid move");
    console.log("PASS: Invalid action rejection");
}

console.log("ALL TESTS PASSED");
