// games/slots.js

import { STATE } from '../state.js';
import { UI, showNotification, updateBalanceDisplay } from '../ui.js';
import * as api from '../api.js';

export function initSlots() {
    if (UI.slotsSpinBtn) {
        UI.slotsSpinBtn.addEventListener('click', handleSlotsSpin);
    }
}

async function handleSlotsSpin() {
    if (STATE.slotsState.isSpinning) return;

    const bet = parseInt(UI.slotsBetInput.value, 10);
    if (isNaN(bet) || bet <= 0) return showNotification("Некорректная ставка");
    if (STATE.userBalance < bet) return showNotification("Недостаточно средств");

    STATE.slotsState.isSpinning = true;
    UI.slotsSpinBtn.disabled = true;
    UI.slotsPayline.classList.remove('visible');

    try {
        const gameResult = await api.playGameSlots(bet);
        
        const tracks = [UI.slotsTrack1, UI.slotsTrack2, UI.slotsTrack3];
        let reelsFinished = 0;
        
        tracks.forEach((track, index) => {
            const reelLength = 30;
            const finalSymbol = STATE.slotsState.symbols.find(s => s.name === gameResult.reels[index]);
            
            track.innerHTML = Array.from({ length: reelLength }, (_, i) => {
                const symbol = i === reelLength - 2 ? finalSymbol : STATE.slotsState.symbols[Math.floor(Math.random() * STATE.slotsState.symbols.length)];
                return `<div class="slots-item"><img src="${symbol.imageSrc}" alt="${symbol.name}"></div>`;
            }).join('');

            track.style.transition = 'none';
            track.style.top = '0px';
            track.offsetHeight; // Reflow

            const itemHeight = 90;
            const targetPosition = (reelLength - 2) * itemHeight;
            
            track.style.transition = `top ${2.5 + index * 0.3}s cubic-bezier(0.25, 1, 0.5, 1)`;
            track.style.top = `-${targetPosition}px`;
            
            track.addEventListener('transitionend', () => {
                reelsFinished++;
                if (reelsFinished === tracks.length) {
                    processSlotsResult(gameResult);
                }
            }, { once: true });
        });

    } catch (error) {
        console.error("Ошибка в игре Slots:", error);
        STATE.slotsState.isSpinning = false;
        UI.slotsSpinBtn.disabled = false;
    }
}

function processSlotsResult(gameResult) {
    STATE.userBalance = gameResult.newBalance;
    updateBalanceDisplay(STATE.userBalance);
    
    let message = "Попробуйте еще раз!";
    if (gameResult.winAmount > 0) {
        UI.slotsPayline.classList.add('visible');
        const multiplier = gameResult.winAmount / parseInt(UI.slotsBetInput.value, 10);
        message = `Отлично! Выигрыш x${multiplier}!`;
        showNotification(`${message} (+${gameResult.winAmount.toFixed(0)} ⭐)`);
    } else {
        showNotification(message);
    }

    STATE.slotsState.isSpinning = false;
    UI.slotsSpinBtn.disabled = false;
}
