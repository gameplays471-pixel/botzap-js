const TIPS = [
    'Regra 50/30/20: 50% boletos, 30% desejos, 20% poupança.',
    'Compra por impulso? Coloca no carrinho e dá 24h. Se ainda fizer sentido amanhã, vai.',
    'Cozinhar em casa é o modo economia ativado. Comer fora todo dia é assinatura premium do susto no extrato.',
    'Revisão de assinaturas: se não usa, cancela. Seu cartão não precisa sustentar app em regime de pensão.',
    'Automatize a poupança no dia que cair o salário. Dinheiro que nem estaciona na conta: menos chance de sumir.',
    'Marca genérica é a arte de pagar menos pelo mesmo objetivo. Muitas vezes muda a embalagem, não o resultado.',
    'Promoção "leve 3": pergunte se você queria 3 ou se foi hipnotizado pelo cartaz.',
    'Mercado com fome é perigoso. Você entra pra comprar arroz e sai com um festival de snacks.',
    'Faça lista antes de comprar qualquer coisa. Sem lista, o carrinho vira passeio turístico.',
    'Parcelar é máquina do tempo: você se diverte agora e manda o problema pro seu "eu do futuro".',
    'Vai comprar algo caro? Pergunte: "Vou usar mesmo ou é empolgação momentânea?"',
    'Divide o preço pelo número de usos que imagina. Se o custo por uso doer, repensa.',
    'Faça um "dia sem gastar" na semana. Um dia de paz pro extrato e pra sua consciência.',
    'Negocie internet, celular e planos. A vergonha passa, o desconto fica.',
    'Se você não sabe pra onde o dinheiro vai, ele vai — e você só descobre quando é tarde.',
    'Venda o que tá parado. Seu armário pode estar guardando dinheiro em formato de coisa encostada.',
    'Quer comprar online? Remove o cartão salvo. A fricção extra salva vidas — e o saldo.',
    'Faça um check-up mensal: 15 min pra olhar gastos. Melhor 15 min agora do que 15 parcelas depois.',
];

function getSavingsTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
}

module.exports = { getSavingsTip };
