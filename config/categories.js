// Dicionário de palavras-chave para categorização inteligente
const CATEGORIES = {
    'Alimentação': [
        'almoco', 'almoço', 'janta', 'jantar', 'cafe', 'café', 'lanche', 'comida',
        'supermercado', 'mercado', 'mercadinho', 'atacadao', 'assai', 'carrefour',
        'padaria', 'padoca', 'pao', 'açougue', 'acougue', 'carne', 'churrasco',
        'quitanda', 'sacolao', 'feira', 'fruta', 'verdura', 'hortifruti',
        'ifood', 'delivery', 'pizza', 'hamburguer', 'mcdonalds', 'burguer king',
        'sorvete', 'doce', 'sobremesa', 'bolo', 'restaurante', 'bar', 'boteco',
        'bebida', 'cerveja', 'refrigerante', 'agua'
    ],
    'Transporte': [
        'uber', '99', 'indrive', 'taxi', 'corrida',
        'gasolina', 'combustivel', 'etanol', 'alcool', 'diesel', 'posto', 'abastecer', 'gasosa',
        'onibus', 'onibus', 'metro', 'trem', 'cptm', 'passagem', 'bilhete', 'vt',
        'pedagio', 'estacionamento', 'zona azul',
        'mecanico', 'oficina', 'pneu', 'oleo', 'revisao', 'lavar carro', 'lava rapido',
        'ipva', 'multa', 'seguro carro'
    ],
    'Contas': [
        'luz', 'energia', 'enel', 'agua', 'sabesp', 'sanepar', 'copasa', 'gas',
        'internet', 'vivo', 'claro', 'tim', 'oi', 'telefone', 'celular', 'plano',
        'aluguel', 'condominio', 'iptu', 'iptu', 'prestacao', 'parcela casa',
        'tv', 'net', 'sky', 'boleto', 'fatura', 'cartao', 'nubank', 'itau', 'inter',
        'imposto', 'taxa', 'mensalidade', 'darf', 'das'
    ],
    'Saúde': [
        'farmacia', 'remedio', 'medicamento', 'droga raia', 'drogasil', 'pague menos',
        'medico', 'consulta', 'exame', 'hospital', 'pronto socorro', 'dentista',
        'terapia', 'psicologo', 'convenio', 'plano de saude', 'amil', 'bradesco saude',
        'oculos', 'lente', 'otica', 'suplemento', 'vitamina'
    ],
    'Lazer': [
        'cinema', 'filme', 'ingresso', 'teatro', 'show', 'festa', 'balada', 'ingresso',
        'viagem', 'hotel', 'airbnb', 'passagem aerea', 'voo', 'passeio',
        'jogo', 'videogame', 'playstation', 'xbox', 'nintendo', 'steam',
        'livro', 'amazon', 'brinquedo', 'presente'
    ],
    'Assinaturas': [
        'netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'hbo', 'max',
        'youtube', 'apple music', 'deezer', 'globo play',
        'academia', 'smart fit', 'bluefit', 'crossfit', 'natacao',
        'xbox game pass', 'ps plus', 'icloud', 'google drive'
    ],
    'Casa': [
        'faxina', 'diarista', 'limpeza', 'material de limpeza', 'produto de limpeza',
        'reforma', 'material de construcao', 'pedreiro', 'encanador', 'eletricista',
        'moveis', 'cadeira', 'mesa', 'sofa', 'cama', 'armario', 'guarda roupa',
        'eletrodomestico', 'geladeira', 'fogao', 'microondas', 'maquina de lavar',
        'tv', 'televisao', 'ventilador', 'ar condicionado', 'panela'
    ],
    'Pessoal': [
        'roupa', 'camisa', 'camiseta', 'calça', 'vestido', 'tenis', 'sapato', 'sapato', 'sandalia', 'loja',
        'cabelo', 'cabeleireiro', 'barbeiro', 'barbearia', 'salao', 'unha', 'manicure',
        'perfume', 'maquiagem', 'cosmetico', 'desodorante', 'shampoo',
        'joia', 'bijuteria', 'relogio', 'bolsa', 'mochila'
    ],
    'Educação': [
        'escola', 'faculdade', 'universidade', 'curso', 'aula', 'mensalidade',
        'ingles', 'idioma', 'material escolar', 'caderno', 'caneta', 'mochila',
        'livro', 'apostila', 'formatura'
    ],
    'Pet': [
        'pet', 'cachorro', 'gato', 'racao', 'ração', 'petshop', 'cobasi', 'petz',
        'veterinario', 'vacina', 'banho e tosa', 'brinquedo pet', 'areia gato', 'tapete higienico'
    ],
    'Receita': [
        'salario', 'pagamento', 'adiantamento', 'vale', 'bonus', 'ferias', 'decimo terceiro', '13',
        'pix recebido', 'transferencia', 'venda', 'rendimento', 'lucro', 'freela', 'bico',
        'reembolso', 'cashback', 'troco'
    ],
    'Outros': [] // Tudo que não encaixar vai para cá
};

// Remove acentos de uma string
function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Descobre a categoria correta com base no que a pessoa digitou
function autoCategorize(description) {
    if (!description) return 'Outros';
    
    // Deixa tudo em minúsculo e tira os acentos para facilitar a busca (ex: "Açougue" vira "acougue")
    const lowerDesc = removeAccents(description.toLowerCase());
    
    for (const [category, keywords] of Object.entries(CATEGORIES)) {
        // Se alguma palavra-chave daquela categoria estiver contida no texto que a pessoa mandou...
        if (keywords.some(kw => lowerDesc.includes(removeAccents(kw.toLowerCase())))) {
            return category;
        }
    }
    
    // Caso não encontre nenhuma palavra parecida
    return 'Outros';
}

// Para o comando "Extrato Categoria 1 Alimentação"
function matchCategory(input) {
    if (!input) return null;
    const lowerInput = removeAccents(input.toLowerCase().trim());
    
    for (const cat of Object.keys(CATEGORIES)) {
        if (removeAccents(cat.toLowerCase()) === lowerInput) {
            return cat;
        }
    }
    return null;
}

module.exports = {
    CATEGORIES,
    autoCategorize,
    matchCategory
};
