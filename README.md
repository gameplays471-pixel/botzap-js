# 🤖 Botzap — Bot Financeiro Familiar para WhatsApp

Bot de controle financeiro familiar via WhatsApp, construído com **whatsapp-web.js** e **SQLite**.

## Pré-requisitos

- Node.js 18+
- Google Chrome instalado

## Instalação

```bash
npm install
```

## Como rodar

```bash
# Primeira vez (escaneie o QR Code)
npm start

# Forçar novo login (apaga a sessão salva)
npm run force-login

# Modo desenvolvimento (reinicia ao salvar arquivos)
npm run dev
```

## Estrutura de Arquivos

```
botzap-js/
├── index.js                   # Ponto de entrada
├── config/
│   ├── settings.js            # Configurações (DB_PATH, horários)
│   └── categories.js          # Categorias e palavras-chave
├── db/
│   ├── connection.js          # Conexão singleton com SQLite
│   ├── setup.js               # Criação/migração das tabelas
│   ├── transactions.js        # Operações financeiras
│   ├── users.js               # Grupos e membros
│   └── settingsOps.js         # Histórico de comandos e configurações
├── bot/
│   ├── monitor.js             # Handler de mensagens recebidas
│   └── scheduler.js           # Lembretes (8h) e relatório (20h)
└── execution/
    ├── messageProcessor.js    # Parser de comandos
    └── savingsAdvisor.js      # Dicas financeiras aleatórias
```

## Comandos disponíveis

| Comando | Descrição |
|---|---|
| `Almoço 25` | Registra gasto |
| `Cadeira 500 10x` | Gasto parcelado |
| `Netflix 50 recorrente` | Gasto recorrente |
| `Saldo + 1000` | Ajuste de saldo |
| `Relatório` | Extrato mensal |
| `Extrato Detalhado` | Extrato por categoria |
| `Saldo` | Saldo atual |
| `Categorias` | Lista de categorias e palavras-chave |
| `Remover 3` | Remove item 3 do extrato |
| `Extrato Categoria 3 Contas` | Muda categoria do item 3 |
| `Grupo Adicionar <número>` | Adiciona familiar ao grupo |
| `Grupo Retirar <número>` | Remove familiar do grupo |
| `Grupo Ver` | Lista membros do grupo |
| `Dica` | Dica financeira aleatória |
| `Ajuda` | Este menu |
