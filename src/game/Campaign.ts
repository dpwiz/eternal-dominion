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
    this.updateStatuses();
  }

  resolveRun(hex: Hex, victory: boolean) {
    if (victory) {
      const key = hexToString(hex);
      const tile = this.tiles.get(key);
      if (tile && tile.status === 'CLAIMABLE') {
        tile.status = 'CLEARED';
        this.updateStatuses();
        this.save();
      }
    }
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
    const data = Array.from(this.tiles.entries());
    localStorage.setItem('campaign_save', JSON.stringify(data));
  }

  load(): boolean {
    const saved = localStorage.getItem('campaign_save');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.tiles = new Map(data);
        return true;
      } catch (e) {
        console.error('Failed to load campaign save', e);
      }
    }
    return false;
  }
}
