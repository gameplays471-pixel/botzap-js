const { ensureUserExists } = require('../db/users');
const db = require('../db/connection');
const { processMessage, normalizePhone } = require('../execution/messageProcessor');
const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const { appendLog } = require('../utils/logger'); // <-- Nosso novo logger!

const { extractTransactions, parseShoppingItems } = require('../services/gemini');
const { addTransaction, getBalance, getReport } = require('../db/transactions');
const { getPersonalReport, deleteLatestTransactionByContext, getCategoryBreakdown } = require('../db/transactionsAdvanced');
const { getSavingsTip } = require('../execution/savingsAdvisor');

function checkUserExists(userId) {
    try { return !!db.prepare('SELECT phone_number FROM users WHERE phone_number = ?').get(userId); } catch (e) { return false; }
}

async function handleMessage(client, msg) {
    if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us')) return;      
    if (msg.type !== 'chat' && msg.type !== 'ptt' && msg.type !== 'audio') return;

    const text = msg.body?.trim() || '';
    let rawNumber = msg.from;
    try {
        const contact = await msg.getContact();
        if (contact && contact.number) rawNumber = contact.number + '@c.us';
    } catch (e) {}

    const userId = normalizePhone(rawNumber);
    const textLower = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    if (textLower === 'iniciar bot financeiro') {
        ensureUserExists(userId);
        await msg.reply('✅ Olá! Bot Financeiro Ativado. Mande áudios ou textos com comandos ou gastos!');
        appendLog('INFO', userId, 'Usuário Ativou o Bot');
        return;
    }
    if (textLower === 'desligar bot financeiro') {
        try { db.prepare('DELETE FROM users WHERE phone_number = ?').run(userId); } catch (e) {}
        await msg.reply('🛑 Bot desativado.');
        appendLog('INFO', userId, 'Usuário Desativou o Bot');
        return;
    }
    
    if (!checkUserExists(userId)) return; 

    // Atalho: ajuda sobre Listas via linguagem natural
    const listHelpPatterns = /me ajude com as listas|quais comandos das listas|ajuda listas|me ajude com lista|quais comandos lista|ajuda lista/i;
    if (listHelpPatterns.test(text)) {
        const listHelp = (
            '🛒 *Ajuda — Listas de Compras*\n\n' +
            'Comandos principais:\n' +
            '• `Lista mercado adicionar <item> [quantidade]` — ex: Lista mercado adicionar Arroz 2\n' +
            '• `Lista mercado ver` — mostra itens do mercado\n' +
            '• `Lista mercado remover <n>` — remove item pelo índice\n' +
            '• `Lista mercado limpar` — limpa a lista do mercado\n\n' +
            'Listas pessoais:\n' +
            '• `Lista pessoal adicionar <Nome> <item> [qtd]` — ex: Lista pessoal adicionar Maria Leite 2\n' +
            '• `Lista pessoal ver <Nome>` — exibe lista da pessoa\n\n' +
            'Você também pode usar linguagem natural, por exemplo:\n' +
            '"adicione pra mim na lista de mercado pra eu comprar 1 arroz e 1 feijão"\n\n' +
            'Quer que eu adicione algo agora?'
        );
        appendLog('INFO', userId, '📤 Bot respondeu: Ajuda Listas (atalho)');
        await msg.reply(listHelp);
        return;
    }

    // --- MODO: COMANDO DE TEXTO SIMPLES ---
        // --- MODO: COMANDO DE TEXTO SIMPLES ---
    const isCommand = /^(relat[oó]rio|extrato|xtrato|saldo|categorias|grupo|dica|remover|editar)/i.test(textLower) || textLower === 'ajuda' || textLower === 'menu';

    if (isCommand && !msg.hasMedia) {
        appendLog('INFO', userId, `💬 Enviou texto: "${text.substring(0, 50)}..."`);
        
        const answer = await processMessage(userId, text);
        if (answer) {
            // Se a resposta for uma Promise (algum handler retornou incorretamente), aguarda-a
            if (answer && typeof answer.then === 'function') {
                try { answer = await answer; } catch (e) { answer = String(e.message); }
            }

            if (typeof answer === 'object' && answer.type === 'chart') {
                const { generatePieChartImage } = require('../utils/chartGenerator');
                const { monthToLabel } = require('../utils/monthParser');
                try {
                    const imagePath = await generatePieChartImage(answer.data, `Gastos - ${monthToLabel(answer.month)}`);
                    const media = MessageMedia.fromFilePath(imagePath);
                    await msg.reply(media, undefined, { caption: '📊 Gráfico gerado!' });
                    appendLog('INFO', userId, '📤 Bot enviou: Imagem de Gráfico');
                    setTimeout(() => { if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath); }, 5000);
                } catch (e) {
                    appendLog('ERROR', userId, 'Falha ao gerar gráfico', e.message);
                    await msg.reply(`❌ Erro no gráfico: ${e.message}`);
                }
                } else {
                    // Se for objeto não-chart, transforma em texto amigável
                    let out = answer;
                    if (typeof out === 'object') {
                        try { out = JSON.stringify(out); } catch (_) { out = String(out); }
                    }
                    appendLog('INFO', userId, `📤 Bot respondeu: "${String(out).substring(0, 50)}..."`);
                    await msg.reply(out);
                }
        }
        return;
    }

    // --- MODO: INTELIGÊNCIA ARTIFICIAL (ÁUDIO OU TEXTO NATURAL) ---
    try {
        await msg.react('🧠');
        
        const inputType = msg.hasMedia ? 'Áudio' : 'Texto';
        appendLog('INFO', userId, `🎙️ Enviou para IA (${inputType}): "${text.substring(0, 50)}"`);

        let audioData = null, mimeType = null;
        if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
            const media = await msg.downloadMedia();
            audioData = media.data; mimeType = media.mimetype;
        }

        if (!text && !audioData) { await msg.react(''); return; }

        // Se a mensagem aparenta falar sobre listas, tente interpretar como lista antes de chamar o Gemini
        const listWords = /\blista\b|\bmercado\b|\bcasa\b|\bpessoal\b|\blista(s)?\b/i;
        if (listWords.test(textLower)) {
            try {
                const parsedList = await parseShoppingItems(text);
                if (parsedList && Array.isArray(parsedList.items) && parsedList.items.length) {
                    const shopping = require('../db/shoppingLists');
                    const [groupId] = ensureUserExists(userId);
                    const target = (parsedList.target || 'mercado').toLowerCase();
                    const person = parsedList.person || null;
                    const added = [];
                    for (const it of parsedList.items) {
                        const qty = parseInt(it.quantity || 1, 10) || 1;
                        const res = shopping.addItemToList(groupId, target === 'pessoal' ? 'pessoal' : (target === 'casa' ? 'casa' : 'mercado'), it.description, qty, normalizePhone(userId), person);
                        added.push(`${it.description}${qty>1? ' ('+qty+')':''}${res && res.duplicate ? ' (já existente)' : ''}`);
                    }
                    const replyTextList = `✅ Adicionados à lista ${target}${person? ' de '+person: ''}: ${added.join(', ')}`;
                    appendLog('INFO', userId, `📤 Bot respondeu: "${replyTextList.substring(0,50)}..."`);
                    await msg.reply(replyTextList);
                    await msg.react('✅');
                    return;
                }

                // Se o parser não retornou itens, mas a mensagem parece pedir para VER a lista, mostramos a lista
                const viewVerb = /\b(ver|mostrar|listar)\b/i;
                if (viewVerb.test(textLower) || /^lista\s+\w+/i.test(textLower)) {
                    try {
                        const shopping = require('../db/shoppingLists');
                        const [groupId] = ensureUserExists(userId);
                        let target = 'mercado';
                        if (/\bpessoal\b|\bindividual\b/i.test(textLower)) target = 'pessoal';
                        else if (/\bcasa\b|\blar\b/i.test(textLower)) target = 'casa';
                        else if (/\bmercado\b|\bsupermercado\b/i.test(textLower)) target = 'mercado';

                        let person = null;
                        if (target === 'pessoal') {
                            const m = text.match(/pessoal\s+(?:ver\s+)?([a-zA-ZÀ-ú0-9_\-]+)/i);
                            if (m) person = m[1];
                        }

                        const { items } = shopping.getListItems(groupId, target, person);
                        let replyTextList;
                        if (!items || items.length === 0) replyTextList = `📝 *Lista ${target}${person? ' - '+person : ''} vazia.*`;
                        else {
                            const map = new Map();
                            for (const it of items) {
                                const key = (it.description || '').trim().toLowerCase();
                                const addedByName = it.added_name || it.added_by;
                                if (!map.has(key)) map.set(key, { description: it.description.trim(), quantity: it.quantity || 1, added_by: addedByName });
                                else { const cur = map.get(key); cur.quantity = (cur.quantity || 0) + (it.quantity || 1); if (!cur.added_by && addedByName) cur.added_by = addedByName; }
                            }
                            const consolidated = Array.from(map.values());
                            const lines = consolidated.map((it, i) => `${i+1}. ${it.description}${it.quantity && it.quantity>1 ? ' ('+it.quantity+')' : ''}${it.added_by ? ' — ' + it.added_by : ''}`);
                            replyTextList = `📝 *Lista ${target}${person? ' - '+person : ''}:*\n` + lines.join('\n');
                        }
                        appendLog('INFO', userId, `📤 Bot respondeu: "${replyTextList.substring(0,50)}..."`);
                        await msg.reply(replyTextList);
                        await msg.react('✅');
                        return;
                    } catch (e) { /* segue para Gemini */ }
                }
            } catch (e) { /* falha no parser, segue para Gemini */ }
        }

        // Chama o Google Gemini para intents financeiras
        const result = await extractTransactions(text, audioData, mimeType);

        // Se a mensagem parece pedir PARA VER a lista (ex: "lista mercado ver"), priorize exibir a lista
        if (listWords.test(textLower) && viewVerb.test(textLower)) {
            try {
                const shopping = require('../db/shoppingLists');
                const [groupId] = ensureUserExists(userId);
                let target = 'mercado';
                if (/\bpessoal\b|\bindividual\b/i.test(textLower)) target = 'pessoal';
                else if (/\bcasa\b|\blar\b/i.test(textLower)) target = 'casa';
                else if (/\bmercado\b|\bsupermercado\b/i.test(textLower)) target = 'mercado';

                // tenta extrair nome da pessoa (para listas pessoais)
                let person = null;
                if (target === 'pessoal') {
                    const m = text.match(/pessoal\s+(?:ver\s+)?([a-zA-ZÀ-ú0-9_\-]+)/i);
                    if (m) person = m[1];
                }

                const { items } = shopping.getListItems(groupId, target, person);
                let replyTextList;
                if (!items || items.length === 0) replyTextList = `📝 *Lista ${target}${person? ' - '+person : ''} vazia.*`;
                else {
                    // Consolida itens similar ao messageProcessor
                    const map = new Map();
                    for (const it of items) {
                        const key = (it.description || '').trim().toLowerCase();
                        const addedByName = it.added_name || it.added_by;
                        if (!map.has(key)) map.set(key, { description: it.description.trim(), quantity: it.quantity || 1, added_by: addedByName });
                        else { const cur = map.get(key); cur.quantity = (cur.quantity || 0) + (it.quantity || 1); if (!cur.added_by && addedByName) cur.added_by = addedByName; }
                    }
                    const consolidated = Array.from(map.values());
                    const lines = consolidated.map((it, i) => `${i+1}. ${it.description}${it.quantity && it.quantity>1 ? ' ('+it.quantity+')' : ''}${it.added_by ? ' — ' + it.added_by : ''}`);
                    replyTextList = `📝 *Lista ${target}${person? ' - '+person : ''}:*\n` + lines.join('\n');
                }
                appendLog('INFO', userId, `📤 Bot respondeu: "${replyTextList.substring(0,50)}..."`);
                await msg.reply(replyTextList);
                await msg.react('✅');
                return;
            } catch (e) {
                // silenciosamente segue para o fluxo normal
            }
        }
        
        // Log detalhado com o pensamento interno da IA no arquivo
        appendLog('AI', userId, `Ação interpretada: ${result.intent}`, result);

        let replyText = '';

        switch (result.intent) {
            case 'ADD_EXPENSE':
                if (!result.expenses || result.expenses.length === 0) {
                    replyText = '❌ Nenhum gasto identificado.';
                    break;
                }
                let resList = [];
                for (const exp of result.expenses) {
                    resList.push(addTransaction(userId, exp.description, exp.amount, exp.category, 1, false));
                }
                resList.push('\n' + getSavingsTip());
                replyText = resList.join('\n');
                break;

            case 'GET_REPORT':
                replyText = getReport(userId, result.month);
                break;

            case 'GET_PERSONAL_REPORT':
                replyText = getPersonalReport(userId, result.personName, result.month);
                break;

            case 'DELETE_EXPENSE':
                replyText = deleteLatestTransactionByContext(userId, result.deleteQuery, result.deleteAmount);
                break;

            case 'GET_BALANCE':
                replyText = `💰 Saldo Atual do Grupo: R$ ${getBalance(userId).toFixed(2)}`;
                break;

            case 'GET_CHART':
                const [groupId] = ensureUserExists(userId);
                const dataChart = getCategoryBreakdown(groupId, result.month);
                if (Object.keys(dataChart).length === 0) {
                    replyText = `📊 Nenhuma saída registrada para o período.`;
                } else {
                    const { generatePieChartImage } = require('../utils/chartGenerator');
                    const imagePath = await generatePieChartImage(dataChart, `Gráfico Mensal`);
                    const media = MessageMedia.fromFilePath(imagePath);
                    await msg.reply(media, undefined, { caption: '📊 Gráfico de Gastos' });
                    appendLog('INFO', userId, '📤 Bot enviou: Imagem de Gráfico (via IA)');
                    setTimeout(() => { if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath); }, 5000);
                    await msg.react('✅');
                    return; 
                }
                break;
            case 'GET_HELP':
                if (result.helpCategory === 'GRUPOS') {
                    replyText = '👥 *Como gerenciar a família:*\n\n' +
                                '1️⃣ Para adicionar alguém (a pessoa manda os gastos do celular dela e cai na mesma conta):\n' +
                                '👉 `Grupo adicionar 11999999999`\n\n' +
                                '2️⃣ Para dar um nome bonitinho a esse número (Pra sair no extrato pessoal):\n' +
                                '👉 `Grupo renomear 11999999999 para Esposa`\n\n' +
                                '3️⃣ Para ver quem está no grupo:\n' +
                                '👉 `Grupo ver`';
                } 
                else if (result.helpCategory === 'LISTAS') {
                    replyText = '🛒 *Ajuda — Listas de Compras*\n\n' +
                                'Comandos principais:\n' +
                                '• `Lista mercado adicionar <item> [quantidade]` — ex: Lista mercado adicionar Arroz 2\n' +
                                '• `Lista mercado ver` — mostra itens do mercado\n' +
                                '• `Lista mercado remover <n>` — remove item pelo índice\n' +
                                '• `Lista mercado limpar` — limpa a lista do mercado\n\n' +
                                'Listas pessoais:\n' +
                                '• `Lista pessoal adicionar <Nome> <item> [qtd]` — ex: Lista pessoal adicionar Maria Leite 2\n' +
                                '• `Lista pessoal ver <Nome>` — exibe lista da pessoa\n\n' +
                                'Você também pode usar linguagem natural, por exemplo:\n' +
                                '"adicione pra mim na lista de mercado pra eu comprar 1 arroz e 1 feijão"\n\n' +
                                'Quer que eu adicione algo agora?';
                }
                else if (result.helpCategory === 'WEB') {
                    replyText = '🌐 *Como acessar o Painel na Internet:*\n\n' +
                                'Você precisa criar um Usuário e Senha aqui no Zap para logar no site.\n\n' +
                                '👉 1º Envie: `Grupo nome Família`\n' +
                                '👉 2º Envie: `Grupo senha 123456`\n' +
                                '👉 3º Se errar o nome, use: `Grupo renomeargrupo NovoNome`\n\n' +
                                'Depois acesse o link gerado pelo Ngrok e coloque os dados!';
                } 
                else if (result.helpCategory === 'RELATORIOS') {
                    replyText = '📋 *Como puxar relatórios:*\n\n' +
                                'Mande áudios ou textos como:\n' +
                                '- _"Me mostre o extrato deste mês"_\n' +
                                '- _"Extrato grafico"_\n' +
                                '- _"Quanto o Erick gastou no mês passado?"_\n' +
                                '- _"Qual o nosso saldo?"_';
                } 
                else {
                    replyText = '🤖 Olá! Eu entendo comandos por áudio e texto.\n\n' +
                                'Você pode me pedir:\n' +
                                '🔹 *Ajuda com Grupos* (Adicionar familiares)\n' +
                                '🔹 *Ajuda com Web* (Login do painel)\n' +
                                '🔹 *Ajuda com Relatórios* (Gráficos e extratos)\n\n' +
                                'Ou mande a palavra `Ajuda` para ver a lista de códigos tradicionais.';
                }
                break;

            default:
                replyText = '🤷‍♂️ A IA não conseguiu entender a ação desejada.';
        }

        if (replyText) {
            appendLog('INFO', userId, `📤 Bot respondeu: "${replyText.substring(0, 50)}..."`);
            await msg.reply(replyText);
            await msg.react('✅');
        }

    } catch (e) {
        appendLog('ERROR', userId, 'Erro grave na IA', e.message);
        await msg.react('❌');
        await msg.reply('❌ Ops! Falha na conexão com o Google Gemini.');
    }
}

module.exports = { handleMessage };
