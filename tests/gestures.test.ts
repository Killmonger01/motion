import { describe, expect, it } from 'vitest';
import { assignSides } from '../src/core/handEngine';
import { readControls } from '../src/gestures/controls';
import { analyzeHand, distanceTo, fingerNames } from '../src/gestures/handShape';
import { FIST, makeFrame, makeHand, OPEN, POINT } from './handFactory';

const ids = (c: ReturnType<typeof readControls>) => c.issues.map((i) => i.id);

describe('hand shape', () => {
  it('recognises fist, open palm and pointing finger', () => {
    expect(analyzeHand(makeHand('left', FIST, 0.6, 0.6), 16 / 9).shape).toBe('fist');
    expect(analyzeHand(makeHand('left', OPEN, 0.6, 0.6), 16 / 9).shape).toBe('open');
    expect(analyzeHand(makeHand('left', POINT, 0.6, 0.6), 16 / 9).shape).toBe('point');
  });

  it('classifies a half-bent finger', () => {
    const h = analyzeHand(makeHand('left', ['curled', 'half', 'curled', 'curled'], 0.6, 0.6), 16 / 9);
    expect(h.fingers).toEqual(['curled', 'half', 'curled', 'curled']);
    expect(h.shape).toBe('other');
  });

  it('names the fingers that are wrong', () => {
    expect(distanceTo(['extended', 'curled', 'half', 'curled'], 'fist')).toEqual({ distance: 1.5, wrong: [0, 2] });
    expect(fingerNames([0, 2])).toBe('указательный и безымянный');
    expect(fingerNames([0, 1, 3])).toBe('указательный, средний и мизинец');
  });
});

describe('controls', () => {
  it('level open hands: no steering, no issues', () => {
    const c = readControls(makeFrame());
    expect(c.steer).toBe(0);
    expect(c.issues).toEqual([]);
  });

  it('steers by tilting the hands like a wheel', () => {
    expect(readControls(makeFrame({ tilt: 0.2 })).steer).toBeGreaterThan(0.6); // right hand lower → right
    expect(readControls(makeFrame({ tilt: -0.2 })).steer).toBeLessThan(-0.6);
  });

  it('fires only with both fists', () => {
    expect(readControls(makeFrame({ left: FIST, right: FIST })).fire).toBe(true);
    const one = readControls(makeFrame({ left: FIST, right: OPEN }));
    expect(one.fire).toBe(false);
    expect(ids(one)).toContain('fire.one.right');
    expect(one.issues.find((i) => i.id === 'fire.one.right')!.problem).toBe('Сжата только левая рука');
  });

  it('tells which finger keeps a fist from closing', () => {
    const c = readControls(makeFrame({ left: FIST, right: ['curled', 'half', 'curled', 'curled'] }));
    const issue = c.issues.find((i) => i.id === 'fire.fingers.right')!;
    expect(issue.problem).toBe('Правая рука: не согнут средний палец');
    expect(issue.highlight).toEqual([{ side: 'right', fingers: [1] }]);
  });

  it('launches a rocket with both index fingers, hints when other fingers stick out', () => {
    expect(readControls(makeFrame({ left: POINT, right: POINT })).rocket).toBe(true);
    const c = readControls(makeFrame({ left: POINT, right: ['extended', 'extended', 'curled', 'curled'] }));
    expect(c.rocket).toBe(false);
    expect(c.issues.find((i) => i.id === 'rocket.fingers.right')!.problem).toBe('Правая рука: не прижат средний');
  });

  it('turns on the shield when palms come together, hints when almost', () => {
    const on = readControls(makeFrame({ gap: 0.08 }));
    expect(on.shield).toBe(true);
    expect(on.steer).toBe(0);
    expect(ids(readControls(makeFrame({ gap: 0.12 })))).toContain('shield.near');
  });

  it('asks for the missing hand', () => {
    const c = readControls(makeFrame({ left: null }));
    expect(c.issues[0].problem).toBe('Не вижу левую руку');
    expect(readControls(null).issues[0].id).toBe('frame.none');
  });

  it('notices crossed hands', () => {
    expect(ids(readControls(makeFrame({ gap: -0.3 })))).toContain('steer.crossed');
  });
});

describe('left/right assignment', () => {
  const raw = (x: number, label: string) => ({ norm: Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0, visibility: 1 })), world: [], label });
  it('uses position when two hands are visible', () => {
    const sides = assignSides([raw(0.3, 'Left'), raw(0.7, 'Left')]);
    expect(sides.map(([s, r]) => [s, r.norm[0].x])).toEqual([['left', 0.7], ['right', 0.3]]);
  });
  it('swaps the model label for a single hand (model assumes a mirrored image)', () => {
    expect(assignSides([raw(0.5, 'Left')])[0][0]).toBe('right');
  });
});
