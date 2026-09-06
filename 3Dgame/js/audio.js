// WebAudio 程序化音效（零素材）：init() 必須在首次 user gesture 內呼叫（iOS 解鎖）
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  // 基本音：osc + 指數衰減包絡
  _tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.15, vol = 0.4, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // 噪音爆發（落地/受擊質感）
  _noise({ dur = 0.1, vol = 0.2, lp = 600, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  jump() { this._tone({ type: 'triangle', f0: 320, f1: 640, dur: 0.14, vol: 0.3 }); }
  land() { this._noise({ dur: 0.08, vol: 0.15, lp: 450 }); }
  coin() {
    this._tone({ type: 'sine', f0: 880, dur: 0.06, vol: 0.28 });
    this._tone({ type: 'sine', f0: 1320, dur: 0.12, vol: 0.28, delay: 0.06 });
  }
  hit() {
    this._tone({ type: 'square', f0: 180, f1: 70, dur: 0.2, vol: 0.35 });
    this._noise({ dur: 0.15, vol: 0.2, lp: 500 });
  }
  fall() { this._tone({ type: 'sine', f0: 480, f1: 110, dur: 0.4, vol: 0.28 }); }
  checkpoint() {
    this._tone({ type: 'sine', f0: 660, dur: 0.09, vol: 0.28 });
    this._tone({ type: 'sine', f0: 990, dur: 0.14, vol: 0.28, delay: 0.09 });
  }
  goal() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.3, delay: i * 0.1 }));
  }
  achv() {
    [784, 988, 1175].forEach((f, i) =>
      this._tone({ type: 'sine', f0: f, dur: 0.12, vol: 0.26, delay: i * 0.08 }));
  }
  gameover() {
    [392, 330, 262].forEach((f, i) =>
      this._tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.28, delay: i * 0.15 }));
  }
  ui() { this._tone({ type: 'sine', f0: 620, f1: 900, dur: 0.05, vol: 0.12 }); }
}

export const audio = new AudioFX();
