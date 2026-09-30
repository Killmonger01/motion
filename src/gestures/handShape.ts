import { angleBetween3, dist3 } from '../core/geometry';
import { FINGERS, H } from '../core/handLandmarks';
import type { Hand, Point3 } from '../core/types';

export type FingerState = 'extended' | 'half' | 'curled';
export type Shape = 'fist' | 'open' | 'point' | 'other';

/** Target finger patterns (index, middle, ring, pinky). */
const PATTERNS: Record<Exclude<Shape, 'other'>, FingerState[]> = {
  fist: ['curled', 'curled', 'curled', 'curled'],
  open: ['extended', 'extended', 'extended', 'extended'],
  point: ['extended', 'curled', 'curled', 'curled'],
};

export interface HandShape {
  shape: Shape;
  fingers: FingerState[];
  /** Palm centre in mirrored screen space: x 0..1 (left→right as the user sees it), y 0..1. */
  palm: { x: number; y: number };
  /** Wrist→middle-knuckle length in frame-height units (how big the hand looks). */
  palmSize: number;
}

/**
 * Finger state from 3D world landmarks (camera-angle independent):
 * - bend: how much the finger direction turns from the first to the last phalanx;
 * - reach: how far the fingertip is from the wrist compared with the knuckle.
 */
export function fingerState(world: Point3[], f: (typeof FINGERS)[number]): FingerState {
  const bend = angleBetween3(world[f.mcp], world[f.pip], world[f.dip], world[f.tip]);
  const reach = dist3(world[H.wrist], world[f.tip]) / Math.max(dist3(world[H.wrist], world[f.mcp]), 1e-6);
  if (bend > 100 || reach < 1.15) return 'curled';
  if (bend < 55 && reach > 1.5) return 'extended';
  return 'half';
}

export function analyzeHand(hand: Hand, aspect: number): HandShape {
  const fingers = FINGERS.map((f) => fingerState(hand.world, f));
  const n = hand.norm;
  const shape = (Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]).find((s) => PATTERNS[s].every((st, i) => st === fingers[i])) ?? 'other';
  const cx = (n[H.wrist].x + n[H.indexMcp].x + n[H.pinkyMcp].x) / 3;
  const cy = (n[H.wrist].y + n[H.indexMcp].y + n[H.pinkyMcp].y) / 3;
  const palmSize = Math.hypot((n[H.wrist].x - n[H.middleMcp].x) * aspect, n[H.wrist].y - n[H.middleMcp].y);
  return { shape, fingers, palm: { x: 1 - cx, y: cy }, palmSize };
}

/**
 * How far a hand is from a target shape: 0 = exact, 1 per wrong finger, 0.5 per half-bent finger.
 * Returns the indices of fingers that need to change — this is what makes hints concrete
 * ("не согнут указательный палец") instead of "gesture not recognized".
 */
export function distanceTo(fingers: FingerState[], target: Exclude<Shape, 'other'>) {
  const wrong: number[] = [];
  let distance = 0;
  PATTERNS[target].forEach((want, i) => {
    if (fingers[i] === want) return;
    wrong.push(i);
    distance += fingers[i] === 'half' ? 0.5 : 1;
  });
  return { distance, wrong };
}

/** "указательный", "указательный и средний", "указательный, средний и мизинец". */
export function fingerNames(indices: number[]): string {
  const names = indices.map((i) => FINGERS[i].name);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}
