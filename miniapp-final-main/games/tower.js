// games/tower.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';

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
    if (STATE.towerState.nextLevelTimeout) {
        clearTimeout(STATE.towerState.nextLevelTimeout);
    }

    Object.assign(STATE.towerState, {
        isActive: false,
        isCashingOut: false,
        currentLevel: 0,
        nextLevelTimeout: null
    });

    UI.towerGameBoard.innerHTML = '';
    UI.towerInitialControls.classList.remove('hidden');
    UI.towerCashoutControls.classList.add('hidden');
    UI.towerBetInput.disabled = false;
    UI.towerMaxWinDisplay.textContent = 'Можливий виграш: 0 ⭐';
}

function startTowerGame() {
    const bet = parseInt(UI.towerBetInput.value, 10);
    if (isNaN(bet) || bet < 15) return showNotification("Минимальная ставка 15 ⭐");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.userBalance -= bet;
    updateBalanceDisplay(STATE.userBalance);
    
    Object.assign(STATE.towerState, {
        isActive: true,
        bet: bet,
        currentLevel: 0,
        grid: Array.from({ length: STATE.towerState.levels }, () => Math.floor(Math.random() * 2)),
        payouts: STATE.towerState.multipliers.map(m => Math.round(bet * m))
    });

    UI.towerInitialControls.classList.add('hidden');
    UI.towerCashoutControls.classList.remove('hidden');
    UI.towerCashoutBtn.disabled = true;
    UI.towerCashoutBtn.textContent = `Забрать 0 ⭐`;

    const maxWin = STATE.towerState.payouts[STATE.towerState.payouts.length - 1];
    UI.towerMaxWinDisplay.textContent = `Можливий виграш: ${maxWin.toLocaleString('ru-RU')} ⭐`;

    renderTower();
}

function renderTower() {
    if (!UI.towerGameBoard) return;
    UI.towerGameBoard.innerHTML = '';
    const { isActive, currentLevel, levels, payouts, grid } = STATE.towerState;

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

            // Показываем прошлые удачные ходы
            if (i < currentLevel) {
                const bombCol = grid[i];
                if (j !== bombCol) {
                    cell.classList.add('safe');
                    cell.innerHTML = `<img src="images/diamond.png" alt="Win">`;
                } else {
                    cell.style.opacity = "0.5"; // Скрываем бомбу на пройденных уровнях
                }
            }
            rowEl.appendChild(cell);
        }
        UI.towerGameBoard.appendChild(rowEl);
    }
}

function handleTowerCellClick(row, col) {
    if (!STATE.towerState.isActive || STATE.towerState.isCashingOut || row !== STATE.towerState.currentLevel) return;
    
    STATE.towerState.isActive = false; // Блокируем дальнейшие клики на время анимации
    const bombCol = STATE.towerState.grid[row];
    const cells = UI.towerGameBoard.children[row].querySelectorAll('.tower-cell');

    cells.forEach((cell, cellIndex) => {
        cell.classList.add(cellIndex === bombCol ? 'danger' : 'safe');
        cell.innerHTML = `<img src="images/${cellIndex === bombCol ? 'bomb' : 'diamond'}.png" alt="">`;
    });
    
    UI.towerGameBoard.children[row].classList.remove('active');

    if (col === bombCol) {
        UI.towerCashoutBtn.disabled = true;
        setTimeout(() => endTowerGame(false), 1200);
    } else {
        STATE.towerState.currentLevel++;
        const cashoutAmount = STATE.towerState.payouts[STATE.towerState.currentLevel - 1];
        UI.towerCashoutBtn.textContent = `Забрать ${cashoutAmount.toLocaleString('ru-RU')} ⭐`;
        UI.towerCashoutBtn.disabled = false;

        if (STATE.towerState.currentLevel === STATE.towerState.levels) {
            setTimeout(() => endTowerGame(true), 1200); // Победа на последнем уровне
        } else {
            STATE.towerState.nextLevelTimeout = setTimeout(() => {
                STATE.towerState.isActive = true;
                renderTower(); // Перерисовываем для активации следующего ряда
            }, 800);
        }
    }
}

function endTowerGame(isWin) {
    if (STATE.towerState.nextLevelTimeout) clearTimeout(STATE.towerState.nextLevelTimeout);
    
    STATE.towerState.isActive = false;
    UI.towerCashoutBtn.disabled = true;

    if (isWin && STATE.towerState.currentLevel > 0) {
        const winAmount = STATE.towerState.payouts[STATE.towerState.currentLevel - 1];
        STATE.userBalance += winAmount;
        updateBalanceDisplay(STATE.userBalance);
        showNotification(`Выигрыш ${winAmount.toLocaleString('ru-RU')} ⭐ зачислен!`);
    } else {
        showNotification("Вы проиграли! Ставка сгорела.");
        // Показываем оставшиеся бомбы
        for (let i = STATE.towerState.currentLevel; i < STATE.towerState.levels; i++) {
            const rowEl = UI.towerGameBoard.children[i];
            if (rowEl) {
                const bombCell = rowEl.querySelector(`.tower-cell[data-col="${STATE.towerState.grid[i]}"]`);
                if (bombCell && !bombCell.classList.contains('safe') && !bombCell.classList.contains('danger')) {
                     bombCell.classList.add('danger');
                     bombCell.innerHTML = `<img src="images/bomb.png" alt="Lose">`;
                }
            }
        }
    }
    
    setTimeout(resetTowerGame, 2500);
}

function cashoutTower() {
    if (STATE.towerState.currentLevel === 0 || STATE.towerState.isCashingOut || STATE.towerState.isActive) return;
    if (STATE.towerState.nextLevelTimeout) clearTimeout(STATE.towerState.nextLevelTimeout);

    STATE.towerState.isCashingOut = true;
    STATE.towerState.isActive = false;
    UI.towerCashoutBtn.disabled = true;
    
    endTowerGame(true);
}
