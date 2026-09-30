import { describe, expect, it } from 'vitest';
import { BOSS_HP, Game, STAGES, type Asteroid, type GameEvent, type Input } from '../src/game/game';

const IDLE: Input = { steer: 0, fire: false, shield: false, rocket: false };

function rock(game: Game, x: number, y: number, hp = 1): Asteroid {
  const a: Asteroid = { x, y, r: 30, vx: 0, vy: 0, hp, maxHp: hp, rot: 0, spin: 0, verts: [1, 1, 1], golden: false, flash: 0 };
  game.asteroids.push(a);
  return a;
}

function run(game: Game, seconds: number, input: Input): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) ev.push(...game.update(1 / 60, input));
  return ev;
}

/** No random spawning — every object on screen is placed by the test. */
const quietGame = () => new Game(800, 800, 1, { autoSpawn: false });

const charge = (g: Game) => {
  for (let i = 0; i < 3; i++) g.crystals.push({ x: g.ship.x, y: g.ship.y, vy: 0, phase: 0 });
  run(g, 0.05, IDLE);
};

describe('game basics', () => {
  it('steering moves the ship', () => {
    const g = quietGame();
    const x0 = g.ship.x;
    run(g, 0.5, { ...IDLE, steer: 1 });
    expect(g.ship.x).toBeGreaterThan(x0 + 100);
  });

  it('lasers destroy an asteroid and score points', () => {
    const g = quietGame();
    rock(g, g.ship.x, 300, 2);
    const ev = run(g, 1, { ...IDLE, fire: true });
    expect(ev.some((e) => e.type === 'kill')).toBe(true);
    expect(g.score).toBe(20);
  });

  it('big asteroids split into two fragments', () => {
    const g = quietGame();
    rock(g, g.ship.x, 300, 3);
    const ev = run(g, 0.8, { ...IDLE, fire: true });
    expect(ev.some((e) => e.type === 'split')).toBe(true);
    // Two fragments appeared: each is either still flying or was shot down too.
    expect(ev.filter((e) => e.type === 'kill').length + g.asteroids.length).toBe(3);
  });

  it('a collision costs a life, the shield blocks it', () => {
    const g = quietGame();
    rock(g, g.ship.x, g.ship.y);
    run(g, 0.1, IDLE);
    expect(g.lives).toBe(2);

    const s = quietGame();
    rock(s, s.ship.x, s.ship.y);
    const ev = run(s, 0.1, { ...IDLE, shield: true });
    expect(s.lives).toBe(3);
    expect(ev.some((e) => e.type === 'block')).toBe(true);
  });

  it('rocket needs a full charge; three crystals charge it', () => {
    const g = quietGame();
    expect(run(g, 0.1, { ...IDLE, rocket: true }).some((e) => e.type === 'rocketDenied')).toBe(true);
    charge(g);
    expect(g.rocketCharge).toBe(1);
    rock(g, g.ship.x - 100, 200);
    rock(g, g.ship.x + 100, 250);
    const ev = run(g, 1.5, { ...IDLE, rocket: true });
    expect(ev.some((e) => e.type === 'boom')).toBe(true);
    expect(g.stats.destroyed).toBe(2);
  });

  it('a falling heart restores a life, but never above the maximum', () => {
    const g = quietGame();
    rock(g, g.ship.x, g.ship.y);
    run(g, 0.1, IDLE);
    expect(g.lives).toBe(2);
    g.hearts.push({ x: g.ship.x, y: g.ship.y, vy: 0, phase: 0 });
    const ev = run(g, 0.05, IDLE);
    expect(ev.some((e) => e.type === 'heal')).toBe(true);
    expect(g.lives).toBe(3);
    g.hearts.push({ x: g.ship.x, y: g.ship.y, vy: 0, phase: 0 });
    run(g, 0.05, IDLE);
    expect(g.lives).toBe(3);
  });

  it('hearts only fall when a life is missing', () => {
    const g = new Game(800, 800, 7);
    let seen = 0;
    for (let t = 0; t < 20; t += 1 / 60) {
      g.lives = 3; // keep health full
      g.update(1 / 60, IDLE);
      seen = Math.max(seen, g.hearts.length);
    }
    expect(seen).toBe(0);
    for (let t = 0; t < 20; t += 1 / 60) {
      g.lives = Math.max(g.lives, 1);
      if (g.lives === 3) g.lives = 2; // keep one life missing
      g.update(1 / 60, IDLE);
      seen = Math.max(seen, g.hearts.length);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('the shield drains, says so once, and stays locked until recharged', () => {
    const g = quietGame();
    const ev = run(g, 3, { ...IDLE, shield: true });
    expect(g.shieldOn).toBe(false);
    expect(ev.filter((e) => e.type === 'shieldEmpty')).toHaveLength(1);
    run(g, 0.2, IDLE);
    expect(run(g, 0.05, { ...IDLE, shield: true }).some((e) => e.type === 'shieldEmpty')).toBe(true);
  });
});

describe('lasers', () => {
  it('a narrow beam hits the ship unless it moves away', () => {
    const g = quietGame();
    g.addBeam(g.ship.x, false);
    run(g, 2, IDLE);
    expect(g.lives).toBe(2);

    const d = quietGame();
    d.addBeam(d.ship.x, false);
    run(d, 2, { ...IDLE, steer: 1 }); // dodge during the warning
    expect(d.lives).toBe(3);
  });

  it('a full-width beam can only be blocked by the shield', () => {
    const g = quietGame();
    g.addBeam(400, true);
    run(g, 2.5, { ...IDLE, steer: 1 });
    expect(g.lives).toBe(2);

    const s = quietGame();
    s.addBeam(400, true);
    const ev = run(s, 2, { ...IDLE, shield: true });
    expect(s.lives).toBe(3);
    expect(ev.some((e) => e.type === 'block')).toBe(true);
  });
});

describe('stages and boss', () => {
  it('stages advance by time and the third one brings the boss', () => {
    const g = quietGame();
    const ev = run(g, STAGES[0].duration + STAGES[1].duration + 0.1, { ...IDLE, shield: false });
    expect(ev.filter((e) => e.type === 'stage').map((e) => (e as { index: number }).index)).toEqual([1, 2]);
    expect(g.boss).not.toBeNull();
  });

  it('lasers wear the boss armor down, and it never grows back', () => {
    const g = quietGame();
    g.nextStage();
    g.nextStage();
    run(g, 2.5, IDLE); // boss arrives
    const boss = g.boss!;
    boss.attackIn = 1e9; // keep the test calm
    g.ship.x = boss.x;
    const ev = run(g, 4, { ...IDLE, fire: true });
    expect(ev.some((e) => e.type === 'armorBroken')).toBe(true);
    expect(boss.armor).toBe(0);
    expect(boss.hp).toBeLessThan(BOSS_HP); // extra shots already hit the core
    run(g, 20, IDLE);
    expect(boss.armor).toBe(0);
  });

  it('one rocket strips all the armor at once', () => {
    const g = quietGame();
    g.nextStage();
    g.nextStage();
    run(g, 2.5, IDLE);
    g.boss!.attackIn = 1e9;
    charge(g);
    const ev = run(g, 2, { ...IDLE, rocket: true });
    expect(ev.some((e) => e.type === 'armorBroken')).toBe(true);
    expect(g.boss!.armor).toBe(0);
  });

  it('defeating the boss wins the mission with a bonus', () => {
    const g = quietGame();
    g.nextStage();
    g.nextStage();
    run(g, 2.5, IDLE);
    g.boss!.attackIn = 1e9;
    g.boss!.armor = 0;
    g.boss!.hp = 3;
    g.ship.x = g.boss!.x;
    const ev = run(g, 3, { ...IDLE, fire: true });
    expect(ev.some((e) => e.type === 'bossDown')).toBe(true);
    expect(g.won).toBe(true);
    expect(ev.find((e) => e.type === 'end')).toEqual({ type: 'end', won: true, bonus: 1000 + 3 * 300 });
  });

  it('losing all lives ends the game', () => {
    const g = quietGame();
    for (let i = 0; i < 3; i++) {
      rock(g, g.ship.x, g.ship.y);
      run(g, 2, IDLE);
    }
    expect(g.over).toBe(true);
    expect(g.won).toBe(false);
  });
});
