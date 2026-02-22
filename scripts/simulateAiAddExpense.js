const { setupDatabase } = require('../db/setup');
const { ensureUserExists } = require('../db/users');
const { addTransaction, getReport } = require('../db/transactions');

setupDatabase();
const user = '+5511999999999';
ensureUserExists(user);

// Simula retorno da IA com intent ADD_EXPENSE
const expenses = [ { description: 'arroz', amount: 1.0, category: 'Mercado' } ];

(async () => {
  const resList = [];
  for (const exp of expenses) {
    resList.push(addTransaction(user, exp.description, exp.amount, exp.category, 1, false));
  }
  resList.push('\n' + require('../execution/savingsAdvisor').getSavingsTip());
  console.log('Resposta do handler ADD_EXPENSE:');
  console.log(resList.join('\n'));

  console.log('\nRelatório atual do mês (para confirmar que criou transação):');
  console.log(getReport(user));
})();
