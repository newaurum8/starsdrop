// games/slots.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';

/**
 * Инициализирует игру "Слоты".
 */
export function initSlots() {
    if (UI.slotsSpinBtn) {
        UI.slotsSpinBtn.addEventListener('click', handleSlotsSpin);
    }
}

function handleSlotsSpin() {
    if (STATE.slotsState.isSpinning) return;

    const bet = parseInt(UI.slotsBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.slotsState.isSpinning = true;
    UI.slotsSpinBtn.disabled = true;
    STATE.userBalance -= bet;
    updateBalanceDisplay(STATE.userBalance);
    UI.slotsPayline.classList.remove('visible');

    const results = [];
    const tracks = [UI.slotsTrack1, UI.slotsTrack2, UI.slotsTrack3];
    let reelsFinished = 0;

    tracks.forEach((track, index) => {
        const symbols = STATE.slotsState.symbols;
        const reelLength = 30;
        const finalSymbol = symbols[Math.floor(Math.random() * symbols.length)];
        results[index] = finalSymbol;

        // Создаем барабан с конечным символом на предпоследней позиции
        track.innerHTML = Array.from({ length: reelLength }, (_, i) => {
            const symbol = i === reelLength - 2 ? finalSymbol : symbols[Math.floor(Math.random() * symbols.length)];
            return `<div class="slots-item"><img src="${symbol.imageSrc}" alt="${symbol.name}"></div>`;
        }).join('');

        // Сброс и запуск анимации
        track.style.transition = 'none';
        track.style.top = '0px';
        track.offsetHeight; // Принудительный reflow

        const itemHeight = 90; // Высота элемента + margin
        const targetPosition = (reelLength - 2) * itemHeight;
        
        track.style.transition = `top ${2.5 + index * 0.3}s cubic-bezier(0.25, 1, 0.5, 1)`;
        track.style.top = `-${targetPosition}px`;
        
        track.addEventListener('transitionend', () => {
            reelsFinished++;
            if (reelsFinished === tracks.length) {
                processSlotsResult(results, bet);
            }
        }, { once: true });
    });
}

function processSlotsResult(results, bet) {
    let win = 0;
    let message = "Попробуйте еще раз!";
    const [r1, r2, r3] = results.map(r => r.name);

    // Логика выигрышей (можно усложнить)
    if (r1 === r2 && r2 === r3) {
        win = bet * 5; // x5 за три в ряд
        message = `Джекпот! Выигрыш x5!`;
    } else if (r1 === r2 || r2 === r3) {
        win = bet * 2; // x2 за два в ряд слева или справа
        message = `Отлично! Выигрыш x2!`;
    }

    if (win > 0) {
        STATE.userBalance += win;
        updateBalanceDisplay(STATE.userBalance);
        UI.slotsPayline.classList.add('visible');
        showNotification(`${message} (+${win.toFixed(0)} ⭐)`);
    } else {
        showNotification(message);
    }

    STATE.slotsState.isSpinning = false;
    UI.slotsSpinBtn.disabled = false;
}
