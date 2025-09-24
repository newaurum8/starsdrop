const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const crypto = require('crypto');
const NodeCache = require('node-cache');

require('dotenv').config();

const requiredEnvVars = ['DATABASE_URL', 'ADMIN_SECRET', 'MINI_APP_API_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error(`ОШИБКА: Отсутствуют необходимые переменные окружения: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

const connectionString = process.env.DATABASE_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MINI_APP_API_SECRET = process.env.MINI_APP_API_SECRET;
const BOT_API_URL = 'http://91.239.235.200:8001/api/v1/balance/change';

const appCache = new NodeCache({ stdTTL: 300 });

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err, client) => {
    console.error('Неожиданная ошибка в работе с базой данных', err);
    process.exit(-1);
});

app.use(cors());
app.use(express.json());

async function changeBalanceViaBotAPI(telegram_id, delta, reason) {
    const body = JSON.stringify({
        user_id: telegram_id,
        delta: delta,
        reason: reason
    });
    const signature = crypto.createHmac('sha256', MINI_APP_API_SECRET).update(body).digest('hex');

    const response = await fetch(BOT_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'X-Idempotency-Key': uuidv4()
        },
        body: body
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Ошибка API бота: ${response.statusText}`);
    }
    return await response.json();
}

app.use(express.static(__dirname));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const checkAdminSecret = (req, res, next) => {
    const secret = req.query.secret || req.body.secret;
    if (secret === ADMIN_SECRET) {
        next();
    } else {
        res.status(403).send('Доступ запрещен.');
    }
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => {
    checkAdminSecret(req, res, () => {
        res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    });
});

async function initializeDb() {
    const client = await pool.connect();
    try {
        console.log('Успешное подключение к базе данных PostgreSQL');
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id UUID PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                game_state JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('База данных успешно инициализирована.');
    } catch (err) {
        console.error('Ошибка при инициализации БД:', err);
    } finally {
        client.release();
    }
}

app.post('/api/user/get-or-create', async (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ error: "telegram_id является обязательным" });
    const client = await pool.connect();
    try {
        let userResult = await client.query("SELECT * FROM users WHERE telegram_id = $1", [telegram_id]);
        if (userResult.rows.length > 0) {
            res.json(userResult.rows[0]);
        } else {
            const initialBalance = 0.00;
            const newUserResult = await client.query("INSERT INTO users (telegram_id, user_id, username, balance_uah) VALUES ($1, $2, $3, $4) RETURNING *", [telegram_id, telegram_id, username, initialBalance]);
            res.status(201).json(newUserResult.rows[0]);
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.get('/api/user/inventory', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id является обязательным' });
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`SELECT ui.id AS "uniqueId", i.id, i.name, i."imageSrc", i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1`, [user_id]);
        res.json(rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.post('/api/user/inventory/sell', async (req, res) => {
    const { user_id, unique_id, telegram_id } = req.body;
    if (!user_id || !unique_id || !telegram_id) return res.status(400).json({ error: 'Неверные данные для продажи' });
    const client = await pool.connect();
    try {
        const itemResult = await client.query('SELECT i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.id = $1 AND ui.user_id = $2', [unique_id, user_id]);
        if (itemResult.rows.length === 0) throw new Error('Предмет не найден в инвентаре');
        const itemValue = itemResult.rows[0].value;
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, itemValue, `sell_item_${unique_id}`);
        await client.query("DELETE FROM user_inventory WHERE id = $1 AND user_id = $2", [unique_id, user_id]);
        res.json({ success: true, newBalance: balanceResponse.new_balance });
    } catch (err) {
        console.error("Ошибка при продаже предмета:", err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.post('/api/user/inventory/sell-multiple', async (req, res) => {
    const { user_id, unique_ids, telegram_id } = req.body;
    if (!user_id || !Array.isArray(unique_ids) || unique_ids.length === 0 || !telegram_id) return res.status(400).json({ error: 'Неверные данные' });
    const client = await pool.connect();
    try {
        const placeholders = unique_ids.map((_, i) => `$${i + 2}`).join(',');
        const itemsResult = await client.query(`SELECT SUM(i.value) as total_value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1 AND ui.id IN (${placeholders})`, [user_id, ...unique_ids]);
        if (itemsResult.rows.length === 0 || !itemsResult.rows[0].total_value) throw new Error('Предметы не найдены');
        const totalValue = parseInt(itemsResult.rows[0].total_value, 10);
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, totalValue, `sell_multiple_${unique_ids.length}_items`);
        await client.query(`DELETE FROM user_inventory WHERE id IN (${placeholders}) AND user_id = $1`, [user_id, ...unique_ids]);
        res.json({ success: true, newBalance: balanceResponse.new_balance, soldAmount: totalValue });
    } catch (err) {
        console.error("Ошибка при массовой продаже:", err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.post('/api/case/open', async (req, res) => {
    const { user_id, quantity, telegram_id } = req.body;
    const casePrice = 100;
    const totalCost = casePrice * (quantity || 1);
    if (!user_id || !quantity || quantity < 1 || !telegram_id) return res.status(400).json({ error: 'Неверные данные' });
    const client = await pool.connect();
    try {
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, -totalCost, `open_case_${quantity}`);
        await client.query('BEGIN');
        const caseItemsResult = await client.query('SELECT i.id, i.name, i."imageSrc", i.value FROM items i JOIN case_items ci ON i.id = ci.item_id WHERE ci.case_id = 1');
        let caseItems = caseItemsResult.rows.length > 0 ? caseItemsResult.rows : (await client.query('SELECT id, name, "imageSrc", value FROM items')).rows;
        if (caseItems.length === 0) throw new Error('Нет предметов в игре');
        const wonItems = [];
        for (let i = 0; i < quantity; i++) {
            const randomItem = caseItems[Math.floor(Math.random() * caseItems.length)];
            const result = await client.query("INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2) RETURNING id", [user_id, randomItem.id]);
            wonItems.push({ ...randomItem, uniqueId: result.rows[0].id });
        }
        await client.query('COMMIT');
        res.json({ success: true, newBalance: balanceResponse.new_balance, wonItems });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка открытия кейса:", err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.post('/api/contest/buy-ticket', async (req, res) => {
    const { contest_id, telegram_id, quantity, user_id } = req.body;
    if (!contest_id || !telegram_id || !quantity || quantity < 1 || !user_id) return res.status(400).json({ error: 'Неверные данные' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const contestResult = await client.query("SELECT * FROM contests WHERE id = $1 AND is_active = TRUE", [contest_id]);
        if (contestResult.rows.length === 0 || contestResult.rows[0].end_time <= Date.now()) throw new Error('Конкурс неактивен');
        const contest = contestResult.rows[0];
        const totalCost = contest.ticket_price * quantity;
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, -totalCost, `buy_ticket_${quantity}_contest_${contest_id}`);
        for (let i = 0; i < quantity; i++) {
            await client.query("INSERT INTO user_tickets (contest_id, user_id, telegram_id) VALUES ($1, $2, $3)", [contest_id, user_id, telegram_id]);
        }
        await client.query('COMMIT');
        res.json({ success: true, newBalance: balanceResponse.new_balance });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.get('/api/case/items_full', async (req, res) => {
    if (appCache.has("case_items_full")) {
        return res.json(appCache.get("case_items_full"));
    }
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`SELECT i.id, i.name, i."imageSrc", i.value FROM items i LEFT JOIN case_items ci ON i.id = ci.item_id WHERE ci.case_id = 1 OR (SELECT COUNT(*) FROM case_items) = 0`);
        const items = rows.length > 0 ? rows : (await client.query('SELECT id, name, "imageSrc", value FROM items ORDER BY value DESC')).rows;
        appCache.set("case_items_full", items);
        res.json(items);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.get('/api/game_settings', async (req, res) => {
    if (appCache.has("game_settings")) {
        return res.json(appCache.get("game_settings"));
    }
    const client = await pool.connect();
    try {
        const { rows } = await client.query("SELECT key, value FROM game_settings");
        const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        appCache.set("game_settings", settings);
        res.json(settings);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.get('/api/contest/current', async (req, res) => {
    const client = await pool.connect();
    try {
        const contestResult = await client.query(`SELECT c.id, c.end_time, c.ticket_price, i.name AS "itemName", i."imageSrc" AS "itemImageSrc" FROM contests c JOIN items i ON c.item_id = i.id WHERE c.is_active = TRUE AND c.end_time > $1 ORDER BY c.id DESC LIMIT 1`, [Date.now()]);
        if (contestResult.rows.length === 0) return res.json(null);
        const contest = contestResult.rows[0];
        const ticketCountResult = await client.query("SELECT COUNT(*) AS count, COUNT(DISTINCT user_id) as participants FROM user_tickets WHERE contest_id = $1", [contest.id]);
        const { telegram_id } = req.query;
        let userTickets = 0;
        if (telegram_id) {
            const userTicketsResult = await client.query("SELECT COUNT(*) AS count FROM user_tickets WHERE contest_id = $1 AND telegram_id = $2", [contest.id, telegram_id]);
            userTickets = Number(userTicketsResult.rows[0].count);
        }
        res.json({ ...contest, ...ticketCountResult.rows[0], userTickets });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.post('/api/games/coinflip', async (req, res) => {
    const { telegram_id, bet, choice } = req.body;
    if (!telegram_id || !bet || !choice || bet <= 0) return res.status(400).json({ error: 'Неверные параметры' });
    try {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const winAmount = result === choice ? bet * 2 : 0;
        const delta = winAmount - bet;
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, delta, `coinflip_bet_${bet}`);
        res.json({ success: true, result, winAmount, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/games/rps', async (req, res) => {
    const { telegram_id, bet, choice } = req.body;
    if (!telegram_id || !bet || !choice || bet <= 0) return res.status(400).json({ error: 'Неверные параметры' });
    const choices = ['rock', 'paper', 'scissors'];
    if (!choices.includes(choice)) return res.status(400).json({ error: 'Неверный выбор' });
    try {
        const computerChoice = choices[Math.floor(Math.random() * 3)];
        let winAmount = 0;
        if (choice === computerChoice) winAmount = bet;
        else if ((choice === 'rock' && computerChoice === 'scissors') || (choice === 'paper' && computerChoice === 'rock') || (choice === 'scissors' && computerChoice === 'paper')) winAmount = bet * 2;
        const delta = winAmount - bet;
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, delta, `rps_bet_${bet}`);
        res.json({ success: true, computerChoice, winAmount, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/games/slots', async (req, res) => {
    const { telegram_id, bet } = req.body;
    if (!telegram_id || !bet || bet <= 0) return res.status(400).json({ error: 'Неверные параметры' });
    try {
        const symbols = ['Lemon', 'Cherry', 'Seven'];
        const results = [symbols[Math.floor(Math.random() * 3)], symbols[Math.floor(Math.random() * 3)], symbols[Math.floor(Math.random() * 3)]];
        let winAmount = 0;
        if (results[0] === results[1] && results[1] === results[2]) winAmount = bet * 5;
        else if (results[0] === results[1] || results[1] === results[2]) winAmount = bet * 2;
        const delta = winAmount - bet;
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, delta, `slots_bet_${bet}`);
        res.json({ success: true, reels: results, winAmount, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/games/upgrade', async (req, res) => {
    const { telegram_id, user_id, yourItemUniqueId, desiredItemId } = req.body;
    if (!telegram_id || !user_id || !yourItemUniqueId || !desiredItemId) return res.status(400).json({ error: 'Неверные параметры' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const yourItemRes = await client.query('SELECT i.id, i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.id = $1 AND ui.user_id = $2', [yourItemUniqueId, user_id]);
        const desiredItemRes = await client.query('SELECT * FROM items WHERE id = $1', [desiredItemId]);
        if (yourItemRes.rows.length === 0 || desiredItemRes.rows.length === 0) throw new Error('Предмет не найден');
        const yourItem = yourItemRes.rows[0];
        const desiredItem = desiredItemRes.rows[0];
        const maxChance = 95;
        let chance = (yourItem.value / desiredItem.value) * maxChance;
        if (desiredItem.value <= yourItem.value) chance = maxChance;
        const isSuccess = Math.random() * 100 < Math.min(chance, maxChance);
        await client.query('DELETE FROM user_inventory WHERE id = $1 AND user_id = $2', [yourItemUniqueId, user_id]);
        let newItem = null;
        if (isSuccess) {
            const newItemRes = await client.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2) RETURNING id', [user_id, desiredItem.id]);
            newItem = { ...desiredItem, uniqueId: newItemRes.rows[0].id };
        }
        await client.query('COMMIT');
        res.json({ success: true, isSuccess, newItem });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally { client.release(); }
});

app.post('/api/games/miner/start', async (req, res) => {
    const { telegram_id, bet } = req.body;
    if (!telegram_id || !bet || bet < 1) return res.status(400).json({ error: 'Неверная ставка' });
    const client = await pool.connect();
    try {
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, -bet, `miner_start_bet_${bet}`);
        const totalCells = 12, bombs = 6;
        const bombIndices = new Set();
        while (bombIndices.size < bombs) {
            bombIndices.add(Math.floor(Math.random() * totalCells));
        }
        const sessionId = uuidv4();
        const gameState = {
            bet,
            grid: Array.from({ length: totalCells }, (_, i) => ({ isBomb: bombIndices.has(i) })),
            openedCrystals: 0,
            totalWin: 0
        };
        await client.query("INSERT INTO game_sessions (id, telegram_id, game_type, game_state) VALUES ($1, $2, 'miner', $3)", [sessionId, telegram_id, gameState]);
        res.json({ success: true, sessionId, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.post('/api/games/miner/select', async (req, res) => {
    const { sessionId, cellIndex } = req.body;
    if (!sessionId) return res.status(400).json({ error: "ID сессии не найден" });
    const client = await pool.connect();
    try {
        const sessionRes = await client.query("SELECT * FROM game_sessions WHERE id = $1", [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Игра не найдена' });
        
        let session = sessionRes.rows[0].game_state;
        const cell = session.grid[cellIndex];
        
        if (cell.isBomb) {
            await client.query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
            return res.json({ success: true, isBomb: true, openedGrid: session.grid });
        }
    
        session.openedCrystals++;
        const multiplier = Math.pow(1.4, session.openedCrystals);
        session.totalWin = session.bet * multiplier;

        await client.query("UPDATE game_sessions SET game_state = $1 WHERE id = $2", [session, sessionId]);
        
        res.json({ success: true, isBomb: false, totalWin: session.totalWin, nextWin: session.bet * Math.pow(1.4, session.openedCrystals + 1) });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.post('/api/games/miner/cashout', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "ID сессии не найден" });
    const client = await pool.connect();
    try {
        const sessionRes = await client.query("SELECT * FROM game_sessions WHERE id = $1", [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Игра не найдена' });

        const session = sessionRes.rows[0].game_state;
        const telegram_id = sessionRes.rows[0].telegram_id;

        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, session.totalWin, `miner_cashout_${session.totalWin}`);
        await client.query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);

        res.json({ success: true, winAmount: session.totalWin, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.post('/api/games/tower/start', async (req, res) => {
    const { telegram_id, bet } = req.body;
    const minBet = 15;
    if (!telegram_id || !bet || bet < minBet) return res.status(400).json({ error: `Минимальная ставка ${minBet}` });
    const client = await pool.connect();
    try {
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, -bet, `tower_start_bet_${bet}`);
        
        const levels = 5;
        const multipliers = [1.5, 2.5, 4, 8, 16];
        const sessionId = uuidv4();
        
        const gameState = {
            bet,
            currentLevel: 0,
            levels,
            grid: Array.from({ length: levels }, () => Math.floor(Math.random() * 2)),
            payouts: multipliers.map(m => Math.round(bet * m))
        };
        
        await client.query("INSERT INTO game_sessions (id, telegram_id, game_type, game_state) VALUES ($1, $2, 'tower', $3)", [sessionId, telegram_id, gameState]);
        
        res.json({ success: true, sessionId, newBalance: balanceResponse.new_balance, payouts: gameState.payouts });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.post('/api/games/tower/select', async (req, res) => {
    const { sessionId, col } = req.body;
    if (!sessionId) return res.status(400).json({ error: "ID сессии не найден" });
    const client = await pool.connect();
    try {
        const sessionRes = await client.query("SELECT * FROM game_sessions WHERE id = $1", [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Игра не найдена' });

        let session = sessionRes.rows[0].game_state;
        const telegram_id = sessionRes.rows[0].telegram_id;
        const bombCol = session.grid[session.currentLevel];

        if (col === bombCol) {
            await client.query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
            return res.json({ success: true, isBomb: true, bombCol });
        }
        
        session.currentLevel++;
        const cashoutAmount = session.payouts[session.currentLevel - 1];
        const isWin = session.currentLevel === session.levels;
        
        if (isWin) {
            const balanceResponse = await changeBalanceViaBotAPI(telegram_id, cashoutAmount, `tower_win_${cashoutAmount}`);
            await client.query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
            return res.json({ success: true, isBomb: false, isWin: true, winAmount: cashoutAmount, newBalance: balanceResponse.new_balance, bombCol });
        } else {
            await client.query("UPDATE game_sessions SET game_state = $1 WHERE id = $2", [session, sessionId]);
            res.json({ success: true, isBomb: false, isWin: false, cashoutAmount, bombCol });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.post('/api/games/tower/cashout', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "ID сессии не найден" });
    const client = await pool.connect();
    try {
        const sessionRes = await client.query("SELECT * FROM game_sessions WHERE id = $1", [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Игра не найдена' });

        const session = sessionRes.rows[0].game_state;
        const telegram_id = sessionRes.rows[0].telegram_id;

        if (session.currentLevel === 0) return res.status(400).json({ error: 'Нечего забирать' });

        const winAmount = session.payouts[session.currentLevel - 1];
        const balanceResponse = await changeBalanceViaBotAPI(telegram_id, winAmount, `tower_cashout_${winAmount}`);
        await client.query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
        res.json({ success: true, winAmount, newBalance: balanceResponse.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.use('/api/admin', checkAdminSecret);

app.post('/api/admin/user/balance', async (req, res) => {
    const { telegramId, newBalance } = req.body;
    const client = await pool.connect();
    try {
        const user = await client.query("SELECT balance_uah FROM users WHERE telegram_id = $1", [telegramId]);
        if (user.rows.length === 0) return res.status(404).json({ error: "Пользователь не найден" });
        const currentBalance = parseFloat(user.rows[0].balance_uah);
        const delta = newBalance - currentBalance;
        const response = await changeBalanceViaBotAPI(telegramId, delta, 'admin_panel_update');
        res.json({ success: true, new_balance: response.new_balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
    finally { client.release(); }
});

app.get('/api/admin/users', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query("SELECT id, telegram_id, username, balance_uah FROM users ORDER BY id DESC");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.get('/api/admin/items', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT id, name, "imageSrc", value FROM items ORDER BY value DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.get('/api/admin/case/items', async (req, res) => {
    const caseId = 1;
    const client = await pool.connect();
    try {
        const { rows } = await client.query("SELECT item_id FROM case_items WHERE case_id = $1", [caseId]);
        res.json(rows.map(r => r.item_id));
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

app.post('/api/admin/case/items', async (req, res) => {
    const { itemIds } = req.body;
    const caseId = 1;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("DELETE FROM case_items WHERE case_id = $1", [caseId]);
        if (itemIds && itemIds.length > 0) {
            for (const itemId of itemIds) {
                await client.query("INSERT INTO case_items (case_id, item_id) VALUES ($1, $2)", [caseId, itemId]);
            }
        }
        await client.query('COMMIT');
        appCache.del("case_items_full");
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": err.message });
    } finally { client.release(); }
});

app.post('/api/admin/game_settings', async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Неправильный формат' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(settings)) {
            await client.query("UPDATE game_settings SET value = $1 WHERE key = $2", [value.toString(), key]);
        }
        await client.query('COMMIT');
        appCache.del("game_settings");
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": err.message });
    } finally { client.release(); }
});

app.post('/api/admin/contest/create', async (req, res) => {
    const { item_id, ticket_price, duration_hours } = req.body;
    if (!item_id || !ticket_price || !duration_hours) return res.status(400).json({ error: 'Все поля обязательны' });
    const endTime = Date.now() + duration_hours * 60 * 60 * 1000;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("UPDATE contests SET is_active = FALSE WHERE is_active = TRUE");
        const result = await client.query("INSERT INTO contests (item_id, ticket_price, end_time) VALUES ($1, $2, $3) RETURNING id", [item_id, ticket_price, endTime]);
        await client.query('COMMIT');
        res.status(201).json({ success: true, contestId: result.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.post('/api/admin/contest/draw/:id', async (req, res) => {
    const contestId = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const contestResult = await client.query("SELECT * FROM contests WHERE id = $1 AND is_active = TRUE", [contestId]);
        if (contestResult.rows.length === 0) throw new Error('Активный конкурс не найден');
        const contest = contestResult.rows[0];
        const participantsResult = await client.query("SELECT DISTINCT user_id, telegram_id FROM user_tickets WHERE contest_id = $1", [contestId]);
        if (participantsResult.rows.length === 0) {
            await client.query("UPDATE contests SET is_active = FALSE WHERE id = $1", [contestId]);
            await client.query('COMMIT');
            return res.json({ message: 'В конкурсе не было участников, конкурс завершен.' });
        }
        const participants = participantsResult.rows;
        const winner = participants[Math.floor(Math.random() * participants.length)];
        await client.query("INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)", [winner.user_id, contest.item_id]);
        await client.query("UPDATE contests SET is_active = FALSE, winner_id = $1 WHERE id = $2", [winner.user_id, contestId]);
        await client.query('COMMIT');
        res.json({ success: true, winner_telegram_id: winner.telegram_id, message: "Приз зачислен в инвентарь победителя." });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    initializeDb();
});
