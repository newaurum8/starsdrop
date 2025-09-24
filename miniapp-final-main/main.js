import { STATE } from './state.js';
import * as api from './api.js';
import {
    UI,
    cacheDOMElements,
    showNotification,
    updateBalanceDisplay,
    switchView,
    applyGameSettings,
    renderInventory,
    renderHistory,
    populateCasePreview,
    updateContestUI,
    updateTimer,
    showModal,
    hideModal,
    updatePriceMessage,
    startHorizontalAnimation,
    startMultiVerticalAnimation,
    showResultModal
} from './ui.js';

import { initCoinflip } from './games/coinflip.js';
import { initMiner, resetMinerGame } from './games/miner.js';
import { initRps } from './games/rps.js';
import { initSlots } from './games/slots.js';
import { initTower, resetTowerGame } from './games/tower.js';
import { initUpgrade, resetUpgradeState } from './games/upgrade.js';

function handleViewSwitch(viewId) {
    switch (viewId) {
        case 'profile-view':
            renderInventory(STATE.inventory, handleSellItem);
            renderHistory(STATE.gameHistory);
            break;
        case 'contests-view':
            fetchAndRenderContest();
            break;
        case 'upgrade-view':
            resetUpgradeState(true);
            break;
        case 'miner-view':
            resetMinerGame();
            break;
        case 'tower-view':
            resetTowerGame();
            break;
    }
}

async function fetchAndRenderInventory() {
    try {
        STATE.inventory = await api.loadInventory();
        renderInventory(STATE.inventory, handleSellItem);
    } catch (error) {
        console.error("Ошибка загрузки инвентаря:", error);
        showNotification("Не удалось загрузить инвентарь.");
    }
}

async function handleSellItem(uniqueId) {
    const itemToSell = STATE.inventory.find(item => item.uniqueId === uniqueId);
    if (!itemToSell) return;

    const originalBalance = STATE.userBalance;
    const originalInventory = [...STATE.inventory];

    STATE.userBalance += itemToSell.value;
    STATE.inventory = STATE.inventory.filter(item => item.uniqueId !== uniqueId);
    updateBalanceDisplay(STATE.userBalance);
    renderInventory(STATE.inventory, handleSellItem);
    showNotification('Продажа...');

    try {
        const result = await api.sellFromInventory(uniqueId);
        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);
        showNotification('Предмет успешно продан!');
    } catch (error) {
        console.error("Ошибка при продаже предмета:", error);
        showNotification('Ошибка продажи. Попробуйте снова.');
        STATE.userBalance = originalBalance;
        STATE.inventory = originalInventory;
        updateBalanceDisplay(STATE.userBalance);
        renderInventory(STATE.inventory, handleSellItem);
    }
}

async function fetchAndRenderContest() {
    try {
        STATE.contest = await api.loadContestData();
        updateContestUI();
    } catch (error) {
        console.error("Ошибка загрузки конкурса:", error);
    }
}

async function fetchAndRefreshUserData() {
    try {
        const tg = window.Telegram.WebApp;
        const user = tg.initDataUnsafe.user;
        if (user && user.id) {
            const userData = await api.authenticateUser(user);
            STATE.user = userData;
            STATE.userBalance = userData.balance_uah;
            updateBalanceDisplay(STATE.userBalance);
            return true;
        }
    } catch (error) {
        console.error("Ошибка при обновлении данных пользователя:", error);
    }
    return false;
}

async function initializeApp() {
    cacheDOMElements();
    setupEventListeners();

    try {
        const { possibleItems, gameSettings } = await api.loadInitialData();
        STATE.possibleItems = possibleItems;
        STATE.gameSettings = gameSettings;
        applyGameSettings(STATE.gameSettings);
        populateCasePreview(STATE.possibleItems);
    } catch (error) {
        showNotification("Критическая ошибка: не удалось загрузить данные игр.");
        console.error(error);
        return;
    }

    try {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                fetchAndRefreshUserData().then(success => {
                    if (success) {
                        showNotification("Баланс обновлен!");
                    }
                });
            }
        });

        const user = tg.initDataUnsafe.user;

        if (user && user.id) {
            UI.profilePhoto.src = user.photo_url || '';
            UI.profileName.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim();
            UI.profileId.textContent = `ID ${user.id}`;

            const userData = await api.authenticateUser(user);
            STATE.user = userData;
            STATE.userBalance = userData.balance_uah;
            updateBalanceDisplay(STATE.userBalance);

            fetchAndRenderInventory();
            fetchAndRenderContest();
        } else {
            UI.profileName.textContent = "Guest";
            UI.profileId.textContent = "ID 0";
            STATE.userBalance = 1000;
            updateBalanceDisplay(STATE.userBalance);
        }
    } catch (e) {
        console.warn("Не удалось инициализировать Telegram Web App. Работа в гостевом режиме.");
        UI.profileName.textContent = "Guest";
        UI.profileId.textContent = "ID 0";
        STATE.userBalance = 1000;
        updateBalanceDisplay(STATE.userBalance);
    }

    switchView('game-view', handleViewSwitch);
    setInterval(() => updateTimer(STATE.contest), 1000);
}

function setupEventListeners() {
    UI.navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view, handleViewSwitch));
    });
    UI.gameMenuBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view, handleViewSwitch));
    });

    UI.modalOverlay.addEventListener('click', () => {
        document.querySelectorAll('.modal.visible').forEach(modal => hideModal(modal));
    });

    UI.profileTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            UI.profileTabs.forEach(t => t.classList.remove('active'));
            UI.profileContents.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.tab + '-content')?.classList.add('active');
        });
    });

    UI.inviteFriendBtn.addEventListener('click', () => {
        try {
            const tg = window.Telegram.WebApp;
            const user = tg.initDataUnsafe.user;
            const app_url = `https://t.me/qqtest134_bot/starsdop?startapp=${user.id}`;
            const text = `Привет! Присоединяйся к StarsDrop и получай крутые подарки!`;
            tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(app_url)}&text=${encodeURIComponent(text)}`);
        } catch(e) {
            console.error(e);
            showNotification("Функция доступна только в Telegram.");
        }
    });
    UI.copyLinkBtn.addEventListener('click', () => {
         try {
            const tg = window.Telegram.WebApp;
            const user = tg.initDataUnsafe.user;
            const app_url = `https://t.me/qqtest134_bot/starsdop?startapp=${user.id}`;
            navigator.clipboard.writeText(app_url).then(() => {
                showNotification('Ссылка скопирована!');
            });
        } catch(e) {
            console.error(e);
            showNotification("Функция доступна только в Telegram.");
        }
    });

    UI.caseImageBtn.addEventListener('click', () => {
        updatePriceMessage();
        showModal(UI.preOpenModal);
    });
    UI.startSpinBtn.addEventListener('click', startSpinProcess);
    UI.quantitySelector.addEventListener('click', (e) => {
        if (e.target.classList.contains('quantity-btn')) {
            UI.quantitySelector.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            STATE.openQuantity = parseInt(e.target.innerText, 10);
            updatePriceMessage();
        }
    });
    UI.fastSpinToggle.addEventListener('change', (e) => {
        STATE.isFastSpinEnabled = e.target.checked;
    });
    document.querySelector('[data-close-modal="pre-open-modal"]')?.addEventListener('click', () => hideModal(UI.preOpenModal));

    UI.buyTicketBtn.addEventListener('click', async () => {
        if (!STATE.contest || !STATE.user) return showNotification('Ошибка: данные не загружены.');
        const totalCost = STATE.contest.ticket_price * STATE.ticketQuantity;
        if (STATE.userBalance < totalCost) return showNotification('Недостаточно средств.');

        try {
            const result = await api.buyTickets(STATE.contest.id, STATE.ticketQuantity);
            STATE.userBalance = result.newBalance;
            updateBalanceDisplay(STATE.userBalance);
            showNotification(`Вы успешно приобрели ${STATE.ticketQuantity} билет(ов)!`);
            await fetchAndRenderContest();
        } catch (error) {
            console.error("Ошибка при покупке билета:", error);
        }
    });
    UI.ticketQuantityPlus.addEventListener('click', () => {
        STATE.ticketQuantity = Math.max(1, STATE.ticketQuantity + 1);
        updateContestUI();
    });
    UI.ticketQuantityMinus.addEventListener('click', () => {
        STATE.ticketQuantity = Math.max(1, STATE.ticketQuantity - 1);
        updateContestUI();
    });

    initCoinflip();
    initMiner();
    initRps();
    initSlots();
    initTower();
    initUpgrade(fetchAndRenderInventory);
}

async function startSpinProcess() {
    if (STATE.isSpinning || !STATE.user) return;

    const totalCost = STATE.casePrice * STATE.openQuantity;
    if (STATE.userBalance < totalCost) {
        showNotification("Недостаточно средств.");
        return;
    }

    try {
        STATE.isSpinning = true;
        const result = await api.openCase(STATE.openQuantity);

        STATE.userBalance = result.newBalance;
        updateBalanceDisplay(STATE.userBalance);
        hideModal(UI.preOpenModal);

        STATE.lastWonItems = result.wonItems;
        STATE.gameHistory.push(...result.wonItems.map(item => ({ ...item, date: new Date(), name: `Выигрыш из кейса` })));

        UI.caseView.classList.add('hidden');
        UI.spinView.classList.remove('hidden');

        if (STATE.openQuantity > 1) {
             UI.multiSpinnerContainer.classList.remove('hidden');
             UI.spinnerContainer.classList.add('hidden');
        } else {
             UI.multiSpinnerContainer.classList.add('hidden');
             UI.spinnerContainer.classList.remove('hidden');
        }

        const onAnimationEnd = () => {
            showResultModal(
                STATE.lastWonItems,
                async () => {
                    const itemIdsToSell = STATE.lastWonItems.map(item => item.uniqueId).filter(id => id);
                    if (itemIdsToSell.length === 0) {
                        showNotification('Нет предметов для продажи.');
                        return;
                    }
                    try {
                        const result = await api.sellMultipleItemsFromInventory(itemIdsToSell);
                        STATE.userBalance = result.newBalance;
                        updateBalanceDisplay(STATE.userBalance);
                        showNotification(`Продано на ${result.soldAmount} ⭐`);
                        finalizeSpin();
                    } catch (error) {
                        console.error('Ошибка при массовой продаже:', error);
                        showNotification('Не удалось продать предметы.');
                    }
                },
                () => {
                    finalizeSpin();
                    setTimeout(() => {
                        updatePriceMessage();
                        showModal(UI.preOpenModal);
                    }, 100);
                },
                finalizeSpin
            );
        };

        if (STATE.openQuantity > 1) {
            startMultiVerticalAnimation(STATE.lastWonItems, STATE.possibleItems, STATE.isFastSpinEnabled, onAnimationEnd);
        } else {
            startHorizontalAnimation(STATE.lastWonItems[0], STATE.possibleItems, STATE.isFastSpinEnabled, onAnimationEnd);
        }

    } catch (error) {
        console.error("Ошибка открытия кейса:", error);
        STATE.isSpinning = false;
    }
}

function finalizeSpin() {
    hideModal(UI.resultModal);
    UI.spinView.classList.add('hidden');
    UI.caseView.classList.remove('hidden');
    STATE.isSpinning = false;
    fetchAndRenderInventory();
}

document.addEventListener('DOMContentLoaded', initializeApp);
