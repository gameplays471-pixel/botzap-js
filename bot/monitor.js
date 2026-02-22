const { ensureUserExists, addMember }    = require('../db/users');
const db                                  = require('../db/connection');
const { processMessage, normalizePhone }  = require('../execution/messageProcessor');
const { MessageMedia }                    = require('whatsapp-web.js');
const fs                                  = require('fs');
const { appendLog }                       = require('../utils/logger');

const { extractTransactions }             = require('../services/gemini');
const { addTransaction, getBalance, getReport, getDetailedExtract } = require('../db/transactions');
const { getPersonalReport, deleteLatestTransactionByContext,
        getCategoryBreakdown, getGroupMembersWithNames } = require('../db/transactionsAdvanced');
const { getSavingsTip }                   = require('../execution/savingsAdvisor');
const { generatePieChartImage }           = require('../utils/chartGenerator');
const shopping                            = require('../db/shoppingLists');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function checkUserExists(userId) {
    try { return !!db.prepare('SELECT phone_number FROM users WHERE phone_number = ?').get(userId); } catch (e) { return false; }
}

function formatShoppingList(groupId, target, person = null) {
    const { items } = shopping.getListItems(groupId, target, person);
    const label = `${target}${person ? ' - ' + person : ''}`;
    if (!items || items.length === 0) return `📝 *Lista ${label} vazia.*`;

    const map = new Map();
    for (const it of items) {
        const key = (it.description || '').trim().toLowerCase();
        const addedByName = it.added_name || it.added_by;
        if (!map.has(key)) {
            map.set(key, { description: it.description.trim(), quantity: it.quantity || 1, added_by: addedByName });
        } else {
            const cur = map.get(key);
            cur.quantity = (cur.quantity || 0) + (it.quantity || 1);
            if (!cur.added_by && addedByName) cur.added_by = addedByName;
        }
    }

    const lines = Array.from(map.values()).map((it, i) =>
        `${i + 1}. ${it.description}${it.quantity > 1 ? ' (' + it.quantity + ')' : ''}${it.added_by ? ' — ' + it.added_by : ''}`
    );
    return `📝 *Lista ${label}:*\n` + lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// handleMessage — ponto de entrada principal
// Toda mensagem (texto ou áudio) passa pela IA antes de qualquer coisa.
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(client, msg) {
    if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us')) return;
    if (msg.type !== 'chat' && msg.type !== 'ptt' && msg.type !== 'audio') return;

    const text = msg.body?.trim() || '';
    let rawNumber = msg.from;
    try {
        const contact = await msg.getContact();
        if (contact && contact.number) rawNumber = contact.number + '@c.us';
    } catch (e) {}

    const userId   = normalizePhone(rawNumber);
    const textLower = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // ── Ativação / Desativação (comandos fixos de sistema) ────────────────────
    if (textLower === 'iniciar bot financeiro') {
        ensureUserExists(userId);
        await msg.reply('✅ Olá! Bot Financeiro Ativado. Mande áudios ou textos com o que você precisa!');
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
    if (!text && !msg.hasMedia)   return;

    // ── Toda mensagem passa pela IA ───────────────────────────────────────────
    try {
        await msg.react('🧠');

        const inputType = msg.hasMedia ? 'Áudio' : 'Texto';
        appendLog('INFO', userId, `🧠 IA (${inputType}): "${text.substring(0, 60)}"`);

        let audioData = null, mimeType = null;
        if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
            const media = await msg.downloadMedia();
            audioData = media.data;
            mimeType  = media.mimetype;
        }

        if (!text && !audioData) { await msg.react(''); return; }

        const result = await extractTransactions(text, audioData, mimeType);
        appendLog('AI', userId, `Intent: ${result.intent}`, result);

        const [groupId] = ensureUserExists(userId);
        let replyText   = '';

        switch (result.intent) {

            // ── Gastos ────────────────────────────────────────────────────────
            case 'ADD_EXPENSE': {
                if (!result.expenses || result.expenses.length === 0) {
                    replyText = '❌ Nenhum gasto identificado. Ex: _"Almoço 25"_ ou _"Gastei 45 no mercado"_';
                    break;
                }
                const resList = [];
                for (const exp of result.expenses) {
                    resList.push(addTransaction(userId, exp.description, exp.amount, exp.category || 'Outros', 1, false));
                }
                resList.push('\n' + getSavingsTip());
                replyText = resList.join('\n');
                break;
            }

            // ── Relatórios ────────────────────────────────────────────────────
            case 'GET_REPORT':
                replyText = getReport(userId, result.month || null);
                break;

            case 'GET_DETAILED_EXTRACT':
                replyText = getDetailedExtract(userId);
                break;

            case 'GET_PERSONAL_REPORT':
                replyText = getPersonalReport(userId, result.personName, result.month || null);
                break;

            case 'GET_BALANCE':
                replyText = `💰 Saldo Atual do Grupo: R$ ${getBalance(userId).toFixed(2)}`;
                break;

            // ── Gráfico ───────────────────────────────────────────────────────
            case 'GET_CHART': {
                const dataChart = getCategoryBreakdown(groupId, result.month || null);
                if (!dataChart || Object.keys(dataChart).length === 0) {
                    replyText = '📊 Nenhuma saída registrada para o período.';
                } else {
                    const imagePath = await generatePieChartImage(dataChart, 'Gráfico de Gastos');
                    const media    = MessageMedia.fromFilePath(imagePath);
                    await msg.reply(media, undefined, { caption: '📊 Gráfico de Gastos por Categoria' });
                    appendLog('INFO', userId, '📤 Gráfico enviado');
                    setTimeout(() => { if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath); }, 5000);
                    await msg.react('✅');
                    return;
                }
                break;
            }

            // ── Remover Lançamento ────────────────────────────────────────────
            case 'DELETE_EXPENSE':
                replyText = deleteLatestTransactionByContext(userId, result.deleteQuery, result.deleteAmount);
                break;

            // ── Grupo ─────────────────────────────────────────────────────────
            case 'GET_GROUP_MEMBERS':
                replyText = getGroupMembersWithNames(userId);
                break;

            case 'ADD_MEMBER':
                if (!result.newMemberPhone) {
                    replyText = '❌ Não identifiquei o número. Ex: _"Adiciona o 11999998888 ao grupo"_';
                } else {
                    replyText = addMember(userId, normalizePhone(result.newMemberPhone));
                }
                break;

            // ── Listas de Compras ─────────────────────────────────────────────
            case 'ADD_TO_LIST': {
                const target = (result.listTarget || 'mercado').toLowerCase();
                const person = result.listPerson || null;
                if (!result.listItems || result.listItems.length === 0) {
                    replyText = '❌ Não identifiquei os itens. Ex: _"Adiciona azeitonas e maionese na lista do mercado"_';
                    break;
                }
                const added = [];
                for (const it of result.listItems) {
                    const qty = parseInt(it.quantity || 1, 10) || 1;
                    const res = shopping.addItemToList(groupId, target, it.description, qty, normalizePhone(userId), person);
                    added.push(`${it.description}${qty > 1 ? ' (' + qty + ')' : ''}${res && res.duplicate ? ' (já na lista)' : ''}`);
                }
                replyText = `✅ Adicionado à lista *${target}*${person ? ' de ' + person : ''}:\n${added.map(i => '• ' + i).join('\n')}`;
                break;
            }

            case 'VIEW_LIST': {
                const target = (result.listTarget || 'mercado').toLowerCase();
                const person = result.listPerson || null;
                replyText = formatShoppingList(groupId, target, person);
                break;
            }

            case 'REMOVE_FROM_LIST': {
                const target = (result.listTarget || 'mercado').toLowerCase();
                const person = result.listPerson || null;
                const idx    = result.listIndex;
                if (!idx) {
                    replyText = '❌ Diga o número do item para remover. Ex: _"Remove o item 2 da lista do mercado"_';
                    break;
                }
                const ok = shopping.removeItemByIndex(groupId, target, idx, person);
                replyText = ok
                    ? `✅ Item ${idx} removido da lista *${target}*.`
                    : '❌ Item não encontrado na lista.';
                break;
            }

            case 'CLEAR_LIST': {
                const target = (result.listTarget || 'mercado').toLowerCase();
                shopping.clearList(groupId, target);
                replyText = `✅ Lista *${target}* limpa com sucesso!`;
                break;
            }

            // ── Ajuda ─────────────────────────────────────────────────────────
            case 'GET_HELP':
                switch (result.helpCategory) {
                    case 'GRUPOS':
                        replyText =
                            '👥 *Como gerenciar o grupo/família:*\n\n' +
                            '• _"Adiciona o 11999999999 ao grupo"_\n' +
                            '• `Grupo renomear 11999999999 para Esposa`\n' +
                            '• _"Mostre as pessoas do meu grupo"_\n' +
                            '• `Grupo retirar 11999999999`';
                        break;
                    case 'LISTAS':
                        replyText =
                            '🛒 *Listas de Compras — fale naturalmente:*\n\n' +
                            '• _"Adiciona azeitonas e maionese na lista do mercado"_\n' +
                            '• _"Me mostra a lista do mercado"_\n' +
                            '• _"Remove o item 2 da lista de casa"_\n' +
                            '• _"Limpa a lista do mercado"_\n\n' +
                            'Lista pessoal:\n' +
                            '• _"Adiciona leite na lista da Maria"_\n' +
                            '• _"Mostra a lista de compras da Maria"_';
                        break;
                    case 'RELATORIOS':
                        replyText =
                            '📋 *Relatórios — fale naturalmente:*\n\n' +
                            '• _"Me mostre o extrato de fevereiro"_\n' +
                            '• _"Me manda o extrato detalhado"_\n' +
                            '• _"Manda o gráfico de gastos"_\n' +
                            '• _"Quanto o Erick gastou em janeiro?"_\n' +
                            '• _"Qual o nosso saldo?"_\n' +
                            '• _"Apaga a padaria do extrato"_';
                        break;
                    case 'WEB':
                        replyText =
                            '🌐 *Painel Web:*\n\n' +
                            '👉 `Grupo nome Família Silva`\n' +
                            '👉 `Grupo senha 123456`\n' +
                            '👉 `Grupo renomeargrupo NovoNome` (para alterar)\n\n' +
                            'Depois acesse o link do Ngrok!';
                        break;
                    default:
                        replyText =
                            '🤖 Pode falar comigo naturalmente, por áudio ou texto!\n\n' +
                            '💸 _"Gastei 45 reais no mercado"_\n' +
                            '📋 _"Me mostre o extrato de fevereiro"_\n' +
                            '📊 _"Me manda o gráfico de gastos"_\n' +
                            '🛒 _"Adiciona azeitonas na lista do mercado"_\n' +
                            '👥 _"Mostre as pessoas do meu grupo"_\n\n' +
                            'Diga _"Ajuda com grupos"_, _"Ajuda com listas"_, _"Ajuda com relatórios"_ para mais detalhes.';
                }
                break;

            // ── Fallback: parser legado (Grupo senha, Grupo nome, etc.) ────────
            case 'UNKNOWN':
            default: {
                if (text) {
                    try {
                        const legacyResult = await processMessage(userId, text);
                        const unknownMsg   = '❌ Não entendi o que você quis dizer.';
                        if (legacyResult && !String(legacyResult).startsWith(unknownMsg)) {
                            if (typeof legacyResult === 'object' && legacyResult.type === 'chart') {
                                const imagePath = await generatePieChartImage(legacyResult.data, 'Gráfico');
                                const media    = MessageMedia.fromFilePath(imagePath);
                                await msg.reply(media, undefined, { caption: '📊 Gráfico de Gastos' });
                                setTimeout(() => { if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath); }, 5000);
                                await msg.react('✅');
                                return;
                            }
                            replyText = String(legacyResult);
                            break;
                        }
                    } catch (e) { /* segue para mensagem padrão */ }
                }
                replyText = '🤷‍♂️ Não entendi o que você quis dizer.\n\nTente ser mais específico ou diga _"Ajuda"_ para ver o que posso fazer.';
                break;
            }
        }

        if (replyText) {
            appendLog('INFO', userId, `📤 Resposta: "${replyText.substring(0, 60)}..."`);
            await msg.reply(replyText);
            await msg.react('✅');
        }

    } catch (e) {
        appendLog('ERROR', userId, 'Erro na IA', e.message);
        await msg.react('❌');
        await msg.reply('❌ Ops! Falha ao processar sua mensagem. Tente novamente em instantes.');
    }
}

module.exports = { handleMessage };
