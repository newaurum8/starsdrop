// ui.js

import { STATE } from './state.js'; // Убедимся, что STATE импортирован для использования в функциях

export const UI = {};

export function cacheDOMElements() {
    const selectors = {
        notificationToast: '#notification-toast', userBalanceElement: '#user-balance',
        views: '.view', navButtons: '.nav-btn', caseView: '#case-view', spinView: '#spin-view',
        rouletteTrack: '#roulette', spinnerContainer: '#spinner-container',
        multiSpinnerContainer: '#multi-spinner-container', caseImageBtn: '#case-image-btn',
        modalOverlay: '#modal-overlay', preOpenModal: '#pre-open-modal',
        priceCheckMessage: '#price-check-message', quantitySelector: '#quantity-selector',
        fastSpinToggle: '#fast-spin-toggle', caseContentsPreview: '#case-contents-preview',
        startSpinBtn: '#start-spin-btn', resultModal: '#result-modal',
        inventoryContent: '#inventory-content', historyContent: '#history-content',
        profileTabs: '.profile-tabs:not(.upgrade-picker-container) .profile-tab-btn',
        profileContents: '.profile-tab-content', profilePhoto: '#profile-photo',
        profileName: '#profile-name', profileId: '#profile-id',
        inviteFriendBtn: '#invite-friend-btn', copyLinkBtn: '#copy-link-btn',
        contestCard: '#contests-view .contest-card', contestTimer: '#contest-timer',
        buyTicketBtn: '#buy-ticket-btn', ticketQuantityInput: '#ticket-quantity-input',
        ticketQuantityPlus: '#ticket-quantity-plus', ticketQuantityMinus: '#ticket-quantity-minus',
        userTicketsDisplay: '#user-tickets-display', contestItemImage: '.contest-item__image',
        contestItemName: '.contest-item__name', contestParticipants: '#contest-participants',
        upgradeWheel: '#upgrade-wheel', upgradePointer: '#upgrade-pointer',
        upgradeChanceDisplay: '#upgrade-chance-display', upgradeMultiplierDisplay: '#upgrade-multiplier-display',
        yourItemSlot: '#your-item-slot', desiredItemSlot: '#desired-item-slot',
        performUpgradeBtn: '#perform-upgrade-btn', pickerTabs: '.upgrade-picker-container .profile-tab-btn',
        itemPickerContent: '#item-picker-content', gameMenuBtns: '.game-menu-btn',
        minerGrid: '#miner-grid', minerStartBtn: '#miner-start-btn',
        minerCashoutBtn: '#miner-cashout-btn', minerBetInput: '#miner-bet-input',
        minerNextWin: '#miner-next-win', minerTotalWin: '#miner-total-win',
        minerInfoWrapper: '.miner-info-wrapper', coin: '#coin',
        coinflipResult: '#coinflip-result-message', coinflipBetInput: '#coinflip-bet-input',
        coinflipHeadsBtn: '#coinflip-heads-btn', coinflipTailsBtn: '#coinflip-tails-btn',
        rpsPlayerChoice: '#rps-player-choice', rpsComputerChoice: '#rps-computer-choice',
        rpsResultMessage: '#rps-result-message', rpsBetInput: '#rps-bet-input',
        rpsButtons: '.rps-buttons .primary-button', slotsTrack1: '#slots-track-1',
        slotsTrack2: '#slots-track-2', slotsTrack3: '#slots-track-3',
        slotsSpinBtn: '#slots-spin-btn', slotsBetInput: '#slots-bet-input',
        slotsPayline: '.slots-payline', towerGameBoard: '#tower-game-board',
        towerBetInput: '#tower-bet-input', towerMaxWinDisplay: '#tower-max-win-display',
        towerInitialControls: '#tower-initial-controls', towerCashoutControls: '#tower-cashout-controls',
        towerStartBtn: '#tower-start-btn', towerCashoutBtn: '#tower-cashout-btn'
    };

    for (const key in selectors) {
        UI[key] = document.querySelector(selectors[key]);
    }
    // Используем querySelectorAll для коллекций
    UI.views = document.querySelectorAll('.view');
    UI.navButtons = document.querySelectorAll('.nav-btn');
    UI.profileTabs = document.querySelectorAll('.profile-tabs:not(.upgrade-picker-container) .profile-tab-btn');
    UI.profileContents = document.querySelectorAll('.profile-tab-content');
    UI.gameMenuBtns = document.querySelectorAll('.game-menu-btn');
    UI.rpsButtons = document.querySelectorAll('.rps-buttons .primary-button');
    UI.pickerTabs = document.querySelectorAll('.upgrade-picker-container .profile-tab-btn');
}


export function showNotification(message) {
    if (!UI.notificationToast) return;
    UI.notificationToast.textContent = message;
    UI.notificationToast.classList.add('visible');
    setTimeout(() => UI.notificationToast.classList.remove('visible'), 3000);
}

export function updateBalanceDisplay(balance) {
    if (UI.userBalanceElement) UI.userBalanceElement.innerText = Math.round(balance).toLocaleString('ru-RU');
}

export function showModal(modal) {
    if (modal && UI.modalOverlay) {
        modal.classList.add('visible');
        UI.modalOverlay.classList.add('visible');
    }
}

export function hideModal(modal) {
    if (modal && UI.modalOverlay) {
        modal.classList.remove('visible');
        if (!document.querySelector('.modal.visible')) {
            UI.modalOverlay.classList.remove('visible');
        }
    }
}

export function switchView(viewId, onSwitch) {
    UI.views.forEach(view => view.classList.remove('active'));
    UI.navButtons.forEach(btn => btn.classList.remove('active'));

    const viewToShow = document.getElementById(viewId);
    let btnToActivate;

    if (viewToShow) {
        viewToShow.classList.add('active');
        if (['upgrade-view', 'miner-view', 'coinflip-view', 'rps-view', 'slots-view', 'tower-view'].includes(viewId)) {
            btnToActivate = document.querySelector('.nav-btn[data-view="games-menu-view"]');
        } else {
            btnToActivate = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        }
    } else {
        console.error(`Экран с ID "${viewId}" не найден.`);
        document.getElementById('game-view').classList.add('active');
        btnToActivate = document.querySelector('.nav-btn[data-view="game-view"]');
    }

    if (btnToActivate) btnToActivate.classList.add('active');

    // Логика кнопки "Назад" в Telegram
    const tg = window.Telegram?.WebApp;
    if (tg) {
        if (tg.BackButton.isVisible) tg.BackButton.offClick();

        if (['upgrade-view', 'miner-view', 'coinflip-view', 'rps-view', 'slots-view', 'tower-view'].includes(viewId)) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => switchView('games-menu-view', onSwitch));
        } else if (['games-menu-view', 'contests-view', 'friends-view', 'profile-view'].includes(viewId)) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => switchView('game-view', onSwitch));
        } else {
            tg.BackButton.hide();
        }
    }
    
    // Вызов колбэка после смены вида
    if (onSwitch) {
        onSwitch(viewId);
    }
}

export function applyGameSettings(gameSettings) {
    if (!UI.gameMenuBtns) return;
    const gameButtonsVisibility = {
        'upgrade-view': gameSettings.upgrade_enabled,
        'miner-view': gameSettings.miner_enabled,
        'coinflip-view': gameSettings.coinflip_enabled,
        'rps-view': gameSettings.rps_enabled,
        'slots-view': gameSettings.slots_enabled,
        'tower-view': gameSettings.tower_enabled
    };
    UI.gameMenuBtns.forEach(btn => {
        const view = btn.dataset.view;
        if (gameButtonsVisibility.hasOwnProperty(view)) {
            btn.style.display = (gameButtonsVisibility[view] === 'false' ? 'none' : '');
        }
    });
}

// --- НИЖЕ ИДУТ ФУНКЦИИ, КОТОРЫЕ ОТСУТСТВОВАЛИ В ВАШЕМ ФАЙЛЕ ---

export function renderInventory(inventory, sellCallback) {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    // Примерная реализация:
    if (!UI.inventoryContent) return;
    UI.inventoryContent.innerHTML = '';
    if (inventory.length === 0) {
        UI.inventoryContent.innerHTML = '<p class="inventory-empty-msg">Ваш инвентарь пуст.</p>';
        return;
    }
    inventory.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        itemEl.innerHTML = `
            <img src="${item.imageSrc}" alt="${item.name}">
            <div class="inventory-item-name">${item.name}</div>
            <div class="inventory-item-price">⭐ ${item.value.toLocaleString('ru-RU')}</div>
            <button class="inventory-sell-btn" data-uniqueid="${item.uniqueId}">Продать</button>
        `;
        itemEl.querySelector('.inventory-sell-btn').addEventListener('click', (e) => {
            const uniqueId = e.target.dataset.uniqueid;
            sellCallback(uniqueId);
        });
        UI.inventoryContent.appendChild(itemEl);
    });
}

export function renderHistory(history) {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    // Примерная реализация:
    if (!UI.historyContent) return;
    UI.historyContent.innerHTML = '';
     if (history.length === 0) {
        UI.historyContent.innerHTML = '<p class="inventory-empty-msg">История пуста.</p>';
        return;
    }
    history.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';
        const date = new Date(item.date).toLocaleString();
        itemEl.innerHTML = `
            <img src="${item.imageSrc}" alt="${item.name}">
            <div class="history-item-info">
                <span class="history-item-name">${item.name}</span>
                <span class="history-item-date">${date}</span>
            </div>
            <span class="history-item-price">⭐ ${item.value.toLocaleString('ru-RU')}</span>
        `;
        UI.historyContent.appendChild(itemEl);
    });
}

export function populateCasePreview(items) {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    if (!UI.caseContentsPreview) return;
    UI.caseContentsPreview.innerHTML = items.map(item => `
        <div class="preview-item">
            <img src="${item.imageSrc}" alt="${item.name}">
        </div>
    `).join('');
}

export function updateContestUI() {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    if (!UI.contestCard || !STATE.contest) return;
    UI.contestItemImage.src = STATE.contest.itemImageSrc;
    UI.contestItemName.textContent = STATE.contest.itemName;
    UI.contestParticipants.textContent = `👥 ${STATE.contest.participants}`;
    UI.userTicketsDisplay.textContent = STATE.contest.userTickets;
    UI.ticketQuantityInput.value = STATE.ticketQuantity;
    UI.buyTicketBtn.textContent = `Купить (${STATE.contest.ticket_price * STATE.ticketQuantity} ⭐)`;
}

export function updateTimer() {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    if (!UI.contestTimer || !STATE.contest) {
         if(UI.contestTimer) UI.contestTimer.textContent = '00:00:00';
         return;
    }
    const remaining = STATE.contest.end_time - Date.now();
    if (remaining <= 0) {
        UI.contestTimer.textContent = 'Завершен';
        return;
    }
    const h = String(Math.floor(remaining / 3600000)).padStart(2, '0');
    const m = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    UI.contestTimer.textContent = `${h}:${m}:${s}`;
}

export function updatePriceMessage() {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    if (!UI.priceCheckMessage) return;
    const totalCost = STATE.casePrice * STATE.openQuantity;
    UI.priceCheckMessage.textContent = `⭐ ${totalCost}`;
    if (STATE.userBalance < totalCost) {
        UI.priceCheckMessage.classList.add('error');
    } else {
        UI.priceCheckMessage.classList.remove('error');
    }
}

export function startHorizontalAnimation(wonItem, possibleItems, isFast, onEnd) {
    if (!UI.rouletteTrack) return;

    const reelLength = 50;
    const winnerIndex = 40; // Индекс, на котором остановится рулетка

    // Создаем ленту рулетки
    const reelItems = Array.from({ length: reelLength }, (_, i) => {
        const item = i === winnerIndex ? wonItem : possibleItems[Math.floor(Math.random() * possibleItems.length)];
        return `
            <div class="roulette-item">
                <img src="${item.imageSrc}" alt="${item.name}">
            </div>
        `;
    }).join('');
    UI.rouletteTrack.innerHTML = reelItems;

    // Сбрасываем и запускаем анимацию
    UI.rouletteTrack.style.transition = 'none';
    UI.rouletteTrack.style.left = '0px';
    UI.rouletteTrack.offsetHeight; // Вызываем reflow для применения стилей

    const itemWidth = 130; // Ширина .roulette-item + margin
    const targetPosition = (winnerIndex * itemWidth) - (UI.spinnerContainer.offsetWidth / 2) + (itemWidth / 2);
    const duration = isFast ? 1 : 7;

    UI.rouletteTrack.style.transition = `left ${duration}s cubic-bezier(0.2, 0.8, 0.2, 1)`;
    UI.rouletteTrack.style.left = `-${targetPosition}px`;

    setTimeout(onEnd, duration * 1000);
}


export function startMultiVerticalAnimation(wonItems, possibleItems, isFast, onEnd) {
    if (!UI.multiSpinnerContainer) return;

    UI.multiSpinnerContainer.innerHTML = '';
    UI.multiSpinnerContainer.classList.remove('hidden');
    UI.spinnerContainer.classList.add('hidden'); // Скрываем одиночный спиннер

    const reelLength = 30;
    const winnerIndex = 25;
    let finishedReels = 0;

    wonItems.forEach((wonItem, index) => {
        const spinner = document.createElement('div');
        spinner.className = 'vertical-spinner';
        spinner.innerHTML = '<div class="vertical-roulette-track"></div>';
        const track = spinner.querySelector('.vertical-roulette-track');

        const reelItems = Array.from({ length: reelLength }, (_, i) => {
             const item = i === winnerIndex ? wonItem : possibleItems[Math.floor(Math.random() * possibleItems.length)];
             return `<div class="vertical-roulette-item"><img src="${item.imageSrc}" alt="${item.name}"></div>`;
        }).join('');
        track.innerHTML = reelItems;

        UI.multiSpinnerContainer.appendChild(spinner);

        setTimeout(() => {
            track.style.transition = 'none';
            track.style.top = '0px';
            track.offsetHeight;

            const itemHeight = 110; // .vertical-roulette-item height + margin
            const targetPosition = (winnerIndex * itemHeight) - (spinner.offsetHeight / 2) + (itemHeight / 2);
            const duration = isFast ? 1 : 5 + index * 0.3;

            track.style.transition = `top ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`;
            track.style.top = `-${targetPosition}px`;

            track.addEventListener('transitionend', () => {
                finishedReels++;
                if (finishedReels === wonItems.length) {
                    onEnd();
                }
            }, { once: true });
        }, 100);
    });
}

export function showResultModal(wonItems, sellCallback, againCallback, closeCallback) {
    // !!! ЛОГИКА ЭТОЙ ФУНКЦИИ ОТСУТСТВОВАЛА
    if (!UI.resultModal) return;
    const totalValue = wonItems.reduce((sum, item) => sum + item.value, 0);
    UI.resultModal.innerHTML = `
        <div class="modal-content">
            <h3>Ваш выигрыш!</h3>
            <div class="result-items-container">
                ${wonItems.map(item => `
                    <div class="inventory-item">
                        <img src="${item.imageSrc}" alt="${item.name}">
                        <div class="inventory-item-name">${item.name}</div>
                        <div class="inventory-item-price">⭐ ${item.value}</div>
                    </div>
                `).join('')}
            </div>
            <p>Общая стоимость: ⭐ ${totalValue}</p>
            <div class="result-buttons">
                <button id="result-sell-all" class="secondary-button">Продать все</button>
                <button id="result-spin-again" class="primary-button">Крутить еще</button>
            </div>
             <button id="result-close" class="secondary-button" style="margin-top: 10px;">Закрыть</button>
        </div>
    `;
    UI.resultModal.querySelector('#result-sell-all').onclick = sellCallback;
    UI.resultModal.querySelector('#result-spin-again').onclick = againCallback;
    UI.resultModal.querySelector('#result-close').onclick = closeCallback;
    showModal(UI.resultModal);
}
