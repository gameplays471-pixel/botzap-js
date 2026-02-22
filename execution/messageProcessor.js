/*const { addTransaction, getBalance, getReport, deleteTransaction,
        isDuplicateTransaction, getDetailedExtract,
        updateTransactionCategory } = require('../db/transactions');*/
const { addMember, removeMember, getGroupMembers, ensureUserExists } = require('../db/users');
const { isDuplicateCommand }                        = require('../db/settingsOps');
const { CATEGORIES, matchCategory, autoCategorize } = require('../config/categories');
const { getSavingsTip }                             = require('./savingsAdvisor');
const gemini = require('../services/gemini');

function normalizePhone(phoneStr) {
    if (!phoneStr) return phoneStr;
    let cleaned = phoneStr.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').trim();
    let digits = cleaned.replace(/\D/g, '');
    if (!digits) return phoneStr;
    if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
    if (digits.length === 11) return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return phoneStr.startsWith('+') ? phoneStr : '+' + digits;
}

async function processSingleLine(userId, incomingMsg) {
    // Remove todos os acentos (á, ê, ção -> a, e, cao) e deixa tudo minúsculo
    const msgLower = incomingMsg
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
        
    if (!msgLower) return null;

    const isTransaction = /\d/.test(msgLower);

    // Não aplicar deduplicação para comandos de consulta / view (listas, extratos, ajuda, etc.)
    const dedupeSkipPrefixes = ['lista ', 'listas ', 'extrato', 'relatorio', 'relatório', 'ajuda', 'help', 'menu', 'saldo', 'categorias', 'grupo '];
    const shouldDedupe = !isTransaction && !dedupeSkipPrefixes.some(p => msgLower.startsWith(p));
    if (shouldDedupe && isDuplicateCommand(userId, msgLower)) return 'DUPLICATE_IGNORE';

    // 0. AJUSTE DE SALDO
    if (msgLower.startsWith('saldo +') || msgLower.startsWith('saldo -')) {
        const parts = incomingMsg.trim().split(/\s+/);
        const amount = parseFloat((parts[2] || '').replace(',', '.'));
        if (isNaN(amount)) return '❌ Formato inválido. Use: `Saldo + 1000` ou `Saldo - 50`';
        const cat = parts[1] === '+' ? 'Receita' : 'Outros';
        return addTransaction(userId, 'Ajuste de Saldo', amount, cat);
    }

        // 1. GRUPO
    if (msgLower.startsWith('grupo ')) {
        const cmd = msgLower.slice(6).trim();
        const raw = incomingMsg.trim().slice(6).trim(); // versão com acentos originais

        if (cmd.startsWith('adicionar ')) {
            const num = raw.slice(9).trim();
            return addMember(userId, normalizePhone(num));
        }
        if (cmd.startsWith('retirar ') || cmd.startsWith('remover ')) {
            const num = raw.slice(8).trim();
            return removeMember(userId, normalizePhone(num));
        }
        if (cmd.startsWith('renomear ')) {
            const text = raw.slice(9).trim();
            const match = text.match(/(.+)\s+para\s+(.+)/i);
            if (!match) return "❌ Formato inválido.\nUse: `Grupo renomear <numero> para <nome>`";
            return renameUser(userId, match[1].trim(), match[2].trim());
        }
        if (cmd === 'ver' || cmd === 'membros') {
            return getGroupMembersWithNames(userId);
        }

        // --- NOVOS COMANDOS DE AUTENTICAÇÃO WEB ---
        if (cmd.startsWith('nome ')) {
            const groupName = raw.slice(5).trim();
            if (!groupName) return '❌ Use: `Grupo nome Família Silva`';
            try {
                const [groupId] = ensureUserExists(userId);
                const db = require('../db/connection');
                
                // Verifica se já existe um nome cadastrado
                const existing = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
                if (existing && existing.name) {
                    return `❌ Seu grupo já tem o nome *${existing.name}*.\nPara alterar, use \`Grupo alterar nome <novo nome>\`.`;
                }
                
                db.prepare('INSERT OR REPLACE INTO groups (id, name) VALUES (?, ?)').run(groupId, groupName);
                return `✅ Nome do grupo definido como *${groupName}*!\n\nAgora defina a senha de acesso com:\n\`Grupo senha SUA_SENHA_AQUI\``;
            } catch (e) {
                return `❌ Erro: ${e.message}`;
            }
        }

        if (cmd.startsWith('senha ')) {
            const password = raw.slice(6).trim();
            if (!password) return '❌ Use: `Grupo senha minhasenha123`';
            try {
                const [groupId] = ensureUserExists(userId);
                const db = require('../db/connection');
                
                const existing = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
                if (!existing || !existing.name) {
                    return `❌ Primeiro defina o nome do grupo com:\n\`Grupo nome Família Silva\``;
                }
                
                db.prepare('UPDATE groups SET password = ? WHERE id = ?').run(password, groupId);
                return `🔒 Senha definida com sucesso!\n\nAgora você pode acessar o painel em:\n👉 http://seu-link-ngrok\n\nUsuário: *${existing.name}*\nSenha: *${password}*`;
            } catch (e) {
                return `❌ Erro: ${e.message}`;
            }
        }

                // ... (comandos anteriores de nome e senha)

        if (cmd.startsWith('renomeargrupo ')) {
            const newName = raw.slice(14).trim();
            try {
                const [groupId] = ensureUserExists(userId);
                const db = require('../db/connection');
                db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(newName, groupId);
                return `✅ Nome do grupo de acesso Web alterado para *${newName}*!`;
            } catch (e) {
                return `❌ Erro: ${e.message}`;
            }
        }


        if (cmd.startsWith('alterar nome ')) {
            const newName = raw.slice(13).trim();
            try {
                const [groupId] = ensureUserExists(userId);
                const db = require('../db/connection');
                db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(newName, groupId);
                return `✅ Nome do grupo alterado para *${newName}*!`;
            } catch (e) {
                return `❌ Erro: ${e.message}`;
            }
        }

        return '❌ Comando inválido.\nUse: `Grupo Adicionar`, `Grupo Remover`, `Grupo Renomear`, `Grupo nome`, `Grupo senha` ou `Grupo Ver`';
    }



    // 2. REMOVER TRANSAÇÃO
    // Aceita "extrato remover", "relatório remover", e "remover" para manter compatibilidade
    const removePrefixes = ['extrato remover ', 'relatório remover ', 'relatorio remover ', 'remover '];
    const matchedRemovePrefix = removePrefixes.find(p => msgLower.startsWith(p));
    if (matchedRemovePrefix) {
        const rest = incomingMsg.slice(matchedRemovePrefix.length).trim();
        // Permite dividir por espaços ou vírgulas (Ex: 1 2 3 ou 1, 2, 3)
        const parts = rest.split(/[\s,]+/).map(n => parseInt(n)).filter(n => !isNaN(n));
        
        if (parts.length === 0) {
            return '❌ Formato inválido.\nUse: `Extrato Remover <números>`\nExemplo: `Extrato Remover 1 2 4`';
        }
        return deleteTransaction(userId, parts);
    }

    // 3. MUDAR CATEGORIA
    const categoryPrefixes = ['extrato categoria', 'relatório categoria', 'relatorio categoria', 'report categoria'];
    const matchedPrefix = categoryPrefixes.find(p => msgLower.startsWith(p));
    if (matchedPrefix) {
        const rest = incomingMsg.trim().slice(matchedPrefix.length).trim();
        const [idxStr, ...catParts] = rest.split(/\s+/);
        const idx = parseInt(idxStr);
        const catInput = catParts.join(' ');
        if (isNaN(idx) || !catInput) {
            return '❌ Formato inválido.\nUse: `Extrato Categoria <número> <categoria>`\nExemplo: `Extrato Categoria 3 Contas`\nEnvie `Categorias` para ver a lista.';
        }
        const matched = matchCategory(catInput);
        if (!matched) {
            return `❌ Categoria "${catInput}" não reconhecida.\n\nCategorias: ${Object.keys(CATEGORIES).sort().join(', ')}`;
        }
        return updateTransactionCategory(userId, idx, matched);
    }

    // 3.5 EDITAR TRANSAÇÃO
    const editPrefixes = ['extrato editar ', 'relatório editar ', 'relatorio editar ', 'editar '];
    const matchedEditPrefix = editPrefixes.find(p => msgLower.startsWith(p));
    if (matchedEditPrefix) {
        const rest = incomingMsg.slice(matchedEditPrefix.length).trim();
        const parts = rest.split(/\s+/);
        const idx = parseInt(parts[0]);
        
        if (isNaN(idx) || parts.length < 2) {
            return '❌ Formato inválido.\nUse: `Extrato Editar <número> <descrição> <valor>`\nExemplo: `Extrato Editar 3 Uber 35.50`';
        }
        
        // Pega o último item como valor, o resto é descrição
        const lastPart = parts[parts.length - 1];
        const newAmount = parseFloat(lastPart.replace(',', '.'));
        
        let newDescription;
        if (!isNaN(newAmount) && newAmount > 0) {
            newDescription = parts.slice(1, -1).join(' ');
        } else {
            newDescription = parts.slice(1).join(' ');
        }
        
        const finalAmount = !isNaN(newAmount) && newAmount > 0 ? newAmount : null;
        return updateTransaction(userId, idx, newDescription, finalAmount);
    }

    // 3.7 GRÁFICO DE CATEGORIAS
    if (msgLower.includes('extrato gráfico') || msgLower.includes('relatorio gráfico') || msgLower.includes('grafico')) {
        const [groupId] = ensureUserExists(userId);
        const monthInput = msgLower.split(/gráfico|grafico/)[1]?.trim() || null;
        const month = parseMonth(monthInput);
        
        if (!month) {
            return '❌ Mês inválido. Use: `Extrato Gráfico Janeiro` ou `Extrato Gráfico 02/2026`';
        }
        
        const breakdown = getCategoryBreakdown(groupId, month);
        if (Object.keys(breakdown).length === 0) {
            return `📊 Nenhuma saída registrada para ${monthToLabel(month)}.`;
        }
        
        // Marca para ser processado depois (retorna caminho da imagem)
        return { type: 'chart', data: breakdown, month };
    }

    // 3.8 EXTRATO PESSOAL
    const personalPrefixes = ['extrato pessoal', 'relatório pessoal', 'relatorio pessoal'];
    const matchedPersonal = personalPrefixes.find(p => msgLower.startsWith(p));
    if (matchedPersonal) {
        const target = incomingMsg.trim().slice(matchedPersonal.length).trim();
        return getPersonalReport(userId, target || null);
    }

    // 4. RELATÓRIO DE MÊS ANTERIOR E ATUAL
    // Agora aceita com ou sem espaço, e com a abreviação "xtrato"
    const reportPrefixes = ['relatorio ', 'relatório ', 'extrato ', 'xtrato ', 'report ', 'relatorio', 'relatório', 'extrato', 'xtrato', 'report'];
    const matchedReportPrefix = reportPrefixes.find(p => msgLower.startsWith(p));
    if (matchedReportPrefix) {
        const rest = incomingMsg.slice(matchedReportPrefix.length).trim();
        // Se a pessoa digitou só "extrato", o rest é vazio
        if (!rest || !['detalhado', 'detailed', 'gráfico', 'grafico'].includes(rest.toLowerCase())) {
            const month = parseMonth(rest || null);
            if (!month) {
                return `❌ Mês inválido. Use: \`Relatório Janeiro\` ou \`Extrato 02/2026\``;
            }
            return getReport(userId, month);
        }
    }



    // 4. EXTRATO / RELATÓRIO
    if (['relatorio', 'relatório', 'report', 'gastos', 'total', 'extrato'].some(k => msgLower.includes(k))) {
        if (msgLower.includes('detalhado')) return getDetailedExtract(userId);
        return getReport(userId);
    }

    // 5. SALDO
    if (msgLower === 'saldo' || msgLower === 'balance') {
        return `💰 Saldo Atual do Grupo: R$ ${getBalance(userId).toFixed(2)}`;
    }

    // 6. CATEGORIAS
    if (msgLower === 'categorias' || msgLower === 'categories') {
        const lines = ['🏷️ *Categorias Disponíveis:*\n'];
        for (const cat of Object.keys(CATEGORIES).sort()) {
            const kws = CATEGORIES[cat];
            const sample = kws.slice(0, 6).map(k => k.charAt(0).toUpperCase() + k.slice(1));
            if (kws.length > 6) sample.push('...');
            lines.push(`*${cat}*`);
            lines.push(`  ${sample.join(', ')}\n`);
        }
        return lines.join('\n');
    }

    // 7. AJUDA (Menu Estático Completo)
    if (msgLower === 'ajuda' || msgLower === 'help' || msgLower === 'menu') {
        return (
            '🤖 *Menu Completo de Comandos*\n\n' +
            '💸 *Lançamentos*\n' +
            '👉 _Almoço 25_ (Nome e valor)\n' +
            '👉 _Cadeira 500 10x_ (Parcelado)\n' +
            '👉 _Remover 1_ (Apaga pelo ID)\n\n' +
            '📋 *Consultas*\n' +
            '👉 _Extrato_ (Lista do mês)\n' +
            '👉 _Extrato grafico_ (Gera Imagem)\n' +
            '👉 _Extrato pessoal_ (Por pessoa)\n' +
            '👉 _Saldo_ (Dinheiro restante)\n' +
            '👉 _Categorias_ (Ver as áreas)\n\n' +
            '🛒 *Listas de Compras*\n' +
            '👉 _Lista mercado adicionar Arroz 2_\n' +
            '👉 _Lista mercado ver_\n' +
            '👉 _Lista mercado remover 1_\n' +
            '👉 _Lista casa adicionar Detergente_\n' +
            '👉 _Lista pessoal adicionar Maria Leite 2_\n' +
            '👉 _Lista pessoal ver Maria_\n\n' +
            '👥 *Família / WhatsApp*\n' +
            '👉 _Grupo adicionar <numero>_\n' +
            '👉 _Grupo renomear <numero> para <Nome>_\n' +
            '👉 _Grupo ver_\n\n' +
            '🌐 *Painel Web (Site)*\n' +
            '👉 _Grupo nome <Nome de Login>_\n' +
            '👉 _Grupo senha <Senha de Login>_\n' +
            '👉 _Grupo renomeargrupo <Novo Nome>_\n\n' +
            '💡 *Dica de Ouro:* Você não precisa decorar isso! Mande áudios ou converse comigo. Ex:\n' +
            '_"Preciso de ajuda com grupos"_ ou _"Apaga a padaria do extrato"_'
        );
    }





    // 8. DICA
    // 7.5 LISTAS DE COMPRAS (mercado, casa, pessoal)
    // Interpretação natural via Gemini (ex: "adicione pra mim na lista de mercado pra eu comprar 1 arroz e 1 feijão")
    if ((/\blista\b/.test(msgLower) || /\bcomprar\b/.test(msgLower)) && /\badicione|coloque|ponha|adicona|adiciona|comprar\b/.test(msgLower)) {
        try {
            const parsed = await gemini.parseShoppingItems(incomingMsg);
            if (!parsed || parsed.items?.length === 0) {
                // deixa o processamento seguir para os comandos manuais
            } else {
                const [groupId] = ensureUserExists(userId);
                const shopping = require('../db/shoppingLists');
                const target = (parsed.target || 'mercado').toLowerCase();
                const person = parsed.person || null;
                const added = [];
                for (const it of parsed.items) {
                    const qty = parseInt(it.quantity || 1, 10) || 1;
                    const res = shopping.addItemToList(groupId, target === 'pessoal' ? 'pessoal' : (target === 'casa' ? 'casa' : 'mercado'), it.description, qty, normalizePhone(userId), person);
                    added.push(`${it.description}${qty>1? ' ('+qty+')':''}${res && res.duplicate ? ' (já existente)' : ''}`);
                }
                return `✅ Adicionados à lista ${target}${person? ' de '+person: ''}: ${added.join(', ')}`;
            }
        } catch (e) {
            // falha no Gemini — prosseguir com parsing manual
        }
    }
    const listPrefixes = ['lista ', 'listas '];
    const matchedListPrefix = listPrefixes.find(p => msgLower.startsWith(p));
    if (matchedListPrefix) {
        const raw = incomingMsg.trim().slice(matchedListPrefix.length).trim();
        if (!raw) return '❌ Use: `Lista mercado ver` ou `Lista mercado adicionar Arroz 2`';

        const parts = raw.split(/\s+/);
        const type = parts[0].toLowerCase();
        const action = (parts[1] || 'ver').toLowerCase();

        try {
            const [groupId] = ensureUserExists(userId);

            // Helper para formatar saída
            const formatList = (typeKey, name = null, displayName = null) => {
                const { items } = require('../db/shoppingLists').getListItems(groupId, typeKey, name);
                if (!items || items.length === 0) return `📝 *Lista ${typeKey}${displayName || name ? ' - ' + (displayName || name) : ''} vazia.*`;

                // Consolida itens similares (case-insensitive), somando quantidades
                const map = new Map();
                for (const it of items) {
                    const key = (it.description || '').trim().toLowerCase();
                    const addedByName = it.added_name || it.added_by;
                    if (!map.has(key)) map.set(key, { description: it.description.trim(), quantity: it.quantity || 1, added_by: addedByName });
                    else {
                        const cur = map.get(key);
                        cur.quantity = (cur.quantity || 0) + (it.quantity || 1);
                        if (!cur.added_by && addedByName) cur.added_by = addedByName;
                    }
                }

                const consolidated = Array.from(map.values());
                const lines = consolidated.map((it, i) => `${i+1}. ${it.description}${it.quantity && it.quantity>1 ? ' ('+it.quantity+')' : ''}${it.added_by ? ' — ' + it.added_by : ''}`);
                return `📝 *Lista ${typeKey}${displayName || name ? ' - ' + (displayName || name) : ''}:*\n` + lines.join('\n');
            };

            // Mercado / Casa
            if (type === 'mercado' || type === 'supermercado' || type === 'casa' || type === 'lar') {
                const listType = (type === 'casa' || type === 'lar') ? 'casa' : 'mercado';

                if (['ver','mostrar','listar'].includes(action)) {
                    return formatList(listType);
                }

                if (['adicionar','add','+'].includes(action)) {
                    // item is rest after action
                    const itemRaw = raw.split(/\s+/).slice(2).join(' ').trim();
                    if (!itemRaw) return '❌ Use: `Lista mercado adicionar Arroz 2`';
                    const tokens = itemRaw.split(/\s+/);
                    let quantity = 1;
                    const last = tokens[tokens.length-1];
                    if (/^\d+$/.test(last)) { quantity = parseInt(last,10); tokens.pop(); }
                    const description = tokens.join(' ');
                    const out = require('../db/shoppingLists').addItemToList(groupId, listType, description, quantity, normalizePhone(userId));
                    if (out && out.duplicate) return `⚠️ Item já estava na lista ${listType} (adicionado recentemente): *${description}*`;
                    return `✅ Item adicionado à Lista ${listType}: *${description}* ${quantity>1 ? '('+quantity+')' : ''}`;
                }

                if (['remover','apagar','del'].includes(action)) {
                    const idx = parseInt(parts[2]);
                    if (isNaN(idx)) return '❌ Use: `Lista mercado remover 2` (número do item)';
                    const ok = require('../db/shoppingLists').removeItemByIndex(groupId, listType, idx);
                    return ok ? `✅ Item ${idx} removido da Lista ${listType}.` : '❌ Item não encontrado.';
                }

                if (['limpar','clear'].includes(action)) {
                    require('../db/shoppingLists').clearList(groupId, listType);
                    return `✅ Lista ${listType} limpa.`;
                }
            }

            // Pessoal
            if (type === 'pessoal' || type === 'individual') {
                if (['ver','mostrar','listar'].includes(action)) {
                    const personInput = parts.slice(2).join(' ').trim() || parts[1] || null;
                    if (!personInput) return '❌ Use: `Lista pessoal ver Maria`';
                    const users = require('../db/users');
                    const found = users.findMemberByNameOrDigits((await ensureUserExists(userId))[0], personInput);
                    let listKey = personInput.toLowerCase();
                    let displayLabel = personInput;
                    if (found) {
                        listKey = found.name ? found.name.toLowerCase() : found.phone_number;
                        displayLabel = found.name || found.phone_number;
                    }
                    return formatList('pessoal', listKey, displayLabel);
                }

                if (['adicionar','add','+'].includes(action)) {
                    const person = parts[2];
                    const itemRaw = parts.slice(3).join(' ').trim();
                    if (!person || !itemRaw) return '❌ Use: `Lista pessoal adicionar Maria Leite 2`';
                    const tokens = itemRaw.split(/\s+/);
                    let quantity = 1;
                    const last = tokens[tokens.length-1];
                    if (/^\d+$/.test(last)) { quantity = parseInt(last,10); tokens.pop(); }
                    const description = tokens.join(' ');
                    const out = require('../db/shoppingLists').addItemToList(groupId, 'pessoal', description, quantity, normalizePhone(userId), person);
                    if (out && out.duplicate) return `⚠️ Item já estava na lista de ${person} (adicionado recentemente): *${description}*`;
                    return `✅ Item adicionado à Lista pessoal de *${person}*: *${description}* ${quantity>1 ? '('+quantity+')' : ''}`;
                }

                if (['remover','apagar','del'].includes(action)) {
                    const person = parts[2];
                    const idx = parseInt(parts[3]);
                    if (!person || isNaN(idx)) return '❌ Use: `Lista pessoal remover Maria 2`';
                    const ok = require('../db/shoppingLists').removeItemByIndex(groupId, 'pessoal', idx, person);
                    return ok ? `✅ Item ${idx} removido da Lista de ${person}.` : '❌ Item não encontrado.';
                }
            }

            return '❌ Tipo de lista inválido. Use: `mercado`, `casa` ou `pessoal`';
        } catch (e) {
            return `❌ Erro: ${e.message}`;
        }
    }

    if (msgLower.includes('dica') || msgLower.includes('tip')) return getSavingsTip();

    // 9. TRANSAÇÃO
    const parts = incomingMsg.trim().split(/\s+/);
    let amount = null, installments = 1, isRecurring = false;
    const descParts = [];

    for (const part of parts) {
        const val = parseFloat(part.replace(',', '.'));
        if (!isNaN(val) && val > 0 && amount === null) {
            amount = val;
        } else if (part.toLowerCase() === 'recorrente') {
            isRecurring = true;
        } else if (/^\d+x$/i.test(part)) {
            installments = parseInt(part);
        } else {
            descParts.push(part);
        }
    }

    if (amount === null) return null;

    const description = descParts.join(' ').trim();
    const category = autoCategorize(description);

    if (isDuplicateTransaction(userId, description, amount)) {
        return `⚠️ Já registrei '${description}' de R$ ${amount.toFixed(2)} recentemente. Ignorando duplicata.`;
    }

    return addTransaction(userId, description, amount, category, installments, isRecurring);
}

async function processMessage(userId, incomingMsg) {
    const lines = incomingMsg.split('\n');
    const responses = [];
    let hasNewTransaction = false;

    for (const line of lines) {
        const resp = await processSingleLine(userId, line);
        if (resp === 'DUPLICATE_IGNORE') continue;
        if (!resp) continue;

        responses.push(resp);

        // Se salvou lançamento, vamos mandar dica no final (1x por mensagem)
        if (typeof resp === 'string' && resp.includes('✅ Salvo')) {
            hasNewTransaction = true;
        }
    }

  if (!responses.length) {
    return (
      '❌ Não entendi o que você quis dizer.\n\n' +
      'Para lançar um gasto, mande *nome + valor*. Ex: *Quitanda 25*\n\n' +
      'Se quiser ver os comandos, mande *Ajuda*.'
    );
  }

  // Se for retorno especial (ex: gráfico), devolve ele puro
  if (responses.length === 1 && typeof responses[0] === 'object') {
    return responses[0];
  }

  let text = responses.join('\n');

  if (hasNewTransaction) {
    text += `\n\n${getSavingsTip()}`;
  }

  return text;
}



const { addTransaction, getBalance, getReport, deleteTransaction,
        isDuplicateTransaction, getDetailedExtract,
        updateTransactionCategory } = require('../db/transactions');
const { updateTransaction, getCategoryBreakdown, getTransactionsByMonth, renameUser, 
    getPersonalReport, getGroupMembersWithNames } = require('../db/transactionsAdvanced');
const { parseMonth, monthToLabel } = require('../utils/monthParser');
const { generateCategoryReport, generatePieChartImage } = require('../utils/chartGenerator');
module.exports = { processMessage, normalizePhone };
