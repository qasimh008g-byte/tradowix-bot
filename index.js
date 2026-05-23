'use strict';
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const db          = require('./src/db');
const loop        = require('./src/signalLoop');
const admin       = require('./src/adminCommands');
const msgs        = require('./src/messages');

const TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = loop.CHANNEL_ID;   // -1003887051531

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('TELEGRAM_BOT_TOKEN missing from .env — exiting');
  process.exit(1);
}

async function boot() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' TRADOWIX AI SIGNALS BOT — Booting');
  console.log(' Channel:', CHANNEL_ID);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── Step 1: Kill stale polling / webhook session ────────────────────────────
  // Using a plain HTTPS call to deleteWebhook before starting polling
  // prevents the 409 Conflict that happens when a previous process didn't exit cleanly.
  const https = require('https');
  await new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (r.ok) console.log('[BOOT] Stale webhook/polling cleared (409 prevention)');
          else console.warn('[BOOT] deleteWebhook response:', body);
        } catch (_) {}
        resolve();
      });
    }).on('error', (err) => {
      console.warn('[BOOT] deleteWebhook request failed (non-fatal):', err.message);
      resolve();
    });
  });

  // Small pause to let Telegram process the deleteWebhook
  await new Promise(r => setTimeout(r, 1500));

  // ── Step 2: Start polling ───────────────────────────────────────────────────
  const bot = new TelegramBot(TOKEN, {
    polling: {
      autoStart: true,
      params: { timeout: 30, allowed_updates: ['message', 'channel_post'] }
    }
  });

  bot.on('polling_error', (err) => {
    if (err.message && err.message.includes('409')) {
      console.warn('[BOT] 409 Conflict — still resolving, will retry automatically');
    } else {
      console.error('[BOT] Polling error:', err.message);
    }
  });
  bot.on('error', (err) => console.error('[BOT] Error:', err.message));

  console.log('[BOOT] Telegram polling started');

  // ── Step 3: Wire modules ────────────────────────────────────────────────────
  loop.init(bot);
  admin.register(bot);
  console.log('[BOOT] Modules wired');

  // ── Step 4: Verify channel connectivity ─────────────────────────────────────
  try {
    const chat = await bot.getChat(CHANNEL_ID);
    console.log('[BOOT] ✅ CHANNEL CONNECTED —', chat.title || CHANNEL_ID, '| ID:', CHANNEL_ID);
  } catch (err) {
    console.error('[BOOT] ⛔ Cannot reach channel', CHANNEL_ID, '—', err.message);
    console.error('[BOOT]    Fix: Make sure the bot is added as ADMIN in the channel with "Post Messages" permission.');
    // Continue booting — admin can fix permissions without restarting
  }

  // ── Step 5: Ensure bot_running is set and start loop ────────────────────────
  const storedState = await db.getConfig('bot_running');

  if (storedState !== 'false') {
    await db.setConfig('bot_running', 'true');

    // Post startup banner
    const posted = await loop.post(msgs.buildStartupMessage());
    if (posted) {
      console.log('[BOOT] ✅ Startup message posted to channel', CHANNEL_ID);
    } else {
      console.warn('[BOOT] ⚠️  Startup message failed — check channel admin rights');
    }

    // Start the 24/7 signal loop
    await loop.start();

  } else {
    console.log('[BOOT] Loop is in stopped state (last /stopbot). Send /startbot to resume.');
  }

  console.log('[BOOT] Bot fully online.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

boot().catch((err) => {
  console.error('[FATAL]', err.message);
  console.error(err.stack);
  process.exit(1);
});
