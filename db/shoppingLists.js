const db = require('./connection');

function ensureList(groupId, type, name = null) {
    const nameNorm = name ? name.trim().toLowerCase() : null;
    const existing = db.prepare(
        'SELECT id FROM shopping_lists WHERE group_id = ? AND type = ? AND (name IS ? OR name = ? )'
    ).get(groupId, type, nameNorm, nameNorm);

    if (existing) return existing.id;

    const info = db.prepare(
        'INSERT INTO shopping_lists (group_id, type, name) VALUES (?, ?, ?)'
    ).run(groupId, type, nameNorm);
    return info.lastInsertRowid;
}

function addItemToList(groupId, type, description, quantity = 1, addedBy = null, name = null) {
    const nameNorm = name ? name.trim().toLowerCase() : null;
    const listId = ensureList(groupId, type, nameNorm);
    // Evita duplicata imediata: mesmo item (case-insensitive) adicionado nos últimos 10 segundos
    try {
        const existing = db.prepare(
            'SELECT id FROM shopping_items WHERE list_id = ? AND LOWER(description) = LOWER(?) AND added_at >= datetime(\'now\', \'-10 seconds\')'
        ).get(listId, description);
        if (existing) return { id: existing.id, listId, duplicate: true };
    } catch (_) { /* ignore */ }

    const info = db.prepare(
        'INSERT INTO shopping_items (list_id, description, quantity, added_by) VALUES (?, ?, ?, ?)'
    ).run(listId, description, quantity, addedBy);
    return { id: info.lastInsertRowid, listId, duplicate: false };
}

function getListItems(groupId, type, name = null) {
    const nameNorm = name ? name.trim().toLowerCase() : null;
    const list = db.prepare(
        'SELECT id FROM shopping_lists WHERE group_id = ? AND type = ? AND (name IS ? OR name = ?)'
    ).get(groupId, type, nameNorm, nameNorm);

    if (!list) return { listId: null, items: [] };

        const items = db.prepare(
                `SELECT si.id, si.description, si.quantity, si.added_by, si.added_at, u.name AS added_name
                 FROM shopping_items si
                 LEFT JOIN users u ON
                     replace(replace(replace(replace(replace(replace(si.added_by,' ',''),'-',''),'+',''),'.',''), '(', ''), ')', '') =
                     replace(replace(replace(replace(replace(replace(u.phone_number,' ',''),'-',''),'+',''),'.',''), '(', ''), ')', '')
                 WHERE si.list_id = ? ORDER BY si.id`
        ).all(list.id);

    return { listId: list.id, items };
}

function removeItemByIndex(groupId, type, index, name = null) {
    const { listId, items } = getListItems(groupId, type, name);
    if (!listId) return false;
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) return false;
    const item = items[idx - 1];
    db.prepare('DELETE FROM shopping_items WHERE id = ?').run(item.id);
    return true;
}

function clearList(groupId, type, name = null) {
    const { listId } = getListItems(groupId, type, name);
    if (!listId) return false;
    db.prepare('DELETE FROM shopping_items WHERE list_id = ?').run(listId);
    return true;
}

function getAllLists(groupId) {
    const lists = db.prepare('SELECT id, type, name, created_at FROM shopping_lists WHERE group_id = ?').all(groupId);
    return lists;
}

module.exports = {
    ensureList,
    addItemToList,
    getListItems,
    removeItemByIndex,
    clearList,
    getAllLists
};
