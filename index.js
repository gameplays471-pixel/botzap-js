const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron   = require('node-cron');
const fs     = require('fs');
const path   = require('path');

const { setupDatabase }          = require('./db/setup');
const { handleMessage }          = require('./bot/monitor');
const { sendDailyReminders, send20hReports } = require('./bot/scheduler');
const { AUTH_PATH, TIMEZONE }    = require('./config/settings');


// ── Argumento --force-login ───────────────────────────────────────────────
if (process.argv.includes('--force-login')) {
    if (fs.existsSync(AUTH_PATH)) {
        fs.rmSync(AUTH_PATH, { recursive: true, force: true });
        console.log('🗑️  Sessão anterior removida. Escaneie o QR Code para entrar.');
    }
}

// ── Banco de dados ────────────────────────────────────────────────────────
setupDatabase();

// ── Cliente WhatsApp ──────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    },
});

// QR Code no terminal
client.on('qr', (qr) => {
    console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent) => {
    process.stdout.write(`\rCarregando... ${percent}%`);
});

client.on('authenticated', () => {
    console.log('\n🔐 Autenticado!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    process.exit(1);
});

client.on('ready', () => {
    console.log('\n✅ Bot conectado ao WhatsApp!');
    console.log('   Monitorando mensagens...\n');

    // Lembrete diário às 8h
    cron.schedule('0 8 * * *', () => sendDailyReminders(client), { timezone: TIMEZONE });

    // Relatório noturno às 20h
    cron.schedule('0 20 * * *', () => send20hReports(client), { timezone: TIMEZONE });
});

// Mensagem recebida
client.on('message', async (msg) => {
    try {
        await handleMessage(client, msg);
    } catch (e) {
        console.error('Erro ao processar mensagem:', e);
    }
});

client.on('disconnected', (reason) => {
    console.warn('⚠️  Bot desconectado:', reason);
    console.log('Reiniciando...');
    client.initialize();
});

client.initialize();
