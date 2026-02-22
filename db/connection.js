const Database = require('better-sqlite3');
const { DB_PATH } = require('../config/settings');

// Singleton: todos os módulos compartilham a mesma conexão
const db = new Database(DB_PATH);

// WAL mode: melhor performance para leituras/escritas concorrentes
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Tabela para autenticação da Dashboard Web
db.prepare(`
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        password TEXT
    )
`).run();

module.exports = db;
