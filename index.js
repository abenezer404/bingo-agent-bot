require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const AgentService = require('./src/services/agentService');
const { MainMenu, CancelMenu, BuildConfirmMenu } = require('./src/bot/keyboards');
const http = require('http');
const https = require('https');

// Health check server for Render
const server = http.createServer((req, res) => {
  // Enable CORS for health checks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'bingo-agent-bot',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// Keep-alive mechanism to prevent Render from sleeping
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

function keepAlive() {
  if (!RENDER_URL) {
    console.log('⚠️ RENDER_EXTERNAL_URL not set, skipping keep-alive ping');
    return;
  }

  const url = `${RENDER_URL}/health`;
  
  https.get(url, (res) => {
    console.log(`🔄 Keep-alive ping: ${res.statusCode} at ${new Date().toISOString()}`);
  }).on('error', (err) => {
    console.log(`⚠️ Keep-alive ping failed: ${err.message}`);
  });
}

// Ping every 14 minutes (before 15-minute sleep timeout)
if (process.env.NODE_ENV === 'production' && RENDER_URL) {
  setInterval(keepAlive, 14 * 60 * 1000); // 14 minutes
  console.log('🔄 Keep-alive mechanism started (14-minute intervals)');
  console.log(`🔗 Keep-alive URL: ${RENDER_URL}/health`);
} else {
  console.log('ℹ️ Keep-alive disabled (development mode or missing RENDER_EXTERNAL_URL)');
}

// Validate required environment variables
if (!process.env.AGENT_BOT_TOKEN) {
  console.error("❌ AGENT_BOT_TOKEN is missing in environment variables");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing in environment variables");
  process.exit(1);
}

// Initialize Bot
const token = process.env.AGENT_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
console.log(`🤖 Initializing Bot with token prefix: ${token.substring(0, 5)}...`);

// Basic state management for conversational UI
const userStates = new Map();
// States: 
// - IDLE
// - AWAITING_USERNAME_FOR_REG
// - AWAITING_PASSWORD_FOR_REG
// - AWAITING_AGENT_ADDRESS
// - AWAITING_USERNAME_FOR_FUND
// - AWAITING_AMOUNT_FOR_FUND

const setState = (chatId, state, data = {}) => {
  userStates.set(chatId, { state, data });
};

const getState = (chatId) => {
  return userStates.get(chatId) || { state: 'IDLE', data: {} };
};

const clearState = (chatId) => {
  userStates.set(chatId, { state: 'IDLE', data: {} });
};

// Middleware: Authenticate Agent
const requireAgent = async (chatId, callback) => {
  console.log(`🔍 Checking authorization for ChatID: ${chatId}`);
  try {
    const agent = await AgentService.getAgentByTelegramId(chatId);
    if (!agent) {
      console.log(`❌ No active agent found for ChatID: ${chatId}`);
      bot.sendMessage(chatId, `🚫 <b>Access Denied</b>\n\nYou are not authorized to use this bot.\n\nAsk the Admin to register your Telegram ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
      return;
    }
    console.log(`✅ Agent found: ${agent.name}`);
    callback(agent);
  } catch (err) {
    console.error(`🚨 Error in requireAgent for ChatID ${chatId}:`, err);
  }
};

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`✉️ Received /start from ChatID: ${chatId}`);
  clearState(chatId);
  
  requireAgent(chatId, (agent) => {
    const joinedDate = new Date(agent.created_at).toLocaleDateString();
    const addressText = agent.address ? agent.address : 'Not set';
    const welcomeText = `👋 <b>Welcome back, ${agent.name}!</b>\n\n💰 Balance: <b>${agent.credit_balance} ብር</b>\n📍 Address: <b>${addressText}</b>\n📅 Joined: <b>${joinedDate}</b>\n\nWhat would you like to do?`;
    bot.sendMessage(chatId, welcomeText, { 
      parse_mode: 'HTML',
      reply_markup: MainMenu.reply_markup
    });
  });
});

// Handle text messages (Conversational States)
bot.on('message', async (msg) => {
  console.log(`📩 Raw message received from ${msg.chat.id}: "${msg.text || '[Non-text message]'}"`);
  const chatId = msg.chat.id;
  if (!msg.text || msg.text.startsWith('/')) return;

  const text = msg.text.trim();
  const { state, data } = getState(chatId);

  // Handle Cancel
  if (text === '❌ Cancel') {
    clearState(chatId);
    bot.sendMessage(chatId, "Operation cancelled.", { reply_markup: { remove_keyboard: true } });
    
    // Return to main menu
    requireAgent(chatId, (agent) => {
      bot.sendMessage(chatId, "What would you like to do?", { reply_markup: MainMenu.reply_markup });
    });
    return;
  }

  requireAgent(chatId, async (agent) => {
    switch (state) {
      // --- FUND FLOW ---
      case 'AWAITING_SERIAL_FOR_FUND':
        setState(chatId, 'AWAITING_USERNAME_FOR_FUND', { ...data, serialNumber: text });
        bot.sendMessage(chatId, `Serial: <code>${text}</code>\n\nNow, enter the participant's precise <b>Username</b>:`, { parse_mode: 'HTML' });
        break;

      case 'AWAITING_USERNAME_FOR_FUND':
        // Validate user early and show address if available
        const pendingUser = await AgentService.getPendingUserByUsernameAndSerial(text, data.serialNumber);
        if (!pendingUser) {
          bot.sendMessage(chatId, `❌ User not found for\n\nSerial: <code>${data.serialNumber}</code>\nUsername: <b>${text}</b>\n\nPlease re-enter the <b>Username</b> exactly:`, { parse_mode: 'HTML' });
          return;
        }

        // ADDRESS VALIDATION: Check if user is in agent's area
        const agentAddress = agent.address ? agent.address.trim().toLowerCase() : '';
        const userAddress = pendingUser.address ? pendingUser.address.trim().toLowerCase() : '';

        if (!agentAddress) {
          bot.sendMessage(chatId, `❌ <b>Address Not Set</b>\n\nYou need an address set by the admin to fund users. Please contact the admin.`, { parse_mode: 'HTML' });
          clearState(chatId);
          return;
        }

        if (!userAddress) {
          bot.sendMessage(chatId, `❌ <b>User Address Missing</b>\n\nUser <b>${text}</b> doesn't have an address set. Users must have an address to receive funds.\n\nPlease try another user or ask the admin to set the user's address.`, { parse_mode: 'HTML' });
          return;
        }

        if (agentAddress !== userAddress) {
          bot.sendMessage(chatId, `❌ <b>Address Mismatch</b>\n\nYou can only fund users in your area.\n\nYour address: <b>${agent.address}</b>\nUser address: <b>${pendingUser.address}</b>\n\nPlease try a user from your area.`, { parse_mode: 'HTML' });
          return;
        }

        setState(chatId, 'AWAITING_AMOUNT_FOR_FUND', {
          ...data,
          targetUsername: text,
          targetUserId: pendingUser.id,
          targetAddress: pendingUser.address || null
        });

        const userAddressLine = pendingUser.address ? `📍 Address: <b>${pendingUser.address}</b> ✅\n` : '';
        bot.sendMessage(chatId, `✅ User found and validated.\n\nSerial: <code>${data.serialNumber}</code>\nUser: <b>${text}</b>\n${userAddressLine}\nEnter the amount to assign (ብር):`, { parse_mode: 'HTML' });
        break;

      case 'AWAITING_AMOUNT_FOR_FUND':
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Invalid amount. Please enter a valid number (e.g. 100):");
        }
        
        setState(chatId, 'CONFIRM_FUND', { ...data, amount });
        
        const addrLine = data.targetAddress ? `📍 Address: <b>${data.targetAddress}</b>\n` : '';
        bot.sendMessage(chatId, `⚠️ <b>Confirm Transaction</b>\n\nSerial: <code>${data.serialNumber}</code>\nUser: <b>${data.targetUsername}</b>\n${addrLine}Amount: <b>${amount} ብር</b>\n\nThis will be deducted from your credit balance. Proceed?`, {
          parse_mode: 'HTML',
          reply_markup: BuildConfirmMenu('confirm_fund').reply_markup
        });
        break;
    }
  });
});

// Handle button callbacks (Inline Keyboards)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  
  // Answer callback query immediately to stop loading spinner on button
  bot.answerCallbackQuery(query.id).catch(console.error);

  requireAgent(chatId, async (agent) => {
    switch (action) {
      case 'action_my_balance':
        bot.sendMessage(chatId, `💰 <b>Your Balance</b>\n\nYou currently have <b>${agent.credit_balance} ብር</b> in your account.`, { parse_mode: 'HTML' });
        break;

      case 'action_recent_transactions':
        const transactions = await AgentService.getAgentTransactions(agent.id);
        if (transactions.length === 0) {
          bot.sendMessage(chatId, "📭 <b>No transactions found.</b>", { parse_mode: 'HTML' });
          return;
        }

        // Show first page of transactions
        showTransactionsPage(chatId, agent, transactions, 0);
        break;

      case 'action_my_profile': {
        const joinedDate = new Date(agent.created_at).toLocaleDateString();
        const addressText = agent.address ? agent.address : 'Not set';
        const profileText = `👤 <b>My Profile</b>\n\nName: <b>${agent.name}</b>\nTelegram ID: <code>${chatId}</code>\n📍 Address: <b>${addressText}</b>\n💰 Balance: <b>${agent.credit_balance} ብር</b>\n📅 Joined: <b>${joinedDate}</b>`;
        bot.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        break;
      }

      case 'action_view_users':
        if (!agent.address) {
          bot.sendMessage(chatId, "❌ <b>Address Required</b>\n\nYou need an address set by the admin to view users in your area.", { parse_mode: 'HTML' });
          return;
        }

        const usersInArea = await AgentService.getUsersByAddress(agent.address);
        if (usersInArea.length === 0) {
          bot.sendMessage(chatId, `📭 <b>No Users Found</b>\n\nNo users found in your area: <b>${agent.address}</b>`, { parse_mode: 'HTML' });
          return;
        }

        // Show first page of users
        showUsersPage(chatId, agent, usersInArea, 0);
        break;

      case 'action_update_address':
        bot.sendMessage(chatId, "🔒 <b>Address Update Restricted</b>\n\nYour address can only be updated by the admin for security reasons. Please contact the admin if you need to change your address.", { parse_mode: 'HTML' });
        break;

      case 'action_fund_user':
        if (!agent.address) {
          bot.sendMessage(chatId, "❌ <b>Address Required</b>\n\nYou need an address set by the admin to fund users. Please contact the admin.", { parse_mode: 'HTML' });
          return;
        }

        const availableUsers = await AgentService.getUsersByAddress(agent.address);
        if (availableUsers.length === 0) {
          bot.sendMessage(chatId, `📭 <b>No Users in Your Area</b>\n\nNo users found in your area: <b>${agent.address}</b>\n\nUsers must have the same address as you to receive funds.`, { parse_mode: 'HTML' });
          return;
        }

        // Show funding page with user list
        showFundingUsersPage(chatId, agent, availableUsers, 0);
        break;

      case 'action_cancel':
        clearState(chatId);
        bot.editMessageText("Operation cancelled.", {
          chat_id: chatId,
          message_id: query.message.message_id
        });
        bot.sendMessage(chatId, "What would you like to do?", { reply_markup: MainMenu.reply_markup });
        break;

      case 'confirm_fund':
        const { state, data } = getState(chatId);
        if (state !== 'CONFIRM_FUND') {
          bot.sendMessage(chatId, "Transaction expired or invalid.");
          return;
        }

        // Edit original message to remove buttons to prevent double-click
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(console.error);

        bot.sendMessage(chatId, "⏳ Processing transaction...", { reply_markup: { remove_keyboard: true } });
        
        const fundResult = await AgentService.assignPackageToUser(agent.id, data.serialNumber, data.targetUsername, data.amount);
        clearState(chatId);
        
        if (fundResult.success) {
          bot.sendMessage(chatId, `✅ <b>Delivered Successfully!</b>\n\n<b>${data.amount} ብር</b> has been delivered to <b>${data.targetUsername}</b> (Serial: <code>${data.serialNumber}</code>).\n\nYour new balance: <b>${fundResult.newBalance} ብር</b>`, { parse_mode: 'HTML' });
        } else {
          bot.sendMessage(chatId, `❌ <b>Transaction Failed</b>\n\n${fundResult.message}`, { parse_mode: 'HTML' });
        }
        break;

      // Handle pagination for user lists
      default:
        if (action.startsWith('users_page_')) {
          const page = parseInt(action.split('_')[2]);
          const users = await AgentService.getUsersByAddress(agent.address);
          showUsersPage(chatId, agent, users, page, query.message.message_id);
        } else if (action.startsWith('funding_page_')) {
          const page = parseInt(action.split('_')[2]);
          const users = await AgentService.getUsersByAddress(agent.address);
          showFundingUsersPage(chatId, agent, users, page, query.message.message_id);
        } else if (action.startsWith('transactions_page_')) {
          const page = parseInt(action.split('_')[2]);
          const transactions = await AgentService.getAgentTransactions(agent.id);
          showTransactionsPage(chatId, agent, transactions, page, query.message.message_id);
        }
        break;
    }
  });
});

// Helper function to show paginated users list
function showUsersPage(chatId, agent, users, page = 0, messageId = null) {
  const USERS_PER_PAGE = 10;
  const startIndex = page * USERS_PER_PAGE;
  const endIndex = startIndex + USERS_PER_PAGE;
  const pageUsers = users.slice(startIndex, endIndex);
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE);

  let usersText = `👥 <b>Users in Your Area</b>\n📍 Address: <b>${agent.address}</b>\n\n`;
  usersText += `<b>Page ${page + 1} of ${totalPages} (${users.length} total users)</b>\n\n`;
  
  pageUsers.forEach((user, index) => {
    const globalIndex = startIndex + index + 1;
    usersText += `${globalIndex}. <b>${user.username}</b>\n`;
    if (user.machine_serial) {
      usersText += `   Serial: <code>${user.machine_serial}</code>\n`;
    }
    usersText += `   Joined: ${new Date(user.created_at).toLocaleDateString()}\n\n`;
  });

  // Create pagination buttons
  const buttons = [];
  if (page > 0) {
    buttons.push({ text: "⬅️ Previous", callback_data: `users_page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    buttons.push({ text: "Next ➡️", callback_data: `users_page_${page + 1}` });
  }

  const keyboard = buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;

  if (messageId) {
    // Edit existing message
    bot.editMessageText(usersText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(console.error);
  } else {
    // Send new message
    bot.sendMessage(chatId, usersText, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }
}

// Helper function to show paginated users list for funding
function showFundingUsersPage(chatId, agent, users, page = 0, messageId = null) {
  const USERS_PER_PAGE = 10;
  const startIndex = page * USERS_PER_PAGE;
  const endIndex = startIndex + USERS_PER_PAGE;
  const pageUsers = users.slice(startIndex, endIndex);
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE);

  let fundingText = `💳 <b>Fund User</b>\n📍 Your Area: <b>${agent.address}</b>\n💰 Your Balance: <b>${agent.credit_balance} ብር</b>\n\n`;
  fundingText += `<b>Available Users - Page ${page + 1} of ${totalPages} (${users.length} total)</b>\n\n`;
  
  pageUsers.forEach((user, index) => {
    const globalIndex = startIndex + index + 1;
    fundingText += `${globalIndex}. <b>${user.username}</b>`;
    if (user.machine_serial) {
      fundingText += ` (Serial: <code>${user.machine_serial}</code>)`;
    }
    fundingText += `\n`;
  });
  
  fundingText += `\nPlease enter the player's <b>User Serial Number</b>:`;

  // Create pagination buttons
  const buttons = [];
  if (page > 0) {
    buttons.push({ text: "⬅️ Previous", callback_data: `funding_page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    buttons.push({ text: "Next ➡️", callback_data: `funding_page_${page + 1}` });
  }

  const keyboard = buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;

  if (messageId) {
    // Edit existing message
    bot.editMessageText(fundingText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(console.error);
  } else {
    // Send new message and set state
    setState(chatId, 'AWAITING_SERIAL_FOR_FUND');
    bot.sendMessage(chatId, fundingText, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }
}

// Helper function to show paginated transactions
function showTransactionsPage(chatId, agent, transactions, page = 0, messageId = null) {
  const TRANSACTIONS_PER_PAGE = 5;
  const startIndex = page * TRANSACTIONS_PER_PAGE;
  const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
  const pageTransactions = transactions.slice(startIndex, endIndex);
  const totalPages = Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE);

  let historyText = `📜 <b>Your Recent Activity</b>\n\n`;
  historyText += `<b>Page ${page + 1} of ${totalPages} (${transactions.length} total transactions)</b>\n\n`;

  pageTransactions.forEach((tx, index) => {
    const globalIndex = startIndex + index + 1;
    const date = new Date(tx.created_at).toLocaleDateString();
    const time = new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let typeIcon, typeLabel;
    switch (tx.transaction_type) {
      case 'fund':
        typeIcon = '➕';
        typeLabel = 'Received from Admin';
        break;
      case 'transfer':
        typeIcon = '💸';
        typeLabel = `Transfer to ${tx.target_username || 'User'}`;
        break;
      case 'deduct':
        typeIcon = '➖';
        typeLabel = tx.target_username ? `Sent to ${tx.target_username}` : 'Deducted by Admin';
        break;
      default:
        typeIcon = '📝';
        typeLabel = tx.description || 'Transaction';
    }
    
    historyText += `${globalIndex}. ${typeIcon} <b>${tx.amount} ብር</b>\n`;
    historyText += `   ${typeLabel}\n`;
    historyText += `   📅 ${date} at ${time}\n\n`;
  });

  // Create pagination buttons
  const buttons = [];
  if (page > 0) {
    buttons.push({ text: "⬅️ Previous", callback_data: `transactions_page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    buttons.push({ text: "Next ➡️", callback_data: `transactions_page_${page + 1}` });
  }

  const keyboard = buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;

  if (messageId) {
    // Edit existing message
    bot.editMessageText(historyText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(console.error);
  } else {
    // Send new message
    bot.sendMessage(chatId, historyText, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }
}

// Add process error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit, try to continue running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, try to continue running
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  console.log('📊 Process info:', {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid
  });
  
  // Give the bot time to finish current operations
  setTimeout(() => {
    server.close(() => {
      console.log('🔌 HTTP server closed');
      process.exit(0);
    });
  }, 1000);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('🔌 HTTP server closed');
    process.exit(0);
  });
});

// Add error handling for server
server.on('error', (err) => {
  console.error('❌ HTTP server error:', err);
});

// Log when server is ready
server.on('listening', () => {
  console.log('✅ Health check server is ready to accept connections');
});

console.log('🤖 Telegram Agent Bot is starting...');
