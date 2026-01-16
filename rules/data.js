export const BOARD = {
    cols: 6,
    rows: 7,
    ringOut: true // if pushed out of bounds -> HP 0
};

export const SPELLS = {
    STRIKE: {
        id: "STRIKE",
        range: 1,
        damage: 2,
        cooldown: 0,
        type: "MELEE",
        description: "Melee attack 2 dmg"
    },
    DASH: {
        id: "DASH",
        range: 2, // movement range
        cooldown: 2,
        type: "MOVE",
        description: "Move up to 2 tiles straight orthogonal"
    },
    GUARD: {
        id: "GUARD",
        cooldown: 3,
        type: "BUFF",
        description: "Reduce next dmg by 2 (counter 1 if melee)"
    },
    FORCE: {
        id: "FORCE",
        range: 2,
        damage: 1,
        push: 1,
        cooldown: 3,
        type: "RANGED",
        description: "Ranged 1 dmg + push 1 tile"
    }
};

export function createInitialState() {
    return {
        board: { ...BOARD },
        turn: {
            currentPlayerId: "P1",
            number: 1,
            actionTaken: false
        },
        units: {
            P1: {
                id: "P1",
                x: 2,
                y: 5,
                hp: 10,
                status: {
                    guard: null // null or object
                },
                cooldowns: {
                    STRIKE: 0,
                    DASH: 0,
                    GUARD: 0,
                    FORCE: 0
                }
            },
            P2: {
                id: "P2",
                x: 3,
                y: 1,
                hp: 10,
                status: {
                    guard: null
                },
                cooldowns: {
                    STRIKE: 0,
                    DASH: 0,
                    GUARD: 0,
                    FORCE: 0
                }
            }
        },
        winner: null,
        log: [] // Strings, keep last 12
    };
}
