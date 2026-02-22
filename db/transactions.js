const db = require('./connection');
const { ensureUserExists } = require('./users');

// Helpers de data
function currentMonth() {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().replace('T', ' ').slice(0, 19);
}

function getMonthItems(groupId, month = null) {
    const m = month || currentMonth();
    return db.prepare(`
        SELECT t.id, t.category, t.amount, t.date, t.description
        FROM transactions t
        JOIN users u ON t.user_id = u.phone_number
        WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = ?
        ORDER BY t.date ASC
    `).all(groupId, m).map((row, i) => ({ ...row, idx: i + 1 }));
}

function addTransaction(userId, description, amount, category = 'Outros', installments = 1, isRecurring = false) {
    if (amount <= 0) return '❌ O valor deve ser maior que zero.';
    try {
        ensureUserExists(userId);
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const count = isRecurring ? 12 : installments;
        const installValue = (installments > 1 && !isRecurring) ? amount / installments : amount;

        const insert = db.prepare(`
            INSERT INTO transactions (date, description, amount, category, user_id, installments_total, current_installment, is_recurring)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction(() => {
            for (let i = 0; i < count; i++) {
                let desc, instTotal, instCurr;
                if (isRecurring) {
                    desc = `${description} (Recorrente ${i + 1}/12)`;
                    instTotal = 1; instCurr = 1;
                } else if (installments > 1) {
                    desc = `${description} (${i + 1}/${installments})`;
                    instTotal = installments; instCurr = i + 1;
                } else {
                    desc = description;
                    instTotal = 1; instCurr = 1;
                }
                insert.run(addMonths(now, i), desc, installValue, category, userId, instTotal, instCurr, isRecurring ? 1 : 0);
            }
        });
        insertMany();

        if (isRecurring)      return `✅ Salvo: ${description} - R$ ${installValue.toFixed(2)} (Recorrente/mês)`;
        if (installments > 1) return `✅ Salvo: ${description} - R$ ${amount.toFixed(2)} (em ${installments}x de R$ ${installValue.toFixed(2)})`;
        return `✅ Salvo: ${description} - R$ ${amount.toFixed(2)} (${category})`;
    } catch (e) {
        return `❌ Erro ao salvar: ${e.message}`;
    }
}

function getBalance(userId) {
    const [groupId] = ensureUserExists(userId);
    const rows = db.prepare(`
        SELECT t.amount, t.category FROM transactions t
        JOIN users u ON t.user_id = u.phone_number
        WHERE u.group_id = ?
    `).all(groupId);
    return rows.reduce((acc, r) => r.category === 'Receita' ? acc + r.amount : acc - r.amount, 0);
}

function getReport(userId, month = null) {
    const [groupId] = ensureUserExists(userId);
    const items = getMonthItems(groupId, month);
    const m = month || currentMonth();
    const [year, mon] = m.split('-');
    const label = `${mon}/${year}`;

    if (!items.length) return `Nenhuma transação encontrada para ${label}.`;

    const income   = items.filter(i => i.category === 'Receita').reduce((s, i) => s + i.amount, 0);
    const expenses = items.filter(i => i.category !== 'Receita').reduce((s, i) => s + i.amount, 0);

    let report = `📊 *Extrato (${label}):*\n`;
    for (const item of items) {
        const emoji = item.category === 'Receita' ? '💰' : '🔻';
        const day = item.date.slice(5, 10).split('-').reverse().join('/');
        // Agora mostra a categoria entre colchetes
        report += `\n${item.idx}. ${emoji} ${day} ${item.description} [${item.category}]: R$ ${item.amount.toFixed(2)}`;
    }
    report += `\n\n----------------`;
    report += `\n📈 *Resumo:*`;
    report += `\nEntradas: R$ ${income.toFixed(2)}`;
    report += `\nSaídas:   R$ ${expenses.toFixed(2)}`;
    report += `\n💰 *Saldo Mês: R$ ${(income - expenses).toFixed(2)}*`;
    report += `\n\nPara apagar: \`Extrato Remover <números>\``;
    report += `\nPara editar: \`Extrato Editar <número> <descrição> <valor>\``;
    report += `\nPara mudar categoria: \`Extrato Categoria <número> <categoria>\``;
    report += `\nPara ver gráfico: \`Extrato Gráfico\``;
    return report;
}


function deleteTransaction(userId, indices) {
    try {
        const [groupId] = ensureUserExists(userId);
        const items = getMonthItems(groupId);
        
        // Garante que indices seja um array
        const idxArray = Array.isArray(indices) ? indices : [indices];
        
        // Filtra os itens que batem com os números passados
        const matches = items.filter(i => idxArray.includes(i.idx));
        
        if (!matches.length) return `❌ Nenhuma transação informada foi encontrada no extrato deste mês.`;

        const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');
        const deleteMany = db.transaction((matchesArray) => {
            for (const match of matchesArray) {
                deleteStmt.run(match.id);
            }
        });
        deleteMany(matches);

        // Se removeu só 1
        if (matches.length === 1) {
            return `✅ Transação ${matches[0].idx} (${matches[0].description}) removida com sucesso!`;
        }

        // Se removeu vários
        const removedNames = matches.map(m => ` - ${m.idx}. ${m.description}`);
        return `✅ ${matches.length} transações removidas com sucesso:\n${removedNames.join('\n')}`;
    } catch (e) {
        return `❌ Erro ao remover: ${e.message}`;
    }
}

function updateTransactionCategory(userId, index, newCategory) {
    try {
        const [groupId] = ensureUserExists(userId);
        const items = getMonthItems(groupId);
        const match = items.find(i => i.idx === index);
        if (!match) return `❌ Transação ${index} não encontrada no extrato deste mês.`;
        db.prepare('UPDATE transactions SET category = ? WHERE id = ?').run(newCategory, match.id);
        return `✅ Categoria do item ${index} (${match.description}) alterada para *${newCategory}*!`;
    } catch (e) {
        return `❌ Erro ao atualizar categoria: ${e.message}`;
    }
}

function isDuplicateTransaction(userId, description, amount, limit = 5) {
    try {
        const [groupId] = ensureUserExists(userId);
        const recent = db.prepare(`
            SELECT description, amount FROM transactions t
            JOIN users u ON t.user_id = u.phone_number
            WHERE u.group_id = ? ORDER BY t.id DESC LIMIT ?
        `).all(groupId, limit);
        return recent.some(r => r.description === description && Math.abs(r.amount - amount) < 0.01);
    } catch (_) { return false; }
}

function getDetailedExtract(userId) {
    try {
        const [groupId] = ensureUserExists(userId);
        const rows = db.prepare(`
            SELECT t.category, t.amount FROM transactions t
            JOIN users u ON t.user_id = u.phone_number
            WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
        `).all(groupId);

        if (!rows.length) return 'Nenhuma transação encontrada para este mês.';

        const income = {}, expense = {};
        for (const r of rows) {
            if (r.category === 'Receita') income[r.category]  = (income[r.category]  || 0) + r.amount;
            else                          expense[r.category] = (expense[r.category] || 0) + r.amount;
        }

        const month = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
        let res = `📑 *Extrato Detalhado (${month}):*\n\n`;

        if (Object.keys(expense).length) {
            res += '🔻 *Saídas:*\n';
            for (const cat of Object.keys(expense).sort()) res += `  - ${cat}: R$ ${expense[cat].toFixed(2)}\n`;
            res += '\n';
        }
        if (Object.keys(income).length) {
            res += '💰 *Entradas:*\n';
            for (const cat of Object.keys(income).sort()) res += `  - ${cat}: R$ ${income[cat].toFixed(2)}\n`;
            res += '\n';
        }

        const totalIn  = Object.values(income).reduce((s, v) => s + v, 0);
        const totalOut = Object.values(expense).reduce((s, v) => s + v, 0);
        res += `----------------\n`;
        res += `📈 Total Entradas: R$ ${totalIn.toFixed(2)}\n`;
        res += `📉 Total Saídas:   R$ ${totalOut.toFixed(2)}\n`;
        res += `💰 *Saldo: R$ ${(totalIn - totalOut).toFixed(2)}*`;
        return res;
    } catch (e) {
        return `❌ Erro ao gerar extrato: ${e.message}`;
    }
}

function getDailySummary(userId) {
    try {
        const [groupId] = ensureUserExists(userId);
        const today = new Date().toISOString().slice(0, 10);
        const rows = db.prepare(`
            SELECT t.amount, t.category FROM transactions t
            JOIN users u ON t.user_id = u.phone_number
            WHERE u.group_id = ? AND date(t.date) = ?
        `).all(groupId, today);

        if (!rows.length) return null;

        const income   = rows.filter(r => r.category === 'Receita').reduce((s, r) => s + r.amount, 0);
        const expenses = rows.filter(r => r.category !== 'Receita').reduce((s, r) => s + r.amount, 0);
        const day = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

        return `📅 *Resumo do Dia (${day}):*\n\n📈 Entradas: R$ ${income.toFixed(2)}\n📉 Saídas:   R$ ${expenses.toFixed(2)}\n💰 Saldo do Dia: R$ ${(income - expenses).toFixed(2)}`;
    } catch (_) { return null; }
}

module.exports = {
    addTransaction, getBalance, getReport, deleteTransaction,
    updateTransactionCategory, isDuplicateTransaction,
    getDetailedExtract, getDailySummary,
};
