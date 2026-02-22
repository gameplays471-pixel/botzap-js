const API_KEY = process.env.GEMINI_API_KEY || '';

// ─────────────────────────────────────────────────────────────────────────────
// extractTransactions — classificador universal de intenções
// Aceita texto e/ou áudio e retorna um JSON com a intenção e os parâmetros.
// ─────────────────────────────────────────────────────────────────────────────
async function extractTransactions(text, audioBase64, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const parts = [];

    if (audioBase64) parts.push({ inline_data: { mime_type: mimeType.split(';')[0], data: audioBase64 } });
    if (text) parts.push({ text: text });

    const currentDate = new Date().toISOString().slice(0, 10);

    const prompt = `Você é um assistente financeiro e pessoal de IA para WhatsApp. Analise a mensagem ou áudio e descubra a intenção do usuário.
Data atual: ${currentDate}

Intenções disponíveis:
- ADD_EXPENSE: registrar gasto/despesa com valor monetário
- GET_REPORT: ver extrato ou relatório resumido de um mês
- GET_DETAILED_EXTRACT: ver extrato detalhado com todos os lançamentos individuais (quando pedir "detalhado", "completo", "todos os lançamentos")
- GET_PERSONAL_REPORT: ver relatório de uma pessoa específica do grupo
- DELETE_EXPENSE: apagar ou remover um lançamento do extrato
- GET_BALANCE: ver saldo atual
- GET_CHART: ver gráfico de gastos
- GET_GROUP_MEMBERS: ver quem está no grupo/família, listar pessoas/membros
- ADD_MEMBER: adicionar número/pessoa ao grupo financeiro
- ADD_TO_LIST: adicionar itens a uma lista de compras (mercado, casa ou pessoal)
- VIEW_LIST: ver ou mostrar uma lista de compras
- REMOVE_FROM_LIST: remover item de uma lista pelo número/índice
- CLEAR_LIST: limpar ou apagar toda uma lista
- GET_HELP: pedir ajuda sobre como usar o bot
- UNKNOWN: intenção não identificada ou que exige um comando especial de sistema

Responda SOMENTE com JSON válido (sem markdown, sem texto extra), neste formato:
{
  "intent": "...",
  "expenses": [],
  "personName": null,
  "month": null,
  "deleteQuery": null,
  "deleteAmount": null,
  "helpCategory": null,
  "listTarget": null,
  "listPerson": null,
  "listItems": [],
  "listIndex": null,
  "newMemberPhone": null
}

Regras importantes:
- month: sempre no formato "YYYY-MM". Ex: fevereiro = "${currentDate.slice(0,4)}-02", janeiro = "${currentDate.slice(0,4)}-01", "mês passado" = mês anterior ao atual.
- listTarget: "mercado", "casa" ou "pessoal".
- listItems: array de {description, quantity} para ADD_TO_LIST.
- expenses: array de {description, amount, category} para ADD_EXPENSE. Categorias válidas: Alimentação, Transporte, Saúde, Lazer, Educação, Moradia, Contas, Vestuário, Outros.
- helpCategory: "GRUPOS", "RELATORIOS", "WEB", "LANCAMENTOS", "LISTAS" ou "GERAL" (apenas para GET_HELP).
- newMemberPhone: número de telefone (apenas dígitos) para ADD_MEMBER.
- Para GET_DETAILED_EXTRACT: use quando pedir extrato DETALHADO, completo ou todos os lançamentos.
- Para GET_REPORT: use para relatório/extrato simples de um mês.
- Para comandos de sistema como "Grupo senha", "Grupo nome", "Grupo renomear", "Grupo renomeargrupo", "Grupo alterar nome" use UNKNOWN (serão tratados pelo parser legado).`;

    const payload = {
        system_instruction: { parts: { text: prompt } },
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0.1 }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Falha no Gemini: ${response.status}`);

    const data = await response.json();
    let resultText = data.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    return JSON.parse(resultText);
}

// ─────────────────────────────────────────────────────────────────────────────
// parseShoppingItems — mantido para compatibilidade com fallback legado
// ─────────────────────────────────────────────────────────────────────────────
async function parseShoppingItems(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const currentDate = new Date().toISOString().slice(0, 10);
    const prompt = `Você é um assistente que converte comandos naturais de compra em uma lista estruturada.
Data atual: ${currentDate}

Receba uma frase em Português e retorne um JSON no formato:
{
  "target": "mercado|casa|pessoal",
  "person": "NomeOpcionalParaListasPessoais",
  "items": [ { "description": "Arroz", "quantity": 1 }, ... ]
}

Exemplos:
"adicione pra mim na lista de mercado pra eu comprar 1 arroz e 1 feijao"
=> {"target":"mercado","items":[{"description":"arroz","quantity":1},{"description":"feijao","quantity":1}]}

Se não conseguir extrair, retorne {"target":"unknown","items":[]}.`;

    const payload = {
        system_instruction: { parts: { text: prompt } },
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: 0.1 }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Falha no Gemini');

    const data = await response.json();
    let resultText = data.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
        return JSON.parse(resultText);
    } catch (e) {
        return { target: 'unknown', items: [] };
    }
}

module.exports = { extractTransactions, parseShoppingItems };
