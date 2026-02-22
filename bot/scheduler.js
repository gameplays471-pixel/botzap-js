const { getLast10Users, getAllGroupsToReport } = require('../db/users');
const { getDailySummary }                      = require('../db/transactions');
const { hasDailyReportBeenSent, markDailyReportSent } = require('../db/settingsOps');

const REMINDER_TEXT = (
    '💡 *Lembrete Diário*\n\n' +
    'Não se esqueça de anotar seus gastos de hoje! 📝\n\n' +
    'Basta enviar: `<descrição> <valor>`\n' +
    'Exemplo: `Café 5.50`'
);

async function sendDailyReminders(client) {
    console.log('🔔 Enviando lembretes diários...');
    const users = getLast10Users();
    for (const phone of users) {
        try {
            // phone no banco: "+55 11 99999-0000" → converte para ID do WhatsApp
            const waId = phone.replace(/\D/g, '') + '@c.us';
            await client.sendMessage(waId, REMINDER_TEXT);
        } catch (e) {
            console.error(`Erro ao enviar lembrete para ${phone}:`, e.message);
        }
    }
    console.log('✅ Lembretes enviados!');
}

async function send20hReports(client) {
    console.log('🔔 Enviando relatórios das 20h...');
    const today = new Date().toISOString().slice(0, 10);
    const groups = getAllGroupsToReport();

    for (const { group_id: groupId, phone_number: phone } of groups) {
        if (hasDailyReportBeenSent(groupId, today)) continue;
        try {
            const summary = getDailySummary(phone);
            if (summary) {
                const waId = phone.replace(/\D/g, '') + '@c.us';
                await client.sendMessage(waId, summary);
            }
            markDailyReportSent(groupId, today);
        } catch (e) {
            console.error(`Erro ao enviar relatório para ${phone}:`, e.message);
        }
    }
    console.log('✅ Relatórios das 20h enviados!');
}

module.exports = { sendDailyReminders, send20hReports };
