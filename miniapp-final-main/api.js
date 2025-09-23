// api.js

import { STATE } from './state.js';
import { showNotification } from './ui.js';

async function callApi(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) {
            if (STATE.user && STATE.user.id) {
                body.user_id = STATE.user.id;
                body.telegram_id = STATE.user.telegram_id;
            }
            options.body = JSON.stringify(body);
        }
        const response = await fetch(endpoint, options);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка сервера');
        }
        return result;
    } catch (error) {
        showNotification(error.message);
        throw error;
    }
}

export async function authenticateUser(tgUser) {
    return callApi('/api/user/get-or-create', 'POST', {
        telegram_id: tgUser.id,
        username: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim()
    });
}

export async function loadInventory() {
    if (!STATE.user || !STATE.user.id) return [];
    // Используем GET запрос с query параметром
    const response = await fetch(`/api/user/inventory?user_id=${STATE.user.id}`);
    if (!response.ok) throw new Error("Ошибка загрузки инвентаря");
    return await response.json();
}

export async function sellFromInventory(uniqueId) {
    return callApi('/api/user/inventory/sell', 'POST', {
        unique_id: uniqueId
    });
}

export async function sellMultipleItemsFromInventory(uniqueIds) {
    return callApi('/api/user/inventory/sell-multiple', 'POST', {
        unique_ids: uniqueIds
    });
}

export async function openCase(quantity) {
    return callApi('/api/case/open', 'POST', {
        quantity: quantity
    });
}

export async function loadContestData() {
    if (!STATE.user || !STATE.user.telegram_id) return null;
    try {
        const response = await fetch(`/api/contest/current?telegram_id=${STATE.user.telegram_id}`);
        if (!response.ok) throw new Error('Network error');
        return await response.json();
    } catch (error) {
        console.error("Не удалось загрузить данные о конкурсе:", error);
        return null;
    }
}

export async function buyTickets(contestId, quantity) {
    return callApi('/api/contest/buy-ticket', 'POST', {
        contest_id: contestId,
        quantity: quantity
    });
}

export async function loadInitialData() {
     const [caseResponse, settingsResponse] = await Promise.all([
        fetch('/api/case/items_full'),
        fetch('/api/game_settings')
    ]);
    if (!caseResponse.ok) throw new Error(`Ошибка загрузки кейсов: ${caseResponse.status}`);
    if (!settingsResponse.ok) throw new Error(`Ошибка загрузки настроек: ${settingsResponse.status}`);

    const possibleItems = await caseResponse.json();
    const gameSettings = await settingsResponse.json();
    return { possibleItems, gameSettings };
}

// --- НОВЫЕ ФУНКЦИИ ДЛЯ ИГР ---

export async function playGameCoinflip(bet, choice) {
    return callApi('/api/games/coinflip', 'POST', {
        bet: bet,
        choice: choice
    });
}

export async function playGameRps(bet, choice) {
    return callApi('/api/games/rps', 'POST', {
        bet: bet,
        choice: choice
    });
}

export async function playGameSlots(bet) {
    return callApi('/api/games/slots', 'POST', {
        bet: bet
    });
}

export async function performUpgrade(yourItemUniqueId, desiredItemId) {
    return callApi('/api/games/upgrade', 'POST', {
        yourItemUniqueId: yourItemUniqueId,
        desiredItemId: desiredItemId
    });
}

// --- API ДЛЯ MINER И TOWER ---

export async function startMinerGame(bet) {
    return callApi('/api/games/miner/start', 'POST', { bet });
}

export async function selectMinerCell(sessionId, cellIndex) {
    return callApi('/api/games/miner/select', 'POST', { sessionId, cellIndex });
}

export async function cashoutMiner(sessionId) {
    return callApi('/api/games/miner/cashout', 'POST', { sessionId });
}

export async function startTowerGame(bet) {
    return callApi('/api/games/tower/start', 'POST', { bet });
}

export async function selectTowerCell(sessionId, col) {
    return callApi('/api/games/tower/select', 'POST', { sessionId, col });
}

export async function cashoutTower(sessionId) {
    return callApi('/api/games/tower/cashout', 'POST', { sessionId });
}
