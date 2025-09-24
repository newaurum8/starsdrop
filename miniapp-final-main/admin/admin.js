document.addEventListener('DOMContentLoaded', () => {
    const secret = new URLSearchParams(window.location.search).get('secret');
    if (!secret) {
        document.body.innerHTML = '<h1>Доступ запрещен. Необходим секретный ключ.</h1>';
        return;
    }

    const API_BASE = '/api/admin';

    // DOM элементы
    const usersTableBody = document.querySelector('#users-table tbody');
    const caseItemsContainer = document.getElementById('case-items-container');
    const saveCaseBtn = document.getElementById('save-case-btn');
    const gameManagementContainer = document.getElementById('game-management-container');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const contestItemSelect = document.getElementById('contest-item-select');
    const createContestBtn = document.getElementById('create-contest-btn');
    const currentContestInfo = document.getElementById('current-contest-info');
    const contestDetails = document.getElementById('contest-details');
    const drawWinnerBtn = document.getElementById('draw-winner-btn');

    let allItems = [];
    let caseItemIds = new Set();
    let gameSettings = {};


    async function apiFetch(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const url = `${API_BASE}${endpoint}?secret=${secret}`;

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            alert(`Ошибка API: ${error.message}`);
            throw error;
        }
    }

    async function loadUsers() {
        try {
            const users = await apiFetch('/users');
            usersTableBody.innerHTML = '';
            users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${user.telegram_id}</td>
                    <td>${user.username || 'N/A'}</td>
                    <td>${user.balance_uah}</td>
                    <td><button class="button-primary" disabled>Изменить</button></td>
                `;
                usersTableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Ошибка загрузки пользователей:", error);
        }
    }

    async function loadAllItems() {
        try {
            allItems = await apiFetch('/items');
            renderCaseItems();
            populateContestSelect();
        } catch (error) {
            console.error("Ошибка загрузки предметов:", error);
        }
    }

    async function loadCaseItems() {
        try {
            const itemIds = await apiFetch('/case/items');
            caseItemIds = new Set(itemIds);
            renderCaseItems();
        } catch (error) {
            console.error("Ошибка загрузки предметов кейса:", error);
        }
    }

    function renderCaseItems() {
        caseItemsContainer.innerHTML = '';
        allItems.forEach(item => {
            const isChecked = caseItemIds.has(item.id);
            const label = document.createElement('label');
            label.className = 'item-label';
            label.innerHTML = `
                <input type="checkbox" data-item-id="${item.id}" ${isChecked ? 'checked' : ''}>
                <img src="../${item.imageSrc}" alt="${item.name}">
                <span>${item.name}</span>
            `;
            caseItemsContainer.appendChild(label);
        });
    }

    function populateContestSelect() {
        contestItemSelect.innerHTML = '';
        allItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (Стоимость: ${item.value})`;
            contestItemSelect.appendChild(option);
        });
    }

    async function loadGameSettings() {
        try {
            const settings = await apiFetch('/game_settings', 'GET', null, true); // Исправлено
            gameSettings = settings || {};
            renderGameSettings();
        } catch (error) {
            console.error("Ошибка загрузки настроек:", error);
        }
    }

    function renderGameSettings() {
        gameManagementContainer.innerHTML = '';
        const settingKeys = {
            'upgrade_enabled': 'Апгрейды',
            'miner_enabled': 'Минер',
            'coinflip_enabled': 'Орел и Решка',
            'rps_enabled': 'Камень-ножницы-бумага',
            'slots_enabled': 'Слоты',
            'tower_enabled': 'Вежа'
        };

        for (const key in settingKeys) {
            const isEnabled = gameSettings[key] === 'true';
            const item = document.createElement('div');
            item.className = 'setting-item';
            item.innerHTML = `
                <label for="${key}">${settingKeys[key]}</label>
                <input type="checkbox" id="${key}" data-setting-key="${key}" class="toggle-switch" ${isEnabled ? 'checked' : ''}>
            `;
            gameManagementContainer.appendChild(item);
        }
    }
    
    async function loadCurrentContest() {
        try {
            const contest = await apiFetch('/contest/current', 'GET', null, true); // Исправлено
            if (contest) {
                contestDetails.textContent = `Приз: ${contest.itemName}, Цена билета: ${contest.ticket_price}, Участников: ${contest.participants}, Билетов: ${contest.count}. Завершится: ${new Date(contest.end_time).toLocaleString()}`;
                currentContestInfo.classList.remove('hidden');
                drawWinnerBtn.dataset.contestId = contest.id;
            } else {
                currentContestInfo.classList.add('hidden');
            }
        } catch (error) {
             console.error("Ошибка загрузки конкурса:", error);
        }
    }


    saveCaseBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(caseItemsContainer.querySelectorAll('input:checked')).map(input => parseInt(input.dataset.itemId, 10));
        try {
            await apiFetch('/case/items', 'POST', { itemIds: selectedIds });
            alert('Содержимое кейса успешно сохранено!');
            caseItemIds = new Set(selectedIds);
        } catch (error) {
            console.error("Ошибка сохранения кейса:", error);
        }
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const newSettings = {};
        gameManagementContainer.querySelectorAll('.toggle-switch').forEach(toggle => {
            newSettings[toggle.dataset.settingKey] = toggle.checked;
        });
        try {
            await apiFetch('/game_settings', 'POST', { settings: newSettings });
            alert('Настройки игр сохранены!');
            gameSettings = Object.entries(newSettings).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {});
        } catch (error) {
            console.error("Ошибка сохранения настроек:", error);
        }
    });

    createContestBtn.addEventListener('click', async () => {
        const contestData = {
            item_id: parseInt(document.getElementById('contest-item-select').value, 10),
            ticket_price: parseInt(document.getElementById('contest-ticket-price').value, 10),
            duration_hours: parseInt(document.getElementById('contest-duration').value, 10)
        };
        try {
            await apiFetch('/contest/create', 'POST', contestData);
            alert('Новый конкурс успешно создан!');
            loadCurrentContest();
        } catch (error) {
            console.error("Ошибка создания конкурса:", error);
        }
    });

    drawWinnerBtn.addEventListener('click', async (e) => {
        const contestId = e.target.dataset.contestId;
        if (!contestId || !confirm('Вы уверены, что хотите провести розыгрыш досрочно?')) return;
        try {
            const result = await apiFetch(`/contest/draw/${contestId}`, 'POST');
            alert(`Розыгрыш проведен! ${result.message}`);
            loadCurrentContest();
        } catch (error) {
            console.error("Ошибка при розыгрыше:", error);
        }
    });


    // Initial Load
    loadUsers();
    loadAllItems();
    loadCaseItems();
    loadGameSettings();
    loadCurrentContest();
});
