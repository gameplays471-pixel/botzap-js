const { processMessage } = require('../execution/messageProcessor');
const { ensureUserExists } = require('../db/users');

const userId = '+55 11 98350-4881';
ensureUserExists(userId);

(async () => {
  const response = await processMessage(userId, 'lista mercado ver');
  console.log('Resposta completa do bot:');
  console.log(response);
  console.log('\n--- FIM ---');
})();
