import { Hex } from './HexMath';

export enum Terrain { Plains, Hills, Forest, Mountains, Void }

export enum MobUnit { Scout, Warrior, Brute }
export enum FriendlyType { Guard, Cavalry, Archer, Mystic }
export enum FriendlyState { Idle, Engaging, Melee, Returning, Healing }
export enum EngineerState { MovingToWork, Working, Returning }

// Entities

export interface City {
  id: number;
  hex: Hex;
  maxHp: number;
  archeryCooldown: number;
  mysticismCooldown: number;
  timeSinceLastDamage: number;
  size: number;
}

export interface Enemy {
  id: number;
  hex: Hex;
  maxHp: number;
  speed: number;
  damage: number;
  isConverted: boolean;
  isVoidspawn?: boolean;
  targetId?: number;
}

export interface Engineer {
  id: number;
  targetHex: string | null;
  homeCityHex: Hex | null;
  workTimer: number;
  offsetX: number;
  offsetY: number;
}

export interface FriendlyUnit {
  id: number;
  cityId: number;
  cavalryIndex?: number;
  archerIndex?: number;
  mysticIndex?: number;
  targetId: number | null;
  angle: number;
  maxHp: number;
  cooldown?: number;
}

// Ephemera

export interface Projectile {
  id: number;
  targetId: number;
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

// Globals

export interface Tile {
  hex: Hex;
  terrain: Terrain;
  improvementLevel?: number; // 0, 1, 2
}

export interface Tech {
  id: string;
  name: string;
  description: string;
}

export interface GameState {
  tiles: Map<string, Tile>;
  safePoints: Hex[];
  threatPoints: Hex[];
  cities: City[];
  enemies: Enemy[];
  friendlyUnits: FriendlyUnit[];
  projectiles: Projectile[];
  particles: Particle[];
  engineers: Engineer[];
  techs: string[];
  fusions: string[];
  supplies: number;
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