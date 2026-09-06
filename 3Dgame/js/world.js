import * as THREE from 'three';

// 由關卡資料建場景；S4 補移動平台路徑運算 + frameDelta
export class World {
  constructor(scene, level) {
    this.scene = scene;
    this.group = null;
    this.solids = [];
    this.coins = [];
    this.checkpoints = [];
    this.goal = null;
    this.time = 0;
    this.setLevel(level);
  }

  setLevel(level) {
    this.level = level;
    this.time = 0;
    if (this.group) {
      this.scene.remove(this.group);
      this._dispose(this.group);
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.solids.length = 0;
    this.coins = [];
    this.checkpoints = [];
    this.goal = null;
    this.movers = [];

    for (let i = 0; i < level.boxes.length; i++) {
      const b = level.boxes[i];
      const [x, y, z] = b.pos;
      const [sx, sy, sz] = b.size;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: b.color ?? 0x8a6f52, roughness: 0.85 })
      );
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this.solids.push({
        idx: i, cx: x, cy: y, cz: z,
        hx: sx / 2, hy: sy / 2, hz: sz / 2,
        moving: false, frameDelta: { x: 0, y: 0, z: 0 },
      });
    }

    // 移動平台：waypoints 循環 + 正弦緩動；先擺到 t=0 位置
    for (const m of level.movingPlatforms) {
      const [sx, sy, sz] = m.size;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: 0x5f7fa3, roughness: 0.7 })
      );
      this.group.add(mesh);
      const solid = {
        idx: this.solids.length,
        cx: 0, cy: 0, cz: 0,
        hx: sx / 2, hy: sy / 2, hz: sz / 2,
        moving: true, frameDelta: { x: 0, y: 0, z: 0 },
      };
      this.solids.push(solid);
      const p0 = this._moverPos(m, 0);
      solid.cx = p0[0]; solid.cy = p0[1]; solid.cz = p0[2];
      mesh.position.set(p0[0], p0[1], p0[2]);
      this.movers.push({ m, solid, mesh });
    }

    for (const [x, y, z] of level.coins) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.08, 20),
        new THREE.MeshStandardMaterial({
          color: 0xf5c542, roughness: 0.3, metalness: 0.6,
          emissive: 0x664400, emissiveIntensity: 0.5,
        })
      );
      mesh.rotation.x = Math.PI / 2;
      g.add(mesh);
      g.position.set(x, y, z);
      this.group.add(g);
      this.coins.push({ pos: new THREE.Vector3(x, y, z), mesh: g, taken: false });
    }

    level.checkpoints.forEach((c, i) => {
      const [x, y, z] = c.pos;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 })
      );
      pole.position.y = 0.7;
      const flagMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, roughness: 0.5 });
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), flagMat);
      flag.position.set(0.28, 1.25, 0);
      g.add(pole, flag);
      g.position.set(x, y, z);
      this.group.add(g);
      this.checkpoints.push({ pos: c.pos, group: g, flagMat, hit: false });
    });

    // 尖刺（碰撞判定 S5；先渲染：格狀四棱錐）
    if (level.spikes.length) {
      const spikeGeo = new THREE.ConeGeometry(0.26, 1, 4);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xcc4455, roughness: 0.5, flatShading: true,
      });
      for (const s of level.spikes) {
        const [x, y, z] = s.pos;
        const [w, h, d] = s.size;
        const cols = Math.max(1, Math.round(w / 0.55));
        const rows = Math.max(1, Math.round(d / 0.55));
        for (let a = 0; a < cols; a++) {
          for (let b = 0; b < rows; b++) {
            const cone = new THREE.Mesh(spikeGeo, spikeMat);
            cone.rotation.y = Math.PI / 4;
            cone.scale.set(1, h, 1);
            cone.position.set(
              x - w / 2 + ((a + 0.5) * w) / cols,
              y,
              z - d / 2 + ((b + 0.5) * d) / rows
            );
            this.group.add(cone);
          }
        }
      }
    }

    const [gx, gy, gz] = level.goal.pos;
    const gg = new THREE.Group();
    gg.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.1, 12, 28),
        new THREE.MeshStandardMaterial({
          color: 0x7fd4ff, emissive: 0x2a9fd4, emissiveIntensity: 1.0, roughness: 0.3,
        })
      ),
      new THREE.Mesh(
        new THREE.CircleGeometry(0.8, 28),
        new THREE.MeshBasicMaterial({
          color: 0x9fe8ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        })
      )
    );
    gg.position.set(gx, gy, gz);
    this.group.add(gg);
    this.goal = { pos: new THREE.Vector3(gx, gy, gz), group: gg };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const mo of this.movers) {
      const p = this._moverPos(mo.m, t);
      mo.solid.frameDelta.x = p[0] - mo.solid.cx;
      mo.solid.frameDelta.y = p[1] - mo.solid.cy;
      mo.solid.frameDelta.z = p[2] - mo.solid.cz;
      mo.solid.cx = p[0]; mo.solid.cy = p[1]; mo.solid.cz = p[2];
      mo.mesh.position.set(p[0], p[1], p[2]);
    }
    for (const c of this.coins) if (!c.taken) c.mesh.rotation.y = t * 2.2;
    if (this.goal) {
      this.goal.group.rotation.y = t * 0.8;
      const s = 1 + 0.05 * Math.sin(t * 3);
      this.goal.group.scale.set(s, s, s);
    }
  }

  // waypoints 循環、區間內正弦緩動（端點速度為 0，接點平滑）
  _moverPos(m, t) {
    const wp = m.waypoints;
    const n = wp.length;
    const u = ((t / m.period) + (m.phase || 0)) % 1;
    const f = u * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * (f - Math.floor(f)));
    return [
      wp[i][0] + (wp[j][0] - wp[i][0]) * e,
      wp[i][1] + (wp[j][1] - wp[i][1]) * e,
      wp[i][2] + (wp[j][2] - wp[i][2]) * e,
    ];
  }

  markCoin(i, taken) {
    const c = this.coins[i];
    if (c) { c.taken = taken; c.mesh.visible = !taken; }
  }

  markCheckpoint(i, hit) {
    const c = this.checkpoints[i];
    if (c) { c.hit = hit; c.flagMat.color.setHex(hit ? 0x57e389 : 0x66ccff); }
  }

  _dispose(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
}
