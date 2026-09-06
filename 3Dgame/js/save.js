// 存檔：loadSave()/persist()，try/catch 保護 + 與預設值深度合併（新版新增欄位自動補上）
import { STORE_KEY, LEVEL_COUNT } from './config.js';

function defaultSave() {
  const levels = {};
  for (let i = 1; i <= LEVEL_COUNT; i++) levels[i] = { best: null, cleared: false, coins: 0 };
  return {
    version: 1,
    levels,
    totalCoins: 0,
    totalJumps: 0,
    unlockedColors: ['red'],
    selectedColor: 'red',
    achievements: [],
    muted: false,
  };
}

function merge(data, def) {
  const out = Array.isArray(def) ? [] : { ...def };
  for (const k of Object.keys(def)) {
    const isObj = typeof def[k] === 'object' && def[k] !== null && !Array.isArray(def[k]);
    if (isObj && data && k in data && typeof data[k] === 'object') out[k] = merge(data[k], def[k]);
    else if (data && k in data) out[k] = data[k];
  }
  return out;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? merge(data, defaultSave()) : defaultSave();
  } catch {
    return defaultSave(); // 毀損 / private mode
  }
}

export function persist(save) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  } catch {
    /* 存檔失敗不阻斷遊戲 */
  }
}
