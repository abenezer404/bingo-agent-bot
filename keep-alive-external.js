// External Keep-Alive Script
// Run this on a different service (like GitHub Actions, Vercel, or another server)

const https = require('https');

const BOT_URL = 'https://bingo-agent-bot.onrender.com/health';

function pingBot() {
  const startTime = Date.now();
  
  https.get(BOT_URL, (res) => {
    const responseTime = Date.now() - startTime;
    console.log(`✅ Bot ping successful: ${res.statusCode} (${responseTime}ms) at ${new Date().toISOString()}`);
  }).on('error', (err) => {
    console.log(`❌ Bot ping failed: ${err.message} at ${new Date().toISOString()}`);
  });
}

// Ping every 10 minutes
setInterval(pingBot, 10 * 60 * 1000);

// Initial ping
pingBot();

console.log('🔄 External keep-alive monitor started (10-minute intervals)');
console.log(`📡 Monitoring: ${BOT_URL}`);