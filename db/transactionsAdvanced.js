const db = require('./connection');
const { ensureUserExists } = require('./users');

function getTransactionsByMonth(groupId, monthStr) {
    // monthStr é "2026-02" ou null (usa mês atual)
    const m = monthStr || new Date().toISOString().slice(0, 7);
    
    return db.prepare(`
        SELECT t.id, t.category, t.amount, t.date, t.description
        FROM transactions t
        JOIN users u ON t.user_id = u.phone_number
        WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = ?
        ORDER BY t.date ASC
    `).all(groupId, m).map((row, i) => ({ ...row, idx: i + 1 }));
}

function updateTransaction(userId, index, newDescription, newAmount) {
    try {
        const [groupId] = ensureUserExists(userId);
        const items = getTransactionsByMonth(groupId);
        const match = items.find(i => i.idx === index);
        
        if (!match) return `❌ Transação ${index} não encontrada no extrato deste mês.`;
        
        const desc = newDescription || match.description;
        const amount = newAmount || match.amount;
        
        if (amount <= 0) return '❌ O valor deve ser maior que zero.';
        
        db.prepare(`
            UPDATE transactions 
            SET description = ?, amount = ? 
            WHERE id = ?
        `).run(desc, amount, match.id);
        
        return `✅ Transação ${index} atualizada!\n*${desc}* - R$ ${amount.toFixed(2)}`;
    } catch (e) {
        return `❌ Erro ao atualizar: ${e.message}`;
    }
}

function getCategoryBreakdown(groupId, monthStr) {
    // monthStr é "2026-02" ou null (usa mês atual)
    const m = monthStr || new Date().toISOString().slice(0, 7);
    
    const rows = db.prepare(`
        SELECT t.category, SUM(t.amount) as total
        FROM transactions t
        JOIN users u ON t.user_id = u.phone_number
        WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = ? AND t.category != 'Receita'
        GROUP BY t.category
        ORDER BY total DESC
    `).all(groupId, m);
    
    const breakdown = {};
    for (const row of rows) {
        breakdown[row.category] = row.total;
    }
    return breakdown;
}

function getMonthlyTimeline(groupId, monthsBack = 6) {
    // Retorna os últimos N meses com saldo de cada um
    const timeline = [];
    const now = new Date();
    
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toISOString().slice(0, 7);
        
        const rows = db.prepare(`
            SELECT t.amount, t.category FROM transactions t
            JOIN users u ON t.user_id = u.phone_number
            WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = ?
        `).all(groupId, monthStr);
        
        const income = rows.filter(r => r.category === 'Receita').reduce((s, r) => s + r.amount, 0);
        const expenses = rows.filter(r => r.category !== 'Receita').reduce((s, r) => s + r.amount, 0);
        const balance = income - expenses;
        
        timeline.push({
            month: monthStr,
            income,
            expenses,
            balance
        });
    }
    
    return timeline;
}
// Adiciona a coluna 'name' silenciosamente caso ela ainda não exista no banco de dados
try {
    db.prepare('ALTER TABLE users ADD COLUMN name TEXT').run();
} catch (e) { /* Coluna já existe */ }

function renameUser(userId, targetInput, newName) {
    try {
        const [groupId] = ensureUserExists(userId);
        const members = db.prepare('SELECT phone_number, name FROM users WHERE group_id = ?').all(groupId);
        
        // Permite buscar pelos últimos dígitos (ex: 98350)
        const digits = targetInput.replace(/\D/g, '');
        const target = members.find(m => digits && m.phone_number.includes(digits));
        
        if (!target) return `❌ Número não encontrado no seu grupo. Use 'Grupo Ver' para ver os números.`;

        db.prepare('UPDATE users SET name = ? WHERE phone_number = ?').run(newName, target.phone_number);
        return `✅ O número ${target.phone_number} agora se chama *${newName}*!`;
    } catch (e) {
        return `❌ Erro ao renomear: ${e.message}`;
    }
}

function getGroupMembersWithNames(userId) {
    const [groupId] = ensureUserExists(userId);
    const members = db.prepare('SELECT phone_number, name FROM users WHERE group_id = ?').all(groupId);
    
    let res = '👥 *Membros do Grupo:*\n\n';
    members.forEach(m => {
        const name = m.name ? ` *( ${m.name} )*` : '';
        res += `👤 ${m.phone_number}${name}\n`;
    });
    return res + '\nPara renomear alguém use:\n`Grupo renomear <numero> para <Nome>`';
}

function getPersonalReport(userId, targetName = null, monthStr = null) {
    const [groupId] = ensureUserExists(userId);
    const m = monthStr || new Date().toISOString().slice(0, 7);

    const rows = db.prepare(`
        SELECT t.amount, t.category, t.description, t.date, u.phone_number, u.name 
        FROM transactions t
        JOIN users u ON t.user_id = u.phone_number
        WHERE u.group_id = ? AND strftime('%Y-%m', t.date) = ?
        ORDER BY t.date ASC
    `).all(groupId, m);

    if (!rows.length) return `Nenhuma transação encontrada para este mês (${m}).`;

    // 1. Relatório Específico de Uma Pessoa
    if (targetName) {
        const search = targetName.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');
        
        const personRows = rows.filter(r => 
            (r.name && r.name.toLowerCase().includes(search)) || 
            (searchDigits && r.phone_number.includes(searchDigits))
        );

        if (!personRows.length) return `❌ Nenhum gasto encontrado para "${targetName}" neste mês.`;

        const personIdent = personRows[0].name || personRows[0].phone_number;
        let report = `👤 *Extrato de ${personIdent}*\n`;
        
        let inc = 0, exp = 0;
        personRows.forEach((item, i) => {
            const emoji = item.category === 'Receita' ? '💰' : '🔻';
            if (item.category === 'Receita') inc += item.amount;
            else exp += item.amount;
            
            const day = item.date.slice(5, 10).split('-').reverse().join('/');
            report += `\n${i+1}. ${emoji} ${day} ${item.description} [${item.category}]: R$ ${item.amount.toFixed(2)}`;
        });

        report += `\n\n📈 Entradas: R$ ${inc.toFixed(2)}`;
        report += `\n📉 Saídas: R$ ${exp.toFixed(2)}`;
        report += `\n💰 *Saldo da pessoa: R$ ${(inc - exp).toFixed(2)}*`;

        return report;
    }

    // 2. Resumo Geral de Todas as Pessoas
    const summary = {};
    for (const r of rows) {
        const ident = r.name || r.phone_number;
        if (!summary[ident]) summary[ident] = { inc: 0, exp: 0 };
        if (r.category === 'Receita') summary[ident].inc += r.amount;
        else summary[ident].exp += r.amount;
    }

    let report = `👥 *Resumo Pessoal do Mês*\n`;
    for (const [ident, totals] of Object.entries(summary)) {
        report += `\n👤 *${ident}*`;
        report += `\n   ⬆️ R$ ${totals.inc.toFixed(2)} | ⬇️ R$ ${totals.exp.toFixed(2)}`;
        report += `\n   ⚖️ Saldo Real: R$ ${(totals.inc - totals.exp).toFixed(2)}\n`;
    }
    return report;
}

// Nova função chamada pela Inteligência Artificial para apagar gastos
function deleteLatestTransactionByContext(userId, query, amount) {
    try {
        const [groupId] = ensureUserExists(userId);
        // Busca os últimos 50 gastos para tentar achar o que o usuário quer apagar
        const rows = db.prepare(`
            SELECT t.id, t.description, t.amount, t.date 
            FROM transactions t JOIN users u ON t.user_id = u.phone_number 
            WHERE u.group_id = ? ORDER BY t.date DESC LIMIT 50
        `).all(groupId);

        const match = rows.find(r => {
            const descMatch = query ? r.description.toLowerCase().includes(query.toLowerCase()) : true;
            const amtMatch = amount ? Math.abs(r.amount - amount) < 0.01 : true;
            return descMatch && amtMatch;
        });

        if (!match) return `❌ Não encontrei nenhum gasto recente parecido com "${query || ''} ${amount || ''}".`;

        db.prepare('DELETE FROM transactions WHERE id = ?').run(match.id);
        const day = match.date.slice(5, 10).split('-').reverse().join('/');
        return `✅ Gasto removido com sucesso: *${match.description}* (R$ ${match.amount.toFixed(2)}) de ${day}`;
    } catch (e) {
        return `❌ Erro ao remover: ${e.message}`;
    }
}


module.exports = {
    getTransactionsByMonth, updateTransaction, getCategoryBreakdown,
    getMonthlyTimeline, renameUser, getGroupMembersWithNames, 
    getPersonalReport, deleteLatestTransactionByContext
};


