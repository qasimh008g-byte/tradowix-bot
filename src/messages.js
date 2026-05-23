'use strict';

const path          = require('path');
const { DateTime }  = require('luxon');

const TIMEZONE      = 'Asia/Karachi';
const REFERRAL_LINK = 'https://tradowix.com/register?lid=71889791';
const SUPPORT       = '@OfficialPhantomXWix';
const BRAND         = 'TRADOWIX AI SIGNALS';

// ─── IMAGE PATHS ──────────────────────────────────────────────────────────────
const IMAGES = {
  UP:     path.resolve(__dirname, '../assets/up.jpg.jpeg'),
  DOWN:   path.resolve(__dirname, '../assets/down.jpg.jpeg'),
  PROFIT: path.resolve(__dirname, '../assets/profit.jpg.jpeg'),
  OTM:    path.resolve(__dirname, '../assets/otm.jpg.jpeg'),
};

// ─── TIME HELPERS ─────────────────────────────────────────────────────────────
function pkt(fmt = 'hh:mm a') {
  return DateTime.now().setZone(TIMEZONE).toFormat(fmt);
}

function pktFull() {
  return DateTime.now().setZone(TIMEZONE).toFormat('dd MMM yyyy  |  hh:mm:ss a');
}

// Returns the exact open time of the next 1-minute candle (ceiling to next whole minute)
function nextCandleTime() {
  const now      = DateTime.now().setZone(TIMEZONE);
  const msIntoMin = now.millisecond + now.second * 1000;
  // If we're exactly on a minute boundary, next candle is 1 minute away
  const addMs    = msIntoMin === 0 ? 60000 : 60000 - msIntoMin;
  return now.plus(addMs).startOf('minute').toFormat('hh:mm a');
}

function tick(val) { return val ? '✅' : '❌'; }

function confidenceBar(pct) {
  const filled = Math.round(pct / 10);
  return '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
}

// ─── SIGNAL MESSAGE ───────────────────────────────────────────────────────────
function buildSignalMessage(signal) {
  const dir    = signal.direction === 'UP' ? '▲ CALL  🟢' : '▼ PUT   🔴';
  const arrow  = signal.direction === 'UP' ? '📈' : '📉';
  const bar    = confidenceBar(signal.confidence);

  return `
╔══════════════════════════╗
  🤖 *TRADOWIX AI SIGNAL*
╚══════════════════════════╝

💎 *PAIR:*        \`${signal.pair}\`
⏰ *SIGNAL TIME:* \`${pkt('hh:mm:ss a')} PKT\`
🕯 *ENTRY TIME:*  \`${nextCandleTime()} PKT\`

${arrow} *DIRECTION:*  *${dir}*
⏳ *EXPIRY:*  \`1 MINUTE\`

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 *AI MARKET ANALYSIS*
━━━━━━━━━━━━━━━━━━━━━━━━
▸ RSI Momentum    ${tick(signal.rsi_confirmed)}  \`${signal.rsi_value.toFixed(1)}\`
▸ EMA Trend       ${tick(signal.ema_aligned)}  \`${signal.ema_trend}\`
▸ MACD Signal     ${tick(signal.macd_aligned)}  \`${signal.macd_signal}\`
▸ Volume Spike    ${tick(signal.volume_spike)}
▸ Smart Money     ${tick(signal.smart_money_flow)}
▸ Momentum        \`${signal.momentum > 0 ? '+' : ''}${signal.momentum}\`

⚡ *AI ACCURACY:*  \`${signal.confidence}%\`
${bar}

━━━━━━━━━━━━━━━━━━━━━━━━
💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}
━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── RECOVERY SIGNAL MESSAGE ──────────────────────────────────────────────────
function buildRecoverySignalMessage(signal) {
  const dir   = signal.direction === 'UP' ? '▲ CALL  🟢' : '▼ PUT   🔴';
  const arrow = signal.direction === 'UP' ? '📈' : '📉';
  const bar   = confidenceBar(signal.confidence);

  return `
╔══════════════════════════╗
  🔄 *RECOVERY SIGNAL*
╚══════════════════════════╝

⚡ *AI RECOVERY ENGINE ACTIVATED* ⚡

💎 *PAIR:*        \`${signal.pair}\`
⏰ *SIGNAL TIME:* \`${pkt('hh:mm:ss a')} PKT\`
🕯 *ENTRY TIME:*  \`${nextCandleTime()} PKT\`

${arrow} *DIRECTION:*  *${dir}*
⏳ *EXPIRY:*  \`1 MINUTE\`

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 *AI RECOVERY ANALYSIS*
━━━━━━━━━━━━━━━━━━━━━━━━
▸ RSI Reversal    ${tick(signal.rsi_confirmed)}  \`${signal.rsi_value.toFixed(1)}\`
▸ EMA Realign     ✅  \`${signal.ema_trend}\`
▸ MACD Cross      ✅  \`${signal.macd_signal}\`
▸ Volume Confirm  ${tick(signal.volume_spike)}
▸ Smart Money     ${tick(signal.smart_money_flow)}
▸ Momentum Shift  \`${signal.momentum > 0 ? '+' : ''}${signal.momentum}\`

⚡ *RECOVERY ACCURACY:*  \`${signal.confidence}%\`  _(Enhanced)_
${bar}

━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ _Strict risk management — 1× standard trade_
💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}
━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── PHOTO CAPTIONS (used with sendPhoto) ─────────────────────────────────────

function buildSignalCaption(signal) {
  const dir = signal.direction === 'UP' ? '📈 CALL' : '📉 PUT';
  return (
`📈 *PHANTOM WIX X AI SIGNAL* 📈

💱 *Pair:* \`${signal.pair}\`
⏰ *Entry Time:* \`${nextCandleTime()} PKT\`
⌛ *Expiry:* 1 Minute
📊 *Direction:* *${dir}*

⚡ _Take trade on NEXT candle only._
🔥 *Powered By PHANTOM WIX X*
📩 *Feedback:* ${SUPPORT}`
  );
}

function buildRecoveryCaption(signal) {
  const dir = signal.direction === 'UP' ? '📈 CALL' : '📉 PUT';
  return (
`🔄 *PHANTOM WIX X RECOVERY SIGNAL* 🔄

💱 *Pair:* \`${signal.pair}\`
⏰ *Entry Time:* \`${nextCandleTime()} PKT\`
⌛ *Expiry:* 1 Minute
📊 *Direction:* *${dir}*

⚡ _Recovery — strict risk management._
🔥 *Powered By PHANTOM WIX X*
📩 *Feedback:* ${SUPPORT}`
  );
}

function buildProfitCaption() {
  return (
`🎯 *TRADE RESULT: WIN* ✅

💰 Direct Profit Secured
📈 AI Prediction Successful
🏆 *Result: WIN*

🔥 *Powered By PHANTOM WIX X*
📩 *Feedback:* ${SUPPORT}`
  );
}

function buildOtmCaption() {
  return (
`🚨 *TRADE RESULT: OTM* ❌

📉 Market moved opposite.
⏳ Wait for recovery signal.

🔥 *Powered By PHANTOM WIX X*
📩 *Feedback:* ${SUPPORT}`
  );
}

// ─── WIN RESULT ───────────────────────────────────────────────────────────────
function buildWinMessage(signal) {
  return `
╔══════════════════════════╗
  🏆 *RESULT:  WIN  ✅*
╚══════════════════════════╝

💎 *PAIR:*  \`${signal.pair}\`
📈 *OUTCOME:*  *DIRECT WIN* 🟢
🕒 *CLOSED:*  \`${pktFull()} PKT\`

━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AI prediction confirmed!
💰 Profitable trade executed.
🔥 Keep following the signals!
━━━━━━━━━━━━━━━━━━━━━━━━

🚀 *Congratulations Traders!*
💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}`.trim();
}

// ─── LOSS RESULT ──────────────────────────────────────────────────────────────
function buildLossMessage(signal) {
  return `
╔══════════════════════════╗
  ❌ *RESULT:  LOSS*
╚══════════════════════════╝

💎 *PAIR:*  \`${signal.pair}\`
📉 *OUTCOME:*  Market reversal detected
🕒 *CLOSED:*  \`${pktFull()} PKT\`

━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ *Recovery signal incoming in 3 min...*
⚠️ Stay calm — manage your risk.
🧠 AI engine recalculating...
━━━━━━━━━━━━━━━━━━━━━━━━

💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}`.trim();
}

// ─── RECOVERY WIN ─────────────────────────────────────────────────────────────
function buildRecoveryWinMessage(signal) {
  return `
╔══════════════════════════╗
  🔄 *RECOVERY:  WIN  ✅*
╚══════════════════════════╝

💎 *PAIR:*  \`${signal.pair}\`
📈 *OUTCOME:*  *RECOVERY WIN* 🟢
🕒 *CLOSED:*  \`${pktFull()} PKT\`

━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *AI Recovery Engine Successful!*
💡 Loss recovered — profit secured.
🔥 Trust the system, stay disciplined!
━━━━━━━━━━━━━━━━━━━━━━━━

💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}`.trim();
}

// ─── RECOVERY LOSS ────────────────────────────────────────────────────────────
function buildRecoveryLossMessage(signal) {
  return `
╔══════════════════════════╗
  ⚠️ *RECOVERY:  LOSS*
╚══════════════════════════╝

💎 *PAIR:*  \`${signal.pair}\`
📉 Extreme volatility — recovery failed.
🕒 *CLOSED:*  \`${pktFull()} PKT\`

━━━━━━━━━━━━━━━━━━━━━━━━
⛔ *Pause trading — await next clean signal.*
📊 AI engine full recalibration mode.
💡 Never over-trade after a double loss.
━━━━━━━━━━━━━━━━━━━━━━━━

💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}`.trim();
}

// ─── DAILY STATS ──────────────────────────────────────────────────────────────
function buildStatsMessage(stats) {
  const date = DateTime.now().setZone(TIMEZONE).toFormat('dd MMM yyyy');

  if (!stats) {
    return `📊 *${BRAND} — DAILY STATS*\n\n_No signals recorded today yet._\n\n📩 ${SUPPORT}`;
  }

  const wr     = parseFloat(stats.win_rate || 0).toFixed(1);
  const bar    = confidenceBar(parseFloat(wr));

  return `
╔══════════════════════════╗
  📊 *TRADOWIX AI — STATS*
╚══════════════════════════╝

📅 *Date:*  \`${date} PKT\`

📈 *Total Signals:*  \`${stats.total_signals}\`
✅ *Wins:*            \`${stats.wins}\`
❌ *Losses:*          \`${stats.losses}\`
🔄 *Recoveries:*      \`${stats.recoveries}\`

🎯 *Win Rate:*  \`${wr}%\`
${bar}

━━━━━━━━━━━━━━━━━━━━━━━━
💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}
━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── STARTUP ──────────────────────────────────────────────────────────────────
function buildStartupMessage() {
  return `
╔══════════════════════════╗
  🤖 *TRADOWIX AI SIGNALS*
╚══════════════════════════╝

✅ *BOT IS NOW ONLINE* ✅

🕒 *Time:*      \`${pktFull()} PKT\`
📡 *Status:*    Auto-Signal Mode ACTIVE
🎯 *Strategy:*  AI Quantum Entry v2
⏰ *Interval:*  Continuous (15s after result)
🔁 *Mode:*      Fully Autonomous 24/7
🌏 *Timezone:*  Pakistan (PKT)

━━━━━━━━━━━━━━━━━━━━━━━━
🔥 *Powered by TRADOWIX AI Engine* 🔥
Get ready for premium OTC signals!
━━━━━━━━━━━━━━━━━━━━━━━━
💼 *Platform:* [TRADOWIX](${REFERRAL_LINK})
📩 *Feedback:* ${SUPPORT}
━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── WELCOME ──────────────────────────────────────────────────────────────────
function buildWelcomeMessage(name, referralCode, botUsername) {
  const refLink = referralCode
    ? `\n🔗 *Your Referral Link:*\n\`https://t.me/${botUsername}?start=${referralCode}\``
    : '';

  return `
╔══════════════════════════╗
  🤖 *TRADOWIX AI SIGNALS*
╚══════════════════════════╝

Welcome *${name}*! 👋

You are connected to the most advanced
AI-powered OTC Signal Bot.

━━━━━━━━━━━━━━━━━━━━━━━━
💼 *Trade on TRADOWIX:*
👉 ${REFERRAL_LINK}
${refLink}
━━━━━━━━━━━━━━━━━━━━━━━━
📩 *Support:* ${SUPPORT}`.trim();
}

module.exports = {
  // Photo caption builders (for sendPhoto)
  buildSignalCaption,
  buildRecoveryCaption,
  buildProfitCaption,
  buildOtmCaption,
  IMAGES,
  // Text message builders (startup, stats, welcome — no image)
  buildSignalMessage,
  buildRecoverySignalMessage,
  buildWinMessage,
  buildLossMessage,
  buildRecoveryWinMessage,
  buildRecoveryLossMessage,
  buildStatsMessage,
  buildStartupMessage,
  buildWelcomeMessage,
  TIMEZONE,
  REFERRAL_LINK,
  SUPPORT,
  BRAND
};
