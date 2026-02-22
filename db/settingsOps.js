const db = require('./connection');

// ── Histórico de comandos ─────────────────────────────────────────────────

function isDuplicateCommand(userId, commandText) {
    if (!commandText) return false;
    try {
        const last = db.prepare(
            'SELECT command FROM command_history WHERE user_id = ? ORDER BY id DESC LIMIT 1'
        ).get(userId);

        if (last && last.command === commandText) return true;

        db.prepare('INSERT INTO command_history (user_id, command) VALUES (?, ?)').run(userId, commandText);

        // Mantém apenas os últimos 5 por usuário
        db.prepare(`
            DELETE FROM command_history
            WHERE user_id = ? AND id NOT IN (
                SELECT id FROM command_history WHERE user_id = ? ORDER BY id DESC LIMIT 5
            )
        `).run(userId, userId);

        return false;
    } catch (_) { return false; }
}

// ── Configurações gerais do bot ───────────────────────────────────────────

function getSetting(key) {
    const row = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run(key, String(value));
}

// ── Relatório das 20h ─────────────────────────────────────────────────────

function hasDailyReportBeenSent(groupId, dateStr) {
    const key = `daily_report_${groupId}_${dateStr}`;
    return !!db.prepare('SELECT 1 FROM bot_settings WHERE key = ?').get(key);
}

function markDailyReportSent(groupId, dateStr) {
    const key = `daily_report_${groupId}_${dateStr}`;
    db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, "sent")').run(key);
}

module.exports = { isDuplicateCommand, getSetting, setSetting, hasDailyReportBeenSent, markDailyReportSent };
