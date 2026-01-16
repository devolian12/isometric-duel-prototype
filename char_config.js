
// UI-Only Configuration for Characters and Spells
// This maps visual choices to the underlying Engine rules OR Client-side logic

export const CHARACTERS = {
    DUELIST: {
        id: 'DUELIST',
        name: 'Duelist',
        spells: ['STRIKE', 'DASH', 'GUARD', 'FORCE']
    },
    RANGED: {
        id: 'RANGED',
        name: 'Ranged',
        // Note: NET is omitted for MVP as per Step 7B constraints
        spells: ['SHOT', 'SNIPE', 'BACKSTEP']
    }
};

export const SPELL_MAPPING = {
    // Duelist (1:1 with Engine)
    'STRIKE': 'STRIKE',
    'DASH': 'DASH',
    'GUARD': 'GUARD',
    'FORCE': 'FORCE',

    // Ranged (Client-Side Resolution)
    'SHOT': 'CLIENT_SIDE',
    'SNIPE': 'CLIENT_SIDE',
    'BACKSTEP': 'CLIENT_SIDE',
    'NET': 'CLIENT_SIDE'
};

export const SPELL_DISPLAY = {
    // Duelist
    'STRIKE': { label: 'Strike', desc: 'Melee 3', type: 'ATTACK', logic: { range: 1 } },
    'DASH': { label: 'Dash', desc: 'Move 3', type: 'MOVE' },
    'GUARD': { label: 'Guard', desc: 'Shield', type: 'BUFF' },
    'FORCE': { label: 'Force', desc: 'Push 3', type: 'ATTACK', logic: { range: 2 } },

    // Ranged
    'SHOT': { label: 'Shot', desc: 'R3 Dmg1', type: 'ATTACK', logic: { range: 3, dmg: 1, cd: 0 } },
    'SNIPE': { label: 'Snipe', desc: 'R5 Dmg2', type: 'ATTACK', logic: { range: 5, dmg: 2, cd: 2 } },
    'BACKSTEP': { label: 'Backstep', desc: 'Evade', type: 'MOVE', logic: { cd: 1 } },
    'NET': { label: 'Net', desc: 'Root', type: 'DEBUFF', logic: { range: 3, cd: 3 } }
};
