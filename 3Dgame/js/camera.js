import * as THREE from 'three';
import { CAMERA } from './config.js';

// 第三人稱追隨鏡頭：yaw/pitch 球面偏移 + damp 平滑 + 平台 AABB 遮蔽射線
const _off = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = CAMERA.PITCH;
    this.smoothYaw = 0;
    this._camPos = new THREE.Vector3();
    this._lookPos = new THREE.Vector3();
  }

  addYaw(d) {
    this.yaw += d;
  }

  addPitch(d) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + d, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
  }

  // 關卡開始：瞬間對齊，避免鏡頭從舊位置飛來
  reset(playerPos) {
    const cp = Math.cos(this.pitch);
    _off.set(
      Math.sin(this.yaw) * cp * CAMERA.DIST,
      Math.sin(this.pitch) * CAMERA.DIST,
      Math.cos(this.yaw) * cp * CAMERA.DIST
    );
    this._camPos.copy(playerPos).add(_off);
    this._lookPos.copy(playerPos).add(_off.set(0, 1.2, 0));
    this.smoothYaw = this.yaw;
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._lookPos);
  }

  update(dt, playerPos, solids) {
    this.smoothYaw = THREE.MathUtils.damp(this.smoothYaw, this.yaw, CAMERA.SMOOTH_LOOK, dt);

    // 目標視點 = 玩家 + (0, 1.4, 0)；鏡頭理想位置 = 目標 + 球面偏移
    _off.set(
      Math.sin(this.smoothYaw) * Math.cos(this.pitch) * CAMERA.DIST,
      Math.sin(this.pitch) * CAMERA.DIST,
      Math.cos(this.smoothYaw) * Math.cos(this.pitch) * CAMERA.DIST
    );
    _desired.copy(playerPos).add(_off);
    _desired.y += 1.4;

    // 遮蔽射線：視點中心→鏡頭理想位置被平台擋到就收縮（最小距離 2）
    _origin.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
    _dir.copy(_desired).sub(_origin);
    const len = _dir.length();
    if (len > 1e-6) {
      _dir.divideScalar(len);
      let hitT = Infinity;
      for (const b of solids) {
        const t = slabT(_origin, _dir, b);
        if (t > 0.001 && t < hitT) hitT = t;
      }
      if (hitT !== Infinity && hitT < len) {
        _desired.copy(_origin).addScaledVector(_dir, Math.max(hitT - 0.3, 2.0));
      }
    }

    this._camPos.x = THREE.MathUtils.damp(this._camPos.x, _desired.x, CAMERA.SMOOTH_POS, dt);
    this._camPos.y = THREE.MathUtils.damp(this._camPos.y, _desired.y, CAMERA.SMOOTH_POS, dt);
    this._camPos.z = THREE.MathUtils.damp(this._camPos.z, _desired.z, CAMERA.SMOOTH_POS, dt);
    this._lookPos.x = THREE.MathUtils.damp(this._lookPos.x, playerPos.x, CAMERA.SMOOTH_LOOK, dt);
    this._lookPos.y = THREE.MathUtils.damp(this._lookPos.y, playerPos.y + 1.4, CAMERA.SMOOTH_LOOK, dt);
    this._lookPos.z = THREE.MathUtils.damp(this._lookPos.z, playerPos.z, CAMERA.SMOOTH_LOOK, dt);

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._lookPos);
  }
}

// slab 法求射線與 AABB 相交參數；不相交回傳 Infinity
function slabT(o, d, b) {
  let tmin = 0.001;
  let tmax = Infinity;
  if (Math.abs(d.x) < 1e-8) {
    if (o.x < b.cx - b.hx || o.x > b.cx + b.hx) return Infinity;
  } else {
    const invD = 1 / d.x;
    let t1 = (b.cx - b.hx - o.x) * invD;
    let t2 = (b.cx + b.hx - o.x) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(d.y) < 1e-8) {
    if (o.y < b.cy - b.hy || o.y > b.cy + b.hy) return Infinity;
  } else {
    const invD = 1 / d.y;
    let t1 = (b.cy - b.hy - o.y) * invD;
    let t2 = (b.cy + b.hy - o.y) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(d.z) < 1e-8) {
    if (o.z < b.cz - b.hz || o.z > b.cz + b.hz) return Infinity;
  } else {
    const invD = 1 / d.z;
    let t1 = (b.cz - b.hz - o.z) * invD;
    let t2 = (b.cz + b.hz - o.z) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin > 0.001 ? tmin : Infinity;
}
