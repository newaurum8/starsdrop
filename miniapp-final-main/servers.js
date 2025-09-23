const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Загружаем переменные окружения из .env файла
require('dotenv').config();

// --- ПРОВЕРКА КЛЮЧЕВЫХ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ---
const requiredEnvVars = ['DATABASE_URL', 'ADMIN_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error(`ОШИБКА: Отсутствуют необходимые переменные окружения: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// --- ИНИЦИАЛЛИЗАЦИЯ ПРИЛОЖЕНИЯ ---
const app = express();
const port = process.env.PORT || 3000;

const connectionString = process.env.DATABASE_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(cors());
app.use(express.json());


// --- ХЕЛПЕР ДЛЯ ПРЯМОГО ИЗМЕНЕНИЯ БАЛАНСА В БД ---
async function updateUserBalanceDirectly(client, telegramId, delta) {
    const userBalanceQuery = await client.query("SELECT balance_uah FROM users WHERE telegram_id = $1 FOR UPDATE", [telegramId]);
    if (userBalanceQuery.rows.length === 0) {
        throw new Error('Пользователь не найден для обновления баланса.');
    }

    const currentBalance = userBalanceQuery.rows[0].balance_uah;
    if (parseFloat(currentBalance) + parseFloat(delta) < 0) {
        throw new Error('Недостаточно средств');
    }

    const result = await client.query(
        "UPDATE users SET balance_uah = balance_uah + $1 WHERE telegram_id = $2 RETURNING balance_uah",
        [delta, telegramId]
    );

    return { new_balance: result.rows[0].balance_uah };
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
        res.status(403).send('Доступ запрещен.');
    }
};

// --- ОСНОВНЫЕ МАРШРУТЫ ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => {
    checkAdminSecret(req, res, () => {
        res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    });
});

// --- ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ---
async function initializeDb() {
    const client = await pool.connect();
    try {
        console.log('Успешное подключение к базе данных PostgreSQL');

        // Используем balance_uah как в боте
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE,
                username TEXT,
                balance_uah NUMERIC(10, 2) NOT NULL DEFAULT 1000.00,
                chosen_currency VARCHAR(10),
                chosen_game VARCHAR(50),
                registration_date TIMESTAMPTZ DEFAULT NOW(),
                games_played INT DEFAULT 0,
                total_wagered NUMERIC(10, 2) DEFAULT 0.00,
                total_purchased_uah NUMERIC(10, 2) DEFAULT 0.00,
                total_withdrawn_gold INT DEFAULT 0,
                withdrawals_count INT DEFAULT 0,
                in_yellow_list BOOLEAN DEFAULT FALSE,
                total_purchased_uc NUMERIC(10, 2) DEFAULT 0.00,
                total_withdrawn_uc INT DEFAULT 0,
                withdrawals_count_uc INT DEFAULT 0,
                total_purchased_bc NUMERIC(10, 2) DEFAULT 0.00,
                total_withdrawn_bc INT DEFAULT 0,
                withdrawals_count_bc INT DEFAULT 0
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
            // Используем balance_uah
            const newUserResult = await pool.query(
                "INSERT INTO users (telegram_id, username, balance_uah) VALUES ($1, $2, $3) RETURNING *",
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
    const { user_id, unique_id, telegram_id } = req.body;
    if (!user_id || !unique_id || !telegram_id) {
        return res.status(400).json({ error: 'Неверные данные для продажи' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const itemResult = await client.query(
            'SELECT i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.id = $1 AND ui.user_id = $2', 
            [unique_id, user_id]
        );
        if (itemResult.rows.length === 0) throw new Error('Предмет не найден в инвентаре');
        
        const itemValue = itemResult.rows[0].value;
        
        const balanceResponse = await updateUserBalanceDirectly(client, telegram_id, itemValue);
        
        await client.query("DELETE FROM user_inventory WHERE id = $1", [unique_id]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, newBalance: balanceResponse.new_balance });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка при продаже предмета:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/user/inventory/sell-multiple', async (req, res) => {
    const { user_id, unique_ids, telegram_id } = req.body;
    if (!user_id || !Array.isArray(unique_ids) || unique_ids.length === 0 || !telegram_id) {
        return res.status(400).json({ error: 'Неверные данные для массовой продажи' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const placeholders = unique_ids.map((_, i) => `$${i + 2}`).join(',');
        const itemsResult = await client.query(
            `SELECT SUM(i.value) as total_value FROM user_inventory ui 
             JOIN items i ON ui.item_id = i.id 
             WHERE ui.user_id = $1 AND ui.id IN (${placeholders})`,
            [user_id, ...unique_ids]
        );

        if (itemsResult.rows.length === 0 || !itemsResult.rows[0].total_value) {
            throw new Error('Один или несколько предметов не найдены в инвентаре');
        }
        
        const totalValue = parseInt(itemsResult.rows[0].total_value, 10);
        
        const balanceResponse = await updateUserBalanceDirectly(client, telegram_id, totalValue);
        
        await client.query(`DELETE FROM user_inventory WHERE id IN (${placeholders}) AND user_id = $1`, [user_id, ...unique_ids]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, newBalance: balanceResponse.new_balance, soldAmount: totalValue });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка при массовой продаже:", err);
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
    const { user_id, quantity, telegram_id } = req.body;
    const casePrice = 100;
    const totalCost = casePrice * (quantity || 1);

    if (!user_id || !quantity || quantity < 1 || !telegram_id) {
        return res.status(400).json({ error: 'Неверные данные для открытия кейса' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const balanceResponse = await updateUserBalanceDirectly(client, telegram_id, -totalCost);

        const caseItemsResult = await client.query('SELECT i.id, i.name, i."imageSrc", i.value FROM items i JOIN case_items ci ON i.id = ci.item_id WHERE ci.case_id = 1');
        let caseItems;
        if (caseItemsResult.rows.length === 0) {
             const allItems = await client.query('SELECT id, name, "imageSrc", value FROM items');
             if (allItems.rows.length === 0) throw new Error('В игре нет предметов');
             caseItems = allItems.rows;
        } else {
            caseItems = caseItemsResult.rows;
        }

        const wonItems = [];
        for (let i = 0; i < quantity; i++) {
            const randomItem = caseItems[Math.floor(Math.random() * caseItems.length)];
            const result = await client.query(
                "INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2) RETURNING id",
                [user_id, randomItem.id]
            );
            wonItems.push({
                ...randomItem,
                uniqueId: result.rows[0].id
            });
        }
        
        await client.query('COMMIT');
        res.json({ success: true, newBalance: balanceResponse.new_balance, wonItems });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ошибка открытия кейса:", err);
        res.status(500).json({ error: err.message });
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
        
        const balanceResponse = await updateUserBalanceDirectly(client, telegram_id, -totalCost);

        for (let i = 0; i < quantity; i++) {
            await client.query("INSERT INTO user_tickets (contest_id, user_id, telegram_id) VALUES ($1, $2, $3)", [contest_id, user.id, telegram_id]);
        }

        await client.query('COMMIT');
        res.json({ success: true, newBalance: balanceResponse.new_balance });

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
        // Запрашиваем balance_uah
        const { rows } = await pool.query("SELECT id, telegram_id, username, balance_uah FROM users ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/user/balance', async (req, res) => {
    const { userId, newBalance } = req.body;
    try {
        // Обновляем balance_uah
        const result = await pool.query("UPDATE users SET balance_uah = $1 WHERE id = $2", [newBalance, userId]);
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
    console.log(`Основное приложение: http://localhost:${port}`);
    console.log(`Админ-панель: http://localhost:${port}/admin?secret=${ADMIN_SECRET}`);
    initializeDb();
});
