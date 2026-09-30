/** Gesture pictograms (stroke-only, inherit text color). */
export const ICONS = {
  play: `<svg viewBox="0 0 64 64"><path d="M32 6 50 50 32 42 14 50Z"/><path d="M26 50l6 10 6-10"/></svg>`,
  tutorial: `<svg viewBox="0 0 64 64"><path d="M20 58V30a4 4 0 0 1 8 0v-8a4 4 0 0 1 8 0v4a4 4 0 0 1 8 0v4a4 4 0 0 1 8 0v14c0 8-6 14-14 14h-6c-6 0-12-4-12-10"/><path d="M20 38l-6-6a4 4 0 0 0-6 6l12 14"/></svg>`,
  steer: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="6"/><path d="M8 30h18M38 30h18M32 38v18"/></svg>`,
  fire: `<svg viewBox="0 0 64 64"><rect x="14" y="22" width="36" height="28" rx="10"/><path d="M22 22v-6a4 4 0 0 1 8 0v6M30 22v-8a4 4 0 0 1 8 0v8M38 22v-6a4 4 0 0 1 8 0v8M14 32h10a4 4 0 0 1 0 8h-6"/></svg>`,
  shield: `<svg viewBox="0 0 64 64"><path d="M30 58V26M30 26v-12a4 4 0 0 0-8 0v22l-6-6a4 4 0 0 0-6 6l12 14c3 4 6 8 8 12"/><path d="M34 58V26M34 26v-12a4 4 0 0 1 8 0v22l6-6a4 4 0 0 1 6 6L42 50c-3 4-6 8-8 12"/></svg>`,
  rocket: `<svg viewBox="0 0 64 64"><path d="M28 34V10a4 4 0 0 1 8 0v24"/><path d="M36 30a4 4 0 0 1 8 0v4a4 4 0 0 1 8 0v10c0 8-6 14-14 14h-8c-6 0-12-6-14-12l-4-10a4 4 0 0 1 7-4l4 6V34"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;
