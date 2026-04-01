# Bingo Agent Bot - Render Deployment Guide

## Prerequisites

1. **Telegram Bot Token**: Get from [@BotFather](https://t.me/botfather) on Telegram
2. **GitHub Repository**: Push your code to GitHub
3. **Render Account**: Sign up at [render.com](https://render.com)
4. **Database**: PostgreSQL database URL (can use the same as admin server)

## Step-by-Step Deployment

### 1. Prepare Your Repository

```bash
# Make sure all changes are committed
git add .
git commit -m "prepare bot for deployment"
git push origin main
```

### 2. Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `bingo-agent-bot` folder (if it's a subfolder)

### 3. Configure Service Settings

**Basic Settings:**
- **Name**: `bingo-agent-bot` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Root Directory**: `bingo-agent-bot` (if it's a subfolder)

**Build & Deploy:**
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 4. Set Environment Variables

Add these environment variables in Render:

```
NODE_ENV=production
AGENT_BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL=postgresql://username:password@host:port/database
PORT=3000
```

**Important**: 
- Get `AGENT_BOT_TOKEN` from [@BotFather](https://t.me/botfather)
- Use the same `DATABASE_URL` as your admin server
- `PORT` is automatically set by Render, but we include it for compatibility

### 5. Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your bot
3. Monitor the deployment logs for any errors

### 6. Verify Deployment

1. **Check Health**: Visit your Render URL (e.g., `https://your-bot-name.onrender.com/health`)
2. **Test Bot**: Send `/start` to your Telegram bot
3. **Check Logs**: Monitor Render logs for any issues

## Environment Variables Explained

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `AGENT_BOT_TOKEN` | Telegram bot token from BotFather | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `PORT` | Server port (auto-set by Render) | `3000` |

## Troubleshooting

### Common Issues:

1. **Bot not responding**:
   - Check if `AGENT_BOT_TOKEN` is correct
   - Verify bot is not running elsewhere (only one instance allowed)

2. **Database connection errors**:
   - Verify `DATABASE_URL` is correct
   - Ensure database is accessible from Render

3. **Build failures**:
   - Check Node.js version compatibility
   - Verify all dependencies are in `package.json`

### Checking Logs:

1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. Look for error messages

### Health Check:

Your bot includes a health endpoint at `/health` that returns:
```json
{
  "status": "healthy",
  "service": "bingo-agent-bot", 
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45
}
```

## Post-Deployment

1. **Add Agents**: Use your admin server to add authorized agents
2. **Test Functionality**: Have agents test the bot features
3. **Monitor**: Keep an eye on logs and performance

## Updating the Bot

To update your deployed bot:

```bash
# Make changes to your code
git add .
git commit -m "update bot features"
git push origin main
```

Render will automatically redeploy when you push to the main branch.

## Support

If you encounter issues:
1. Check Render logs first
2. Verify environment variables
3. Test database connectivity
4. Ensure Telegram bot token is valid