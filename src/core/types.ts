export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The user's own left/right hand (not the side of the image). */
export type Side = 'left' | 'right';

export interface Hand {
  side: Side;
  /** 21 landmarks, normalized 0..1 in the raw (NOT mirrored) camera frame. */
  norm: Point3[];
  /** 21 landmarks in meters, centred on the hand — used for finger shape analysis. */
  world: Point3[];
}

export interface HandsFrame {
  left: Hand | null;
  right: Hand | null;
  /** Camera frame size in pixels. */
  width: number;
  height: number;
  /** Timestamp, ms (performance.now()). */
  t: number;
}
