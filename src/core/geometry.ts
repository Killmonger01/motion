import type { Point3 } from './types';

const DEG = 180 / Math.PI;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const dist3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Angle between direction a1→a2 and direction b1→b2, degrees 0..180. */
export function angleBetween3(a1: Point3, a2: Point3, b1: Point3, b2: Point3): number {
  const u = { x: a2.x - a1.x, y: a2.y - a1.y, z: a2.z - a1.z };
  const w = { x: b2.x - b1.x, y: b2.y - b1.y, z: b2.z - b1.z };
  const n = Math.hypot(u.x, u.y, u.z) * Math.hypot(w.x, w.y, w.z);
  if (n === 0) return 0;
  return Math.acos(clamp((u.x * w.x + u.y * w.y + u.z * w.z) / n, -1, 1)) * DEG;
}

export const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
