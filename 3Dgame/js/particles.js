import * as THREE from 'three';

// 單一 THREE.Points 粒子池（AdditiveBlending）：硬幣/跳躍/受擊/完成 爆發
const POOL = 256;

export class Particles {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(POOL * 3);
    this.colors = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.life = new Float32Array(POOL); // <=0 = 閒置
    for (let i = 0; i < POOL; i++) this.positions[i * 3 + 1] = -9999;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._cursor = 0;
    this._c = new THREE.Color();
  }

  // pos: THREE.Vector3；color: 0xRRGGBB
  burst(pos, { color = 0xffffff, count = 12, speed = 2, up = 1.6, life = 0.55 } = {}) {
    this._c.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % POOL;
      const i3 = i * 3;
      this.positions[i3] = pos.x;
      this.positions[i3 + 1] = pos.y;
      this.positions[i3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.6;
      this.vel[i3] = Math.cos(a) * r * speed * 0.45;
      this.vel[i3 + 1] = up * (0.5 + Math.random() * 0.9);
      this.vel[i3 + 2] = Math.sin(a) * r * speed * 0.45;
      this.colors[i3] = this._c.r;
      this.colors[i3 + 1] = this._c.g;
      this.colors[i3 + 2] = this._c.b;
      this.life[i] = life * (0.6 + Math.random() * 0.6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -9999;
        continue;
      }
      this.vel[i3 + 1] -= 4 * dt; // 輕重力
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      dirty = true;
    }
    if (dirty) this.geo.attributes.position.needsUpdate = true;
  }
}
