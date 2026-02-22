const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const { DB_PATH } = require('../config/settings');

function backupDb() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const src = DB_PATH;
  const dest = `${DB_PATH}.bak.${ts}`;
  fs.copyFileSync(src, dest);
  console.log('Backup created:', dest);
  return dest;
}

function mergeDuplicates() {
  const duplicates = db.prepare(`
    SELECT group_id, type, lower(name) AS lname, COUNT(*) AS cnt
    FROM shopping_lists
    WHERE name IS NOT NULL
    GROUP BY group_id, type, lname
    HAVING cnt > 1
  `).all();

  if (!duplicates.length) {
    console.log('No duplicate shopping lists found.');
    return;
  }

  const moveTx = db.transaction(() => {
    for (const dup of duplicates) {
      const { group_id, type, lname } = dup;
      const rows = db.prepare(
        `SELECT id, name, created_at FROM shopping_lists WHERE group_id = ? AND type = ? AND lower(name) = ? ORDER BY created_at ASC, id ASC`
      ).all(group_id, type, lname);

      const target = rows[0];
      const others = rows.slice(1);
      console.log(`Merging ${others.length} list(s) into id=${target.id} (${target.name}) for group=${group_id} type=${type} name=${lname}`);

      for (const o of others) {
        const otherId = o.id;
        const items = db.prepare('SELECT id, description, quantity FROM shopping_items WHERE list_id = ?').all(otherId);

        for (const it of items) {
          // try find same description (case-insensitive) in target
          const existing = db.prepare('SELECT id, quantity FROM shopping_items WHERE list_id = ? AND lower(description) = lower(?) LIMIT 1').get(target.id, it.description);
          if (existing) {
            db.prepare('UPDATE shopping_items SET quantity = ? WHERE id = ?').run(existing.quantity + (it.quantity || 0), existing.id);
            db.prepare('DELETE FROM shopping_items WHERE id = ?').run(it.id);
            console.log(`  - Merged item '${it.description}' qty ${it.quantity} into existing id=${existing.id}`);
          } else {
            db.prepare('UPDATE shopping_items SET list_id = ? WHERE id = ?').run(target.id, it.id);
            console.log(`  - Moved item '${it.description}' id=${it.id} -> list ${target.id}`);
          }
        }

        // remove the duplicate list row
        db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(otherId);
        console.log(`  - Removed duplicate list id=${otherId}`);
      }
    }

    // normalize remaining list names to lowercase
    db.prepare('UPDATE shopping_lists SET name = lower(name) WHERE name IS NOT NULL').run();
  });

  moveTx();
  console.log('Merge completed.');
}

function main() {
  try {
    const bak = backupDb();
    mergeDuplicates();
    console.log('Done. Database backup at:', bak);
  } catch (err) {
    console.error('Error during merge:', err);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
