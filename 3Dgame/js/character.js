import * as THREE from 'three';

// 膠囊小角色：跑動擺腳 + 空中收腳 + 落地 squash + 換色
export class Character {
  constructor(hex, trimHex) {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.05 });
    this.bodyMat = bodyMat;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 12), bodyMat);
    body.position.y = 0;
    body.castShadow = true;
    this.group.add(body);
    this.body = body;

    const trimMat = new THREE.MeshStandardMaterial({ color: trimHex, roughness: 0.6 });
    this.trimMat = trimMat;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.14, 16), trimMat);
    belt.position.y = -0.15;
    this.group.add(belt);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14314f, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMat);
      eye.position.set(sx * 0.11, 0.25, 0.26);
      this.group.add(eye);
    }

    this.legMat = trimMat;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.3), trimMat);
    this.legL.position.set(-0.13, -0.6, 0);
    this.group.add(this.legL);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.3), trimMat);
    this.legR.position.set(0.13, -0.6, 0);
    this.group.add(this.legR);

    this._phase = 0;
    this._squash = 0;
    this._facing = 0;
    this._airBlend = 0;
    this._blink = 0;
  }

  setColor(hex, trimHex) {
    this.bodyMat.color.setHex(hex);
    this.trimMat.color.setHex(trimHex);
  }

  // speed = 落地衝擊速度，決定 squash 深度
  land(speed) {
    const s = Math.min(Math.max((speed - 7) / 8, 0), 1);
    this._squash = Math.max(this._squash, 0.35 + 0.65 * s);
  }

  update(dt, s) {
    // 無敵閃爍（受擊/重生後 1s）
    if (s.iframe > 0) {
      this._blink += dt;
      this.group.visible = Math.floor(this._blink * 12) % 2 === 0;
    } else {
      this.group.visible = true;
      this._blink = 0;
    }

    // 面向：速度向量最短路轉過去
    if (s.speed > 0.1) {
      const target = Math.atan2(s.vx, s.vz);
      let diff = target - this._facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this._facing += diff * Math.min(1, dt * 14);
    }
    this.group.rotation.y = this._facing;

    // 腳擺動
    if (s.grounded) {
      this._phase += dt * 11 * Math.min(s.speed / 5, 1.2);
      this._airBlend = 0;
    } else {
      this._airBlend = Math.min(this._airBlend + dt * 8, 1);
    }
    const swing = Math.sin(this._phase) * 0.7 * Math.min(s.speed / 5, 1);
    const tuck = this._airBlend * 0.55;
    this.legL.rotation.x = swing + tuck;
    this.legR.rotation.x = -swing + tuck;

    // 落地 squash 衰减
    this._squash += (0 - this._squash) * Math.min(1, dt * 12);
    const q = this._squash;
    this.group.scale.set(1 + 0.12 * q, 1 - 0.18 * q, 1 + 0.12 * q);
  }
}
