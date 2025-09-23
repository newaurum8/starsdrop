// state.js

export const STATE = {
    user: null,
    userBalance: 0,
    inventory: [],
    gameHistory: [],
    isSpinning: false,
    isFastSpinEnabled: false,
    openQuantity: 1,
    casePrice: 100,
    lastWonItems: [],
    contest: null,
    ticketQuantity: 1,
    possibleItems: [],
    gameSettings: {},
    upgradeState: {
        yourItem: null,
        desiredItem: null,
        chance: 0,
        multiplier: 0,
        isUpgrading: false,
        activePicker: 'inventory',
        maxChance: 95,
        currentRotation: 0,
    },
    minerState: {
        isActive: false, bet: 100, bombs: 6, grid: [], openedCrystals: 0, currentMultiplier: 1, totalWin: 0,
    },
    coinflipState: { isFlipping: false },
    rpsState: { isPlaying: false, choices: ['rock', 'paper', 'scissors'], choiceMap: { rock: '✊', paper: '✋', scissors: '✌️' } },
    slotsState: { isSpinning: false, symbols: [{ name: 'Lemon', imageSrc: 'images/slot_lemon.png' }, { name: 'Cherry', imageSrc: 'images/slot_cherry.png' }, { name: 'Seven', imageSrc: 'images/slot_7.png' }] },
    towerState: { isActive: false, isCashingOut: false, bet: 15, currentLevel: 0, levels: 5, grid: [], payouts: [], multipliers: [1.5, 2.5, 4, 8, 16], nextLevelTimeout: null }
};
