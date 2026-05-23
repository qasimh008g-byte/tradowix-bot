const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[DB] Missing Supabase credentials in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getConfig(key) {
  const { data, error } = await supabase
    .from('bot_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) return null;
  return data?.value ?? null;
}

async function setConfig(key, value) {
  const { error } = await supabase
    .from('bot_config')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() });
  if (error) console.error('[DB] setConfig error:', error.message);
}

async function saveSignal(signalData) {
  const { data, error } = await supabase
    .from('signals')
    .insert(signalData)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[DB] saveSignal error:', error.message);
    return null;
  }
  return data;
}

async function updateSignal(id, updates) {
  const { error } = await supabase
    .from('signals')
    .update(updates)
    .eq('id', id);
  if (error) console.error('[DB] updateSignal error:', error.message);
}

async function getPendingSignals() {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('status', 'pending')
    .lt('expiry_time', new Date().toISOString());
  if (error) {
    console.error('[DB] getPendingSignals error:', error.message);
    return [];
  }
  return data || [];
}

async function getRecoveryPendingSignals() {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('status', 'recovery_pending')
    .lt('expiry_time', new Date(Date.now() - 1).toISOString());
  if (error) {
    console.error('[DB] getRecoveryPendingSignals error:', error.message);
    return [];
  }
  return data || [];
}

async function updateDailyStats(isWin, isRecovery = false) {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('signal_stats')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (existing) {
    const wins = existing.wins + (isWin ? 1 : 0);
    const losses = existing.losses + (!isWin ? 1 : 0);
    const total = existing.total_signals + 1;
    const recoveries = existing.recoveries + (isRecovery ? 1 : 0);
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(2) : 0;
    await supabase
      .from('signal_stats')
      .update({ wins, losses, total_signals: total, recoveries, win_rate: winRate, updated_at: new Date().toISOString() })
      .eq('date', today);
  } else {
    const wins = isWin ? 1 : 0;
    const losses = isWin ? 0 : 1;
    const winRate = isWin ? 100 : 0;
    await supabase.from('signal_stats').insert({
      date: today,
      total_signals: 1,
      wins,
      losses,
      recoveries: isRecovery ? 1 : 0,
      win_rate: winRate
    });
  }
}

async function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('signal_stats')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  return data;
}

async function getVipUser(telegramId) {
  const { data } = await supabase
    .from('vip_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return data;
}

async function upsertVipUser(telegramId, username, fullName) {
  const existing = await getVipUser(telegramId);
  if (existing) return existing;
  const { data } = await supabase
    .from('vip_users')
    .insert({ telegram_id: telegramId, username, full_name: fullName })
    .select()
    .maybeSingle();
  return data;
}

module.exports = {
  supabase,
  getConfig,
  setConfig,
  saveSignal,
  updateSignal,
  getPendingSignals,
  getRecoveryPendingSignals,
  updateDailyStats,
  getTodayStats,
  getVipUser,
  upsertVipUser
};
