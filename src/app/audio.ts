const MUTE_KEY = 'hand-pilot:muted';

/** Synthesized sound effects — no audio files, everything is generated with WebAudio. */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable — keep default */
    }
  }

  /** Must be called from a user gesture (click) — browsers block audio until then. */
  unlock() {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  hover() { this.tone(880, 0, 0.05, 'sine', 0.04); }
  select() { this.tone(660, 0, 0.08, 'triangle'); this.tone(990, 0.07, 0.12, 'triangle'); }
  countdown() { this.tone(520, 0, 0.15, 'square', 0.06); }
  go() { this.tone(1040, 0, 0.3, 'square', 0.07); }
  shoot() { this.tone(1400, 0, 0.05, 'square', 0.025); }
  crystal() { this.tone(1046, 0, 0.08, 'triangle', 0.1); this.tone(1568, 0.06, 0.12, 'triangle', 0.1); }
  charged() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.07, 0.15, 'triangle', 0.1)); }
  heal() { [659, 880, 1319].forEach((f, i) => this.tone(f, i * 0.08, 0.2, 'sine', 0.12)); }
  block() { this.tone(520, 0, 0.12, 'sine', 0.12); this.tone(780, 0.04, 0.12, 'sine', 0.08); }
  damage() { this.noise(0.35, 0.3, 400); this.tone(110, 0, 0.35, 'sawtooth', 0.12); }
  explode(big = false) { this.noise(big ? 0.9 : 0.25, big ? 0.35 : 0.14, big ? 600 : 1400); }
  rocket() { this.sweep(200, 900, 0.5); }
  warn() { this.tone(880, 0, 0.12, 'square', 0.05); this.tone(660, 0.14, 0.12, 'square', 0.05); }
  denied() { this.tone(200, 0, 0.12, 'square', 0.06); this.tone(160, 0.12, 0.16, 'square', 0.06); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.12, 0.35, 'triangle', 0.12)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, i * 0.18, 0.4, 'sawtooth', 0.07)); }

  /** Filtered white-noise burst — explosions. */
  private noise(dur: number, gain: number, cutoff: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  }

  private sweep(from: number, to: number, dur: number) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
}
