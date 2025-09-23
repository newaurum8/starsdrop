import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';
import * as api from '../api.js';

export function initCoinflip() {
    if (UI.coinflipHeadsBtn) UI.coinflipHeadsBtn.addEventListener('click', () => handleCoinflip('heads'));
    if (UI.coinflipTailsBtn) UI.coinflipTailsBtn.addEventListener('click', () => handleCoinflip('tails'));
}

async function handleCoinflip(playerChoice) {
    if (!UI.coin || STATE.coinflipState.isFlipping) return;

    const bet = parseInt(UI.coinflipBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.coinflipState.isFlipping = true;
    UI.coinflipResult.textContent = '';
    UI.coinflipHeadsBtn.disabled = true;
    UI.coinflipTailsBtn.disabled = true;

    try {
        const gameResult = await api.playGameCoinflip(bet, playerChoice);
        
        // Обработчик завершения анимации
        UI.coin.addEventListener('transitionend', () => {
            STATE.userBalance = gameResult.newBalance;
            updateBalanceDisplay(STATE.userBalance);
            
            if (gameResult.winAmount > 0) {
                UI.coinflipResult.textContent = `Вы выиграли ${bet} ⭐!`;
                showNotification(`Победа!`);
            } else {
                UI.coinflipResult.textContent = `Вы проиграли ${bet} ⭐.`;
                showNotification(`Проигрыш!`);
            }
            
            STATE.coinflipState.isFlipping = false;
            UI.coinflipHeadsBtn.disabled = false;
            UI.coinflipTailsBtn.disabled = false;

            UI.coin.style.transition = 'none';
            UI.coin.style.transform = gameResult.result === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)';
        }, { once: true });

        // Запускаем анимацию
        UI.coin.style.transition = 'transform 1s cubic-bezier(0.5, 1.3, 0.5, 1.3)';
        const currentRotation = UI.coin.style.transform.includes('180') ? 180 : 0;
        const fullSpins = 5 * 360;
        UI.coin.style.transform = `rotateY(${currentRotation + fullSpins + (gameResult.result === 'tails' ? 180 : 0)}deg)`;

    } catch (error) {
        console.error("Ошибка в игре Coinflip:", error);
        STATE.coinflipState.isFlipping = false;
        UI.coinflipHeadsBtn.disabled = false;
        UI.coinflipTailsBtn.disabled = false;
    }
}
