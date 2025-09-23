// games/tower.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';
import * as api from '../api.js';

/**
 * Инициализирует игру "Башня".
 */
export function initTower() {
    if (UI.towerStartBtn) UI.towerStartBtn.addEventListener('click', startTowerGame);
    if (UI.towerCashoutBtn) UI.towerCashoutBtn.addEventListener('click', cashoutTower);
}

/**
 * Сбрасывает игру в начальное состояние.
 */
export function resetTowerGame() {
    if (!UI.towerGameBoard) return;

    Object.assign(STATE.towerState, {
        isActive: false,
        sessionId: null,
        currentLevel: 0,
        payouts: []
    });

    UI.towerGameBoard.innerHTML = '';
    UI.towerInitialControls.classList.remove('hidden');
    UI.towerCashoutControls.classList.add('hidden');
    UI.towerBetInput.disabled = false;
    UI.towerMaxWinDisplay.textContent = 'Можливий виграш: 0 ⭐';
}

async function startTowerGame() {
    const bet = parseInt(UI.towerBetInput.value, 10);
    const minBet = 15;
    if (isNaN(bet) || bet < minBet) return showNotification(`Минимальная ставка ${minBet} ⭐`);
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    UI.towerStartBtn.disabled = true;

    try {
        const result = await api.startTowerGame(bet);
        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);

        Object.assign(STATE.towerState, {
            isActive: true,
            sessionId: result.sessionId,
            payouts: result.payouts,
            currentLevel: 0
        });

        UI.towerInitialControls.classList.add('hidden');
        UI.towerCashoutControls.classList.remove('hidden');
        UI.towerCashoutBtn.disabled = true;
        UI.towerCashoutBtn.textContent = `Забрать 0 ⭐`;

        const maxWin = result.payouts[result.payouts.length - 1];
        UI.towerMaxWinDisplay.textContent = `Можливий виграш: ${maxWin.toLocaleString('ru-RU')} ⭐`;

        renderTower();
    } catch (error) {
        console.error("Ошибка при старте игры 'Башня':", error);
    } finally {
        UI.towerStartBtn.disabled = false;
    }
}

function renderTower() {
    if (!UI.towerGameBoard) return;
    UI.towerGameBoard.innerHTML = '';
    const { isActive, currentLevel, levels, payouts } = STATE.towerState;

    for (let i = 0; i < levels; i++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'tower-row' + (isActive && i === currentLevel ? ' active' : '');
        const payout = payouts[i] || 0;

        for (let j = 0; j < 2; j++) {
            const cell = document.createElement('div');
            cell.className = 'tower-cell';
            cell.dataset.col = j;
            cell.innerHTML = `+${payout.toLocaleString('ru-RU')}`;
            if (isActive && i === currentLevel) {
                cell.addEventListener('click', () => handleTowerCellClick(i, j), { once: true });
            }
            rowEl.appendChild(cell);
        }
        UI.towerGameBoard.appendChild(rowEl);
    }
}

async function handleTowerCellClick(row, col) {
    if (!STATE.towerState.isActive || row !== STATE.towerState.currentLevel) return;
    
    STATE.towerState.isActive = false; // Блокируем дальнейшие клики на время запроса

    try {
        const result = await api.selectTowerCell(STATE.towerState.sessionId, col);
        
        const cells = UI.towerGameBoard.children[row].querySelectorAll('.tower-cell');
        cells.forEach((cell, cellIndex) => {
            cell.classList.add(cellIndex === result.bombCol ? 'danger' : 'safe');
            cell.innerHTML = `<img src="images/${cellIndex === result.bombCol ? 'bomb' : 'diamond'}.png" alt="">`;
        });
        UI.towerGameBoard.children[row].classList.remove('active');

        if (result.isBomb) {
            UI.towerCashoutBtn.disabled = true;
            showNotification("Вы проиграли! Ставка сгорела.");
            setTimeout(resetTowerGame, 2500);
        } else {
            STATE.towerState.currentLevel++;
            UI.towerCashoutBtn.textContent = `Забрать ${result.cashoutAmount.toLocaleString('ru-RU')} ⭐`;
            UI.towerCashoutBtn.disabled = false;

            if (result.isWin) {
                STATE.userBalance = result.newBalance;
                updateBalanceDisplay(STATE.userBalance);
                showNotification(`Выигрыш ${result.winAmount.toLocaleString('ru-RU')} ⭐ зачислен!`);
                setTimeout(resetTowerGame, 2500);
            } else {
                setTimeout(() => {
                    STATE.towerState.isActive = true;
                    // Перерисовываем, чтобы показать прошлый ход и активировать следующий ряд
                    renderTowerWithHistory(); 
                }, 800);
            }
        }
    } catch (error) {
        console.error("Ошибка при выборе ячейки в Башне:", error);
        STATE.towerState.isActive = true; // Разблокируем в случае ошибки
    }
}

function renderTowerWithHistory() {
    if (!UI.towerGameBoard) return;
    const { currentLevel, levels, payouts } = STATE.towerState;
    
    // Деактивируем все ряды
    for (let i = 0; i < levels; i++) {
        UI.towerGameBoard.children[i].classList.remove('active');
    }
    
    // Активируем текущий ряд
    if (UI.towerGameBoard.children[currentLevel]) {
        UI.towerGameBoard.children[currentLevel].classList.add('active');
        // Заново навешиваем обработчики на новый активный ряд
        const cells = UI.towerGameBoard.children[currentLevel].querySelectorAll('.tower-cell');
        cells.forEach((cell, colIndex) => {
             cell.addEventListener('click', () => handleTowerCellClick(currentLevel, colIndex), { once: true });
        });
    }
}


async function cashoutTower() {
    if (STATE.towerState.isCashingOut || !STATE.towerState.sessionId) return;
    
    STATE.towerState.isCashingOut = true;
    STATE.towerState.isActive = false;
    UI.towerCashoutBtn.disabled = true;

    try {
        const result = await api.cashoutTower(STATE.towerState.sessionId);
        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);
        showNotification(`Выигрыш ${result.winAmount.toLocaleString('ru-RU')} ⭐ зачислен!`);
        setTimeout(resetTowerGame, 2500);
    } catch(error) {
        console.error("Ошибка при кэшауте в Башне:", error);
        STATE.towerState.isCashingOut = false;
        STATE.towerState.isActive = true;
        UI.towerCashoutBtn.disabled = false;
    }
}
