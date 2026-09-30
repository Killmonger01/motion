export type Fit = 'cover' | 'contain';

/**
 * Maps camera-frame coordinates onto the full-screen canvas.
 * The video is mirrored (feels like a mirror) and scaled to cover the screen,
 * unless covering would crop too much of the frame (or `contain` is requested) —
 * then it is letterboxed, so nothing the model sees is hidden from the user.
 */
export class Viewport {
  width = 0;
  height = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  vw = 1;
  vh = 1;

  update(width: number, height: number, vw: number, vh: number, fit: Fit = 'cover') {
    this.width = width;
    this.height = height;
    this.vw = vw || 1;
    this.vh = vh || 1;
    const cover = Math.max(width / this.vw, height / this.vh);
    const contain = Math.min(width / this.vw, height / this.vh);
    this.scale = fit === 'contain' || cover / contain > 1.35 ? contain : cover;
    this.ox = (width - this.vw * this.scale) / 2;
    this.oy = (height - this.vh * this.scale) / 2;
  }

  /** Normalized (0..1, un-mirrored) camera point → screen CSS pixels. */
  toScreen(nx: number, ny: number): { x: number; y: number } {
    return {
      x: this.width - (this.ox + nx * this.vw * this.scale),
      y: this.oy + ny * this.vh * this.scale,
    };
  }
}
