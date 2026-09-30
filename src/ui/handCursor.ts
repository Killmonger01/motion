import { OneEuroFilter } from '../core/filters';
import { clamp } from '../core/geometry';
import { H } from '../core/handLandmarks';
import type { HandsFrame, Side } from '../core/types';

/**
 * Index fingertip → screen cursor. The central part of the camera frame is
 * stretched to the whole screen, so every corner is reachable without the
 * hand leaving the frame.
 */
export class HandCursor {
  private fx = new OneEuroFilter(1.0, 0.01);
  private fy = new OneEuroFilter(1.0, 0.01);
  private side: Side | null = null;

  update(frame: HandsFrame | null, screenW: number, screenH: number): { x: number; y: number } | null {
    if (!frame || (!frame.left && !frame.right)) {
      this.side = null;
      return null;
    }
    if (!this.side || !frame[this.side]) {
      this.side = frame.right ? 'right' : 'left';
      this.fx.reset();
      this.fy.reset();
    }
    const tip = frame[this.side]!.norm[H.indexTip];
    const sx = clamp((1 - tip.x - 0.12) / 0.76) * screenW;
    const sy = clamp((tip.y - 0.08) / 0.67) * screenH;
    return { x: this.fx.filter(sx, frame.t), y: this.fy.filter(sy, frame.t) };
  }
}

/**
 * "Dwell to click": holding the cursor over any [data-action] element fills it
 * up and then clicks it. The same elements also work with a mouse or touch.
 */
export class DwellController {
  private target: HTMLElement | null = null;
  private since = 0;
  private firedOn: HTMLElement | null = null;

  constructor(private cursorEl: HTMLElement, private onHover: () => void) {}

  update(point: { x: number; y: number } | null, t: number, root: HTMLElement): void {
    this.cursorEl.classList.toggle('visible', !!point);
    if (!point) return this.setTarget(null, t);
    this.cursorEl.style.transform = `translate(${point.x}px, ${point.y}px)`;

    const hit = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-action]') ?? null;
    const target = hit && root.contains(hit) && !(hit as HTMLButtonElement).disabled ? hit : null;
    if (target !== this.target) this.setTarget(target, t);
    if (!target || target === this.firedOn) {
      this.cursorEl.style.setProperty('--p', '0');
      return;
    }

    const duration = Number(target.dataset.dwell ?? 1100);
    const progress = clamp((t - this.since) / duration);
    target.style.setProperty('--dwell', String(progress));
    this.cursorEl.style.setProperty('--p', String(progress));
    if (progress >= 1) {
      this.firedOn = target;
      target.style.setProperty('--dwell', '0');
      target.classList.add('fired');
      setTimeout(() => target.classList.remove('fired'), 400);
      target.click();
    }
  }

  reset() {
    this.setTarget(null, 0);
    this.cursorEl.classList.remove('visible');
  }

  private setTarget(target: HTMLElement | null, t: number) {
    if (this.target) {
      this.target.style.setProperty('--dwell', '0');
      this.target.classList.remove('hovered');
    }
    this.target = target;
    this.since = t;
    if (target !== this.firedOn) this.firedOn = null;
    if (target) {
      target.classList.add('hovered');
      this.onHover();
    }
  }
}
