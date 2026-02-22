const { setupDatabase } = require('../db/setup');
const { ensureUserExists } = require('../db/users');
const shopping = require('../db/shoppingLists');

setupDatabase();

const user = '+5511999999999';
const [groupId] = ensureUserExists(user);

// Simulação de retorno da IA para "Lista mercado adicionar arroz 1"
const parsedList = {
  target: 'mercado',
  person: null,
  items: [ { description: 'arroz', quantity: 1 } ]
};

(async () => {
  const added = [];
  for (const it of parsedList.items) {
    const qty = parseInt(it.quantity || 1, 10) || 1;
    const res = shopping.addItemToList(groupId, parsedList.target, it.description, qty, user, parsedList.person);
    added.push(`${it.description}${qty>1? ' ('+qty+')':''}${res && res.duplicate ? ' (já existente)' : ''}`);
  }
  const replyText = `✅ Adicionados à lista ${parsedList.target}${parsedList.person? ' de '+parsedList.person: ''}: ${added.join(', ')}`;
  console.log(replyText);
})();
