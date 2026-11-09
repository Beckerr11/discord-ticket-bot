# Discord Ticket Bot

Standalone Discord ticket bot built with `discord.js`, role-based permissions, and transcript logging.

## Highlights

- Slash command to publish a ticket panel
- Ticket creation with category-based routing
- Duplicate ticket protection per user
- Close button with transcript export
- Log channel support for operational visibility

## Stack

- Node.js
- discord.js v14
- discord-html-transcripts
- dotenv

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example file and add your Discord bot token.

3. Update `logChannels.json` with your server role, categories, and log channel IDs.

## Run locally

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## Slash command

After the bot is online, use:

```text
/ticket-panel channel:#support-panel
```

That command posts the ticket selector inside the chosen text channel.

## Configuration notes

- `cargoticket`: support team role that can access tickets
- `canallogsticket`: channel that receives transcript logs
- `categoria_suporte`: category for support tickets
- `categoria_denuncias`: category for report tickets
- `categoria_solicitarpremiacao`: category for billing or payout tickets
- `cor`: embed accent color

## Author

Becker
