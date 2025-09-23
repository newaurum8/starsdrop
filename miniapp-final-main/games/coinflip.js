// games/coinflip.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';

/**
 * Инициализирует обработчики событий для игры "Орел и Решка".
 */
export function initCoinflip() {
    if (UI.coinflipHeadsBtn) {
        UI.coinflipHeadsBtn.addEventListener('click', () => handleCoinflip('heads'));
    }
    if (UI.coinflipTailsBtn) {
        UI.coinflipTailsBtn.addEventListener('click', () => handleCoinflip('tails'));
    }
}

/**
 * Обрабатывает один раунд игры.
 * @param {string} playerChoice - Выбор игрока ('heads' или 'tails').
 */
function handleCoinflip(playerChoice) {
    if (!UI.coin || STATE.coinflipState.isFlipping) return;

    const bet = parseInt(UI.coinflipBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) {
        return showNotification("Некорректная ставка");
    }
    if (STATE.userBalance < bet) {
        return showNotification("Недостаточно средств");
    }

    STATE.coinflipState.isFlipping = true;
    UI.coinflipResult.textContent = '';
    STATE.userBalance -= bet;
    updateBalanceDisplay(STATE.userBalance);

    const result = Math.random() < 0.5 ? 'heads' : 'tails';

    // Обработчик завершения анимации
    UI.coin.addEventListener('transitionend', () => {
        if (playerChoice === result) {
            STATE.userBalance += bet * 2;
            UI.coinflipResult.textContent = `Вы выиграли ${bet * 1} ⭐!`;
            showNotification(`Победа!`);
        } else {
            UI.coinflipResult.textContent = `Вы проиграли ${bet} ⭐.`;
            showNotification(`Проигрыш!`);
        }
        updateBalanceDisplay(STATE.userBalance);
        STATE.coinflipState.isFlipping = false;
        
        // Сбрасываем стили для следующей анимации
        UI.coin.style.transition = 'none';
        UI.coin.style.transform = result === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)';
    }, { once: true });

    // Запускаем анимацию
    UI.coin.style.transition = 'transform 1s cubic-bezier(0.5, 1.3, 0.5, 1.3)';
    const currentRotation = UI.coin.style.transform.includes('180') ? 180 : 0;
    const fullSpins = 5 * 360;
    UI.coin.style.transform = `rotateY(${currentRotation + fullSpins + (result === 'tails' ? 180 : 0)}deg)`;
}
