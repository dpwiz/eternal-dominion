export type Hex = { q: number; r: number; s: number };

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r, s: a.s + b.s });

export const hexDistance = (a: Hex, b: Hex): number => 
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;

export const hexDirections = [
  { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
];

export const hexNeighbor = (hex: Hex, dir: number): Hex => hexAdd(hex, hexDirections[dir]);

export const hexToPixel = (hex: Hex, size: number): { x: number; y: number } => {
  const x = size * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r);
  const y = size * (3 / 2 * hex.r);
  return { x, y };
};

export const pixelToHex = (x: number, y: number, size: number): Hex => {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return hexRound({ q, r, s: -q - r });
};

export const hexRound = (hex: Hex): Hex => {
  let q = Math.round(hex.q);
  let r = Math.round(hex.r);
  let s = Math.round(hex.s);
  const qDiff = Math.abs(q - hex.q);
  const rDiff = Math.abs(r - hex.r);
  const sDiff = Math.abs(s - hex.s);
  if (qDiff > rDiff && qDiff > sDiff) q = -r - s;
  else if (rDiff > sDiff) r = -q - s;
  else s = -q - r;
  return { q, r, s };
};

export const hexToString = (hex: Hex): string => `${hex.q === -0 ? 0 : hex.q},${hex.r === -0 ? 0 : hex.r}`;

export const stringToHex = (str: string): Hex => {
  const [q, r] = str.split(',').map(Number);
  return { q, r, s: -q - r };
};
