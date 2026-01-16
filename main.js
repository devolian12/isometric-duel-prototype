
import { createInitialState, BOARD } from './rules/data.js';
import { applyAction, getLegalMoves, getLegalTargets, inBounds } from './rules/engine.js';
import { Iso } from './iso.js';
import { CHARACTERS, SPELL_MAPPING, SPELL_DISPLAY } from './char_config.js';

// --- State ---
let gameState = createInitialState();
let selectedSpellId = null;
let hoveredTile = null;
let rangeZoneTiles = []; // Tiles in casting range

// Character Config State
let p1CharId = 'DUELIST';
let p2CharId = 'RANGED';

// Visual Feedback
let feedbackEffects = [];
let lastRectWidth = 0;
let lastRectHeight = 0;

// --- DOM ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const spellsListEl = document.getElementById('spells-list');
const logPanelEl = document.getElementById('log-panel');
const logEl = document.getElementById('log');
const logToggleEl = document.getElementById('log-toggle');
const turnTextEl = document.getElementById('turn-text');
const p1StatusEl = document.getElementById('p1-status');
const p2StatusEl = document.getElementById('p2-status');
const btnEndTurn = document.getElementById('btn-end-turn');
const p1CharSelect = document.getElementById('p1-char-select');
const p2CharSelect = document.getElementById('p2-char-select');

// === Character & Client-Side Logic ===

p1CharSelect.addEventListener('change', (e) => { p1CharId = e.target.value; render(); });
p2CharSelect.addEventListener('change', (e) => { p2CharId = e.target.value; render(); });

function getActiveCharacter() {
    const pid = gameState.turn.currentPlayerId;
    return CHARACTERS[(pid === 'P1') ? p1CharId : p2CharId] || CHARACTERS.DUELIST;
}

// --- Range Zone Calculation ---
function updateRangeZone() {
    rangeZoneTiles = [];
    if (!selectedSpellId) return;

    const conf = SPELL_DISPLAY[selectedSpellId];
    // Only show range zone for attacks/spells with a specific 'range' property
    // Move types (DASH, BACKSTEP) use specific destination logic, handled by validTargets
    if (!conf || !conf.logic || typeof conf.logic.range === 'undefined') {
        return;
    }

    const range = conf.logic.range;
    const pid = gameState.turn.currentPlayerId;
    const unit = gameState.units[pid];

    for (let row = 0; row < BOARD.rows; row++) {
        for (let col = 0; col < BOARD.cols; col++) {
            const dist = Math.abs(col - unit.x) + Math.abs(row - unit.y);
            if (dist <= range) {
                rangeZoneTiles.push({ x: col, y: row });
            }
        }
    }
}

// --- Extended Targeting Logic ---
function getExtendedLegalTargets(state, pid, uiSpellId) {
    const engineId = SPELL_MAPPING[uiSpellId];

    // 1. Engine Spells (Duelist)
    if (engineId && engineId !== 'CLIENT_SIDE') {
        return getLegalTargets(state, pid, engineId);
    }

    // 2. Client-Side Spells (Ranged)
    const targets = [];
    const myUnit = state.units[pid];
    const oppId = pid === 'P1' ? 'P2' : 'P1';
    const oppUnit = state.units[oppId];
    const logic = SPELL_DISPLAY[uiSpellId].logic;

    if (!logic) return [];

    if (uiSpellId === 'BACKSTEP') {
        const currentDist = Math.abs(myUnit.x - oppUnit.x) + Math.abs(myUnit.y - oppUnit.y);
        const candidates = [
            { x: myUnit.x + 1, y: myUnit.y },
            { x: myUnit.x - 1, y: myUnit.y },
            { x: myUnit.x, y: myUnit.y + 1 },
            { x: myUnit.x, y: myUnit.y - 1 }
        ];

        candidates.forEach(pos => {
            if (inBounds(pos.x, pos.y)) {
                if (pos.x === oppUnit.x && pos.y === oppUnit.y) return;
                const newDist = Math.abs(pos.x - oppUnit.x) + Math.abs(pos.y - oppUnit.y);
                if (newDist > currentDist) {
                    targets.push(pos);
                }
            }
        });
        return targets;
    }

    const dist = Math.abs(myUnit.x - oppUnit.x) + Math.abs(myUnit.y - oppUnit.y);
    if (dist <= logic.range) {
        targets.push({ x: oppUnit.x, y: oppUnit.y });
    }

    return targets;
}

// --- Client-Side Action Resolution ---
function resolveClientSpell(state, uiSpellId, target) {
    const nextState = JSON.parse(JSON.stringify(state));
    const pid = nextState.turn.currentPlayerId;
    const oppId = pid === 'P1' ? 'P2' : 'P1';

    const myUnit = nextState.units[pid];
    const oppUnit = nextState.units[oppId];
    const logic = SPELL_DISPLAY[uiSpellId].logic;

    if (uiSpellId === 'BACKSTEP') {
        myUnit.x = target.x;
        myUnit.y = target.y;
        nextState.log.push(`${pid} BACKSTEP`);
    } else {
        let dmg = logic.dmg;
        if (oppUnit.status.guard) {
            dmg = Math.max(0, dmg - 5); // Guard assumption
            oppUnit.status.guard = false;
            nextState.log.push(`${pid} hit Guard!`);
        }
        oppUnit.hp -= dmg;
        nextState.log.push(`${pid} ${uiSpellId} -> ${oppId} (-${dmg})`);
    }
    myUnit.cooldowns[uiSpellId] = logic.cd;
    nextState.turn.actionTaken = true;
    if (oppUnit.hp <= 0) {
        nextState.winner = pid;
        nextState.log.push(`*** ${pid} WINS ***`);
    } else if (myUnit.hp <= 0) {
        nextState.winner = oppId;
    }
    return nextState;
}

function applyStateChange(action) {
    let next;

    if (action.type === 'CAST' && SPELL_MAPPING[action.spellId] === 'CLIENT_SIDE') {
        next = resolveClientSpell(gameState, action.spellId, action.target);
    } else {
        next = applyAction(gameState, action);
    }

    if (next.turn.number > gameState.turn.number || next.turn.currentPlayerId !== gameState.turn.currentPlayerId) {
        const nextPid = next.turn.currentPlayerId;
        const u = next.units[nextPid];
        // Decrement custom cooldowns
        ['SHOT', 'SNIPE', 'BACKSTEP', 'NET'].forEach(spell => {
            if (u.cooldowns[spell] > 0) u.cooldowns[spell]--;
        });
    }

    gameState = next;

    // Position might have changed, update zone
    updateRangeZone();
    render();
}

// --- Resize & Input (Standard) ---
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    lastRectWidth = rect.width;
    lastRectHeight = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Iso.computeOrigin(rect.width, rect.height);
    requestAnimationFrame(renderLoop);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);
requestAnimationFrame(resizeCanvas);

function getCanvasPoint(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width;
    const scaleY = canvas.clientHeight / rect.height;
    return { px: (e.clientX - rect.left) * scaleX, py: (e.clientY - rect.top) * scaleY };
}
function ensureCanvasValid() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - lastRectWidth) > 1 || Math.abs(rect.height - lastRectHeight) > 1) resizeCanvas();
}

// --- Pointer Events ---
let isPointerDown = false;
canvas.addEventListener('pointerdown', (e) => { ensureCanvasValid(); canvas.setPointerCapture(e.pointerId); isPointerDown = true; updateHover(e); });
canvas.addEventListener('pointermove', (e) => { updateHover(e); });
canvas.addEventListener('pointerup', (e) => { isPointerDown = false; canvas.releasePointerCapture(e.pointerId); if (!gameState.winner && hoveredTile) onTileClick(hoveredTile.x, hoveredTile.y); });
canvas.addEventListener('pointerleave', (e) => { hoveredTile = null; isPointerDown = false; });
function updateHover(e) { if (gameState.winner) { hoveredTile = null; return; } const { px, py } = getCanvasPoint(e, canvas); hoveredTile = Iso.pickTile(px, py); }


// --- Rendering ---
function renderLoop(timestamp) {
    render(timestamp);
    requestAnimationFrame(renderLoop);
}

function render(timestamp) {
    ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

    const pid = gameState.turn.currentPlayerId;
    const legalMoves = getLegalMoves(gameState, pid);

    let validTargets = [];
    if (selectedSpellId) {
        validTargets = getExtendedLegalTargets(gameState, pid, selectedSpellId);
    }

    // Tiles
    for (let row = 0; row < BOARD.rows; row++) {
        for (let col = 0; col < BOARD.cols; col++) {

            let fillColor = '#333';
            let strokeColor = '#555';

            const isMove = legalMoves.some(m => m.to.x === col && m.to.y === row);
            const isTarget = validTargets.some(t => t.x === col && t.y === row);
            const isRangeZone = rangeZoneTiles.some(t => t.x === col && t.y === row);

            if (!gameState.winner) {
                if (selectedSpellId) {
                    if (isTarget) fillColor = '#4e4e1f';
                    else if (isRangeZone) fillColor = '#2a2a35'; // Range Zone Base (Subtle)
                    // Else remain dark
                } else {
                    if (isMove) fillColor = '#1f4e1f'; // Move Base
                }
            }

            drawTile(col, row, fillColor, strokeColor);

            if (!gameState.winner) {
                if (selectedSpellId) {
                    if (isTarget) drawTile(col, row, null, '#eab308', 2);
                    else if (isRangeZone) {
                        // Range Zone Overlay (Subtle Top)
                        ctx.save();
                        ctx.globalAlpha = 0.15;
                        drawTile(col, row, '#ffffff', null); // Subtle lighting
                        ctx.restore();
                    }
                } else {
                    if (isMove) drawTile(col, row, null, '#22c55e', 2);
                }
            }
        }
    }

    // Units
    const units = [gameState.units.P1, gameState.units.P2]
        .filter(u => u.hp > 0)
        .sort((a, b) => Iso.gridToScreen(a.x, a.y).y - Iso.gridToScreen(b.x, b.y).y);
    units.forEach(u => drawUnit(u));

    // Hover
    if (hoveredTile && !gameState.winner) {
        const { x, y } = hoveredTile;
        let isValid = false;
        if (selectedSpellId) {
            isValid = validTargets.some(t => t.x === x && t.y === y);
        } else {
            isValid = legalMoves.some(m => m.to.x === x && m.to.y === y);
        }
        if (isValid) {
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin((timestamp || 0) / 150) * 0.2;
            drawTile(x, y, null, '#ffffff', 2);
            ctx.globalAlpha = 0.2;
            drawTile(x, y, '#ffffff', null);
            ctx.restore();
        } else {
            ctx.save();
            ctx.globalAlpha = 0.8;
            drawTile(x, y, null, '#ef4444', 2);
            ctx.restore();
        }
    }

    // Feedback
    if (timestamp) {
        feedbackEffects = feedbackEffects.filter(fx => (timestamp - fx.startTime) < fx.duration);
        feedbackEffects.forEach(fx => {
            const elapsed = timestamp - fx.startTime;
            const progress = elapsed / fx.duration;
            const alpha = 1.0 - progress;
            ctx.save();
            ctx.globalAlpha = alpha * 0.6;
            drawTile(fx.x, fx.y, fx.color, null);
            ctx.globalAlpha = alpha;
            drawTile(fx.x, fx.y, null, fx.color, 2);
            ctx.restore();
        });
    }

    updateUI();
}

function drawTile(col, row, fillStyle, strokeStyle, lineWidth = 1) {
    const poly = Iso.getTilePolygon(col, row);
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawUnit(unit) {
    const c = Iso.gridToScreen(unit.x, unit.y);
    const radius = 12; const height = 30;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, radius, radius * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    const color = unit.id === 'P1' ? '#3b82f6' : '#ef4444';
    ctx.fillStyle = color; ctx.fillRect(c.x - radius, c.y - height, radius * 2, height);
    ctx.beginPath(); ctx.ellipse(c.x, c.y - height, radius, radius * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = lighten(color, 20); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x, c.y, radius, radius * 0.5, 0, 0, Math.PI, false); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(unit.id, c.x, c.y - height + 5);
    if (unit.status.guard) { ctx.fillStyle = 'gold'; ctx.font = '16px serif'; ctx.fillText('🛡️', c.x + 15, c.y - height / 2); }
}

function lighten(col, amt) {
    if (col === '#3b82f6') return '#60a5fa';
    if (col === '#ef4444') return '#f87171';
    return col;
}

// --- Interaction Logic ---

function onTileClick(x, y) {
    const pid = gameState.turn.currentPlayerId;
    let actionSuccess = false;

    if (selectedSpellId) {
        const targets = getExtendedLegalTargets(gameState, pid, selectedSpellId);
        const valid = targets.find(t => t.x === x && t.y === y);
        if (valid) {
            applyStateChange({
                type: 'CAST',
                playerId: pid,
                turnNumber: gameState.turn.number,
                spellId: selectedSpellId,
                target: { x, y }
            });
            selectedSpellId = null;
            actionSuccess = true;
        }
    } else {
        const moves = getLegalMoves(gameState, pid);
        const valid = moves.find(m => m.to.x === x && m.to.y === y);
        if (valid) {
            applyStateChange(valid);
            actionSuccess = true;
        }
    }

    if (actionSuccess) {
        feedbackEffects.push({ x, y, startTime: performance.now(), duration: 300, color: '#ffffff' });
    }
}

// --- UI Logic ---
logToggleEl.addEventListener('click', () => { logPanelEl.classList.toggle('hidden'); logToggleEl.textContent = logPanelEl.classList.contains('hidden') ? 'Log ▾' : 'Log ▴'; });
function updateUI() {
    turnTextEl.textContent = `${gameState.turn.currentPlayerId} (Turn ${gameState.turn.number})`;
    const p1 = gameState.units.P1; const p2 = gameState.units.P2;
    p1StatusEl.textContent = `P1 ${p1.hp}` + (p1.status.guard ? '🛡️' : '');
    p2StatusEl.textContent = `P2 ${p2.hp}` + (p2.status.guard ? '🛡️' : '');
    if (gameState.winner) { turnTextEl.textContent = `WINNER: ${gameState.winner}!`; turnTextEl.style.color = '#eab308'; }
    else { turnTextEl.style.color = '#fff'; }
    renderSpells();
    renderLog();
}
function renderSpells() {
    spellsListEl.innerHTML = '';
    const character = getActiveCharacter();
    const spellList = character.spells;
    const pid = gameState.turn.currentPlayerId;
    const unit = gameState.units[pid];

    spellList.forEach(uiId => {
        const btn = document.createElement('button');
        btn.className = 'spell-btn';
        const display = SPELL_DISPLAY[uiId] || { label: uiId, desc: '' };
        const cd = unit ? (unit.cooldowns[uiId] || 0) : 0;
        btn.innerHTML = `<span>${display.label}</span><span style="font-size:0.7em; color:#aaa; font-weight:normal;">${display.desc}</span><span style="font-size:0.75em; color:#ef4444; font-weight:bold;">${cd > 0 ? `CD: ${cd}` : ''}</span>`;
        if (cd > 0 || gameState.winner || gameState.turn.actionTaken) btn.disabled = true;
        if (selectedSpellId === uiId) btn.classList.add('selected');
        btn.addEventListener('click', (e) => { e.stopPropagation(); selectedSpellId = (selectedSpellId === uiId) ? null : uiId; updateRangeZone(); render(); });
        spellsListEl.appendChild(btn);
    });
}
function renderLog() {
    logEl.innerHTML = ''; const entries = gameState.log.slice(-10);
    entries.forEach(msg => { const div = document.createElement('div'); div.className = 'log-entry'; div.textContent = `> ${msg}`; logEl.appendChild(div); });
    logPanelEl.scrollTop = logPanelEl.scrollHeight;
}
btnEndTurn.addEventListener('click', () => { applyStateChange({ type: 'END_TURN', playerId: gameState.turn.currentPlayerId, turnNumber: gameState.turn.number }); selectedSpellId = null; });
