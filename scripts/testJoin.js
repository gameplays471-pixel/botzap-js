const db = require('../db/connection');

const result = db.prepare(`
  SELECT si.id, si.description, si.added_by, u.name AS added_name
  FROM shopping_items si
  LEFT JOIN users u ON
    replace(replace(replace(replace(replace(replace(si.added_by,' ',''),'-',''),'+',''),'.',''), '(', ''), ')', '') =
    replace(replace(replace(replace(replace(replace(u.phone_number,' ',''),'-',''),'+',''),'.',''), '(', ''), ')', '')
  LIMIT 5
`).all();

console.log('JOIN result:');
console.log(result);
