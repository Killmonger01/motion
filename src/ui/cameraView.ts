import { FINGERS, HAND_BONES } from '../core/handLandmarks';
import type { HandsFrame, Side } from '../core/types';
import type { Controls, Issue } from '../gestures/controls';
import { Viewport, type Fit } from './viewport';

const SHAPE_LABEL = { fist: 'кулак', open: 'ладонь', point: 'палец', other: '…' } as const;
const COLORS = { hand: '#ffb938', joint: '#fff4e6', bad: '#ff3d6e', active: '#3ff0b4' };

/** Mirrored camera picture with hand skeletons; wrong fingers glow red. */
export class CameraView {
  readonly viewport = new Viewport();
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  draw(video: HTMLVideoElement, frame: HandsFrame | null, controls: Controls | null, t: number, opts: { dim: number; highlight: Issue['highlight']; fit: Fit }) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    const vp = this.viewport;
    vp.update(w, h, video.videoWidth, video.videoHeight, opts.fit);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#140a2e';
    ctx.fillRect(0, 0, w, h);
    if (video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, vp.ox, vp.oy, vp.vw * vp.scale, vp.vh * vp.scale);
      ctx.restore();
    }
    if (opts.dim > 0) {
      ctx.fillStyle = `rgba(20, 10, 46, ${opts.dim})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (!frame) return;

    const pulse = 0.5 + 0.5 * Math.sin(t / 110);
    for (const side of ['left', 'right'] as const) {
      const hand = frame[side];
      if (!hand) continue;
      const pts = hand.norm.map((p) => vp.toScreen(p.x, p.y));
      const size = Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y);
      const lw = Math.min(Math.max(size * 0.06, 2), 7);
      const bad = badJoints(opts.highlight, side);
      const shape = controls?.[side]?.shape;
      const active = shape === 'fist' || shape === 'point' || !!controls?.shield;

      ctx.lineCap = 'round';
      for (const [a, b] of HAND_BONES) {
        const isBad = bad.has(a) && bad.has(b);
        ctx.strokeStyle = isBad ? COLORS.bad : active ? COLORS.active : COLORS.hand;
        ctx.lineWidth = isBad ? lw * 1.6 : lw;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = isBad ? 14 + 10 * pulse : 8;
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      pts.forEach((p, i) => {
        const isBad = bad.has(i);
        if (isBad) {
          ctx.fillStyle = `rgba(255, 61, 110, ${0.25 + 0.25 * pulse})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, lw * (2.5 + pulse), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = isBad ? COLORS.bad : COLORS.joint;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lw * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      if (shape && size > 25) {
        const label = `${side === 'left' ? 'Л' : 'П'} · ${SHAPE_LABEL[shape]}`;
        ctx.font = `700 ${Math.round(Math.max(11, Math.min(16, size * 0.18)))}px Rubik, sans-serif`;
        ctx.textAlign = 'center';
        const x = pts[0].x;
        const y = pts[0].y + size * 0.55 + 14;
        const tw = ctx.measureText(label).width + 16;
        ctx.fillStyle = 'rgba(30, 14, 62, 0.8)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2, y - 15, tw, 22, 11);
        ctx.fill();
        ctx.fillStyle = bad.size ? COLORS.bad : active ? COLORS.active : COLORS.joint;
        ctx.fillText(label, x, y);
      }
    }
  }
}

/** Landmark indices to paint red for this hand: whole hand, or just the wrong fingers. */
function badJoints(highlight: Issue['highlight'], side: Side): Set<number> {
  const out = new Set<number>();
  for (const h of highlight) {
    if (h.side !== side) continue;
    if (!h.fingers) for (let i = 0; i < 21; i++) out.add(i);
    else for (const f of h.fingers) [FINGERS[f].mcp, FINGERS[f].pip, FINGERS[f].dip, FINGERS[f].tip].forEach((j) => out.add(j));
  }
  return out;
}
