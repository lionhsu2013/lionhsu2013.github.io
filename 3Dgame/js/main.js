// Sky Hopper — 啟動與主循環
import * as THREE from 'three';
import { CAMERA, PHYSICS, COLORS, ACHIEVEMENTS } from './config.js';
import { Input } from './input.js';
import { Game, States } from './game.js';
import { FollowCamera } from './camera.js';
import { Character } from './character.js';
import { LEVELS } from './levels.js';
import { World } from './world.js';
import { loadSave, persist } from './save.js';
import { checkAchievements, achievementById } from './achievements.js';
import { audio } from './audio.js';
import { Particles } from './particles.js';

// ---------- file:// 防護 ----------
if (location.protocol === 'file:') {
  document.getElementById('file-guard').classList.remove('hidden');
  console.error('Sky Hopper 需要本地 HTTP server（ES Modules 無法在 file:// 執行）');
}

// ---------- 渲染器 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

// ---------- 場景 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc9f0);
scene.fog = new THREE.Fog(0x8fc9f0, 40, 110);

const camera = new THREE.PerspectiveCamera(CAMERA.FOV, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4, 9);
camera.lookAt(0, 0.5, -2);

const hemi = new THREE.HemisphereLight(0xffffff, 0x93a8c0, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d6, 2.0);
sun.position.set(8, 14, 6);
scene.add(sun);

// ---------- S3：關卡世界 ----------
const world = new World(scene, LEVELS[0]);
const L1_SPAWN = new THREE.Vector3(...LEVELS[0].spawn);

// ---------- S9：粒子 ----------
const particles = new Particles(scene);

// ---------- S6：存檔 ----------
const save = loadSave();
const selColor = COLORS.find((c) => c.id === save.selectedColor) || COLORS[0];

// ---------- S8：音效（mute 隨存檔；init 在首次 user gesture） ----------
audio.setMuted(save.muted);

// ---------- S2：角色 + 跟隨鏡頭 ----------
const character = new Character(selColor.hex, selColor.trim);
scene.add(character.group);
character.group.position.copy(L1_SPAWN);
const followCam = new FollowCamera(camera);
followCam.reset(L1_SPAWN);

// ---------- 輸入 & 遊戲 ----------
const input = new Input();
input.attach(canvas, {
  joyBase: document.getElementById('joy-base'),
  joyStick: document.getElementById('joy-stick'),
  jumpBtn: document.getElementById('btn-jump'),
});

const $ = (id) => document.getElementById(id);
const game = new Game({
  solids: world.solids,
  input,
  level: LEVELS[0],
  onEvent: (type, payload) => {
    switch (type) {
      case 'hp':
        renderHearts();
        break;
      case 'jump':
        audio.jump();
        particles.burst(game.player.pos, { color: 0xdfe8ff, count: 6, speed: 1, up: 0.4, life: 0.3 });
        break;
      case 'land':
        character.land(payload.speed);
        audio.land();
        particles.burst(game.player.pos, { color: 0xf5f2e8, count: 10, speed: 1.6, up: 0.5, life: 0.4 });
        break;
      case 'coin':
        el.hudCoins.textContent = '🪙 ' + game.player.coins;
        world.markCoin(payload.i, true);
        audio.coin();
        particles.burst(world.coins[payload.i].pos, { color: 0xffd75e, count: 14, speed: 2.4, up: 2.2, life: 0.55 });
        break;
      case 'checkpoint':
        world.markCheckpoint(payload.i, true);
        audio.checkpoint();
        break;
      case 'spike':
        audio.hit();
        particles.burst(game.player.pos, { color: 0xff5544, count: 16, speed: 2.8, up: 1.6, life: 0.5 });
        break;
      case 'fall':
        audio.fall();
        game.damage();
        renderHearts();
        if (game.state === States.GAMEOVER) showGameOver();
        else game.respawn();
        break;
      case 'gameover':
        save.totalJumps += game.player.jumps;
        save.totalCoins += game.player.coins;
        persist(save);
        audio.gameover();
        showGameOver();
        break;
      case 'goal':
        audio.goal();
        if (world.goal) particles.burst(world.goal.pos, { color: 0xffe066, count: 28, speed: 3, up: 3, life: 0.8 });
        showComplete(payload, onGoal(payload));
        break;
    }
  },
});

// ---------- UI ----------
const el = {
  menu: $('menu'),
  menuLevels: $('menu-levels'),
  hud: $('hud'),
  pause: $('pause'),
  complete: $('complete'),
  completeStats: $('complete-stats'),
  gameover: $('gameover'),
  gameoverMsg: $('gameover-msg'),
  hudHearts: $('hud-hearts'),
  hudTime: $('hud-time'),
  hudLevel: $('hud-level'),
  hudCoins: $('hud-coins'),
  hudHint: $('hud-hint'),
  menuBest: $('menu-best'),
  btnMute: $('btn-mute'),
  btnMuteMenu: $('btn-mute-menu'),
  touchUi: $('touch-ui'),
};

function renderHearts() {
  const hp = Math.max(0, game.player.hp);
  el.hudHearts.textContent = '❤️'.repeat(hp) + '🖤'.repeat(PHYSICS.MAX_HP - hp);
}

function startGame(levelId) {
  const lv = LEVELS[levelId - 1];
  if (!lv) return;
  const spawn = new THREE.Vector3(...lv.spawn);
  world.setLevel(lv);
  game.setLevel(lv);
  game.startLevel(levelId, spawn);
  followCam.yaw = 0; // 固定起始方向（選單環繞鏡頭會累積 yaw）
  followCam.reset(spawn);
  character.group.position.copy(spawn);
  scene.background.setHex(lv.sky.color);
  scene.fog.near = lv.sky.fog[0];
  scene.fog.far = lv.sky.fog[1];
  el.menu.classList.add('hidden');
  el.gameover.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.complete.classList.add('hidden');
  el.hud.classList.remove('hidden');
  el.hudLevel.textContent = lv.name;
  el.hudHint.textContent = lv.hint;
  el.hudCoins.textContent = '🪙 0';
  renderHearts();
}

function showComplete(payload, newRecord) {
  el.completeStats.innerHTML =
    '用時 <b>' + payload.time.toFixed(1) + '</b> 秒' +
    (newRecord ? ' <span class="new-record">新紀錄！</span>' : '') + '<br>' +
    '硬幣 <b>' + payload.coins + ' / ' + payload.totalCoins + '</b><br>' +
    '受傷 <b>' + payload.hitCount + '</b>';
  el.complete.classList.remove('hidden');
}

// ---------- S6：存檔 / 成就 / toast ----------
function onGoal(payload) {
  const id = game.levelId;
  const p = game.player;
  const lv = save.levels[id] || (save.levels[id] = { best: null, cleared: false, coins: 0 });
  const newRecord = lv.best == null || payload.time < lv.best;
  if (newRecord) lv.best = payload.time;
  lv.cleared = true;
  lv.coins = Math.max(lv.coins, p.coins);
  save.totalCoins += p.coins;
  save.totalJumps += p.jumps;

  // 成就判定（新解鎖 → 寫回 save 並 toast）
  const newly = checkAchievements(save, {
    levelId: id, time: payload.time, coins: p.coins,
    totalCoins: payload.totalCoins, hitCount: p.hitCount, cleared: true,
  });
  for (const aid of newly) {
    save.achievements.push(aid);
    const a = achievementById(aid);
    if (a) showToast(a.icon + ' 達成成就：' + a.name);
  }
  if (newly.length) audio.achv();

  // 顏色解鎖（商店資料源）
  for (const c of COLORS) {
    if (c.unlock == null || save.unlockedColors.includes(c.id)) continue;
    const u = c.unlock;
    const ok =
      (u.type === 'level' && save.levels[u.level] && save.levels[u.level].cleared) ||
      (u.type === 'coins' && save.totalCoins >= u.total) ||
      (u.type === 'achv' && save.achievements.includes(u.achv)) ||
      (u.type === 'clearall' && save.levels[1].cleared && save.levels[2].cleared && save.levels[3].cleared);
    if (ok) save.unlockedColors.push(c.id);
  }

  persist(save);
  return newRecord;
}

function showToast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function renderMenuBest() {
  const parts = LEVELS.map((lv) => {
    const s = save.levels[lv.id];
    return s && s.best != null ? lv.name + ' ' + s.best.toFixed(1) + 's' : null;
  }).filter(Boolean);
  el.menuBest.textContent = parts.length ? '最佳：' + parts.join('　') : '';
}

function renderAchv() {
  const list = $('achv-list');
  list.textContent = '';
  for (const a of ACHIEVEMENTS) {
    const got = save.achievements.includes(a.id);
    const div = document.createElement('div');
    div.className = 'achv-item' + (got ? ' unlocked' : '');
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = a.icon;
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'aname';
    name.textContent = a.name;
    const desc = document.createElement('div');
    desc.className = 'adesc';
    desc.textContent = a.desc + (got ? '' : '（未達成）');
    info.append(name, desc);
    div.append(badge, info);
    list.appendChild(div);
  }
}

// ---------- S7：商店 ----------
function unlockText(c) {
  if (!c.unlock) return '';
  const u = c.unlock;
  if (u.type === 'level') return '通過第 ' + u.level + ' 關';
  if (u.type === 'coins') return '累計 ' + u.total + ' 枚硬幣';
  if (u.type === 'achv') {
    const a = achievementById(u.achv);
    return '達成成就「' + (a ? a.name : u.achv) + '」';
  }
  if (u.type === 'clearall') return '通過全部關卡';
  return '';
}

function renderStore() {
  const grid = $('store-grid');
  grid.textContent = '';
  for (const c of COLORS) {
    const unlocked = save.unlockedColors.includes(c.id);
    const div = document.createElement('div');
    div.className = 'color-card' + (unlocked ? '' : ' locked') +
      (save.selectedColor === c.id ? ' selected' : '');
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = '#' + c.hex.toString(16).padStart(6, '0');
    const nm = document.createElement('div');
    nm.className = 'cname';
    nm.textContent = c.name;
    const uq = document.createElement('div');
    uq.className = 'cunlock';
    uq.textContent = unlocked ? (save.selectedColor === c.id ? '使用中' : '點選更換') : unlockText(c);
    div.append(sw, nm, uq);
    if (unlocked) div.addEventListener('click', () => selectColor(c.id));
    grid.appendChild(div);
  }
}

function selectColor(id) {
  if (!save.unlockedColors.includes(id)) return;
  save.selectedColor = id;
  persist(save);
  const c = COLORS.find((x) => x.id === id) || COLORS[0];
  character.setColor(c.hex, c.trim);
  renderStore();
}

function showGameOver() {
  el.gameoverMsg.textContent = '心臟耗盡，再試一次吧。';
  el.gameover.classList.remove('hidden');
}

function showMenu() {
  game.toMenu();
  el.menu.classList.remove('hidden');
  el.hud.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.gameover.classList.add('hidden');
  el.complete.classList.add('hidden');
  renderMenuBest();
}

function showPause() {
  game.pause();
  el.pause.classList.remove('hidden');
}
function hidePause() {
  game.resume();
  el.pause.classList.add('hidden');
}

let selectedLevel = 1;
el.menuLevels.addEventListener('click', (e) => {
  const btn = e.target.closest('.lv-btn');
  if (!btn || !LEVELS[+btn.dataset.level - 1]) return;
  document.querySelectorAll('.lv-btn').forEach((b) => b.classList.toggle('selected', b === btn));
  selectedLevel = +btn.dataset.level;
});
el.menu.addEventListener('click', (e) => {
  if (e.target.id === 'btn-start') { audio.init(); startGame(selectedLevel); }
});
$('btn-resume').addEventListener('click', hidePause);
$('btn-retry').addEventListener('click', () => startGame(game.levelId));
$('btn-quit').addEventListener('click', showMenu);
$('btn-retry2').addEventListener('click', () => startGame(game.levelId));
$('btn-goto-menu').addEventListener('click', showMenu);
$('btn-next').addEventListener('click', () => {
  const nid = game.levelId + 1;
  if (LEVELS[nid - 1]) startGame(nid);
  else showMenu();
});
$('btn-complete-menu').addEventListener('click', showMenu);
$('btn-store').addEventListener('click', () => { renderStore(); $('store').classList.remove('hidden'); });
$('btn-store-close').addEventListener('click', () => $('store').classList.add('hidden'));
// ---------- S8：音效開關 ----------
function renderMute() {
  const label = save.muted ? '音效：關' : '音效：開';
  el.btnMute.textContent = label;
  el.btnMuteMenu.textContent = label;
}
function toggleMute() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  persist(save);
  renderMute();
}
el.btnMute.addEventListener('click', () => { audio.init(); toggleMute(); });
el.btnMuteMenu.addEventListener('click', () => { audio.init(); toggleMute(); });
renderMute();

// iOS：回前景時 AudioContext 可能仍 suspended → 再 resume；切背景中自動暫停
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) audio.resume();
  else if (game.state === States.PLAYING) showPause();
});

$('btn-achv').addEventListener('click', () => { renderAchv(); $('achv').classList.remove('hidden'); });
$('btn-achv-close').addEventListener('click', () => $('achv').classList.add('hidden'));
document.querySelector('.lv-btn[data-level="1"]')?.classList.add('selected');
renderMenuBest();

addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (game.state === States.PLAYING) showPause();
  else if (game.state === States.PAUSED) hidePause();
});

// ---------- S5：pointer lock（桌面）；失鎖（ESC）時自動暫停 ----------
input.onLockChange = (locked) => {
  if (!locked && game.state === States.PLAYING) showPause();
};
canvas.addEventListener('click', () => {
  if (game.state === States.PLAYING) input.requestLock();
});

// ---------- resize ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 主循環 ----------
let last = performance.now();
let _prevState = null;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  input.update(dt);
  followCam.addYaw(input.consumeCameraYaw());
  followCam.addPitch(input.consumeCameraPitch());
  if (game.state === States.PLAYING) {
    world.update(dt); // 平台先動（S4 移動平台 frameDelta 也在此）
    game.cameraYaw = followCam.smoothYaw;
    game.update(dt);
    const p = game.player;
    character.group.position.copy(p.pos);
    character.update(dt, {
      vx: p.vel.x, vz: p.vel.z,
      speed: Math.hypot(p.vel.x, p.vel.z),
      grounded: p.grounded, vy: p.vel.y, iframe: p.iframe,
    });
    followCam.update(dt, p.pos, world.solids);
  } else {
    if (game.state === States.MENU) {
      // 選單背景：鏡頭緩慢環繞角色
      followCam.addYaw(dt * 0.22);
      followCam.update(dt, character.group.position, world.solids);
    }
    character.update(dt, { vx: 0, vz: 0, speed: 0, grounded: true, vy: 0 });
  }

  if (game.state !== _prevState) {
    _prevState = game.state;
    el.touchUi.classList.toggle('hidden', !(input.isTouch && game.state === States.PLAYING));
  }

  particles.update(dt);
  el.hudTime.textContent = (game.state === States.PLAYING ? game.time : 0).toFixed(1);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- debug hook ----------
window.__game = {
  THREE,
  audio,
  scene,
  camera,
  renderer,
  game,
  input,
  world,
  particles,
  LEVELS,
  get state() { return game.state; },
  get player() { return game.player; },
  get time() { return game.time; },
  get coins() { return game.player.coins; },
  debug: {
    teleport(x, y, z) {
      game.player.pos.set(x, y, z);
      game.player.vel.set(0, 0, 0);
      game.player.grounded = false;
      game.player.groundPlat = null;
    },
    jump() { input.pressJump(); },
    releaseJump() { input.releaseJump(); },
    damage() { game.damage(); },
    addCoin(n) { game.player.coins += n; },
  },
};
