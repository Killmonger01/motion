import { BOSS_ARMOR, BOSS_HP, type Boss, type Game, type GameEvent } from './game';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface FloatText { x: number; y: number; text: string; life: number; color: string }
interface Star { x: number; y: number; z: number }

const C = {
  ship: '#ff6b4a',
  laser: '#ffe08a',
  rock: '#2a1650',
  rockEdge: '#b07cff',
  gold: '#ffd23f',
  crystal: '#3ff0b4',
  shield: '#3ff0b4',
  good: '#3ff0b4',
  bad: '#ff3d6e',
  rocket: '#ffb938',
  hull: '#3a1250',
  beam: '#ff4f9a',
  plasma: '#ff4f9a',
  armor: '#ffb938',
  heart: '#ff4f9a',
};

/** Draws the game world plus purely visual effects (particles, floating score, screen shake). */
export class GameRenderer {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private stars: Star[] = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
  private shake = 0;
  private boom: { x: number; y: number; r: number; life: number } | null = null;

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Turns game events into visual effects. */
  effects(events: GameEvent[], game: Game) {
    const u = game.unit;
    for (const e of events) {
      switch (e.type) {
        case 'kill':
          this.burst(e.x, e.y, e.golden ? C.gold : C.rockEdge, 18 + e.r / u / 2, u);
          this.text(e.x, e.y, `+${e.points}`, e.golden ? C.gold : '#fff4e6');
          break;
        case 'chip':
          this.burst(e.x, e.y, C.laser, 5, u);
          break;
        case 'damage':
          this.burst(e.x, e.y, C.bad, 30, u);
          this.shake = 0.4;
          break;
        case 'block':
          this.burst(e.x, e.y, C.shield, 20, u);
          this.text(e.x, e.y, 'БЛОК', C.shield);
          break;
        case 'crystal':
          this.burst(e.x, e.y, C.crystal, 14, u);
          this.text(e.x, e.y - 30 * u, e.charged ? 'РАКЕТА ГОТОВА' : `+${e.points}`, C.crystal);
          break;
        case 'heal':
          this.burst(e.x, e.y, C.heart, 24, u);
          this.text(e.x, e.y - 30 * u, '+1 ЖИЗНЬ', C.heart);
          break;
        case 'split':
          this.burst(e.x, e.y, C.rockEdge, 10, u);
          break;
        case 'bossHit':
          this.burst(e.x, e.y, C.laser, 4, u);
          break;
        case 'armorHit':
          this.burst(e.x, e.y, C.armor, 5, u);
          break;
        case 'armorBroken':
          this.burst(e.x, e.y, C.armor, 50, u * 1.5);
          this.text(e.x, e.y + 80 * u, 'БРОНЯ ПРОБИТА!', C.good);
          this.shake = 0.35;
          break;
        case 'bossDown':
          for (let i = 0; i < 6; i++) this.burst(e.x + (Math.random() - 0.5) * 200 * u, e.y + (Math.random() - 0.5) * 80 * u, i % 2 ? C.rocket : C.beam, 60, u * 2);
          this.boom = { x: e.x, y: e.y, r: Math.min(game.w, game.h) * 0.6, life: 0.6 };
          this.shake = 0.8;
          break;
        case 'boom':
          this.boom = { x: e.x, y: e.y, r: e.radius, life: 0.6 };
          this.burst(e.x, e.y, C.rocket, 60, u * 2);
          this.shake = 0.3;
          break;
      }
    }
  }

  private burst(x: number, y: number, color: string, count: number, u: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 260) * u;
      const max = 0.4 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: (1.5 + Math.random() * 3) * u });
    }
  }

  private text(x: number, y: number, text: string, color: string) {
    this.texts.push({ x, y, text, color, life: 0.9 });
  }

  draw(game: Game, dt: number, paused = false) {
    const { ctx } = this;
    const { w, h } = game;
    const u = game.unit;
    if (!paused) this.step(dt, game);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * this.shake, (Math.random() - 0.5) * 18 * this.shake);

    // Night sky fading into a sunset glow at the bottom.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0c0620');
    bg.addColorStop(0.65, '#1c0c3c');
    bg.addColorStop(1, '#4a1450');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, w + 40, h + 40);
    const glow = ctx.createRadialGradient(w / 2, h * 1.25, 0, w / 2, h * 1.25, h * 0.9);
    glow.addColorStop(0, 'rgba(255, 107, 74, 0.45)');
    glow.addColorStop(1, 'rgba(255, 107, 74, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-20, -20, w + 40, h + 40);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255, 236, 214, ${0.25 + s.z * 0.6})`;
      ctx.fillRect(s.x * w, s.y * h, s.z * 2.2, s.z * 2.2 + (paused ? 0 : s.z * 4 * (1 + game.stage * 0.6)));
    }

    if (this.boom) {
      const k = 1 - this.boom.life / 0.6;
      ctx.strokeStyle = `rgba(255, 185, 56, ${1 - k})`;
      ctx.lineWidth = 8 * u * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(this.boom.x, this.boom.y, this.boom.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawBeams(game, u);
    if (game.boss) this.drawBoss(game.boss, u);
    for (const c of game.crystals) this.drawCrystal(c.x, c.y, c.phase, u);
    for (const h of game.hearts) this.drawHeart(h.x, h.y, h.phase, u);
    for (const a of game.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      ctx.beginPath();
      a.verts.forEach((m, i) => {
        const ang = (i / a.verts.length) * Math.PI * 2;
        const px = Math.cos(ang) * a.r * m;
        const py = Math.sin(ang) * a.r * m;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = a.flash > 0 ? '#fff4e6' : a.golden ? '#4a2a08' : C.rock;
      ctx.fill();
      ctx.strokeStyle = a.golden ? C.gold : C.rockEdge;
      ctx.lineWidth = 2.5 * u;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (a.maxHp > 1) {
        // Damage pips: how many hits are left.
        ctx.fillStyle = 'rgba(255, 244, 230, 0.85)';
        for (let i = 0; i < a.hp; i++) ctx.fillRect((i - (a.hp - 1) / 2) * 8 * u - 2 * u, -2 * u, 4 * u, 4 * u);
      }
      ctx.restore();
    }

    ctx.strokeStyle = C.laser;
    ctx.lineWidth = 3 * u;
    ctx.shadowColor = C.rocket;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (const b of game.bullets) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + 18 * u);
    }
    ctx.stroke();

    for (const r of game.rockets) {
      ctx.fillStyle = C.rocket;
      ctx.shadowColor = C.rocket;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 16 * u);
      ctx.lineTo(r.x - 7 * u, r.y + 10 * u);
      ctx.lineTo(r.x + 7 * u, r.y + 10 * u);
      ctx.fill();
      this.particles.push({ x: r.x, y: r.y + 12 * u, vx: (Math.random() - 0.5) * 40, vy: 120 * u, life: 0.3, max: 0.3, color: C.rocket, size: 3 * u });
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = C.plasma;
    ctx.shadowColor = C.plasma;
    ctx.shadowBlur = 16;
    for (const p of game.enemyShots) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    this.drawShip(game, u);

    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = `900 ${Math.round(24 * u + 6)}px Rubik, sans-serif`;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private step(dt: number, game: Game) {
    for (const s of this.stars) {
      s.y += dt * s.z * 0.15 * (1 + game.stage * 1.2);
      if (s.y > 1) {
        s.y = 0;
        s.x = Math.random();
      }
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    for (const t of this.texts) {
      t.y -= 50 * dt;
      t.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    if (this.boom && (this.boom.life -= dt) <= 0) this.boom = null;
  }

  private drawBeams(game: Game, u: number) {
    const { ctx } = this;
    const t = game.t;
    for (const b of game.beams) {
      const left = b.x - b.w / 2;
      if (b.warn > 0) {
        // Telegraph: pulsing danger zone + dashed edges, more urgent as it charges.
        const urgency = 1 - b.warn / (b.full ? 1.3 : 1.0);
        ctx.fillStyle = `rgba(255, 79, 154, ${0.06 + 0.12 * urgency * (0.5 + 0.5 * Math.sin(t * 30))})`;
        ctx.fillRect(left, 0, b.w, game.h);
        ctx.strokeStyle = 'rgba(255, 79, 154, 0.8)';
        ctx.lineWidth = 2 * u;
        ctx.setLineDash([10 * u, 10 * u]);
        ctx.beginPath();
        if (!b.full) {
          ctx.moveTo(left, 0); ctx.lineTo(left, game.h);
          ctx.moveTo(left + b.w, 0); ctx.lineTo(left + b.w, game.h);
        } else {
          ctx.moveTo(0, game.ship.y - 50 * u); ctx.lineTo(game.w, game.ship.y - 50 * u);
          ctx.moveTo(0, game.ship.y + 50 * u); ctx.lineTo(game.w, game.ship.y + 50 * u);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.beam;
        ctx.font = `900 ${Math.round(18 * u + 8)}px Rubik, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(b.full ? '⚠ ЩИТ!' : '⚠', b.full ? game.w / 2 : b.x, game.h * 0.45);
        continue;
      }
      // Firing: a bright core with a wide glow.
      const k = Math.min(1, b.life / 0.6);
      const grd = ctx.createLinearGradient(left, 0, left + b.w, 0);
      grd.addColorStop(0, 'rgba(255, 79, 154, 0)');
      grd.addColorStop(0.5, `rgba(255, 220, 240, ${0.9 * k})`);
      grd.addColorStop(1, 'rgba(255, 79, 154, 0)');
      ctx.fillStyle = b.full ? `rgba(255, 79, 154, ${0.35 * k})` : grd;
      ctx.fillRect(left, 0, b.w, game.h);
      if (b.full) {
        ctx.fillStyle = `rgba(255, 220, 240, ${0.6 * k})`;
        ctx.fillRect(0, game.ship.y - 30 * u, game.w, 60 * u);
      }
    }
  }

  private drawBoss(b: Boss, u: number) {
    const { ctx } = this;
    const armored = b.armor > 0;
    ctx.save();
    ctx.translate(b.x, b.y);
    const hw = b.w / 2;
    const hh = b.h / 2;

    // Hull
    ctx.fillStyle = b.flash > 0 ? '#fff4e6' : '#2a1146';
    ctx.strokeStyle = C.beam;
    ctx.lineWidth = 3 * u;
    ctx.shadowColor = C.beam;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh * 0.4);
    ctx.lineTo(-hw * 0.6, -hh);
    ctx.lineTo(hw * 0.6, -hh);
    ctx.lineTo(hw, -hh * 0.4);
    ctx.lineTo(hw * 0.75, hh * 0.5);
    ctx.lineTo(hw * 0.25, hh * 0.5);
    ctx.lineTo(0, hh);
    ctx.lineTo(-hw * 0.25, hh * 0.5);
    ctx.lineTo(-hw * 0.75, hh * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Weak core — glows when the armor is down.
    const pulse = 0.5 + 0.5 * Math.sin(b.t * 10);
    ctx.fillStyle = armored ? '#5a2a6e' : `rgba(63, 240, 180, ${0.7 + 0.3 * pulse})`;
    ctx.shadowColor = armored ? 'transparent' : C.good;
    ctx.shadowBlur = armored ? 0 : 30;
    ctx.beginPath();
    ctx.arc(0, 0, hh * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Armor plates
    if (armored) {
      // Plates fade as the armor is chipped away.
      ctx.fillStyle = `rgba(255, 185, 56, ${0.3 + 0.6 * (b.armor / BOSS_ARMOR)})`;
      ctx.shadowColor = C.armor;
      ctx.shadowBlur = 14;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * hh * 0.05, -hh * 0.55);
        ctx.lineTo(side * hh * 0.55, -hh * 0.2);
        ctx.lineTo(side * hh * 0.55, hh * 0.3);
        ctx.lineTo(side * hh * 0.05, hh * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // Armor bar (while it lasts) and health bar under the hull
    const bw = b.w * 0.8;
    const bar = (y: number, value: number, color: string) => {
      ctx.fillStyle = 'rgba(255, 244, 230, 0.15)';
      ctx.fillRect(-bw / 2, y, bw, 6 * u);
      ctx.fillStyle = color;
      ctx.fillRect(-bw / 2, y, bw * value, 6 * u);
    };
    if (armored) bar(hh + 12 * u, b.armor / BOSS_ARMOR, C.armor);
    bar(hh + (armored ? 22 : 12) * u, b.hp / BOSS_HP, C.good);
    ctx.restore();
  }

  private drawHeart(x: number, y: number, phase: number, u: number) {
    const { ctx } = this;
    const s = 21 * u * (1 + 0.15 * Math.sin(phase * 3)); // heartbeat
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = C.heart;
    ctx.shadowColor = C.heart;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.8, -s * 1.3, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.8, -s * 1.3, s * 1.6, -s * 0.1, 0, s * 0.9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff4e6';
    ctx.fillRect(-s * 0.12, -s * 0.5, s * 0.24, s * 0.8);
    ctx.fillRect(-s * 0.4, -s * 0.22, s * 0.8, s * 0.24);
    ctx.restore();
  }

  private drawCrystal(x: number, y: number, phase: number, u: number) {
    const { ctx } = this;
    const s = 13 * u * (1 + 0.12 * Math.sin(phase * 2));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(phase) * 0.4);
    ctx.fillStyle = C.crystal;
    ctx.shadowColor = C.crystal;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, s * 1.3);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawShip(game: Game, u: number) {
    const { ctx } = this;
    const { x, y, vx, invuln } = game.ship;
    if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return; // blink after a hit
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((vx / game.w) * 0.35);

    // Engine flame
    const flame = (18 + Math.random() * 10) * u;
    ctx.fillStyle = C.rocket;
    ctx.shadowColor = C.rocket;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(-8 * u, 18 * u);
    ctx.lineTo(0, 18 * u + flame);
    ctx.lineTo(8 * u, 18 * u);
    ctx.fill();

    // Hull
    ctx.fillStyle = C.hull;
    ctx.strokeStyle = C.ship;
    ctx.lineWidth = 3 * u;
    ctx.shadowColor = C.ship;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, -30 * u);
    ctx.lineTo(24 * u, 20 * u);
    ctx.lineTo(8 * u, 13 * u);
    ctx.lineTo(0, 20 * u);
    ctx.lineTo(-8 * u, 13 * u);
    ctx.lineTo(-24 * u, 20 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (game.shieldOn) {
      ctx.strokeStyle = `rgba(63, 240, 180, ${0.5 + 0.4 * game.shieldEnergy})`;
      ctx.fillStyle = 'rgba(63, 240, 180, 0.12)';
      ctx.lineWidth = 3 * u;
      ctx.shadowColor = C.shield;
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(0, -2 * u, 46 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
