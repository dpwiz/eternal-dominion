import { Hex, hexToString, hexNeighbor, hexDistance } from './HexMath';
import { Terrain } from './Types';
import { PRNG } from './Random';

export type CampaignTileStatus = 'CLEARED' | 'CLAIMABLE' | 'SHROUDED' | 'HIDDEN';

export interface CampaignTile {
  hex: Hex;
  terrain: Terrain;
  threatLevel: number;
  status: CampaignTileStatus;
}

export class CampaignEngine {
  tiles: Map<string, CampaignTile> = new Map();
  days: number = 1;
  globalXp: number = 0;
  globalLevel: number = 1;
  proficiencies: Record<string, number> = {};

  constructor(seed: number = 42) {
    if (this.load()) {
      return;
    }

    const rng = new PRNG(seed);
    const radius = 6; // up to 6 hexes out (127 tiles)
    for (let q = -radius; q <= radius; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
        const hex = { q, r, s: -q - r };
        const dist = hexDistance({q:0, r:0, s:0}, hex);
        
        let terrain = Terrain.Plains;
        if (dist > 0) {
          const rand = rng.next();
          if (rand < 0.2) terrain = Terrain.Mountains;
          else if (rand < 0.4) terrain = Terrain.Hills;
          else if (rand < 0.6) terrain = Terrain.Forest;
        }

        const threatLevel = dist; // Simplistic threat level scaling with distance

        this.tiles.set(hexToString(hex), {
          hex,
          terrain,
          threatLevel,
          status: 'HIDDEN'
        });
      }
    }
    this.days = 1;
    this.globalXp = 0;
    this.globalLevel = 1;
    this.proficiencies = {};
    this.updateStatuses();
  }

  resolveRun(hex: Hex, victory: boolean, turnsPlayed: number, earnedXp: number, techs: string[], fusions: string[]) {
    this.days += turnsPlayed;
    this.globalXp += earnedXp;
    this.globalLevel = Math.floor(Math.sqrt(this.globalXp / 100)) + 1; // Basic global scaling

    if (victory) {
      const key = hexToString(hex);
      const tile = this.tiles.get(key);
      if (tile && tile.status === 'CLAIMABLE') {
        tile.status = 'CLEARED';
        this.updateStatuses();
      }

      for (const t of techs) {
        this.proficiencies[t] = (this.proficiencies[t] || 0) + 1;
      }
      for (const f of fusions) {
        this.proficiencies[f] = (this.proficiencies[f] || 0) + 1;
      }
    } else {
      for (const t of techs) {
        if (Math.random() < 0.5) {
          this.proficiencies[t] = (this.proficiencies[t] || 0) + 1;
        }
      }
    }
    this.save();
  }

  updateStatuses() {
    const clearedHexes: Hex[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.status === 'CLEARED') {
        clearedHexes.push(tile.hex);
      }
    }

    for (const tile of this.tiles.values()) {
      if (tile.status === 'CLEARED') continue;

      let minDist = Infinity;
      if (clearedHexes.length === 0) {
        minDist = hexDistance(tile.hex, { q: 0, r: 0, s: 0 }) + 1; // Center is 1 (CLAIMABLE)
      } else {
        for (const cleared of clearedHexes) {
          // Add terrain pathing distances instead of strict hex distances if desired later
          const dist = hexDistance(tile.hex, cleared);
          if (dist < minDist) minDist = dist;
        }
      }

      if (minDist === 1) {
        tile.status = 'CLAIMABLE';
      } else if (minDist === 2) {
        tile.status = 'SHROUDED';
      } else {
        tile.status = 'HIDDEN';
      }
    }
  }

  save() {
    const data = {
      tiles: Array.from(this.tiles.entries()),
      days: this.days,
      globalXp: this.globalXp,
      globalLevel: this.globalLevel,
      proficiencies: this.proficiencies
    };
    localStorage.setItem('campaign_save', JSON.stringify(data));
  }

  load(): boolean {
    const saved = localStorage.getItem('campaign_save');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (Array.isArray(data)) {
            // legacy save migration
            this.tiles = new Map(data);
            this.days = 1;
            this.globalXp = 0;
            this.globalLevel = 1;
            this.proficiencies = {};
        } else {
            this.tiles = new Map(data.tiles);
            this.days = data.days || 1;
            this.globalXp = data.globalXp || 0;
            this.globalLevel = data.globalLevel || 1;
            this.proficiencies = data.proficiencies || {};
        }
        return true;
      } catch (e) {
        console.error('Failed to load campaign save', e);
      }
    }
    return false;
  }
}
