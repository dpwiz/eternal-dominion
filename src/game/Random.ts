export class PRNG {
  seed: number;
  constructor(seed: number) { this.seed = seed; }
  next() {
    // Coerce to 32-bit int to prevent precision drift for long sequences
    this.seed |= 0;
    this.seed = this.seed + 0x6D2B79F5 | 0;
    let t = Math.imul(this.seed ^ this.seed >>> 15, 1 | this.seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
