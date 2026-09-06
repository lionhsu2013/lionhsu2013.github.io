import { CAMERA } from './config.js';

const JOY_R = 44; // 搖桿半徑 px

// 統一輸入抽象：鍵盤（S1）+ 滑鼠 pointer lock / 拖曳 fallback（S5）+ 觸控搖桿/跳鈕（S9）
// 輸出：move {x,y}(-1..1, 鏡頭座標系前向為 +y)、跳躍邊沿/按住、本幀 yaw/pitch delta
export class Input {
  constructor() {
    this.keys = new Set();
    this._jumpHeld = false;
    this._jumpEdge = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.isTouch =
      navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    this.canvas = null;
    this.onLockChange = null; // main 設定：(locked) => void（失鎖時用於自動暫停）
    this._locked = false;
    this._dragging = false;
    this._lx = 0;
    this._ly = 0;
    // S9 觸控
    this._joyVec = { x: 0, y: 0 };
    this._joyActive = false;
    this._joyId = null;
    this._joyCX = 0;
    this._joyCY = 0;
    this._joyStick = null;
    this._camT = { active: false, id: null, lx: 0, ly: 0 };
  }

  // touch: { joyBase, joyStick, jumpBtn }（S9）
  attach(canvas, touch) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      this._setKey(e.code, true);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this._setKey(e.code, false));
    addEventListener('blur', () => {
      this.keys.clear();
      this._jumpHeld = false;
      this._dragging = false;
      this._joyActive = false;
      this._joyVec.x = 0;
      this._joyVec.y = 0;
      this._camT.active = false;
    });
    if (!this.isTouch) this._attachMouse(canvas);
    else if (touch) this._attachTouch(canvas, touch);
  }

  // 行動版：左下搖桿（DOM + pointer capture）+ 右下跳鈕 + 右半屏拖曳轉鏡頭
  _attachTouch(canvas, { joyBase, joyStick, jumpBtn }) {
    this._joyStick = joyStick;

    joyBase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { joyBase.setPointerCapture(e.pointerId); } catch { /* 合成事件無 active pointer */ }
      this._joyActive = true;
      this._joyId = e.pointerId;
      const r = joyBase.getBoundingClientRect();
      this._joyCX = r.left + r.width / 2;
      this._joyCY = r.top + r.height / 2;
      this._moveJoy(e);
    });
    joyBase.addEventListener('pointermove', (e) => {
      if (this._joyActive && e.pointerId === this._joyId) this._moveJoy(e);
    });
    const endJoy = (e) => {
      if (this._joyActive && e.pointerId === this._joyId) {
        this._joyActive = false;
        this._joyVec.x = 0;
        this._joyVec.y = 0;
        joyStick.style.transform = 'translate(0px, 0px)';
      }
    };
    joyBase.addEventListener('pointerup', endJoy);
    joyBase.addEventListener('pointercancel', endJoy);

    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { jumpBtn.setPointerCapture(e.pointerId); } catch { /* 合成事件無 active pointer */ }
      this.pressJump();
    });
    const endJump = () => this.releaseJump();
    jumpBtn.addEventListener('pointerup', endJump);
    jumpBtn.addEventListener('pointercancel', endJump);

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || e.clientX < innerWidth / 2) return;
      this._camT.active = true;
      this._camT.id = e.pointerId;
      this._camT.lx = e.clientX;
      this._camT.ly = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件無 active pointer */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._camT.active || e.pointerId !== this._camT.id) return;
      this.yawDelta -= (e.clientX - this._camT.lx) * CAMERA.YAW_TOUCH;
      this.pitchDelta -= (e.clientY - this._camT.ly) * CAMERA.YAW_TOUCH;
      this._camT.lx = e.clientX;
      this._camT.ly = e.clientY;
    });
    const endCam = (e) => {
      if (this._camT.active && e.pointerId === this._camT.id) this._camT.active = false;
    };
    canvas.addEventListener('pointerup', endCam);
    canvas.addEventListener('pointercancel', endCam);
  }

  _moveJoy(e) {
    let dx = e.clientX - this._joyCX;
    let dy = e.clientY - this._joyCY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) { dx = (dx / len) * JOY_R; dy = (dy / len) * JOY_R; }
    this._joyVec.x = dx / JOY_R;
    this._joyVec.y = -dy / JOY_R; // 螢幕 y 向下 → 前(+y)為畫面上方
    this._joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // 桌面：pointer lock；未鎖定時左鍵拖曳 fallback
  _attachMouse(canvas) {
    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this._locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (this._locked) {
        this.yawDelta -= e.movementX * CAMERA.YAW_MOUSE;
        this.pitchDelta -= e.movementY * CAMERA.YAW_MOUSE;
      } else if (this._dragging) {
        this.yawDelta -= (e.clientX - this._lx) * CAMERA.YAW_MOUSE;
        this.pitchDelta -= (e.clientY - this._ly) * CAMERA.YAW_MOUSE;
        this._lx = e.clientX;
        this._ly = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this._locked) {
        this._dragging = true;
        this._lx = e.clientX;
        this._ly = e.clientY;
      }
    });
    addEventListener('mouseup', () => { this._dragging = false; });
  }

  requestLock() {
    if (this.isTouch || this._locked) return;
    const p = this.canvas.requestPointerLock ? this.canvas.requestPointerLock() : null;
    if (p && p.catch) p.catch(() => {}); // 瀏覽器拒絕 → 保留拖曳 fallback
  }

  _setKey(code, down) {
    if (code === 'Space') {
      if (down && !this._jumpHeld) this._jumpEdge = true;
      this._jumpHeld = down;
      return;
    }
    const dir = {
      KeyW: 'f', ArrowUp: 'f',
      KeyS: 'b', ArrowDown: 'b',
      KeyA: 'l', ArrowLeft: 'l',
      KeyD: 'r', ArrowRight: 'r',
      KeyQ: 'ql', KeyE: 'qr',
    }[code];
    if (!dir) return;
    if (down) this.keys.add(dir);
    else this.keys.delete(dir);
  }

  // 觸控跳鈕 / debug 用
  pressJump() {
    if (!this._jumpHeld) this._jumpEdge = true;
    this._jumpHeld = true;
  }
  releaseJump() {
    this._jumpHeld = false;
  }

  // 每幀呼叫：持續鍵（Q/E）累積 yaw
  update(dt) {
    if (this.keys.has('ql')) this.yawDelta += CAMERA.YAW_KEY * dt;
    if (this.keys.has('qr')) this.yawDelta -= CAMERA.YAW_KEY * dt;
  }

  get move() {
    let x = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0) + this._joyVec.x;
    let y = (this.keys.has('f') ? 1 : 0) - (this.keys.has('b') ? 1 : 0) + this._joyVec.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; } // 對角歸一化（搖桿+鍵盤混合時）
    return { x, y };
  }

  // 邊沿：讀一次即歸零
  jumpPressed() {
    const p = this._jumpEdge;
    this._jumpEdge = false;
    return p;
  }
  jumpHeld() {
    return this._jumpHeld;
  }

  // 本幀累積 yaw（滑鼠/拖曳/QE 共用），讀後歸零
  consumeCameraYaw() {
    const d = this.yawDelta;
    this.yawDelta = 0;
    return d;
  }

  // 本幀累積 pitch（滑鼠/拖曳），讀後歸零
  consumeCameraPitch() {
    const d = this.pitchDelta;
    this.pitchDelta = 0;
    return d;
  }
}
