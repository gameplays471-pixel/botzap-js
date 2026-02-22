const { setupDatabase } = require('../db/setup');
const { ensureUserExists } = require('../db/users');
const shopping = require('../db/shoppingLists');

setupDatabase();
const user = '+5511999999999';
const [groupId] = ensureUserExists(user);

console.log('Adding with person "Erick" (capital E)');
shopping.addItemToList(groupId, 'pessoal', 'Camisa', 2, user, 'Erick');

console.log('\nQuerying with "erick" (lowercase)');
const res = shopping.getListItems(groupId, 'pessoal', 'erick');
console.log(res.items);

console.log('\nQuerying with "Erick" (original)');
const res2 = shopping.getListItems(groupId, 'pessoal', 'Erick');
console.log(res2.items);
