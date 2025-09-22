const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// Используем переменную окружения для строки подключения
const connectionString = 'postgresql://neondb_owner:npg_xoO8NXpDn1fy@ep-hidden-sound-a23oyr8a-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

if (!connectionString) {
    console.error('Ошибка: Переменная окружения DATABASE_URL не установлена!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Важная настройка для Render и Supabase
    }
});

app.use(cors());
app.use(express.json());

// --- КОНФИГУРАЦИЯ ---
const ADMIN_SECRET = 'Aurum';
// !!! ИСПРАВЛЕНИЕ: Установлен ваш публичный URL-адрес Python-сервера !!!
const BOT_API_URL = 'https://server4644.server-vps.com/api/v1/balance/change'; 
const MINI_APP_SECRET_KEY = "a4B!z$9pLw@cK#vG*sF7qE&rT2uY"; // Ваш секретный ключ

// --- Хелпер для отправки запросов к API бота ---
async function changeBalanceInBot(telegramId, delta, reason) {
    const idempotencyKey = uuidv4();
    const body = JSON.stringify({
        user_id: telegramId, // Отправляем telegram_id
        delta: delta,
        reason: reason
    });

    const signature = crypto
        .createHmac('sha256', MINI_APP_SECRET_KEY)
        .update(body)
        .digest('hex');

    // Логика повторных попыток для сетевых ошибок
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(BOT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey,
                    'X-Signature': signature
                },
                body: body,
                timeout: 7000 // таймаут 7 секунд
            });

            const result = await response.json();

            if (!response.ok) {
                 // Не повторяем попытку при ошибках клиента (4xx)
                if (response.status >= 400 && response.status < 500) {
                     throw new Error(result.detail || `Ошибка API бота: ${response.status}`);
                }
                 console.warn(`Попытка ${attempt} не удалась. Статус: ${response.status}. Ответ:`, result);
                 if (attempt === 3) throw new Error(`Ошибка API бота после 3 попыток: ${result.detail || response.status}`);
                 await new Promise(res => setTimeout(res, 1000 * attempt)); // экспоненциальная задержка
                 continue;
            }

            return result;
        } catch (error) {
             console.error(`Попытка ${attempt} провалилась с сетевой ошибкой:`, error);
             if (attempt === 3) throw new Error("Не удалось связаться с сервером бота после нескольких попыток.");
             await new Promise(res => setTimeout(res, 1000 * attempt));
        }
    }
}


// --- ОТДАЧА СТАТИЧЕСКИХ ФАЙЛОВ ---
app.use(express.static(__dirname));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// --- ЗАЩИТА АДМИН-ПАНЕЛИ ---
const checkAdminSecret = (req, res, next) => {
    const secret = req.query.secret || req.body.secret;
    if (secret === ADMIN_SECRET) {
        next();
    } else {
        res.status(403).send('Доступ запрещен');
    }
};

// --- ОСНОВНЫЕ МАРШРУТЫ ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', checkAdminSecret, (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

// --- ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ---
async function initializeDb() {
    const client = await pool.connect();
    try {
        console.log('Успешное подключение к базе данных PostgreSQL');

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE,
                username TEXT,
                balance INTEGER NOT NULL DEFAULT 1000
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                "imageSrc" TEXT,
                value INTEGER NOT NULL
            );
        `);

        const items = [
            { id: 1, name: 'Cigar', imageSrc: 'images/item.png', value: 3170 },
            { id: 2, name: 'Bear', imageSrc: 'images/item1.png', value: 440 },
            { id: 3, name: 'Sigmaboy', imageSrc: 'images/case.png', value: 50 },
            { id: 4, name: 'Lemon', imageSrc: 'images/slot_lemon.png', value: 100 },
            { id: 5, name: 'Cherry', imageSrc: 'images/slot_cherry.png', value: 200 },
            { id: 6, name: 'Seven', imageSrc: 'images/slot_7.png', value: 777 }
        ];

        for (const item of items) {
            await client.query(
                `INSERT INTO items (id, name, "imageSrc", value) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING;`,
                [item.id, item.name, item.imageSrc, item.value]
            );
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_inventory (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS case_items (
                case_id INTEGER,
                item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
                PRIMARY KEY (case_id, item_id)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS game_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        
        const settings = [
            { key: 'miner_enabled', value: 'true' },
            { key: 'tower_enabled', value: 'true' },
            { key: 'slots_enabled', value: 'true' },
            { key: 'coinflip_enabled', value: 'true' },
            { key: 'rps_enabled', value: 'true' },
            { key: 'upgrade_enabled', value: 'true' }
        ];

        for (const s of settings) {
            await client.query(
                `INSERT INTO game_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING;`,
                [s.key, s.value]
            );
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS contests (
                id SERIAL PRIMARY KEY,
                item_id INTEGER NOT NULL REFERENCES items(id),
                ticket_price INTEGER NOT NULL,
                end_time BIGINT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                winner_id INTEGER REFERENCES users(id)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_tickets (
                id SERIAL PRIMARY KEY,
                contest_id INTEGER NOT NULL REFERENCES contests(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                telegram_id BIGINT NOT NULL
            );
        `);

        console.log('База данных успешно инициализирована.');
    } catch (err) {
        console.error('Ошибка при инициализации БД:', err);
    } finally {
        client.release();
    }
}


// --- API Маршруты (клиентские) ---

app.post('/api/user/get-or-create', async (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) {
        return res.status(400).json({ error: "telegram_id является обязательным" });
    }
    try {
        let userResult = await pool.query("SELECT * FROM users WHERE telegram_id = $1", [telegram_id]);
        if (userResult.rows.length > 0) {
            res.json(userResult.rows[0]);
        } else {
            const initialBalance = 1000;
            const newUserResult = await pool.query(
                "INSERT INTO users (telegram_id, username, balance) VALUES ($1, $2, $3) RETURNING *",
                [telegram_id, username, initialBalance]
            );
            res.status(201).json(newUserResult.rows[0]);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/inventory', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id является обязательным' });
    }

    const sql = `
        SELECT ui.id AS "uniqueId", i.id, i.name, i."imageSrc", i.value
        FROM user_inventory ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = $1
    `;
    try {
        const { rows } = await pool.query(sql, [user_id]);
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/user/inventory/sell', async (req, res) => {
    const { user_id, unique_id } = req.body; // user_id здесь это внутренний ID из таблицы users
    if (!user_id || !unique_id) {
        return res.status(400).json({ error: 'Неверные данные для продажи' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const itemResult = await client.query(
            'SELECT i.value, u.telegram_id FROM user_inventory ui JOIN items i ON ui.item_id = i.id JOIN users u ON ui.user_id = u.id WHERE ui.id = $1 AND ui.user_id = $2', 
            [unique_id, user_id]
        );
        if (itemResult.rows.length === 0) throw new Error('Предмет не найден в инвентаре');
        
        const { value: itemValue, telegram_id } = itemResult.rows[0];
        
        const botResponse = await changeBalanceInBot(telegram_id, itemValue, `sell_item_${unique_id}`);
        
        await client.query("DELETE FROM user_inventory WHERE id = $1", [unique_id]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, newBalance: botResponse.new_balance });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка при продаже предмета:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/case/items_full', async (req, res) => {
    try {
        const sql = `
            SELECT i.id, i.name, i."imageSrc", i.value
            FROM items i
            LEFT JOIN case_items ci ON i.id = ci.item_id
            WHERE ci.case_id = 1 OR (SELECT COUNT(*) FROM case_items) = 0
        `;
        const { rows } = await pool.query(sql);

        if (rows.length > 0) {
            res.json(rows);
        } else {
            const allItemsResult = await pool.query('SELECT id, name, "imageSrc", value FROM items ORDER BY value DESC');
            res.json(allItemsResult.rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/case/open', async (req, res) => {
    const { user_id, quantity } = req.body; // user_id здесь это внутренний ID из таблицы users
    const casePrice = 100;
    const totalCost = casePrice * (quantity || 1);

    if (!user_id || !quantity || quantity < 1) {
        return res.status(400).json({ error: 'Неверные данные для открытия кейса' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const userResult = await client.query("SELECT telegram_id FROM users WHERE id = $1", [user_id]);
        if (userResult.rows.length === 0) throw new Error('Пользователь не найден');
        const { telegram_id } = userResult.rows[0];

        const botResponse = await changeBalanceInBot(telegram_id, -totalCost, `open_case_x${quantity}`);

        const caseItemsResult = await client.query('SELECT i.id, i.name, i."imageSrc", i.value FROM items i JOIN case_items ci ON i.id = ci.item_id WHERE ci.case_id = 1');
        if (caseItemsResult.rows.length === 0) {
             const allItems = await client.query('SELECT id, name, "imageSrc", value FROM items');
             if (allItems.rows.length === 0) throw new Error('В игре нет предметов');
             var caseItems = allItems.rows;
        } else {
            var caseItems = caseItemsResult.rows;
        }

        const wonItems = Array.from({ length: quantity }, () => caseItems[Math.floor(Math.random() * caseItems.length)]);
        
        for (const item of wonItems) {
            await client.query("INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)", [user_id, item.id]);
        }
        
        await client.query('COMMIT');
        res.json({ success: true, newBalance: botResponse.new_balance, wonItems });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка открытия кейса:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/game_settings', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT key, value FROM game_settings");
        const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contest/current', async (req, res) => {
    const now = Date.now();
    const sql = `
        SELECT c.id, c.end_time, c.ticket_price, c.winner_id, i.name AS "itemName", i."imageSrc" AS "itemImageSrc"
        FROM contests c
        JOIN items i ON c.item_id = i.id
        WHERE c.is_active = TRUE AND c.end_time > $1
        ORDER BY c.id DESC LIMIT 1
    `;
    try {
        const contestResult = await pool.query(sql, [now]);
        if (contestResult.rows.length === 0) return res.json(null);
        
        const contest = contestResult.rows[0];

        const ticketCountResult = await pool.query("SELECT COUNT(*) AS count, COUNT(DISTINCT user_id) as participants FROM user_tickets WHERE contest_id = $1", [contest.id]);
        const ticketCount = ticketCountResult.rows[0];
        
        const { telegram_id } = req.query;
        let userTickets = 0;
        if (telegram_id) {
            const userTicketsResult = await pool.query("SELECT COUNT(*) AS count FROM user_tickets WHERE contest_id = $1 AND telegram_id = $2", [contest.id, telegram_id]);
            userTickets = Number(userTicketsResult.rows[0].count);
        }

        res.json({ ...contest, ...ticketCount, userTickets });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/contest/buy-ticket', async (req, res) => {
    const { contest_id, telegram_id, quantity } = req.body;
    if (!contest_id || !telegram_id || !quantity || quantity < 1) {
        return res.status(400).json({ error: 'Неверные данные для покупки билета' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const contestResult = await client.query("SELECT * FROM contests WHERE id = $1 AND is_active = TRUE", [contest_id]);
        if (contestResult.rows.length === 0 || contestResult.rows[0].end_time <= Date.now()) {
            throw new Error('Конкурс неактивен или завершен');
        }
        const contest = contestResult.rows[0];

        const userResult = await client.query("SELECT id FROM users WHERE telegram_id = $1", [telegram_id]);
        if (userResult.rows.length === 0) throw new Error('Пользователь не найден');
        const user = userResult.rows[0];

        const totalCost = contest.ticket_price * quantity;
        
        const botResponse = await changeBalanceInBot(telegram_id, -totalCost, `buy_ticket_x${quantity}_contest_${contest_id}`);

        for (let i = 0; i < quantity; i++) {
            await client.query("INSERT INTO user_tickets (contest_id, user_id, telegram_id) VALUES ($1, $2, $3)", [contest_id, user.id, telegram_id]);
        }

        await client.query('COMMIT');
        res.json({ success: true, newBalance: botResponse.new_balance });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// --- API Маршруты (админские) ---
app.use('/api/admin', checkAdminSecret);

app.get('/api/admin/users', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, telegram_id, username, balance FROM users ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/user/balance', async (req, res) => {
    const { userId, newBalance } = req.body;
    try {
        const result = await pool.query("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, userId]);
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.get('/api/admin/items', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, name, "imageSrc", value FROM items ORDER BY value DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/case/items', async (req, res) => {
    const caseId = 1;
    try {
        const { rows } = await pool.query("SELECT item_id FROM case_items WHERE case_id = $1", [caseId]);
        res.json(rows.map(r => r.item_id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": err.message });
    } finally {
        client.release();
    }
});


app.post('/api/admin/game_settings', async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Неправильный формат настроек' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(settings)) {
            await client.query("UPDATE game_settings SET value = $1 WHERE key = $2", [value.toString(), key]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": err.message });
    } finally {
        client.release();
    }
});

app.post('/api/admin/contest/create', async (req, res) => {
    const { item_id, ticket_price, duration_hours } = req.body;
    if (!item_id || !ticket_price || !duration_hours) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    const endTime = Date.now() + duration_hours * 60 * 60 * 1000;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("UPDATE contests SET is_active = FALSE WHERE is_active = TRUE");
        const result = await client.query(
            "INSERT INTO contests (item_id, ticket_price, end_time) VALUES ($1, $2, $3) RETURNING id",
            [item_id, ticket_price, endTime]
        );
        await client.query('COMMIT');
        res.status(201).json({ success: true, contestId: result.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/admin/contest/draw/:id', async (req, res) => {
    const contestId = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const contestResult = await client.query("SELECT * FROM contests WHERE id = $1 AND is_active = TRUE", [contestId]);
        if (contestResult.rows.length === 0) {
            throw new Error('Активный конкурс не найден');
        }
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
    } finally {
        client.release();
    }
});


app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    console.log(`Основной додаток: http://localhost:${port}`);
    console.log(`Админ-панель: http://localhost:${port}/admin?secret=${ADMIN_SECRET}`);
    initializeDb();
});
