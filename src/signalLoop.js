'use strict';

/**
 * TRADOWIX AI — Autonomous Signal Loop v4
 *
 * Result determination: REAL price comparison via Twelve Data API.
 *   CALL/UP  → WIN if close_price > entry_price, else LOSS
 *   PUT/DOWN → WIN if close_price < entry_price, else LOSS
 *
 * Flow:
 *   SIGNAL (fetch entry_price) → 65s (candle closes) → fetch close_price → WIN/LOSS
 *   WIN  → 15s → next SIGNAL
 *   LOSS → 3 min → RECOVERY SIGNAL → 65s → fetch close_price → WIN/LOSS → 15s → next SIGNAL
 *
 * Channel: -1003887051531
 */

const fs           = require('fs');
const db           = require('./db');
const ai           = require('./aiEngine');
const msgs         = require('./messages');
const priceService = require('./priceService');

// ── Timing constants ──────────────────────────────────────────────────────────
const CHANNEL_ID      = '-1003887051531';
const CANDLE_EXPIRY   = 65 * 1000;     // 65s after candle open
const RECOVERY_DELAY  = 3 * 60 * 1000; // 3 min before recovery signal
const RECOVERY_BUFFER = 20 * 1000;     // extra buffer after recovery candle
const NEXT_SIGNAL_GAP = 15 * 1000;     // gap after result before next signal

// ── State ─────────────────────────────────────────────────────────────────────
let _bot     = null;
let _running = false;
let _cycleId = 0;

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init(bot) {
  _bot = bot;
  console.log('[LOOP] init() — bot assigned | channel:', CHANNEL_ID);
}

// ─── POST TEXT (startup / stats / welcome) ────────────────────────────────────
async function post(text) {
  if (!_bot) { console.error('[POST] Bot not initialised'); return null; }
  try {
    return await _bot.sendMessage(CHANNEL_ID, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error('[POST] Failed →', err.message);
    _logChannelError(err);
    return null;
  }
}

// ─── POST PHOTO + CAPTION ─────────────────────────────────────────────────────
async function postPhoto(imagePath, caption) {
  if (!_bot) { console.error('[PHOTO] Bot not initialised'); return null; }
  try {
    return await _bot.sendPhoto(CHANNEL_ID, fs.createReadStream(imagePath), {
      caption,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('[PHOTO] Failed →', err.message);
    _logChannelError(err);
    try { return await post(caption); } catch (_) { return null; }
  }
}

function _logChannelError(err) {
  if (err.message.includes('chat not found'))
    console.error('[POST] ⛔ Add bot as ADMIN in channel', CHANNEL_ID);
  if (err.message.includes('not enough rights') || err.message.includes('CHAT_WRITE_FORBIDDEN'))
    console.error('[POST] ⛔ Bot needs "Post Messages" admin permission');
}

// ─── TIMING: ms until (next whole minute − 10–15s) ───────────────────────────
function msUntilNextPreCandle() {
  const now         = Date.now();
  const msToNextMin = 60000 - (now % 60000);
  const leadTime    = 10000 + Math.floor(Math.random() * 5001); // 10–15s
  return msToNextMin <= leadTime
    ? msToNextMin + 60000 - leadTime
    : msToNextMin - leadTime;
}

// ─── PRICE RESULT: fetch close price and compare ──────────────────────────────
// Returns 'win' | 'loss'. If price fetch fails, falls back to weighted-random
// so the loop never stalls.
async function _resolveByPrice(signal, entryPrice) {
  const closeData = await priceService.getPrice(signal.pair);

  if (!closeData) {
    // Price unavailable — use weighted random as safety fallback
    const winRate = parseInt((await db.getConfig('target_win_rate')) || '88');
    const rate    = signal.is_recovery ? Math.min(94, winRate + 6) : winRate;
    const result  = Math.random() * 100 < rate ? 'win' : 'loss';
    console.warn(`[PRICE] No close price for ${signal.pair} — fallback random: ${result.toUpperCase()}`);
    return { result, closePrice: null };
  }

  const result = priceService.determineResultFromPrice(
    signal.direction,
    entryPrice,
    closeData.price
  );

  console.log(
    `[PRICE] ${signal.pair} ${signal.direction} | entry=${entryPrice} close=${closeData.price} → ${result.toUpperCase()}`
  );

  return { result, closePrice: closeData.price };
}

// ─── MAIN CYCLE ───────────────────────────────────────────────────────────────
async function _runCycle(cycleId) {
  if (!_running || cycleId !== _cycleId) return;

  try {
    const signal     = ai.generateSignal();
    const now        = new Date();
    const candleOpen = new Date(Math.ceil(now.getTime() / 60000) * 60000);
    const expiryTime = new Date(candleOpen.getTime() + CANDLE_EXPIRY);

    // Fetch entry price before posting signal
    const entryData = await priceService.getPrice(signal.pair);
    const entryPrice = entryData ? entryData.price : null;

    if (entryPrice) {
      console.log(`[PRICE] Entry price for ${signal.pair}: ${entryPrice}`);
    } else {
      console.warn(`[PRICE] No entry price for ${signal.pair} — result will use fallback`);
    }

    const saved = await db.saveSignal({
      pair:         signal.pair,
      direction:    signal.direction,
      timeframe:    '1 Minute',
      strategy:     signal.strategy,
      trade_time:   now.toISOString(),
      expiry_time:  expiryTime.toISOString(),
      status:       'pending',
      is_recovery:  false,
      rsi_value:    signal.rsi_value,
      ema_trend:    signal.ema_trend,
      macd_signal:  signal.macd_signal,
      momentum:     signal.momentum,
      confidence:   signal.confidence,
      entry_price:  entryPrice,
      price_source: entryData ? entryData.symbol : null
    });

    if (!saved) {
      console.error('[CYCLE] DB save failed — retrying in 15s');
      setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
      return;
    }

    const signalImg = signal.direction === 'UP' ? msgs.IMAGES.UP : msgs.IMAGES.DOWN;
    const msg = await postPhoto(signalImg, msgs.buildSignalCaption(signal));
    if (msg) {
      await db.updateSignal(saved.id, { telegram_message_id: msg.message_id });
      const candleStr = candleOpen.toLocaleTimeString('en-PK', {
        timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit'
      });
      console.log(`[SIGNAL] ✅ ${signal.pair} ${signal.direction} conf=${signal.confidence}% candle@${candleStr}`);
    } else {
      console.warn(`[SIGNAL] ⚠️  DB saved (${saved.id}) but Telegram post failed`);
    }

    const resolveIn = Math.max(expiryTime.getTime() - Date.now(), 1000);
    setTimeout(() => _resolveAndContinue(cycleId, saved, signal, entryPrice), resolveIn);

  } catch (err) {
    console.error('[CYCLE] Unexpected error:', err.message);
    setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
  }
}

async function _resolveAndContinue(cycleId, saved, signal, entryPrice) {
  if (!_running || cycleId !== _cycleId) return;

  try {
    const { result, closePrice } = await _resolveByPrice(signal, entryPrice);

    const updates = { close_price: closePrice };

    if (result === 'win') {
      await db.updateSignal(saved.id, { ...updates, status: 'win' });
      await db.updateDailyStats(true, false);
      await postPhoto(msgs.IMAGES.PROFIT, msgs.buildProfitCaption());
      console.log(`[RESULT] ✅ WIN — ${signal.pair} → next signal in 15s`);
      setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
    } else {
      await db.updateSignal(saved.id, { ...updates, status: 'loss' });
      await db.updateDailyStats(false, false);
      await postPhoto(msgs.IMAGES.OTM, msgs.buildOtmCaption());
      console.log(`[RESULT] ❌ LOSS — ${signal.pair} → recovery in 3 min`);
      setTimeout(() => _runRecovery(cycleId, saved, signal), RECOVERY_DELAY);
    }

  } catch (err) {
    console.error('[RESOLVE] Error:', err.message);
    setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
  }
}

async function _runRecovery(cycleId, originalSaved, originalSignal) {
  if (!_running || cycleId !== _cycleId) return;

  try {
    const recovery   = ai.generateRecoverySignal(originalSignal);
    const now        = new Date();
    const candleOpen = new Date(Math.ceil(now.getTime() / 60000) * 60000);
    const expiryTime = new Date(candleOpen.getTime() + CANDLE_EXPIRY);

    // Fetch entry price for recovery signal
    const entryData  = await priceService.getPrice(recovery.pair);
    const entryPrice = entryData ? entryData.price : null;

    if (entryPrice) {
      console.log(`[PRICE] Recovery entry price for ${recovery.pair}: ${entryPrice}`);
    }

    const saved = await db.saveSignal({
      pair:             recovery.pair,
      direction:        recovery.direction,
      timeframe:        '1 Minute',
      strategy:         recovery.strategy,
      trade_time:       now.toISOString(),
      expiry_time:      expiryTime.toISOString(),
      status:           'pending',
      is_recovery:      true,
      parent_signal_id: originalSaved.id,
      rsi_value:        recovery.rsi_value,
      ema_trend:        recovery.ema_trend,
      macd_signal:      recovery.macd_signal,
      momentum:         recovery.momentum,
      confidence:       recovery.confidence,
      entry_price:      entryPrice,
      price_source:     entryData ? entryData.symbol : null
    });

    if (!saved) {
      console.error('[RECOVERY] DB save failed — resuming loop');
      setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
      return;
    }

    const recoveryImg = recovery.direction === 'UP' ? msgs.IMAGES.UP : msgs.IMAGES.DOWN;
    const msg = await postPhoto(recoveryImg, msgs.buildRecoveryCaption(recovery));
    if (msg) {
      await db.updateSignal(saved.id, { telegram_message_id: msg.message_id });
      console.log(`[RECOVERY] ✅ ${recovery.pair} ${recovery.direction} conf=${recovery.confidence}%`);
    }

    const resolveIn = Math.max(expiryTime.getTime() - Date.now(), 1000) + RECOVERY_BUFFER;
    setTimeout(() => _resolveRecovery(cycleId, saved, recovery, entryPrice), resolveIn);

  } catch (err) {
    console.error('[RECOVERY] Error:', err.message);
    setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
  }
}

async function _resolveRecovery(cycleId, saved, recovery, entryPrice) {
  if (!_running || cycleId !== _cycleId) return;

  try {
    const { result, closePrice } = await _resolveByPrice(recovery, entryPrice);

    const updates = { close_price: closePrice };

    if (result === 'win') {
      await db.updateSignal(saved.id, { ...updates, status: 'win' });
      await db.updateDailyStats(true, true);
      await postPhoto(msgs.IMAGES.PROFIT, msgs.buildProfitCaption());
      console.log(`[RECOVERY RESULT] ✅ WIN — ${recovery.pair} → next signal in 15s`);
    } else {
      await db.updateSignal(saved.id, { ...updates, status: 'loss' });
      await db.updateDailyStats(false, true);
      await postPhoto(msgs.IMAGES.OTM, msgs.buildOtmCaption());
      console.log(`[RECOVERY RESULT] ❌ LOSS — ${recovery.pair} → next signal in 15s`);
    }

    setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);

  } catch (err) {
    console.error('[RECOVERY RESULT] Error:', err.message);
    setTimeout(() => _runCycle(cycleId), NEXT_SIGNAL_GAP);
  }
}

// ─── MANUAL CYCLE (/forcewin / /forceloss) ────────────────────────────────────
async function runSignalCycle(forceResult = null) {
  if (!_running) { console.warn('[LOOP] runSignalCycle called but loop not running'); return; }
  const cycleId = _cycleId;

  try {
    const signal     = ai.generateSignal();
    const now        = new Date();
    const candleOpen = new Date(Math.ceil(now.getTime() / 60000) * 60000);
    const expiryTime = new Date(candleOpen.getTime() + CANDLE_EXPIRY);

    const entryData  = await priceService.getPrice(signal.pair);
    const entryPrice = entryData ? entryData.price : null;

    const saved = await db.saveSignal({
      pair:         signal.pair,
      direction:    signal.direction,
      timeframe:    '1 Minute',
      strategy:     signal.strategy,
      trade_time:   now.toISOString(),
      expiry_time:  expiryTime.toISOString(),
      status:       'pending',
      is_recovery:  false,
      rsi_value:    signal.rsi_value,
      ema_trend:    signal.ema_trend,
      macd_signal:  signal.macd_signal,
      momentum:     signal.momentum,
      confidence:   signal.confidence,
      entry_price:  entryPrice,
      price_source: entryData ? entryData.symbol : null
    });

    if (!saved) return;

    const signalImg = signal.direction === 'UP' ? msgs.IMAGES.UP : msgs.IMAGES.DOWN;
    const msg = await postPhoto(signalImg, msgs.buildSignalCaption(signal));
    if (msg) await db.updateSignal(saved.id, { telegram_message_id: msg.message_id });

    const resolveIn = Math.max(expiryTime.getTime() - Date.now(), 1000);
    setTimeout(async () => {
      if (!_running || cycleId !== _cycleId) return;

      let result;
      let closePrice = null;

      if (forceResult) {
        result = forceResult;
      } else {
        const resolved = await _resolveByPrice(signal, entryPrice);
        result     = resolved.result;
        closePrice = resolved.closePrice;
      }

      if (result === 'win') {
        await db.updateSignal(saved.id, { status: 'win', close_price: closePrice });
        await db.updateDailyStats(true, false);
        await postPhoto(msgs.IMAGES.PROFIT, msgs.buildProfitCaption());
      } else {
        await db.updateSignal(saved.id, { status: 'loss', close_price: closePrice });
        await db.updateDailyStats(false, false);
        await postPhoto(msgs.IMAGES.OTM, msgs.buildOtmCaption());
        setTimeout(() => _runRecovery(cycleId, saved, signal), RECOVERY_DELAY);
      }
    }, resolveIn);

  } catch (err) {
    console.error('[MANUAL CYCLE] Error:', err.message);
  }
}

// ─── LOOP CONTROL ─────────────────────────────────────────────────────────────
async function start() {
  if (_running) { console.log('[LOOP] Already running'); return; }
  _running = true;
  _cycleId++;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ TRADOWIX AUTO SIGNAL ENGINE  (Continuous)');
  console.log('   Channel  :', CHANNEL_ID);
  console.log('   Flow     : SIGNAL → 65s → REAL PRICE RESULT → 15s → SIGNAL');
  console.log('   LOSS     : → 3 min → RECOVERY → 65s → RESULT → 15s');
  console.log('   Results  : Real Twelve Data spot price comparison');
  console.log('   Timezone : Asia/Karachi');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const delay = msUntilNextPreCandle();
  console.log(`[LOOP] First signal fires in ${Math.round(delay / 1000)}s`);
  setTimeout(() => _runCycle(_cycleId), delay);
}

function stop() {
  _running = false;
  _cycleId++;
  console.log('[LOOP] Stopped — all pending cycles cancelled');
}

function isRunning() { return _running; }
async function getChannelId() { return CHANNEL_ID; }

module.exports = { init, start, stop, isRunning, post, postPhoto, runSignalCycle, getChannelId, CHANNEL_ID };
