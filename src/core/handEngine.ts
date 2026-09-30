import { FilesetResolver, HandLandmarker, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from './filters';
import { H, HAND_LANDMARK_COUNT } from './handLandmarks';
import type { Hand, HandsFrame, Side } from './types';

/** How long a briefly lost hand keeps its last position. */
const HOLD_MS = 300;

type Raw = { norm: NormalizedLandmark[]; world: Landmark[]; label: string };

/** Per-side landmark smoothing, so the ship and the cursor don't jitter. */
class HandSmoother {
  private f = Array.from({ length: HAND_LANDMARK_COUNT }, () => [new OneEuroFilter(1.4, 6), new OneEuroFilter(1.4, 6)]);

  apply(points: NormalizedLandmark[], t: number) {
    return points.map((p, i) => ({ x: this.f[i][0].filter(p.x, t), y: this.f[i][1].filter(p.y, t), z: p.z }));
  }

  reset() {
    this.f.forEach(([fx, fy]) => (fx.reset(), fy.reset()));
  }
}

/** Wraps MediaPipe HandLandmarker: loading, per-frame detection, left/right assignment and smoothing. */
export class HandEngine {
  private smoothers: Record<Side, HandSmoother> = { left: new HandSmoother(), right: new HandSmoother() };
  private lastVideoTime = -1;
  private last: HandsFrame | null = null;
  private seen: Record<Side, Hand | null> = { left: null, right: null };
  private seenAt: Record<Side, number> = { left: 0, right: 0 };

  private constructor(private landmarker: HandLandmarker) {}

  static async create(): Promise<HandEngine> {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    const fileset = await FilesetResolver.forVisionTasks(new URL('mediapipe', base).href);
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('models/hand_landmarker.task', base).href, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return new HandEngine(await make('GPU'));
    } catch (err) {
      console.warn('GPU delegate unavailable, falling back to CPU', err);
      return new HandEngine(await make('CPU'));
    }
  }

  /** Detects hands on the current video frame. Returns the previous result if the frame did not change. */
  detect(video: HTMLVideoElement, t: number): HandsFrame | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null;
    if (video.currentTime === this.lastVideoTime) return this.last;
    this.lastVideoTime = video.currentTime;

    const res = this.landmarker.detectForVideo(video, t);
    const raw: Raw[] = res.landmarks.map((norm, i) => ({
      norm,
      world: res.worldLandmarks[i],
      label: res.handedness[i]?.[0]?.categoryName ?? '',
    }));

    const frame: HandsFrame = { left: null, right: null, width: video.videoWidth, height: video.videoHeight, t };
    for (const [side, r] of assignSides(raw)) {
      frame[side] = {
        side,
        norm: this.smoothers[side].apply(r.norm, t),
        world: r.world.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      } satisfies Hand;
    }
    // The model sometimes drops a hand for a few frames (fists, palms close together).
    // Keep its last position briefly so gestures and hints don't flicker.
    for (const side of ['left', 'right'] as const) {
      if (frame[side]) {
        this.seen[side] = frame[side];
        this.seenAt[side] = t;
      } else if (this.seen[side] && t - this.seenAt[side] < HOLD_MS) {
        frame[side] = this.seen[side];
      } else {
        this.seen[side] = null;
        this.smoothers[side].reset();
      }
    }
    this.last = frame;
    return frame;
  }
}

/**
 * Decides which detected hand is the user's left and which is the right.
 * With two hands, position is the most reliable cue: facing the camera, the user's
 * left hand is on the right side of the raw (un-mirrored) image.
 * With one hand we trust the model's label — it assumes a mirrored selfie image,
 * and we feed it the raw frame, so the label is swapped.
 */
export function assignSides(raw: Raw[]): [Side, Raw][] {
  if (raw.length >= 2) {
    const [a, b] = raw.slice(0, 2).sort((p, q) => q.norm[H.wrist].x - p.norm[H.wrist].x);
    return [['left', a], ['right', b]];
  }
  if (raw.length === 1) return [[raw[0].label === 'Left' ? 'right' : 'left', raw[0]]];
  return [];
}
