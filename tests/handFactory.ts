import type { Hand, HandsFrame, Point3, Side } from '../src/core/types';
import type { FingerState } from '../src/gestures/handShape';

const add = (a: Point3, x: number, y: number, z: number): Point3 => ({ x: a.x + x, y: a.y + y, z: a.z + z });

/** Finger joints (mcp, pip, dip, tip) for a given state; the finger points "up" (−y) when extended. */
function finger(mcp: Point3, state: FingerState): Point3[] {
  if (state === 'extended') {
    const pip = add(mcp, 0, -0.04, 0);
    const dip = add(pip, 0, -0.025, 0);
    return [mcp, pip, dip, add(dip, 0, -0.02, 0)];
  }
  if (state === 'half') {
    const pip = add(mcp, 0, -0.03, -0.03);
    const dip = add(pip, 0, -0.005, -0.025);
    return [mcp, pip, dip, add(dip, 0, 0.01, -0.018)];
  }
  const pip = add(mcp, 0, 0, -0.04);
  const dip = add(pip, 0, 0.025, 0);
  return [mcp, pip, dip, add(dip, 0, 0.02, 0.01)];
}

/**
 * Synthetic hand. `fingers` = index, middle, ring, pinky.
 * `cx, cy` — wrist position in the RAW camera frame (user's left hand appears at larger x).
 */
export function makeHand(side: Side, fingers: FingerState[], cx: number, cy: number): Hand {
  const world: Point3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[1] = { x: -0.03, y: -0.02, z: 0 };
  world[2] = { x: -0.045, y: -0.035, z: 0 };
  world[3] = { x: -0.055, y: -0.05, z: 0 };
  world[4] = { x: -0.06, y: -0.06, z: 0 };
  [-0.025, -0.005, 0.015, 0.032].forEach((x, i) => {
    const pts = finger({ x, y: -0.08, z: 0 }, fingers[i]);
    pts.forEach((p, j) => (world[5 + i * 4 + j] = p));
  });
  const norm = world.map((p) => ({ x: cx + p.x * 1.2, y: cy + p.y * 1.2, z: p.z }));
  return { side, world, norm };
}

export const OPEN: FingerState[] = ['extended', 'extended', 'extended', 'extended'];
export const FIST: FingerState[] = ['curled', 'curled', 'curled', 'curled'];
export const POINT: FingerState[] = ['extended', 'curled', 'curled', 'curled'];

/** Two hands; `tilt` > 0 lowers the right hand (wheel turned clockwise). */
export function makeFrame(
  opts: { left?: FingerState[] | null; right?: FingerState[] | null; tilt?: number; gap?: number } = {},
): HandsFrame {
  const gap = opts.gap ?? 0.35;
  const tilt = opts.tilt ?? 0;
  const left = opts.left === null ? null : makeHand('left', opts.left ?? OPEN, 0.5 + gap / 2, 0.6 - tilt);
  const right = opts.right === null ? null : makeHand('right', opts.right ?? OPEN, 0.5 - gap / 2, 0.6 + tilt);
  return { left, right, width: 1280, height: 720, t: 0 };
}
