const { setupDatabase } = require('../db/setup');
const { processMessage } = require('../execution/messageProcessor');

// Inicializa DB (cria tabelas se necessário)
setupDatabase();

const user = '+5511999999999';

const tests = [
  'Lista mercado adicionar Arroz 2',
  'Lista mercado ver',
  'Lista mercado adicionar Leite',
  'Lista mercado ver',
  'Lista mercado remover 1',
  'Lista mercado ver',
  'Lista pessoal adicionar Maria Pao 3',
  'Lista pessoal ver Maria',
  'Lista pessoal remover Maria 1',
  'Lista casa adicionar Detergente',
  'Lista casa ver',
  'Lista mercado limpar',
  'Lista mercado ver'
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
  console.log('Testes concluídos.');
})();

