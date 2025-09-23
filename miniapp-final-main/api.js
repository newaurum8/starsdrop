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
            // ИСПРАВЛЕНО: Добавляем и user_id, и telegram_id во все запросы
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
    return callApi(`/api/user/inventory?user_id=${STATE.user.id}`);
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
        // telegram_id добавится автоматически через callApi
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
