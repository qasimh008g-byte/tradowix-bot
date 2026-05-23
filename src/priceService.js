'use strict';

/**
 * priceService.js — Real forex spot price fetcher
 *
 * Uses Twelve Data free REST API (800 req/day free tier).
 * Maps TRADOWIX OTC pair names → standard forex symbols.
 *
 * OTC pairs are TRADOWIX-internal instruments; their prices closely
 * track the underlying spot forex pair, so we use spot as the proxy.
 *
 * API key env var: TWELVE_DATA_API_KEY
 * Fallback: if Twelve Data is unavailable or pair not supported,
 * returns null so the caller can handle gracefully.
 */

const https = require('https');

// ── OTC pair → Twelve Data forex symbol ──────────────────────────────────────
const OTC_TO_SYMBOL = {
  'GBP/CHF-OTC': 'GBP/CHF',
  'GBP/JPY-OTC': 'GBP/JPY',
  'GBP/NZD-OTC': 'GBP/NZD',
  'GBP/USD-OTC': 'GBP/USD',
  'NZD/CAD-OTC': 'NZD/CAD',
  'NZD/CHF-OTC': 'NZD/CHF',
  'NZD/JPY-OTC': 'NZD/JPY',
  'NZD/USD-OTC': 'NZD/USD',
  'USD/ARS-OTC': 'USD/ARS',
  'USD/BDT-OTC': 'USD/BDT',
  'USD/BRL-OTC': 'USD/BRL',
  'USD/CAD-OTC': 'USD/CAD',
  'USD/CHF-OTC': 'USD/CHF',
  'USD/COP-OTC': 'USD/COP',
  'USD/DZD-OTC': 'USD/DZD',
  'USD/EGP-OTC': 'USD/EGP',
  'USD/IDR-OTC': 'USD/IDR',
  'USD/INR-OTC': 'USD/INR',
  'USD/JPY-OTC': 'USD/JPY',
};

function _httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON: ' + body.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch the current spot price for an OTC pair.
 * Returns { price: number, symbol: string } or null on failure.
 */
async function getPrice(otcPair) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[PRICE] TWELVE_DATA_API_KEY not set — cannot fetch real price');
    return null;
  }

  const symbol = OTC_TO_SYMBOL[otcPair];
  if (!symbol) {
    console.warn('[PRICE] No symbol mapping for:', otcPair);
    return null;
  }

  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

  try {
    const data = await _httpsGet(url);

    // Twelve Data error response: { code: 400, message: "..." }
    if (data.code || data.status === 'error') {
      console.warn(`[PRICE] Twelve Data error for ${symbol}:`, data.message || JSON.stringify(data));
      return null;
    }

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      console.warn(`[PRICE] Invalid price value for ${symbol}:`, data.price);
      return null;
    }

    return { price, symbol };
  } catch (err) {
    console.error(`[PRICE] Fetch failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Determine WIN or LOSS from real prices.
 * Returns 'win' | 'loss'
 *
 * CALL/UP: win if closePrice > entryPrice
 * PUT/DOWN: win if closePrice < entryPrice
 */
function determineResultFromPrice(direction, entryPrice, closePrice) {
  if (direction === 'UP') {
    return closePrice > entryPrice ? 'win' : 'loss';
  } else {
    return closePrice < entryPrice ? 'win' : 'loss';
  }
}

module.exports = { getPrice, determineResultFromPrice, OTC_TO_SYMBOL };
