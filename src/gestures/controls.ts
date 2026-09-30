import { clamp } from '../core/geometry';
import type { HandsFrame, Side } from '../core/types';
import { analyzeHand, distanceTo, fingerNames, type HandShape } from './handShape';

export type Action = 'steer' | 'fire' | 'shield' | 'rocket';

/** A concrete gesture mistake: what's wrong, how to fix it, and which fingers to highlight. */
export interface Issue {
  id: string;
  problem: string;
  fix: string;
  /** What the user is trying to do — used to count a hint as "corrected" once it succeeds. */
  goal: Action | 'frame';
  highlight: { side: Side; fingers?: number[] }[];
}

export interface Controls {
  left: HandShape | null;
  right: HandShape | null;
  /** -1 (hard left) … 1 (hard right). */
  steer: number;
  /** Raw wheel tilt, degrees (positive = clockwise). */
  tilt: number;
  fire: boolean;
  shield: boolean;
  rocket: boolean;
  /** Mistakes in priority order (most important first). */
  issues: Issue[];
}

const DEAD_ZONE = 6; // degrees of tilt ignored around the centre
const FULL_TILT = 35; // tilt that gives full speed
const OVER_TILT = 70;
const SHIELD_GAP = 2.1; // palm-centre distance, in palm sizes: palms side by side, thumbs touching
const SHIELD_NEAR = 3.2;

const WHO = { left: 'Левая', right: 'Правая' } as const;
const WHOM = { left: 'левую', right: 'правую' } as const;
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

const EMPTY: Omit<Controls, 'issues' | 'left' | 'right'> = { steer: 0, tilt: 0, fire: false, shield: false, rocket: false };

export function readControls(frame: HandsFrame | null): Controls {
  const aspect = frame ? frame.width / frame.height : 16 / 9;
  const left = frame?.left ? analyzeHand(frame.left, aspect) : null;
  const right = frame?.right ? analyzeHand(frame.right, aspect) : null;
  const issues: Issue[] = [];
  const hands = { left, right };

  if (!left && !right) {
    issues.push({ id: 'frame.none', problem: 'Не вижу рук', fix: 'Подними обе руки перед камерой, ладонями к экрану', goal: 'frame', highlight: [] });
    return { ...EMPTY, left, right, issues };
  }
  for (const side of ['left', 'right'] as const) {
    const h = hands[side];
    if (!h) {
      issues.push({
        id: `frame.missing.${side}`,
        problem: `Не вижу ${WHOM[side]} руку`,
        fix: 'Подними её в кадр — управлять нужно двумя руками, как штурвалом',
        goal: 'frame',
        highlight: [{ side: other(side) }],
      });
    }
  }
  if (!left || !right) return { ...EMPTY, left, right, issues };

  // ---- Steering wheel: the tilt of the line from the left palm to the right palm ----
  const dx = (right.palm.x - left.palm.x) * aspect;
  const dy = right.palm.y - left.palm.y;
  const crossed = dx < 0;
  const tilt = crossed ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  const gap = Math.hypot(dx, dy) / ((left.palmSize + right.palmSize) / 2);
  const shield = gap < SHIELD_GAP;

  let steer = 0;
  if (crossed && !shield) {
    issues.push({ id: 'steer.crossed', problem: 'Руки перекрещены', fix: 'Левая рука — слева, правая — справа, как на штурвале', goal: 'steer', highlight: [{ side: 'left' }, { side: 'right' }] });
  } else if (!shield) {
    steer = Math.sign(tilt) * clamp((Math.abs(tilt) - DEAD_ZONE) / (FULL_TILT - DEAD_ZONE));
    if (Math.abs(tilt) > OVER_TILT)
      issues.push({
        id: 'steer.over',
        problem: 'Штурвал повёрнут слишком сильно',
        fix: 'Наклоняй руки не больше чем на 45° — корабль уже летит на полной скорости',
        goal: 'steer',
        highlight: [{ side: 'left' }, { side: 'right' }],
      });
  }

  const fire = !shield && left.shape === 'fist' && right.shape === 'fist';
  const rocket = !shield && left.shape === 'point' && right.shape === 'point';

  if (!shield) {
    if (gap < SHIELD_NEAR && left.shape !== 'fist' && right.shape !== 'fist') {
      issues.push({ id: 'shield.near', problem: 'Ладони почти сомкнуты', fix: 'Сдвинь ладони вплотную — большими пальцами друг к другу', goal: 'shield', highlight: [{ side: 'left' }, { side: 'right' }] });
    }
    for (const side of ['left', 'right'] as const) issues.push(...nearMiss(side, hands[side]!));
    for (const side of ['left', 'right'] as const) {
      const me = hands[side]!;
      const them = hands[other(side)]!;
      if (me.shape === 'fist' && them.shape !== 'fist')
        issues.push({
          id: `fire.one.${other(side)}`,
          problem: `Сжата только ${WHO[side].toLowerCase()} рука`,
          fix: `Сожми в кулак и ${WHOM[other(side)]} — стрельба идёт, когда сжаты обе`,
          goal: 'fire',
          highlight: [{ side: other(side) }],
        });
      if (me.shape === 'point' && them.shape !== 'point' && them.shape !== 'fist')
        issues.push({
          id: `rocket.one.${other(side)}`,
          problem: `Указательный палец поднят только на ${side === 'left' ? 'левой' : 'правой'} руке`,
          fix: `Подними указательный и на ${side === 'left' ? 'правой' : 'левой'} — ракета запускается двумя руками`,
          goal: 'rocket',
          highlight: [{ side: other(side) }],
        });
    }
  }

  return { left, right, steer, tilt, fire, shield, rocket, issues };
}

/**
 * A hand that is *almost* a fist or *almost* a pointing hand: tell exactly which fingers are off.
 * A relaxed open hand is the neutral steering pose and never produces a hint.
 */
function nearMiss(side: Side, h: HandShape): Issue[] {
  if (h.shape !== 'other') return [];
  const fist = distanceTo(h.fingers, 'fist');
  const point = distanceTo(h.fingers, 'point');
  const open = distanceTo(h.fingers, 'open');
  const best = fist.distance <= point.distance ? { goal: 'fire' as const, ...fist } : { goal: 'rocket' as const, ...point };
  if (best.distance > 1.5 || best.distance >= open.distance) return [];

  if (best.goal === 'fire') {
    const many = best.wrong.length > 1;
    return [{
      id: `fire.fingers.${side}`,
      problem: `${WHO[side]} рука: не ${many ? 'согнуты' : 'согнут'} ${fingerNames(best.wrong)} ${many ? 'пальцы' : 'палец'}`,
      fix: 'Сожми кулак полностью — так корабль стреляет',
      goal: 'fire',
      highlight: [{ side, fingers: best.wrong }],
    }];
  }
  const indexDown = best.wrong.includes(0);
  const others = best.wrong.filter((i) => i !== 0);
  const parts = [
    indexDown ? 'не выпрямлен указательный палец' : '',
    others.length ? `не ${others.length > 1 ? 'прижаты' : 'прижат'} ${fingerNames(others)}` : '',
  ].filter(Boolean);
  return [{
    id: `rocket.fingers.${side}`,
    problem: `${WHO[side]} рука: ${parts.join(', ')}`,
    fix: 'Для ракеты подними только указательный палец, остальные прижми к ладони',
    goal: 'rocket',
    highlight: [{ side, fingers: best.wrong }],
  }];
}
