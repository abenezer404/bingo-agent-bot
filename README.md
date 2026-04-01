# KELALBINGO Agent Bot

A Telegram bot for KELALBINGO agents to manage user funding and transactions.

## Features

- 🤖 **Agent Authentication**: Only authorized agents can use the bot
- 💰 **Balance Management**: View current credit balance
- 👥 **User Management**: View users in agent's area
- 💳 **Fund Users**: Transfer credits to users with address validation
- 📜 **Transaction History**: View recent transactions with pagination
- 🔒 **Security**: Address-based validation and secure database connections

## Environment Variables

The following environment variables are required:

```env
AGENT_BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=your_postgresql_connection_string
NODE_ENV=production
```

## Deployment

This bot is designed to be deployed on Render.com:

1. Connect your GitHub repository
2. Set environment variables in Render dashboard
3. Deploy as a Web Service (even though it's a bot, it needs to stay running)

## Commands

- `/start` - Initialize the bot and show main menu

## Bot Capabilities

### For Agents:
- View balance and profile information
- Browse users in their assigned area
- Fund users with credit validation
- View transaction history
- Address-based security validation

### Security Features:
- Telegram ID-based agent authentication
- Address matching for user funding
- Database transaction safety
- Error handling and logging

## Database Schema

The bot connects to the same PostgreSQL database as the admin server and requires these tables:
- `agents` - Agent information and balances
- `pending_users` - User accounts
- `agent_transactions` - Transaction history
- `user_packages` - User balance packages

## Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run the bot
npm start
```

## Support

For issues or questions, contact the development team.