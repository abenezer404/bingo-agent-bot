# UptimeRobot Setup for 24/7 Bot Monitoring

## What is UptimeRobot?
UptimeRobot is a free service that monitors your website/service and pings it regularly to keep it alive.

## Setup Steps:

### 1. Create UptimeRobot Account
1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Sign up for a free account
3. Verify your email

### 2. Add Your Bot Monitor
1. Click "Add New Monitor"
2. **Monitor Type**: HTTP(s)
3. **Friendly Name**: `Bingo Agent Bot`
4. **URL**: `https://your-bot-name.onrender.com/health`
5. **Monitoring Interval**: 5 minutes (free tier)
6. Click "Create Monitor"

### 3. Configure Alerts (Optional)
1. Add your email for downtime notifications
2. Set up Telegram/Slack notifications if needed

## Benefits:
- ✅ **Free**: Up to 50 monitors
- ✅ **Reliable**: Pings every 5 minutes
- ✅ **Notifications**: Get alerts when bot goes down
- ✅ **Statistics**: Monitor uptime percentage
- ✅ **No Code Changes**: Works with existing health endpoint

## Alternative Free Services:
- **Pingdom** (free tier)
- **StatusCake** (free tier)
- **Freshping** (free tier)