import { Hex } from './HexMath';

export enum Terrain { Plains, Hills, Forest, Mountains }

export interface Tile {
  hex: Hex;
  terrain: Terrain;
  borderType?: 'safe' | 'threat';
  improvementLevel?: number; // 0, 1, 2
}

export interface City {
  id: string;
  hex: Hex;
  hp: number;
  maxHp: number;
  archeryCooldown: number;
  mysticismCooldown: number;
  timeSinceLastDamage: number;
  size: number;
}

export interface Enemy {
  id: string;
  hex: Hex;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  type: 'Scout' | 'Warrior' | 'Brute';
  speed: number;
  damage: number;
  isConverted: boolean;
  targetId?: string;
}

export interface Tech {
  id: string;
  name: string;
  description: string;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  damage: number;
  speed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Engineer {
  id: string;
  x: number;
  y: number;
  targetHex: string | null;
  homeCityHex: Hex | null;
  state: 'MOVING_TO_WORK' | 'WORKING' | 'RETURNING';
  workTimer: number;
  offsetX: number;
  offsetY: number;
}

export interface FriendlyUnit {
  id: string;
  cityId: string;
  type: 'guard' | 'cavalry' | 'archer' | 'mystic';
  cavalryIndex?: number;
  archerIndex?: number;
  mysticIndex?: number;
  x: number;
  y: number;
  targetId: string | null;
  state: 'idle' | 'engaging' | 'melee' | 'returning' | 'healing';
  angle: number;
  hp: number;
  maxHp: number;
  cooldown?: number;
}

export interface GameState {
  tiles: Map<string, Tile>;
  cities: City[];
  enemies: Enemy[];
  friendlyUnits: FriendlyUnit[];
  projectiles: Projectile[];
  particles: Particle[];
  engineers: Engineer[];
  techs: string[];
  fusions: string[];
  turn: number;
  time: number;
  spawnRates: { scout: number, warrior: number, brute: number, reinforcement: number };
  currentSpawnRates: { scout: number, warrior: number, brute: number, reinforcement: number };
  xp: number;
  level: number;
  xpToNext: number;
  phase: 'START' | 'PLAYING' | 'LEVEL_UP' | 'GAME_OVER' | 'VICTORY';
  focusedHex: string | null;
  pendingTechPicks: Tech[][];
  stats: {
    threatsKilled: number;
    citiesLost: number;
    cumulativeXp: number;
  };
}
