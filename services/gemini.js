const API_KEY = 'AIzaSyA9brN_U1qkO8-uY36JDtNDo34tU4cGkOw';

async function extractTransactions(text, audioBase64, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const parts = [];
    
    if (audioBase64) parts.push({ inline_data: { mime_type: mimeType.split(';')[0], data: audioBase64 } });
    if (text) parts.push({ text: text });

    const currentDate = new Date().toISOString().slice(0, 10);

    const prompt = `Você é um assistente financeiro de IA. Analise a mensagem/áudio e descubra a intenção do usuário.
Data atual: ${currentDate}

Intenções permitidas: ADD_EXPENSE, GET_REPORT, GET_PERSONAL_REPORT, DELETE_EXPENSE, GET_BALANCE, GET_CHART, GET_HELP, UNKNOWN.

Formato JSON Obrigatório:
{
  "intent": "...",
    "expenses": [{"description": "Padaria", "amount": 25.0, "category": "Alimentação"}], 
  "personName": "Erick", 
  "month": "2026-01", 
  "deleteQuery": "mercado", 
  "deleteAmount": 50.0,
    "helpCategory": "GRUPOS" // Apenas se GET_HELP. Use "GRUPOS", "RELATORIOS", "WEB", "LANCAMENTOS", "LISTAS" ou "GERAL"
}`;

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

    if (!response.ok) throw new Error('Falha no Gemini');

    const data = await response.json();
    let resultText = data.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    
    return JSON.parse(resultText);
}

module.exports = { extractTransactions };

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

Se não conseguir extrair, retorne {"target":"unknown","items":[]}.
`;

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
