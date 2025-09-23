// games/miner.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';

/**
 * Инициализирует игру "Минер".
 */
export function initMiner() {
    if (UI.minerStartBtn) UI.minerStartBtn.addEventListener('click', startMinerGame);
    if (UI.minerCashoutBtn) UI.minerCashoutBtn.addEventListener('click', cashoutMiner);
}

/**
 * Сбрасывает игру в начальное состояние.
 */
export function resetMinerGame() {
    if (!UI.minerGrid) return;
    Object.assign(STATE.minerState, {
        isActive: false,
        openedCrystals: 0,
        totalWin: 0,
        grid: []
    });
    
    renderMinerGrid();
    updateMinerUI();
    
    UI.minerBetInput.disabled = false;
    UI.minerStartBtn.classList.remove('hidden');
    UI.minerCashoutBtn.classList.add('hidden');
    UI.minerInfoWrapper.classList.add('hidden');
}

function startMinerGame() {
    const bet = parseInt(UI.minerBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.userBalance -= bet;
    updateBalanceDisplay(STATE.userBalance);

    Object.assign(STATE.minerState, {
        isActive: true,
        bet: bet,
        openedCrystals: 0,
        totalWin: 0
    });

    const totalCells = 12;
    const bombIndices = new Set();
    while (bombIndices.size < STATE.minerState.bombs) {
        bombIndices.add(Math.floor(Math.random() * totalCells));
    }
    STATE.minerState.grid = Array.from({ length: totalCells }, (_, i) => ({ isBomb: bombIndices.has(i), isOpened: false }));

    renderMinerGrid(true);
    updateMinerUI();
    UI.minerBetInput.disabled = true;
    UI.minerStartBtn.classList.add('hidden');
    UI.minerCashoutBtn.classList.remove('hidden');
    UI.minerCashoutBtn.disabled = true;
    UI.minerInfoWrapper.classList.remove('hidden');
}

function renderMinerGrid(isGameActive = false) {
    if (!UI.minerGrid) return;
    UI.minerGrid.innerHTML = '';
    STATE.minerState.grid.forEach((cell, index) => {
        const cellEl = document.createElement('div');
        cellEl.className = 'miner-cell';
        if (cell.isOpened) {
            cellEl.classList.add('opened');
            cellEl.innerHTML = `<img src="images/${cell.isBomb ? 'bomb' : 'diamond'}.png" alt="">`;
            if (cell.isBomb) cellEl.classList.add('bomb');
        }
        if (isGameActive && !cell.isOpened) {
            cellEl.addEventListener('click', () => handleMinerCellClick(index), { once: true });
        }
        UI.minerGrid.appendChild(cellEl);
    });
}

function handleMinerCellClick(index) {
    if (!STATE.minerState.isActive) return;
    const cell = STATE.minerState.grid[index];
    cell.isOpened = true;

    if (cell.isBomb) {
        endMinerGame(false);
    } else {
        STATE.minerState.openedCrystals++;
        updateMinerMultiplierAndWin();
        renderMinerGrid(true);
        updateMinerUI();
        UI.minerCashoutBtn.disabled = false;
        if (STATE.minerState.openedCrystals === (12 - STATE.minerState.bombs)) {
            endMinerGame(true); // Автоматический выигрыш, если все кристаллы найдены
        }
    }
}

function updateMinerMultiplierAndWin() {
    const { bet, openedCrystals } = STATE.minerState;
    // Коэффициенты можно вынести в конфиг
    STATE.minerState.currentMultiplier = openedCrystals === 0 ? 1 : Math.pow(1.4, openedCrystals);
    STATE.minerState.totalWin = bet * STATE.minerState.currentMultiplier;
}

function getNextWin() {
    const { bet, openedCrystals } = STATE.minerState;
    return bet * Math.pow(1.4, openedCrystals + 1);
}

function updateMinerUI() {
    if (!UI.minerNextWin) return;
    if (STATE.minerState.isActive) {
        UI.minerNextWin.textContent = getNextWin().toFixed(2);
        UI.minerTotalWin.textContent = STATE.minerState.openedCrystals > 0 ? STATE.minerState.totalWin.toFixed(2) : '0';
    } else {
        UI.minerTotalWin.textContent = '0';
        UI.minerNextWin.textContent = '0';
    }
}

function endMinerGame(isWin) {
    STATE.minerState.isActive = false;
    if (isWin) {
        const winAmount = STATE.minerState.totalWin;
        showNotification(`Выигрыш ${winAmount.toFixed(2)} ⭐ зачислен!`);
        STATE.userBalance += winAmount;
        updateBalanceDisplay(STATE.userBalance);
    } else {
        showNotification("Вы проиграли! Ставка сгорела.");
    }

    // Показываем все бомбы в конце игры
    STATE.minerState.grid.forEach(cell => { if (cell.isBomb) cell.isOpened = true; });
    renderMinerGrid(false);

    setTimeout(resetMinerGame, 2500);
}

function cashoutMiner() {
    if (!STATE.minerState.isActive || STATE.minerState.openedCrystals === 0) return;
    endMinerGame(true);
}
