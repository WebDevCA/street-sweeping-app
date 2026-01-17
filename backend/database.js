const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'sweeping.db'));

// Initialize database schema
function initializeDatabase() {
    // Users table (simple device-based identification, no auth)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Push subscriptions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, endpoint)
        )
    `);

    // Schedules table
    db.exec(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            label TEXT,
            day_of_week INTEGER NOT NULL,
            week_pattern TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Exceptions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS exceptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            moved_to_date TEXT,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Reminders table
    db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            night_before TEXT DEFAULT '20:00',
            morning_of TEXT DEFAULT '07:00',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Notification log (to prevent duplicate sends)
    db.exec(`
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            notification_type TEXT NOT NULL,
            sweeping_date TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, notification_type, sweeping_date)
        )
    `);

    console.log('Database initialized successfully');
}

// Get or create user by device ID
function getOrCreateUser(deviceId) {
    let user = db.prepare('SELECT * FROM users WHERE device_id = ?').get(deviceId);

    if (!user) {
        const result = db.prepare('INSERT INTO users (device_id) VALUES (?)').run(deviceId);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    return user;
}

// Push subscription methods
function savePushSubscription(userId, subscription) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
    `);

    return stmt.run(
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth
    );
}

function getPushSubscriptions(userId) {
    return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
}

// Schedule methods
function getSchedules(userId) {
    return db.prepare('SELECT * FROM schedules WHERE user_id = ? ORDER BY id').all(userId);
}

function createSchedule(userId, schedule) {
    const stmt = db.prepare(`
        INSERT INTO schedules (user_id, label, day_of_week, week_pattern, start_time, end_time, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
        userId,
        schedule.label || null,
        schedule.dayOfWeek,
        JSON.stringify(schedule.weekPattern),
        schedule.startTime,
        schedule.endTime,
        schedule.active ? 1 : 0
    );
}

function deleteSchedule(userId, scheduleId) {
    return db.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').run(scheduleId, userId);
}

// Exception methods
function getExceptions(userId) {
    return db.prepare('SELECT * FROM exceptions WHERE user_id = ? ORDER BY date').all(userId);
}

function createException(userId, exception) {
    const stmt = db.prepare(`
        INSERT INTO exceptions (user_id, date, moved_to_date, reason)
        VALUES (?, ?, ?, ?)
    `);

    return stmt.run(
        userId,
        exception.date,
        exception.movedToDate || null,
        exception.reason || null
    );
}

function deleteException(userId, exceptionId) {
    return db.prepare('DELETE FROM exceptions WHERE id = ? AND user_id = ?').run(exceptionId, userId);
}

// Reminder methods
function getReminders(userId) {
    let reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').get(userId);

    if (!reminders) {
        // Create default reminders
        db.prepare('INSERT INTO reminders (user_id) VALUES (?)').run(userId);
        reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').get(userId);
    }

    return reminders;
}

function updateReminders(userId, nightBefore, morningOf) {
    const stmt = db.prepare(`
        INSERT INTO reminders (user_id, night_before, morning_of, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            night_before = excluded.night_before,
            morning_of = excluded.morning_of,
            updated_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(userId, nightBefore, morningOf);
}

// Notification log methods
function wasNotificationSent(userId, type, date) {
    const log = db.prepare(`
        SELECT * FROM notification_log
        WHERE user_id = ? AND notification_type = ? AND sweeping_date = ?
    `).get(userId, type, date);

    return !!log;
}

function logNotification(userId, type, date) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO notification_log (user_id, notification_type, sweeping_date)
        VALUES (?, ?, ?)
    `);

    return stmt.run(userId, type, date);
}

// Get all users for notification checking
function getAllUsers() {
    return db.prepare('SELECT * FROM users').all();
}

module.exports = {
    initializeDatabase,
    getOrCreateUser,
    savePushSubscription,
    getPushSubscriptions,
    getSchedules,
    createSchedule,
    deleteSchedule,
    getExceptions,
    createException,
    deleteException,
    getReminders,
    updateReminders,
    wasNotificationSent,
    logNotification,
    getAllUsers
};
