import * as THREE from 'three';
import { PHYSICS, COIN_RADIUS, GOAL_RADIUS } from './config.js';

export const States = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
  GAMEOVER: 'GAMEOVER',
});

// solids 元素格式（World.platforms 同構）：
// { idx, cx, cy, cz, hx, hy, hz, moving, frameDelta: {x,y,z} }
export class Game {
  constructor({ solids, input, level, onEvent }) {
    this.solids = solids;
    this.input = input;
    this.level = level;
    this.onEvent = onEvent || (() => {});
    this.state = States.MENU;
    this.levelId = 1;
    this.time = 0;
    this.cameraYaw = 0; // 由 main 每幀寫入 FollowCamera.smoothYaw，移動方向隨鏡頭
    this.player = this._newPlayer();
    this._resetLevelFlags();
  }

  setLevel(level) {
    this.level = level;
  }

  _resetLevelFlags() {
    const n = this.level ? this.level.coins.length : 0;
    this.coinTaken = new Array(n).fill(false);
    this.cpHit = new Set();
    this.goalDone = false;
    this.lastRespawn = this.level ? this.level.spawn.slice() : [0, 1.5, 0];
  }

  _newPlayer() {
    return {
      pos: new THREE.Vector3(0, 1.5, 0),
      vel: new THREE.Vector3(),
      grounded: false,
      groundPlat: null,
      hp: PHYSICS.MAX_HP,
      iframe: 0,
      hitCount: 0,
      jumps: 0,
      coins: 0,
      lastGrounded: -10,
      lastJumpPress: -10,
      jumpCut: false,
    };
  }

  startLevel(levelId, spawn) {
    this.levelId = levelId;
    this.time = 0;
    this.player = this._newPlayer();
    if (spawn) this.player.pos.copy(spawn);
    this._resetLevelFlags();
    this.state = States.PLAYING;
    this.onEvent('levelStart', { levelId });
  }

  damage() {
    if (this.state !== States.PLAYING) return;
    if (this.player.iframe > 0) return; // 無敵期不重複扣血（尖刺持續重疊 / 受擊後墜落）
    this.player.hp--;
    this.player.iframe = PHYSICS.IFRAMES;
    this.player.hitCount++;
    this.onEvent('hp', { hp: this.player.hp });
    if (this.player.hp <= 0) {
      this.state = States.GAMEOVER;
      this.onEvent('gameover');
    }
  }

  // 墜落/重生：回到最後檢查點（含 1s 無敵）
  respawn() {
    const p = this.lastRespawn;
    this.player.pos.set(p[0], p[1], p[2]);
    this.player.vel.set(0, 0, 0);
    this.player.grounded = false;
    this.player.groundPlat = null;
    this.player.iframe = PHYSICS.IFRAMES;
    this.onEvent('respawn');
  }

  pause() {
    if (this.state === States.PLAYING) this.state = States.PAUSED;
  }
  resume() {
    if (this.state === States.PAUSED) this.state = States.PLAYING;
  }
  toMenu() {
    this.state = States.MENU;
  }

  // 單幀：carry → 跳躍判定 → 重力+子步逐軸解算 → 站地再驗證
  update(dt) {
    if (this.state !== States.PLAYING) return;
    this.time += dt;
    const p = this.player;

    // ① carry（用上一幀的 groundPlat；平台已在 world.update 動過）
    if (p.groundPlat != null) {
      const pl = this.solids[p.groundPlat];
      if (pl) {
        p.pos.x += pl.frameDelta.x;
        p.pos.y += pl.frameDelta.y;
        p.pos.z += pl.frameDelta.z;
      }
    }

    // 跳躍判定（coyote + buffer + 松手截斷）
    if (this.input.jumpPressed()) p.lastJumpPress = this.time;
    if (this.time - p.lastGrounded < PHYSICS.COYOTE &&
        this.time - p.lastJumpPress < PHYSICS.BUFFER) {
      p.vel.y = PHYSICS.JUMP_V;
      p.grounded = false;
      p.groundPlat = null;
      p.lastJumpPress = -10;
      p.jumpCut = false;
      p.jumps++;
      this.onEvent('jump');
    }
    if (!this.input.jumpHeld() && p.vel.y > 0 && !p.jumpCut) {
      p.vel.y *= PHYSICS.JUMP_CUT;
      p.jumpCut = true;
    }

    // ② 速度（鏡頭座標系：W=鏡頭前向，D=鏡頭右方）
    const m = this.input.move;
    const sy = Math.sin(this.cameraYaw), cy = Math.cos(this.cameraYaw);
    let vx = -sy * m.y + cy * m.x;
    let vz = -cy * m.y - sy * m.x;
    const ml = Math.hypot(vx, vz);
    if (ml > 1) { vx /= ml; vz /= ml; }
    p.vel.x = vx * PHYSICS.MOVE_SPEED;
    p.vel.z = vz * PHYSICS.MOVE_SPEED;
    p.vel.y = Math.max(p.vel.y + PHYSICS.GRAVITY * dt, PHYSICS.TERMINAL_VY);
    if (p.iframe > 0) p.iframe -= dt;

    // ③ 子步逐軸解算（Y 先，XZ 後）
    p.grounded = false;
    p.groundPlat = null;
    const disp = { x: p.vel.x * dt, y: p.vel.y * dt, z: p.vel.z * dt };
    const maxDisp = Math.max(Math.abs(disp.x), Math.abs(disp.y), Math.abs(disp.z));
    const n = Math.min(
      Math.max(Math.ceil(maxDisp / PHYSICS.MAX_STEP), 1),
      PHYSICS.MAX_SUBSTEPS
    );
    for (let k = 0; k < n; k++) {
      p.pos.y += disp.y / n;
      this._resolveY(p, disp.y / n);
      p.pos.x += disp.x / n;
      this._resolveAxis(p, 'x');
      p.pos.z += disp.z / n;
      this._resolveAxis(p, 'z');
    }

    // ④ 站地再驗證（防鬼載）
    this._validateStanding(p);
    if (p.grounded) p.lastGrounded = this.time;

    // ⑤ 事件判定（墜落 → 硬幣 → 檢查點 → 門）
    const lv = this.level;
    if (!lv) return;
    if (p.pos.y < lv.killY) {
      this.onEvent('fall');
      return;
    }
    for (let i = 0; i < lv.coins.length; i++) {
      if (this.coinTaken[i]) continue;
      const c = lv.coins[i];
      const dx = p.pos.x - c[0], dy = p.pos.y - c[1], dz = p.pos.z - c[2];
      if (dx * dx + dy * dy + dz * dz < COIN_RADIUS * COIN_RADIUS) {
        this.coinTaken[i] = true;
        p.coins++;
        this.onEvent('coin', { i });
      }
    }
    for (let i = 0; i < lv.checkpoints.length; i++) {
      if (this.cpHit.has(i)) continue;
      const c = lv.checkpoints[i];
      const dx = p.pos.x - c.pos[0], dz = p.pos.z - c.pos[2];
      if (dx * dx + dz * dz < 1.1 * 1.1 &&
          Math.abs(p.pos.y - c.pos[1]) < 1.5) {
        this.cpHit.add(i);
        this.lastRespawn = [c.pos[0], c.pos[1] + 1.0, c.pos[2]];
        this.onEvent('checkpoint', { i });
      }
    }
    // 尖刺：玩家盒 vs 尖刺盒三軸重疊 → 受傷（無敵期不判定，避免連段扣血）
    const H = PHYSICS.HALF;
    for (const s of lv.spikes) {
      if (p.iframe > 0) break;
      const ox = s.size[0] / 2 + H.x - Math.abs(p.pos.x - s.pos[0]);
      const oy = s.size[1] / 2 + H.y - Math.abs(p.pos.y - s.pos[1]);
      const oz = s.size[2] / 2 + H.z - Math.abs(p.pos.z - s.pos[2]);
      if (ox > 0 && oy > 0 && oz > 0) {
        this.onEvent('spike');
        this.damage();
        break;
      }
    }
    if (this.state !== States.PLAYING) return; // GAMEOVER → 不再判定門

    if (!this.goalDone) {
      const g = lv.goal;
      const dx = p.pos.x - g.pos[0], dz = p.pos.z - g.pos[2];
      if (dx * dx + dz * dz < GOAL_RADIUS * GOAL_RADIUS &&
          Math.abs(p.pos.y - g.pos[1]) < 2.0) {
        this.goalDone = true;
        this.state = States.COMPLETE;
        this.onEvent('goal', {
          time: this.time,
          coins: p.coins,
          totalCoins: lv.coins.length,
          hitCount: p.hitCount,
        });
      }
    }
  }

  // 落體：吸附頂面（僅當「移動前腳底在頂面之上」，防沿牆滑入角落被吸上）
  // 上升：頂頭
  _resolveY(p, dy) {
    const H = PHYSICS.HALF;
    if (p.vel.y <= 0) {
      let best = null;
      let bestPen = -Infinity;
      for (const b of this.solids) {
        // 須有實際水平重疊（排除恰好擦邊 / 被推出邊緣的盒）
        if (b.hx + H.x - Math.abs(p.pos.x - b.cx) <= 1e-4) continue;
        if (b.hz + H.z - Math.abs(p.pos.z - b.cz) <= 1e-4) continue;
        const top = b.cy + b.hy;
        const prevFoot = p.pos.y - H.y - dy;
        if (prevFoot < top - 1e-3) continue; // 腳底已在頂面下方 → 不吸附
        const pen = top - (p.pos.y - H.y);
        if (pen > -1e-3 && pen > bestPen) {
          bestPen = pen;
          best = b;
        }
      }
      if (best) {
        const impact = -p.vel.y;
        p.pos.y = best.cy + best.hy + H.y;
        p.vel.y = 0;
        p.grounded = true;
        p.groundPlat = best.idx;
        if (impact > 7) this.onEvent('land', { speed: impact });
      }
    } else {
      for (const b of this.solids) {
        if (b.hx + H.x - Math.abs(p.pos.x - b.cx) <= 1e-4) continue;
        if (b.hz + H.z - Math.abs(p.pos.z - b.cz) <= 1e-4) continue;
        const bottom = b.cy - b.hy;
        const prevHead = p.pos.y + H.y - dy;
        if (prevHead > bottom + 1e-3) continue; // 頭已在該面之上 → 不夾
        const pen = p.pos.y + H.y - bottom;
        if (pen > 0) {
          p.pos.y = bottom - H.y;
          p.vel.y = 0;
          break;
        }
      }
    }
  }

  // 水平單軸：沿速度方向找穿透最深的盒，推出並消速
  // 關鍵：須有「正的」垂直重疊——否則「正站在上面的平台」會被當成牆
  _resolveAxis(p, ax) {
    const H = PHYSICS.HALF;
    const v = p.vel[ax];
    if (v === 0) return;
    const other = ax === 'x' ? 'z' : 'x';
    let best = null;
    let bestPen = 0;
    for (const b of this.solids) {
      // 三軸都須有實際重疊（缺任一軸 = 玩家根本不在这个盒的旁邊/內部）
      const overlapY = b.hy + H.y - Math.abs(p.pos.y - b.cy);
      if (overlapY <= 1e-3) continue;
      const co = other === 'x' ? b.cx : b.cz;
      const ho = other === 'x' ? b.hx : b.hz;
      if (ho + H[other] - Math.abs(p.pos[other] - co) <= 1e-4) continue;
      const cc = ax === 'x' ? b.cx : b.cz;
      const hh = ax === 'x' ? b.hx : b.hz;
      if (hh + H[ax] - Math.abs(p.pos[ax] - cc) <= 1e-4) continue;
      // 向 + 運動時撞的是盒的「− 面」(cc−hh)（玩家從左側進入）；向 − 則撞「+ 面」
      const pen =
        v > 0 ? p.pos[ax] + H[ax] - (cc - hh) : cc + hh - (p.pos[ax] - H[ax]);
      if (pen > 0 && pen > bestPen) {
        bestPen = pen;
        best = b;
      }
    }
    if (best) {
      const cc = ax === 'x' ? best.cx : best.cz;
      const hh = ax === 'x' ? best.hx : best.hz;
      p.pos[ax] = v > 0 ? cc - hh - H[ax] : cc + hh + H[ax];
      p.vel[ax] = 0;
    }
  }

  // 碰撞後驗證「還站在那個平台上嗎」（防走下邊緣仍被 carry 拉回）
  _validateStanding(p) {
    if (p.groundPlat == null) return;
    const b = this.solids[p.groundPlat];
    const H = PHYSICS.HALF;
    if (!b) {
      p.grounded = false;
      p.groundPlat = null;
      return;
    }
    const footY = p.pos.y - H.y;
    const top = b.cy + b.hy;
    const onTop = footY <= top + 0.02 && footY >= top - 0.05;
    const inX = Math.abs(p.pos.x - b.cx) < b.hx + H.x * 0.9;
    const inZ = Math.abs(p.pos.z - b.cz) < b.hz + H.z * 0.9;
    if (!(onTop && inX && inZ)) {
      p.grounded = false;
      p.groundPlat = null;
    }
  }
}
