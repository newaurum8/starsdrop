// games/rps.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';

/**
 * Инициализирует игру "Камень, Ножницы, Бумага".
 */
export function initRps() {
    if (UI.rpsButtons) {
        UI.rpsButtons.forEach(button => {
            button.addEventListener('click', () => handleRps(button.dataset.choice));
        });
    }
}

function handleRps(playerChoice) {
    if (!UI.rpsComputerChoice || STATE.rpsState.isPlaying) return;

    const bet = parseInt(UI.rpsBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.rpsState.isPlaying = true;
    UI.rpsButtons.forEach(button => button.disabled = true);
    UI.rpsPlayerChoice.textContent = STATE.rpsState.choiceMap[playerChoice];
    UI.rpsResultMessage.textContent = '';

    // Вычитаем ставку до результата
    STATE.userBalance -= bet;
    updateBalanceDisplay(STATE.userBalance);

    const computerChoice = STATE.rpsState.choices[Math.floor(Math.random() * 3)];
    const reelLength = 60, winnerIndex = 50;
    const reel = Array.from({ length: reelLength }, (_, i) => {
        const symbolKey = i === winnerIndex ? computerChoice : STATE.rpsState.choices[Math.floor(Math.random() * 3)];
        return STATE.rpsState.choiceMap[symbolKey];
    });

    UI.rpsComputerChoice.innerHTML = reel.map(symbol => `<div class="rps-roulette-item">${symbol}</div>`).join('');
    
    // Сброс и запуск анимации
    UI.rpsComputerChoice.style.transition = 'none';
    UI.rpsComputerChoice.style.left = '0px';
    UI.rpsComputerChoice.getBoundingClientRect(); // Принудительный reflow

    const itemWidth = 130; // Ширина + отступы
    const targetPosition = (winnerIndex * itemWidth) + (itemWidth / 2);
    UI.rpsComputerChoice.style.transition = 'left 6s cubic-bezier(0.2, 0.8, 0.2, 1)';
    UI.rpsComputerChoice.style.left = `calc(50% - ${targetPosition}px)`;

    UI.rpsComputerChoice.addEventListener('transitionend', () => {
        let resultMessage = '';
        if (playerChoice === computerChoice) {
            resultMessage = "Ничья! Ставка возвращена.";
            STATE.userBalance += bet; // Возвращаем ставку
            showNotification(`Ничья!`);
        } else if (
            (playerChoice === 'rock' && computerChoice === 'scissors') ||
            (playerChoice === 'paper' && computerChoice === 'rock') ||
            (playerChoice === 'scissors' && computerChoice === 'paper')
        ) {
            resultMessage = `Вы выиграли ${bet} ⭐!`;
            STATE.userBalance += bet * 2; // Возвращаем ставку + выигрыш
            showNotification(`Победа!`);
        } else {
            resultMessage = `Вы проиграли ${bet} ⭐.`;
            // Ставка уже вычтена, ничего не делаем
            showNotification(`Проигрыш!`);
        }
        
        UI.rpsResultMessage.textContent = resultMessage;
        updateBalanceDisplay(STATE.userBalance);

        setTimeout(() => {
            STATE.rpsState.isPlaying = false;
            UI.rpsButtons.forEach(button => button.disabled = false);
        }, 1500);
    }, { once: true });
}
