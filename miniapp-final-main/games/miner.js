// games/miner.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';
import * as api from '../api.js';

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
        sessionId: null,
        grid: []
    });
    
    renderMinerGrid();
    updateMinerUI();
    
    UI.minerBetInput.disabled = false;
    UI.minerStartBtn.classList.remove('hidden');
    UI.minerCashoutBtn.classList.add('hidden');
    UI.minerInfoWrapper.classList.add('hidden');
}

async function startMinerGame() {
    const bet = parseInt(UI.minerBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    UI.minerStartBtn.disabled = true;

    try {
        const result = await api.startMinerGame(bet);
        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);
        
        Object.assign(STATE.minerState, {
            isActive: true,
            sessionId: result.sessionId,
            grid: Array.from({ length: 12 }, () => ({ isOpened: false }))
        });

        renderMinerGrid(true);
        updateMinerUI();
        UI.minerBetInput.disabled = true;
        UI.minerStartBtn.classList.add('hidden');
        UI.minerCashoutBtn.classList.remove('hidden');
        UI.minerCashoutBtn.disabled = true;
        UI.minerInfoWrapper.classList.remove('hidden');

    } catch (error) {
        console.error("Ошибка при старте игры 'Минер':", error);
    } finally {
        UI.minerStartBtn.disabled = false;
    }
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

async function handleMinerCellClick(index) {
    if (!STATE.minerState.isActive) return;
    
    STATE.minerState.isActive = false; // Блокируем клики на время запроса

    try {
        const result = await api.selectMinerCell(STATE.minerState.sessionId, index);
        
        if (result.isBomb) {
            STATE.minerState.grid = result.openedGrid.map(serverCell => ({ ...serverCell, isOpened: true }));
            renderMinerGrid(false);
            showNotification("Вы проиграли! Ставка сгорела.");
            setTimeout(resetMinerGame, 2500);
        } else {
            STATE.minerState.grid[index] = { isOpened: true, isBomb: false };
            renderMinerGrid(true);
            updateMinerUI(result.nextWin, result.totalWin);
            UI.minerCashoutBtn.disabled = false;
            STATE.minerState.isActive = true; // Разблокируем для следующего хода
        }
    } catch (error) {
        console.error("Ошибка при выборе ячейки:", error);
        STATE.minerState.isActive = true; // Разблокируем в случае ошибки
    }
}

function updateMinerUI(nextWin = 0, totalWin = 0) {
    if (!UI.minerNextWin) return;
    UI.minerNextWin.textContent = nextWin.toFixed(2);
    UI.minerTotalWin.textContent = totalWin.toFixed(2);
}

async function cashoutMiner() {
    if (!STATE.minerState.isActive || !STATE.minerState.sessionId) return;
    UI.minerCashoutBtn.disabled = true;
    STATE.minerState.isActive = false;

    try {
        const result = await api.cashoutMiner(STATE.minerState.sessionId);
        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);
        showNotification(`Выигрыш ${result.winAmount.toFixed(2)} ⭐ зачислен!`);
        setTimeout(resetMinerGame, 2500);
    } catch (error) {
        console.error("Ошибка при кэшауте:", error);
        UI.minerCashoutBtn.disabled = false;
        STATE.minerState.isActive = true;
    }
}
