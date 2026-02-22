const db = require('./connection');

function setupDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            phone_number TEXT PRIMARY KEY,
            group_id     TEXT NOT NULL,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            date                    TEXT    DEFAULT (datetime('now')),
            description             TEXT    NOT NULL,
            amount                  REAL    NOT NULL CHECK(amount > 0),
            category                TEXT    DEFAULT 'Outros',
            user_id                 TEXT    NOT NULL,
            installments_total      INTEGER DEFAULT 1,
            current_installment     INTEGER DEFAULT 1,
            is_recurring            INTEGER DEFAULT 0,
            original_transaction_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS bot_settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS shopping_lists (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id   TEXT    NOT NULL,
            type       TEXT    NOT NULL,
            name       TEXT,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS shopping_items (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id    INTEGER NOT NULL,
            description TEXT   NOT NULL,
            quantity    INTEGER DEFAULT 1,
            added_by    TEXT,
            added_at    TEXT   DEFAULT (datetime('now')),
            FOREIGN KEY(list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS command_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            command     TEXT NOT NULL,
            executed_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_user   ON transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_command_history_user ON command_history(user_id);
    `);

    // Migração: coluna created_at em users (bancos antigos)
    try {
        db.exec("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
        db.exec("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL");
    } catch (_) { /* Já existe */ }

    console.log('✅ Banco de dados inicializado.');
}

module.exports = { setupDatabase };
