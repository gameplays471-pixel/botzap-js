const { randomUUID } = require('crypto');
const db = require('./connection');

function ensureUserExists(userId) {
    let row = db.prepare('SELECT group_id FROM users WHERE phone_number = ?').get(userId);
    if (!row) {
        const groupId = randomUUID();
        db.prepare('INSERT INTO users (phone_number, group_id) VALUES (?, ?)').run(userId, groupId);
        return [groupId, true]; // [groupId, isNew]
    }
    return [row.group_id, false];
}

function addMember(ownerId, newMemberId) {
    try {
        const owner = db.prepare('SELECT group_id FROM users WHERE phone_number = ?').get(ownerId);
        if (!owner) return '❌ Você ainda não tem um grupo. Envie uma transação primeiro.';
        db.prepare('INSERT OR REPLACE INTO users (phone_number, group_id) VALUES (?, ?)').run(newMemberId, owner.group_id);
        return `✅ Membro ${newMemberId} adicionado ao grupo familiar!`;
    } catch (e) {
        return `❌ Erro ao adicionar membro: ${e.message}`;
    }
}

function removeMember(ownerId, memberId) {
    try {
        const owner  = db.prepare('SELECT group_id FROM users WHERE phone_number = ?').get(ownerId);
        const member = db.prepare('SELECT group_id FROM users WHERE phone_number = ?').get(memberId);
        if (!owner)  return '❌ Você não tem um grupo.';
        if (!member) return '❌ Membro não encontrado.';
        if (owner.group_id !== member.group_id) return '❌ Este número não está no seu grupo.';
        const newGroup = randomUUID();
        db.prepare('UPDATE users SET group_id = ? WHERE phone_number = ?').run(newGroup, memberId);
        return `✅ Membro ${memberId} removido do grupo.`;
    } catch (e) {
        return `❌ Erro ao remover membro: ${e.message}`;
    }
}

function getGroupMembers(userId) {
    try {
        const [groupId] = ensureUserExists(userId);
        const rows = db.prepare('SELECT phone_number FROM users WHERE group_id = ?').all(groupId);
        if (!rows.length) return 'Nenhum membro encontrado.';
        return '👥 *Membros do Grupo:*\n' + rows.map((r, i) => `${i + 1}. ${r.phone_number}`).join('\n');
    } catch (e) {
        return `❌ Erro ao listar membros: ${e.message}`;
    }
}

function getLast10Users() {
    return db.prepare('SELECT phone_number FROM users ORDER BY created_at DESC LIMIT 10')
             .all()
             .map(r => r.phone_number);
}

function getAllGroupsToReport() {
    return db.prepare('SELECT group_id, phone_number FROM users GROUP BY group_id').all();
}

module.exports = { ensureUserExists, addMember, removeMember, getGroupMembers, getLast10Users, getAllGroupsToReport };

// Busca um membro do grupo pelo nome (case-insensitive) ou por dígitos do telefone.
function findMemberByNameOrDigits(groupId, input) {
    if (!input) return null;
    const digits = input.replace(/\D/g, '');
    // 1) tenta por nome exato (case-insensitive)
    const byName = db.prepare('SELECT phone_number, name FROM users WHERE group_id = ? AND lower(name) = lower(?) LIMIT 1').get(groupId, input);
    if (byName) return byName;
    // 2) tenta por número parcial (últimos dígitos)
    if (digits) {
        const byPhone = db.prepare('SELECT phone_number, name FROM users WHERE group_id = ? AND phone_number LIKE ? LIMIT 1').get(groupId, `%${digits}%`);
        if (byPhone) return byPhone;
    }
    return null;
}

module.exports = { ensureUserExists, addMember, removeMember, getGroupMembers, getLast10Users, getAllGroupsToReport, findMemberByNameOrDigits };
