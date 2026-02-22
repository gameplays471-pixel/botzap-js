const { setupDatabase } = require('../db/setup');
const { processMessage } = require('../execution/messageProcessor');
const { ensureUserExists } = require('../db/users');

setupDatabase();

// Usar o mesmo número do usuário real: +55 11 98350-4881
const user = '+55 11 98350-4881';
ensureUserExists(user);

const tests = [
  'Lista mercado adicionar Arroz 2',
  'Lista mercado ver',
];

(async () => {
  for (const cmd of tests) {
    console.log('> CMD:', cmd);
    try {
      const out = await processMessage(user, cmd);
      console.log(typeof out === 'object' ? JSON.stringify(out, null, 2) : out);
    } catch (e) {
      console.error('ERRO:', e.message);
    }
    console.log('-----------------------------\n');
  }
})();
