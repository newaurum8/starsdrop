// games/rps.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';
import * as api from '../api.js';

export function initRps() {
    if (UI.rpsButtons) {
        UI.rpsButtons.forEach(button => {
            button.addEventListener('click', () => handleRps(button.dataset.choice));
        });
    }
}

async function handleRps(playerChoice) {
    if (!UI.rpsComputerChoice || STATE.rpsState.isPlaying) return;

    const bet = parseInt(UI.rpsBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.rpsState.isPlaying = true;
    UI.rpsButtons.forEach(button => button.disabled = true);
    UI.rpsPlayerChoice.textContent = STATE.rpsState.choiceMap[playerChoice];
    UI.rpsResultMessage.textContent = '';

    try {
        const gameResult = await api.playGameRps(bet, playerChoice);

        // Анимация рулетки
        const reelLength = 60, winnerIndex = 50;
        const reel = Array.from({ length: reelLength }, (_, i) => {
            const symbolKey = i === winnerIndex ? gameResult.computerChoice : STATE.rpsState.choices[Math.floor(Math.random() * 3)];
            return STATE.rpsState.choiceMap[symbolKey];
        });

        UI.rpsComputerChoice.innerHTML = reel.map(symbol => `<div class="rps-roulette-item">${symbol}</div>`).join('');
        
        UI.rpsComputerChoice.style.transition = 'none';
        UI.rpsComputerChoice.style.left = '0px';
        UI.rpsComputerChoice.getBoundingClientRect(); // Reflow

        const itemWidth = 130;
        const targetPosition = (winnerIndex * itemWidth) + (itemWidth / 2);
        UI.rpsComputerChoice.style.transition = 'left 6s cubic-bezier(0.2, 0.8, 0.2, 1)';
        UI.rpsComputerChoice.style.left = `calc(50% - ${targetPosition}px)`;

        // Обработка после анимации
        UI.rpsComputerChoice.addEventListener('transitionend', () => {
            STATE.userBalance = gameResult.newBalance;
            updateBalanceDisplay(STATE.userBalance);

            let resultMessage = '';
            if (gameResult.winAmount === bet) {
                resultMessage = "Ничья! Ставка возвращена.";
                showNotification(`Ничья!`);
            } else if (gameResult.winAmount > bet) {
                resultMessage = `Вы выиграли ${bet} ⭐!`;
                showNotification(`Победа!`);
            } else {
                resultMessage = `Вы проиграли ${bet} ⭐.`;
                showNotification(`Проигрыш!`);
            }
            
            UI.rpsResultMessage.textContent = resultMessage;

            setTimeout(() => {
                STATE.rpsState.isPlaying = false;
                UI.rpsButtons.forEach(button => button.disabled = false);
            }, 1500);
        }, { once: true });

    } catch (error) {
        console.error("Ошибка в игре RPS:", error);
        STATE.rpsState.isPlaying = false;
        UI.rpsButtons.forEach(button => button.disabled = false);
    }
}
