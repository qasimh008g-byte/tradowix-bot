'use strict';

const db   = require('./db');
const msgs = require('./messages');
const loop = require('./signalLoop');

function parseAdminIds(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function isAdmin(telegramId) {
  const list = parseAdminIds(await db.getConfig('admin_ids'));
  return list.some(id => String(id) === String(telegramId));
}

function send(bot, chatId, text) {
  return bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
}

function register(bot) {

  // /setchannel <id>  — set the target channel ID
  bot.onText(/^\/setchannel (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) {
      send(bot, chatId, '⛔ Unauthorized — admin only.');
      return;
    }
    const rawId = match[1].trim();
    // Validate: must start with - (private channels are negative) or be numeric
    if (!/^-?\d+$/.test(rawId)) {
      send(bot, chatId,
        '⚠️ Invalid channel ID format.\n\n' +
        'Private channels use a negative number like: `-1001234567890`\n\n' +
        'To find your channel ID:\n' +
        '1. Add @userinfobot to your channel\n' +
        '2. It will print the channel ID\n' +
        '3. Then use /setchannel -100XXXXXXXXXX');
      return;
    }

    await db.setConfig('channel_id', rawId);

    // Try to verify the bot can reach it
    try {
      const chat = await bot.getChat(rawId);
      send(bot, chatId,
        `✅ *Channel Connected!*\n\n` +
        `📲 *Name:* ${chat.title || rawId}\n` +
        `🆔 *ID:* \`${rawId}\`\n\n` +
        `Bot will post signals here every 5 minutes.\n` +
        `Make sure bot is *Admin* with Post Messages permission.`);
      console.log('[CHANNEL] ✅ CHANNEL CONNECTED —', chat.title || rawId, '| ID:', rawId);
    } catch (err) {
      send(bot, chatId,
        `⚠️ Channel ID saved (\`${rawId}\`) but verification failed:\n` +
        `_${err.message}_\n\n` +
        `Check:\n` +
        `• Bot is added to the channel\n` +
        `• Bot is promoted to Admin\n` +
        `• Admin has "Post Messages" enabled`);
    }
  });

  // /getchannel — show current channel ID
  bot.onText(/^\/getchannel$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) {
      send(bot, chatId, '⛔ Unauthorized.');
      return;
    }
    const channelId = await loop.getChannelId();
    if (!channelId) {
      send(bot, chatId,
        '⚠️ *No channel configured yet.*\n\n' +
        'Use /setchannel \\-100XXXXXXXXXX\n' +
        'Or forward a message from your channel here.');
    } else {
      send(bot, chatId, `📲 *Current Channel ID:* \`${channelId}\``);
    }
  });

  // /startbot
  bot.onText(/^\/startbot$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) {
      send(bot, chatId, '⛔ Unauthorized — admin only.');
      return;
    }
    if (loop.isRunning()) {
      send(bot, chatId, '✅ Bot is already running and posting signals automatically.');
      return;
    }
    await db.setConfig('bot_running', 'true');
    await loop.post(msgs.buildStartupMessage());
    await loop.start();
    const channelId = await loop.getChannelId();
    send(bot, chatId,
      `✅ *TRADOWIX AI Signal Bot started!*\n` +
      `📲 Channel: \`${channelId || 'NOT SET'}\`\n` +
      `⏰ Continuous signals — 15s gap after each result.`);
  });

  // /stopbot
  bot.onText(/^\/stopbot$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) {
      send(bot, chatId, '⛔ Unauthorized — admin only.');
      return;
    }
    await db.setConfig('bot_running', 'false');
    loop.stop();
    send(bot, chatId, '🛑 *Bot stopped.* No more signals will be posted.');
  });

  // /forcewin
  bot.onText(/^\/forcewin$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    await loop.runSignalCycle('win');
    send(bot, chatId, '✅ Force WIN cycle fired.');
  });

  // /forceloss
  bot.onText(/^\/forceloss$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    await loop.runSignalCycle('loss');
    send(bot, chatId, '✅ Force LOSS cycle fired. Recovery follows in 3 min.');
  });

  // /stats
  bot.onText(/^\/stats$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    const stats = await db.getTodayStats();
    send(bot, chatId, msgs.buildStatsMessage(stats));
  });

  // /status
  bot.onText(/^\/status$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    const running   = loop.isRunning();
    const channelId = await loop.getChannelId();
    const winRate   = await db.getConfig('target_win_rate') || '88';
    send(bot, chatId,
      `*TRADOWIX AI Bot Status*\n\n` +
      `📡 Loop: ${running ? '✅ RUNNING' : '🛑 STOPPED'}\n` +
      `📲 Channel ID: \`${channelId || '⚠️ NOT SET'}\`\n` +
      `🎯 Win Rate: \`${winRate}%\`\n` +
      `⏰ Interval: Continuous (15s after result)`);
  });

  // /addadmin <id>
  bot.onText(/^\/addadmin (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    const newId = match[1].trim();
    const list  = parseAdminIds(await db.getConfig('admin_ids'));
    if (!list.some(id => String(id) === newId)) {
      list.push(newId);
      await db.setConfig('admin_ids', JSON.stringify(list));
    }
    send(bot, chatId, `✅ Admin \`${newId}\` added.`);
  });

  // /setwinrate <50-98>
  bot.onText(/^\/setwinrate (\d+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) { send(bot, chatId, '⛔ Unauthorized.'); return; }
    const rate = parseInt(match[1]);
    if (rate < 50 || rate > 98) { send(bot, chatId, '⚠️ Win rate must be 50–98.'); return; }
    await db.setConfig('target_win_rate', String(rate));
    send(bot, chatId, `✅ Win rate set to \`${rate}%\`.`);
  });

  // /help
  bot.onText(/^\/help$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(msg.from.id))) return;
    send(bot, chatId,
`*TRADOWIX AI Bot — Admin Commands*

/setchannel \\-100XXXXXXXXXX — Set channel ID
/getchannel — Show current channel ID
/startbot — Start auto signal posting
/stopbot — Stop signal posting
/status — Bot status
/forcewin — Force WIN cycle
/forceloss — Force LOSS \\+ recovery
/stats — Today's stats
/addadmin <id> — Add admin by user ID
/setwinrate <50\\-98> — Set AI win rate
/help — This menu

📌 *To find your private channel ID:*
Forward any message from your channel to this bot.
The ID will be saved automatically.`);
  });

  // /start — public welcome + referral tracking
  bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {
    const chatId   = msg.chat.id;
    const userId   = msg.from.id;
    const username = msg.from.username || '';
    const name     = [msg.from.first_name, msg.from.last_name]
      .filter(Boolean).join(' ') || 'Trader';
    const refCode  = match?.[1]?.trim() || '';

    const user = await db.upsertVipUser(userId, username, name);

    if (refCode && user) {
      const { data: referrer } = await db.supabase
        .from('vip_users')
        .select('telegram_id')
        .eq('referral_code', refCode)
        .maybeSingle();
      if (referrer && referrer.telegram_id !== userId) {
        await db.supabase
          .from('referrals')
          .insert({ referrer_telegram_id: referrer.telegram_id, referred_telegram_id: userId })
          .onConflict()
          .ignore();
      }
    }

    const botUsername = process.env.BOT_USERNAME || 'phantom_x_wix_v5_bot';
    send(bot, chatId, msgs.buildWelcomeMessage(name, user?.referral_code, botUsername));
  });
}

module.exports = { register, isAdmin };
