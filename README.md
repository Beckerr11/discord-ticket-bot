# 🎫 Discord Ticket Bot

Um **sistema avançado de tickets para Discord** com logs, transcripts em HTML e botões interativos para gerenciamento de atendimentos.

## 🚀 Tecnologias Utilizadas
- Node.js
- discord.js v14
- discord-html-transcripts
- axios + form-data
- mongoose (MongoDB)
- nodemon (dev)

## 📥 Instalação
```bash
git clone https://github.com/SEU_USUARIO/discord-ticket-bot.git
cd discord-ticket-bot
npm install
```

## ⚙️ Configuração
Crie um arquivo `.env`:
```env
DISCORD_TOKEN=seu_token_aqui
MONGODB_URI=sua_string_de_conexao
```

Edite o `logChannels.json` com IDs do seu servidor.

## ▶️ Execução
```bash
npm start   # produção
npm run dev # desenvolvimento
```

## 📑 Inicialização
Use no Discord:
```
/ticket canal_ticket:#canal
```

---
👨‍💻 Desenvolvido com ❤️ para servidores Discord
