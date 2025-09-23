// ui.js

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
