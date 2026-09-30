import type { Action, Controls, Issue } from '../gestures/controls';

type Kind = 'fault' | 'good' | 'info';

interface Card {
  id: string;
  kind: Kind;
  label: string;
  problem: string;
  fix: string;
  until: number;
}

interface Track {
  issue: Issue;
  since: number;
  lastSeen: number;
  /** Already counted/spoken for this appearance. */
  announced: boolean;
}

export interface HintStat {
  issue: Issue;
  count: number;
}

const MATURE_MS = 450; // an issue must persist this long — passing through half-made gestures is not a mistake
const FRAME_MATURE_MS = 1500; // hand-tracking dropouts are brief — only a real absence is worth a hint
const CORRECT_WINDOW_MS = 6000;
const GOAL_LABEL: Record<Action, string> = { fire: 'Огонь!', shield: 'Щит включён!', rocket: 'Ракета пошла!', steer: 'Штурвал ровно' };

/**
 * The "error mode": turns raw per-frame gesture issues into stable, actionable feedback —
 * a card with what's wrong and how to fix it and red fingers on the camera view —
 * and tracks whether the user managed to fix it.
 */
export class Coach {
  highlight: Issue['highlight'] = [];
  hints = new Map<string, HintStat>();
  shown = 0;
  corrected = 0;
  private tracks = new Map<string, Track>();
  private pending = new Map<string, { goal: Issue['goal']; at: number }>();
  private card: Card | null = null;
  private rendered = '';

  constructor(private el: { root: HTMLElement; kind: HTMLElement; problem: HTMLElement; fix: HTMLElement }) {}

  reset() {
    this.hints.clear();
    this.shown = this.corrected = 0;
    this.tracks.clear();
    this.pending.clear();
    this.card = null;
    this.highlight = [];
    this.render(0);
  }

  /** Hides the card but keeps the statistics (e.g. while the game is paused). */
  hide() {
    this.card = null;
    this.highlight = [];
    this.tracks.clear();
    this.render(0);
  }

  update(c: Controls, t: number) {
    const present = new Set(c.issues.map((i) => i.id));
    for (const issue of c.issues) {
      const tr = this.tracks.get(issue.id);
      if (tr) {
        tr.issue = issue;
        tr.lastSeen = t;
      } else {
        this.tracks.set(issue.id, { issue, since: t, lastSeen: t, announced: false });
      }
    }
    for (const [id, tr] of this.tracks) if (!present.has(id) && t - tr.lastSeen > 250) this.tracks.delete(id);

    const mature = c.issues.filter((i) => {
      const tr = this.tracks.get(i.id)!;
      return t - tr.since >= (i.goal === 'frame' ? FRAME_MATURE_MS : MATURE_MS);
    });
    this.highlight = mature.flatMap((i) => i.highlight);

    const top = mature[0];
    if (top) {
      const tr = this.tracks.get(top.id)!;
      this.show({ id: top.id, kind: 'fault', label: 'Исправь жест', problem: top.problem, fix: top.fix, until: t + 1200 });
      if (!tr.announced) {
        tr.announced = true;
        this.shown++;
        const stat = this.hints.get(top.id) ?? { issue: top, count: 0 };
        stat.count++;
        this.hints.set(top.id, stat);
        this.pending.set(top.id, { goal: top.goal, at: t });
      }
    }

    // A hint counts as "corrected" once the intended action succeeds (or the problem goes away).
    for (const [id, p] of this.pending) {
      if (t - p.at > CORRECT_WINDOW_MS) {
        this.pending.delete(id);
        continue;
      }
      const achieved = p.goal === 'fire' || p.goal === 'shield' || p.goal === 'rocket' ? c[p.goal] : !present.has(id);
      if (achieved && !present.has(id)) {
        this.pending.delete(id);
        this.corrected++;
        if (p.goal !== 'frame') this.show({ id: 'good', kind: 'good', label: 'Исправлено', problem: GOAL_LABEL[p.goal], fix: '', until: t + 1000 });
      }
    }
    this.render(t);
  }

  /** One-off gameplay hint (not a gesture mistake), e.g. "rocket is not charged yet". */
  info(id: string, problem: string, fix: string, t: number) {
    this.show({ id, kind: 'info', label: 'Подсказка', problem, fix, until: t + 2200 });
    this.render(t);
  }

  /** Latest message wins; an active mistake re-asserts itself on the next frame anyway. */
  private show(card: Card) {
    this.card = card;
  }

  private render(t: number) {
    const c = this.card && t < this.card.until ? this.card : null;
    const sig = c ? `${c.kind}|${c.problem}|${c.fix}` : '';
    if (sig === this.rendered) return;
    this.rendered = sig;
    this.el.root.className = `feedback ${c ? `show ${c.kind}` : ''}`;
    if (!c) return;
    this.el.kind.textContent = c.label;
    this.el.problem.textContent = c.problem;
    this.el.fix.textContent = c.fix;
  }
}
