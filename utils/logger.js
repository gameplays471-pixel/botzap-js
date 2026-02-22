const fs = require('fs');
const path = require('path');

function getLogFile() {
    const today = new Date().toISOString().slice(0, 10);
    const logDir = path.join(__dirname, '..', 'logs');
    
    // Garante que a pasta /logs existe
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    return path.join(logDir, `bot-log-${today}.txt`);
}

function appendLog(level, userId, action, data) {
    const time = new Date().toLocaleTimeString('pt-BR');
    
    // Log curto e bonito para o Terminal (Console)
    if (level === 'INFO') {
        console.log(`[${time}] ${userId}: ${action}`);
    } else if (level === 'AI') {
        console.log(`[${time}] 🤖 Gemini: ${action}`);
    } else if (level === 'ERROR') {
        console.log(`[${time}] ❌ ERRO (${userId}): ${action}`);
    }

    // Log super detalhado para o Arquivo (txt)
    const logFile = getLogFile();
    let fileMessage = `[${time}] [${level}] [${userId}] -> ${action}\n`;
    
    if (data) {
        fileMessage += `> DADOS: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}\n`;
    }
    fileMessage += '----------------------------------------\n';
    
    fs.appendFileSync(logFile, fileMessage);
}

module.exports = { appendLog };
