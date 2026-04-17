import { Hex } from './HexMath';

export enum Terrain { Plains, Hills, Forest, Mountains }

export interface Tile {
  hex: Hex;
  terrain: Terrain;
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

export interface FriendlyUnit {
  id: string;
  cityId: string;
  type: 'guard' | 'cavalry';
  x: number;
  y: number;
  targetId: string | null;
  state: 'idle' | 'engaging' | 'melee' | 'returning' | 'healing';
  angle: number;
  hp: number;
  maxHp: number;
}

export interface GameState {
  tiles: Map<string, Tile>;
  cities: City[];
  enemies: Enemy[];
  friendlyUnits: FriendlyUnit[];
  projectiles: Projectile[];
  particles: Particle[];
  techs: string[];
  fusions: string[];
  turn: number;
  time: number;
  xp: number;
  level: number;
  xpToNext: number;
  phase: 'START' | 'PLAYING' | 'LEVEL_UP' | 'GAME_OVER' | 'VICTORY';
  availableCities: number;
  pendingTechPicks: Tech[][];
  stats: {
    threatsKilled: number;
    citiesLost: number;
    cumulativeXp: number;
  };
}
