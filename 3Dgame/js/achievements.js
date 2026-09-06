// 成就判定：回傳本次新解鎖的 id 陣列（由 main 寫回 save.achievements 並存檔）
import { ACHIEVEMENTS, SPEED2_LIMIT } from './config.js';

export function checkAchievements(save, ctx) {
  // ctx: { levelId, time, coins, totalCoins, hitCount }（於單關完成時呼叫）
  const newly = [];
  const has = (id) => save.achievements.includes(id);
  const cleared = (id) => !!(save.levels[id] && save.levels[id].cleared);
  const unlock = (id) => { if (!has(id)) newly.push(id); };

  if (cleared(1)) unlock('first');
  if (save.totalCoins >= 50) unlock('coins50');
  if (save.totalJumps >= 100) unlock('jumps100');
  if (ctx && ctx.cleared && ctx.coins >= ctx.totalCoins) unlock('alcoins');
  if (ctx && ctx.levelId === 2 && ctx.cleared && ctx.time <= SPEED2_LIMIT) unlock('speed2');
  if (ctx && ctx.levelId === 3 && ctx.cleared && ctx.hitCount === 0) unlock('flawless3');
  if (cleared(1) && cleared(2) && cleared(3)) unlock('clearall');
  return newly;
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
