export interface SavedRun {
  date: string;
  score: number;
  won: boolean;
  destroyed: number;
  accuracy: number;
  crystals: number;
  durationSec: number;
  /** Stage reached, 1..3 (missing in runs saved before stages existed). */
  stage?: number;
  hintsShown: number;
  hintsCorrected: number;
}

const KEY = 'hand-pilot:runs';
const TUTORIAL_KEY = 'hand-pilot:tutorial-done';
const LIMIT = 200;

function loadRuns(): SavedRun[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export const bestScore = (runs = loadRuns()) => runs.reduce((m, r) => Math.max(m, r.score), 0);

/** Saves the run; returns whether it beat the previous best and the best score so far. */
export function saveRun(run: Omit<SavedRun, 'date'>): { isRecord: boolean; best: number } {
  const runs = loadRuns();
  const previous = bestScore(runs);
  const isRecord = run.score > previous;
  runs.push({ ...run, date: new Date().toISOString() });
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-LIMIT)));
  } catch {
    /* private mode / quota — results are still shown, just not persisted */
  }
  return { isRecord, best: Math.max(previous, run.score) };
}

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
}
