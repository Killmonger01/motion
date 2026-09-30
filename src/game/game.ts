import { clamp } from '../core/geometry';

export const MAX_LIVES = 3;

/** The mission: three stages, each built around a different gesture. */
export const STAGES = [
  { name: 'Астероидное поле', goal: 'Сбивай астероиды кулаками и собирай кристаллы для ракеты', duration: 30 },
  { name: 'Лазерная засада', goal: 'От узкого луча уходи в сторону. Луч на весь экран держит только щит', duration: 30 },
  { name: 'Крейсер «Тиран»', goal: 'Сбей броню лазерами или одной ракетой — потом бей по ядру', duration: Infinity },
] as const;

export const BOSS_HP = 60;
/** Armor soaks this many laser hits; a rocket strips it all at once. It never grows back. */
export const BOSS_ARMOR = 15;
const CRYSTAL_CHARGE = 0.34; // three crystals = one rocket

export interface Input {
  steer: number;
  fire: boolean;
  shield: boolean;
  rocket: boolean;
}

export interface Asteroid {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  rot: number;
  spin: number;
  /** Radius multipliers of the polygon outline. */
  verts: number[];
  golden: boolean;
  flash: number;
}

export interface Crystal { x: number; y: number; vy: number; phase: number }
/** Falling heart: restores one life. */
export interface Heart { x: number; y: number; vy: number; phase: number }
export interface Bullet { x: number; y: number }
export interface Rocket { x: number; y: number; vx: number }
export interface EnemyShot { x: number; y: number; vx: number; vy: number }

/** Laser beam: first a telegraph (`warn`), then it fires for `life` seconds. */
export interface Beam {
  x: number;
  w: number;
  full: boolean;
  warn: number;
  life: number;
  hit: boolean;
}

export interface Boss {
  x: number;
  y: number;
  targetY: number;
  w: number;
  h: number;
  hp: number;
  /** Remaining armor (laser hits). While > 0 the core takes no damage. */
  armor: number;
  attackIn: number;
  attackN: number;
  flash: number;
  t: number;
}

export type GameEvent =
  | { type: 'shoot' }
  | { type: 'chip'; x: number; y: number }
  | { type: 'kill'; x: number; y: number; r: number; points: number; golden: boolean }
  | { type: 'split'; x: number; y: number }
  | { type: 'damage'; x: number; y: number; cause: 'rock' | 'beam' | 'shot' }
  | { type: 'block'; x: number; y: number }
  | { type: 'crystal'; x: number; y: number; points: number; charged: boolean }
  | { type: 'heal'; x: number; y: number }
  | { type: 'rocket' }
  | { type: 'rocketDenied' }
  | { type: 'boom'; x: number; y: number; radius: number }
  | { type: 'shieldEmpty' }
  | { type: 'stage'; index: number }
  | { type: 'beamWarn'; full: boolean }
  | { type: 'bossHit'; x: number; y: number }
  | { type: 'armorHit'; x: number; y: number }
  | { type: 'armorBroken'; x: number; y: number }
  | { type: 'bossDown'; x: number; y: number }
  | { type: 'end'; won: boolean; bonus: number };

export interface GameStats {
  shots: number;
  hits: number;
  destroyed: number;
  crystals: number;
  blocks: number;
  rockets: number;
  damage: number;
}

/** Deterministic PRNG (mulberry32) — makes the simulation reproducible in tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Game simulation in screen pixels. Pure logic, no rendering, no DOM —
 * the app feeds it gesture input and turns events into sound and effects.
 */
export class Game {
  t = 0;
  stage = 0;
  stageT = 0;
  score = 0;
  lives = MAX_LIVES;
  combo = 0;
  bestCombo = 0;
  shieldEnergy = 1;
  shieldOn = false;
  shieldLocked = false;
  rocketCharge = 0;
  over = false;
  won = false;
  ship = { x: 0, y: 0, vx: 0, invuln: 0 };
  asteroids: Asteroid[] = [];
  crystals: Crystal[] = [];
  hearts: Heart[] = [];
  bullets: Bullet[] = [];
  rockets: Rocket[] = [];
  beams: Beam[] = [];
  enemyShots: EnemyShot[] = [];
  boss: Boss | null = null;
  stats: GameStats = { shots: 0, hits: 0, destroyed: 0, crystals: 0, blocks: 0, rockets: 0, damage: 0 };

  private random: () => number;
  private spawnIn = 1;
  private crystalIn = 3;
  private heartIn = 12;
  private beamIn = 1.5;
  private beamN = 0;
  private fireCd = 0;
  private rocketHeld = false;
  private shieldHeld = false;

  /** `autoSpawn: false` gives tests full control over what is on screen. */
  constructor(public w: number, public h: number, seed = Date.now(), private opts = { autoSpawn: true }) {
    this.random = rng(seed);
    this.resize(w, h);
    this.ship.x = w / 2;
  }

  /** Size unit: sprites and hit boxes scale with the screen. */
  get unit() {
    return Math.min(this.w, this.h) / 800;
  }

  get multiplier() {
    return 1 + Math.min(Math.floor(this.combo / 5), 3);
  }

  /** The cruiser hangs below the HUD bar, a third of the way down. */
  private get bossY() {
    return Math.max(this.h * 0.3, 230 * this.unit);
  }

  /** 0..1 progress of the current stage (boss: damage dealt). */
  get stageProgress() {
    if (this.boss) return 1 - this.boss.hp / BOSS_HP;
    return clamp(this.stageT / STAGES[this.stage].duration);
  }

  resize(w: number, h: number) {
    this.ship.x = (this.ship.x / (this.w || w)) * w;
    this.w = w;
    this.h = h;
    this.ship.y = h - 110 * this.unit;
    if (this.boss) this.boss.targetY = this.bossY;
  }

  update(dt: number, input: Input): GameEvent[] {
    if (this.over) return [];
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.stageT += dt;
    const ev: GameEvent[] = [];
    const u = this.unit;

    // Ship: steering sets the target speed, inertia makes it feel like flying.
    const target = input.steer * this.w * 0.85;
    this.ship.vx += (target - this.ship.vx) * Math.min(1, dt * 8);
    this.ship.x = clamp(this.ship.x + this.ship.vx * dt, 40 * u, this.w - 40 * u);
    this.ship.invuln = Math.max(0, this.ship.invuln - dt);

    // Shield drains while held and recharges otherwise. Once drained it stays
    // locked until 30% is back, so it can't flicker on and off at zero energy.
    if (this.shieldLocked && this.shieldEnergy >= 0.3) this.shieldLocked = false;
    this.shieldOn = input.shield && !this.shieldLocked;
    this.shieldEnergy = clamp(this.shieldEnergy + (this.shieldOn ? -0.4 : 0.16) * dt);
    if (this.shieldOn && this.shieldEnergy === 0) {
      this.shieldLocked = true;
      this.shieldOn = false;
      ev.push({ type: 'shieldEmpty' });
    } else if (input.shield && this.shieldLocked && !this.shieldHeld) {
      ev.push({ type: 'shieldEmpty' });
    }
    this.shieldHeld = input.shield;

    // Twin lasers.
    this.fireCd -= dt;
    if (input.fire && this.fireCd <= 0) {
      this.fireCd = 0.16;
      this.bullets.push({ x: this.ship.x - 14 * u, y: this.ship.y - 20 * u }, { x: this.ship.x + 14 * u, y: this.ship.y - 20 * u });
      this.stats.shots++;
      ev.push({ type: 'shoot' });
    }

    // Rocket fires on the rising edge of the gesture.
    if (input.rocket && !this.rocketHeld) {
      if (this.rocketCharge >= 1) {
        this.rocketCharge = 0;
        this.rockets.push({ x: this.ship.x, y: this.ship.y - 30 * u, vx: 0 });
        this.stats.rockets++;
        ev.push({ type: 'rocket' });
      } else {
        ev.push({ type: 'rocketDenied' });
      }
    }
    this.rocketHeld = input.rocket;

    if (this.stageT >= STAGES[this.stage].duration) this.nextStage(ev);
    if (this.opts.autoSpawn) this.spawn(dt, ev);
    this.updateBoss(dt, ev);
    this.move(dt);
    this.collide(ev);
    return ev;
  }

  nextStage(ev: GameEvent[] = []) {
    this.stage = Math.min(this.stage + 1, STAGES.length - 1);
    this.stageT = 0;
    this.beamIn = 1.5;
    this.beamN = 0;
    if (this.stage === 2) {
      const u = this.unit;
      const w = Math.min(this.w * 0.42, 440 * u);
      this.boss = { x: this.w / 2, y: -140 * u, targetY: this.bossY, w, h: 120 * u, hp: BOSS_HP, armor: BOSS_ARMOR, attackIn: 3, attackN: 0, flash: 0, t: 0 };
      this.crystalIn = 1.5;
    }
    ev.push({ type: 'stage', index: this.stage });
  }

  // ---------- Spawning ----------

  private spawn(dt: number, ev: GameEvent[]) {
    const u = this.unit;
    const k = clamp(this.stageT / 30);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const [base, speed] = this.stage === 0 ? [0.8 - 0.38 * k, 0.26 + 0.16 * k] : this.stage === 1 ? [1.1, 0.34] : [3.2, 0.3];
      this.spawnIn = base * (0.7 + this.random() * 0.6);
      this.spawnAsteroid(speed);
    }

    this.crystalIn -= dt;
    if (this.crystalIn <= 0) {
      this.crystalIn = this.stage === 2 ? 3.2 : 4 + this.random() * 2;
      this.crystals.push({ x: 40 * u + this.random() * (this.w - 80 * u), y: -20, vy: this.h * 0.24, phase: 0 });
    }

    // Hearts only drop when there is a life to restore.
    this.heartIn -= dt;
    if (this.heartIn <= 0) {
      if (this.lives < MAX_LIVES) {
        this.heartIn = (this.stage === 2 ? 10 : 12) + this.random() * 6;
        this.hearts.push({ x: 60 * u + this.random() * (this.w - 120 * u), y: -20, vy: this.h * 0.2, phase: 0 });
      } else {
        this.heartIn = 3;
      }
    }

    if (this.stage === 1) {
      this.beamIn -= dt;
      if (this.beamIn <= 0) {
        this.beamIn = 2.2 - 0.7 * k;
        const n = this.beamN++;
        if (n % 3 === 2) this.addBeam(this.w / 2, true);
        else if (k > 0.5 && n % 3 === 1) {
          // Two columns with a gap between them: find the gap.
          const gap = 0.2 + this.random() * 0.6;
          this.addBeam(this.w * (gap - 0.25), false, this.w * 0.3);
          this.addBeam(this.w * (gap + 0.25), false, this.w * 0.3);
        } else this.addBeam(this.ship.x, false);
        ev.push({ type: 'beamWarn', full: n % 3 === 2 });
      }
    }
  }

  private spawnAsteroid(speed: number) {
    const u = this.unit;
    const golden = this.random() < 0.07;
    const r = (18 + this.random() * 32) * u;
    const maxHp = golden ? 2 : r > 38 * u ? 3 : r > 27 * u ? 2 : 1;
    const x = r + this.random() * (this.w - 2 * r);
    const vy = this.h * speed * (0.8 + this.random() * 0.4);
    // Every fourth rock is a "hunter": aimed at where the ship is now.
    const hunter = this.random() < 0.25;
    const vx = hunter ? ((this.ship.x - x) / (this.ship.y + r)) * vy : (this.random() - 0.5) * 60 * u;
    this.asteroids.push({
      x, y: -r, r, vx, vy, hp: maxHp, maxHp,
      rot: this.random() * Math.PI * 2,
      spin: (this.random() - 0.5) * 2,
      verts: Array.from({ length: 9 }, () => 0.75 + this.random() * 0.3),
      golden,
      flash: 0,
    });
  }

  addBeam(x: number, full: boolean, w = this.w * 0.17) {
    this.beams.push({ x, w: full ? this.w : w, full, warn: full ? 1.3 : 1.0, life: 0.6, hit: false });
  }

  // ---------- Boss ----------

  private updateBoss(dt: number, ev: GameEvent[]) {
    const b = this.boss;
    if (!b) return;
    const u = this.unit;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.y += (b.targetY - b.y) * Math.min(1, dt * 1.5);
    // Swings across the middle, staying clear of the camera preview in the corner.
    b.x = this.w / 2 + Math.sin(b.t * 0.55) * Math.max(0, this.w / 2 - b.w / 2 - 260 * u);
    if (b.y < b.targetY - 20 * u) return; // still arriving

    const rage = b.hp < BOSS_HP / 2;
    b.attackIn -= dt;
    if (b.attackIn > 0) return;
    b.attackIn = rage ? 1.25 : 1.8;
    const n = b.attackN++;
    if (n % 3 === 2) {
      this.addBeam(this.w / 2, true);
      ev.push({ type: 'beamWarn', full: true });
    } else {
      // Aimed fan of plasma shots.
      const count = rage ? 7 : 5;
      const speed = this.h * (rage ? 0.5 : 0.42);
      const base = Math.atan2(this.ship.y - b.y, this.ship.x - b.x);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * 0.16;
        this.enemyShots.push({ x: b.x, y: b.y + b.h / 2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      }
      if (rage && n % 3 === 1) {
        this.addBeam(this.ship.x, false);
        ev.push({ type: 'beamWarn', full: false });
      }
    }
  }

  // ---------- Movement & collisions ----------

  private move(dt: number) {
    const bulletSpeed = this.h * 1.6;
    for (const b of this.bullets) b.y -= bulletSpeed * dt;
    for (const r of this.rockets) {
      // In the boss fight the rocket homes in on the cruiser.
      if (this.boss) r.vx += Math.sign(this.boss.x - r.x) * this.w * 2 * dt;
      r.vx *= 0.98;
      r.x += r.vx * dt;
      r.y -= this.h * 0.9 * dt;
    }
    for (const s of this.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.spin * dt;
      a.flash = Math.max(0, a.flash - dt);
    }
    for (const c of [...this.crystals, ...this.hearts]) {
      c.y += c.vy * dt;
      c.phase += dt * 3;
    }
    for (const beam of this.beams) {
      if (beam.warn > 0) beam.warn -= dt;
      else beam.life -= dt;
    }
    this.bullets = this.bullets.filter((b) => b.y > -20);
    this.asteroids = this.asteroids.filter((a) => a.y < this.h + a.r && a.x > -a.r * 2 && a.x < this.w + a.r * 2);
    this.crystals = this.crystals.filter((c) => c.y < this.h + 20);
    this.hearts = this.hearts.filter((c) => c.y < this.h + 20);
    this.enemyShots = this.enemyShots.filter((s) => s.y < this.h + 20 && s.x > -20 && s.x < this.w + 20);
    this.beams = this.beams.filter((b) => b.life > 0);
  }

  private collide(ev: GameEvent[]) {
    const u = this.unit;
    const shipR = 24 * u;
    const boss = this.boss;

    for (const b of this.bullets) {
      if (boss && Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2) {
        b.y = -100;
        this.stats.hits++;
        boss.flash = 0.08;
        this.score += 5 * this.multiplier;
        if (boss.armor > 0) {
          // Lasers chip the armor away — no rocket strictly required.
          boss.armor--;
          ev.push({ type: 'armorHit', x: b.x, y: boss.y + boss.h / 2 });
          if (boss.armor === 0) ev.push({ type: 'armorBroken', x: boss.x, y: boss.y });
        } else {
          boss.hp--;
          ev.push({ type: 'bossHit', x: b.x, y: boss.y + boss.h / 2 });
          if (boss.hp <= 0) this.defeatBoss(ev);
        }
        continue;
      }
      const a = this.asteroids.find((a) => a.hp > 0 && Math.hypot(a.x - b.x, a.y - b.y) < a.r);
      if (!a) continue;
      this.stats.hits++;
      a.hp--;
      a.flash = 0.1;
      if (a.hp <= 0) this.kill(a, ev);
      else ev.push({ type: 'chip', x: b.x, y: b.y });
      b.y = -100; // bullet consumed
    }
    if (this.over) return;

    for (const r of this.rockets) {
      const hitRock = this.asteroids.some((a) => a.hp > 0 && Math.hypot(a.x - r.x, a.y - r.y) < a.r + 10 * u);
      const reachedBoss = boss && r.y <= boss.y + boss.h / 2;
      if (!hitRock && !reachedBoss && r.y > this.h * (boss ? 0.05 : 0.3)) continue;
      const radius = Math.min(this.w, this.h) * 0.32;
      for (const a of this.asteroids) if (Math.hypot(a.x - r.x, a.y - r.y) < radius + a.r) this.kill(a, ev);
      if (boss && Math.abs(r.x - boss.x) < boss.w / 2 + 40 * u && Math.abs(r.y - boss.y) < radius) {
        if (boss.armor > 0) {
          boss.armor = 0;
          ev.push({ type: 'armorBroken', x: boss.x, y: boss.y });
        } else {
          // No armor left — the rocket hits the core hard.
          boss.hp = Math.max(0, boss.hp - 10);
          boss.flash = 0.2;
          if (boss.hp === 0) this.defeatBoss(ev);
        }
      }
      ev.push({ type: 'boom', x: r.x, y: r.y, radius });
      r.y = -1000;
    }
    this.rockets = this.rockets.filter((r) => r.y > -500);

    for (const a of this.asteroids) {
      if (a.hp <= 0 || Math.hypot(a.x - this.ship.x, a.y - this.ship.y) > a.r + shipR) continue;
      a.hp = 0;
      this.impact(a.x, a.y, 'rock', ev);
    }
    for (const s of this.enemyShots) {
      if (Math.hypot(s.x - this.ship.x, s.y - this.ship.y) > shipR + 7 * u) continue;
      s.y = this.h + 100;
      this.impact(s.x, s.y, 'shot', ev);
    }
    for (const beam of this.beams) {
      const active = beam.warn <= 0 && beam.life > 0;
      if (!active || beam.hit || (!beam.full && Math.abs(this.ship.x - beam.x) > beam.w / 2 + shipR * 0.5)) continue;
      beam.hit = true;
      this.impact(this.ship.x, this.ship.y, 'beam', ev);
    }

    for (const c of this.crystals) {
      if (Math.hypot(c.x - this.ship.x, c.y - this.ship.y) > shipR + 18 * u) continue;
      c.y = this.h + 100;
      const wasCharged = this.rocketCharge >= 1;
      this.rocketCharge = clamp(this.rocketCharge + CRYSTAL_CHARGE);
      this.score += 25;
      this.stats.crystals++;
      ev.push({ type: 'crystal', x: c.x, y: this.ship.y, points: 25, charged: !wasCharged && this.rocketCharge >= 1 });
    }

    for (const heart of this.hearts) {
      if (Math.hypot(heart.x - this.ship.x, heart.y - this.ship.y) > shipR + 20 * u) continue;
      heart.y = this.h + 100;
      if (this.lives < MAX_LIVES) this.lives++;
      else this.score += 100;
      ev.push({ type: 'heal', x: heart.x, y: this.ship.y });
    }

    this.asteroids = this.asteroids.filter((a) => a.hp > 0);
    this.hearts = this.hearts.filter((c) => c.y < this.h + 20);
    this.enemyShots = this.enemyShots.filter((s) => s.y < this.h + 20);
    this.crystals = this.crystals.filter((c) => c.y < this.h + 20);
  }

  /** Something hit the ship: the shield absorbs it, otherwise a life is lost. */
  private impact(x: number, y: number, cause: 'rock' | 'beam' | 'shot', ev: GameEvent[]) {
    if (this.over) return;
    if (this.shieldOn) {
      this.stats.blocks++;
      this.score += 10;
      ev.push({ type: 'block', x, y });
      return;
    }
    if (this.ship.invuln > 0) return;
    this.lives--;
    this.combo = 0;
    this.stats.damage++;
    this.ship.invuln = 1.6;
    ev.push({ type: 'damage', x, y, cause });
    if (this.lives <= 0) {
      this.over = true;
      ev.push({ type: 'end', won: false, bonus: 0 });
    }
  }

  private kill(a: Asteroid, ev: GameEvent[]) {
    if (a.hp < 0) return; // already destroyed this frame
    a.hp = -1;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = 10 * a.maxHp * (a.golden ? 3 : 1) * this.multiplier;
    this.score += points;
    this.stats.destroyed++;
    ev.push({ type: 'kill', x: a.x, y: a.y, r: a.r, points, golden: a.golden });
    // Big rocks break into two fast fragments flying apart.
    if (a.maxHp >= 3 && !a.golden) {
      for (const dir of [-1, 1]) {
        this.asteroids.push({
          ...a,
          r: a.r * 0.55,
          hp: 1,
          maxHp: 1,
          vx: dir * this.w * 0.18,
          vy: a.vy * 1.15,
          verts: a.verts.map((v) => v * (0.9 + this.random() * 0.2)),
          flash: 0,
        });
      }
      ev.push({ type: 'split', x: a.x, y: a.y });
    }
  }

  private defeatBoss(ev: GameEvent[]) {
    const b = this.boss!;
    const bonus = 1000 + this.lives * 300;
    this.score += bonus;
    this.over = this.won = true;
    this.enemyShots = [];
    this.beams = [];
    ev.push({ type: 'bossDown', x: b.x, y: b.y }, { type: 'end', won: true, bonus });
  }
}
