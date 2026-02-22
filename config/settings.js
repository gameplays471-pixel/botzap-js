const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

module.exports = {
    BASE_DIR,
    DB_PATH:      path.join(BASE_DIR, 'finance.db'),
    AUTH_PATH:    path.join(BASE_DIR, '.wwebjs_auth'),
    TIMEZONE:     'America/Sao_Paulo',
    REMINDER_HOUR: 8,   // Hora do lembrete diário
    REPORT_HOUR:  20,   // Hora do relatório noturno
};
