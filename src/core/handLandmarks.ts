/** MediaPipe hand landmark indices. */
export const H = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  middleTip: 12,
  ringMcp: 13,
  pinkyMcp: 17,
  pinkyTip: 20,
} as const;

export const HAND_LANDMARK_COUNT = 21;

/** The four long fingers (thumb is ignored by the gesture rules — its position varies too much). */
export const FINGERS = [
  { name: 'указательный', mcp: 5, pip: 6, dip: 7, tip: 8 },
  { name: 'средний', mcp: 9, pip: 10, dip: 11, tip: 12 },
  { name: 'безымянный', mcp: 13, pip: 14, dip: 15, tip: 16 },
  { name: 'мизинец', mcp: 17, pip: 18, dip: 19, tip: 20 },
] as const;

export const HAND_BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
