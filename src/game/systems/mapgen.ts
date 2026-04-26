import { GameState, Terrain } from '../Types';
import { PRNG } from '../Random';
import { OUTSIDE_RADIUS, MAP_RADIUS } from '../Const';
import { hexToString, hexNeighbor } from '../HexMath';

export function getTerrainBaseProbabilities(t: Terrain) {
  switch (t) {
    case Terrain.Void:
      return { m: 0.00, h: 0.02, f: 0.02, p: 0.01, v: 0.95 };
    case Terrain.Forest:
      return { m: 0.05, h: 0.15, f: 0.60, p: 0.20, v: 0 };
    case Terrain.Hills:
      return { m: 0.20, h: 0.60, f: 0.05, p: 0.15, v: 0 };
    case Terrain.Mountains:
      return { m: 0.60, h: 0.20, f: 0.05, p: 0.15, v: 0 };
    case Terrain.Plains:
    default:
      return { m: 0.025, h: 0.075, f: 0.10, p: 0.80, v: 0 };
  }
}

export function getTerrainBlend(q: number, r: number, s: number, directions: any[], centerTerrain: Terrain, borderTerrain: (Terrain | null)[]) {
  if (q === 0 && r === 0 && s === 0) return new Map([[centerTerrain, 1.0]]);
  
  let bestI = 0, bestU = 0, bestV = 0;
  for (let i = 0; i < 6; i++) {
     const dA = directions[i];
     const dB = directions[(i+1)%6];
     const u = dB.q * r - dB.r * q;
     const v = dA.r * q - dA.q * r;
     if (u >= 0 && v >= 0) {
       if (u === 0 && v === 0) continue;
       bestI = i;
       bestU = u;
       bestV = v;
       break;
     }
  }
  
  const alpha = bestU / MAP_RADIUS;
  const beta = bestV / MAP_RADIUS;
  const gamma = Math.max(0, 1 - (alpha + beta)); 

  const tA = borderTerrain[bestI] ?? centerTerrain;
  const tB = borderTerrain[(bestI+1)%6] ?? centerTerrain;
  
  const weights = new Map<Terrain, number>();
  weights.set(centerTerrain, gamma);
  weights.set(tA, (weights.get(tA) || 0) + alpha);
  weights.set(tB, (weights.get(tB) || 0) + beta);
  return weights;
}

export function generateMap(
  state: GameState, 
  rng: PRNG, 
  centerTerrain: Terrain, 
  borderTerrain: (Terrain | null)[], 
  safeEdges: boolean[], 
  savedImprovements: Record<string, -1 | 0 | 1 | 2>,
  createCity: (hex: import('../HexMath').Hex) => void,
  spawnPoints: import('../HexMath').Hex[],
  safePoints: import('../HexMath').Hex[]
) {
  spawnPoints.length = 0;
  safePoints.length = 0;
  state.safePoints = [];
  state.threatPoints = [];
  const _hexDirections = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
  ];

  for (let q = -OUTSIDE_RADIUS; q <= OUTSIDE_RADIUS; q++) {
    for (let r = Math.max(-OUTSIDE_RADIUS, -q - OUTSIDE_RADIUS); r <= Math.min(OUTSIDE_RADIUS, -q + OUTSIDE_RADIUS); r++) {
      const s = -q - r;
      const hex = { q, r, s };
      const isOutside = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === OUTSIDE_RADIUS;

      if (!isOutside) continue;

      const dots = _hexDirections.map(d => d.q * q + d.r * r + d.s * s);
      const maxDot = Math.max(...dots);
      
      let isSafe = false;
      for (let i = 0; i < 6; i++) {
        if (dots[i] === maxDot) {
          if (safeEdges[i]) {
            isSafe = true;
          }
        }
      }
      
      if (isSafe) {
          state.safePoints.push(hex);
      } else {
          state.threatPoints.push(hex);
      }
    }
  }

  for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
    for (let r = Math.max(-MAP_RADIUS, -q - MAP_RADIUS); r <= Math.min(MAP_RADIUS, -q + MAP_RADIUS); r++) {
      const s = -q - r;
      const hex = { q, r, s };
      const isEdge = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === MAP_RADIUS;
      
      let terrain = Terrain.Plains;
      const weights = getTerrainBlend(q, r, s, _hexDirections, centerTerrain, borderTerrain);
      let pM = 0, pH = 0, pF = 0, pP = 0, pV = 0;
      for (const [t, w] of weights.entries()) {
         const base = getTerrainBaseProbabilities(t);
         pM += w * base.m;
         pH += w * base.h;
         pF += w * base.f;
         pP += w * base.p;
         pV += w * base.v;
      }

      const rand = rng.next();
      if (rand < pV) terrain = Terrain.Void;
      else if (rand < pV + pM) terrain = Terrain.Mountains;
      else if (rand < pV + pM + pH) terrain = Terrain.Hills;
      else if (rand < pV + pM + pH + pF) terrain = Terrain.Forest;
      else terrain = Terrain.Plains;

      const key = hexToString(hex);
      let improvementLevel: -1 | 0 | 1 | 2 = 0;
      
      if (savedImprovements && savedImprovements[key] !== undefined) {
         improvementLevel = savedImprovements[key];
      }
      state.tiles.set(key, { hex, terrain, improvementLevel });
      if (improvementLevel === 2) {
         // Re-create pre-existing city
         createCity(hex);
      }

      if (isEdge) {
        const dots = _hexDirections.map(d => d.q * q + d.r * r + d.s * s);
        const maxDot = Math.max(...dots);
        
        let isSafe = false;
        for (let i = 0; i < 6; i++) {
          if (dots[i] === maxDot) {
            if (safeEdges[i]) {
              isSafe = true;
            }
          }
        }
        
        if (isSafe) {
          safePoints.push(hex);
        } else {
          spawnPoints.push(hex);
        }
      }
    }
  }

  // Second pass: All tiles adjacent to Void are forced to Mountains
  const voidTiles: string[] = [];
  for (const [key, tile] of state.tiles.entries()) {
    if (tile.terrain === Terrain.Void && Math.max(Math.abs(tile.hex.q), Math.abs(tile.hex.r), Math.abs(tile.hex.s)) <= MAP_RADIUS) {
      voidTiles.push(key);
    }
  }
  for (const key of voidTiles) {
    const tile = state.tiles.get(key)!;
    for (let i = 0; i < 6; i++) {
      const neighborHex = hexNeighbor(tile.hex, i);
      const neighborKey = hexToString(neighborHex);
      const neighborTile = state.tiles.get(neighborKey);
      // Do not overwrite edges (MAP_RADIUS + 1) or other void tiles
      if (neighborTile && neighborTile.terrain !== Terrain.Void && Math.max(Math.abs(neighborHex.q), Math.abs(neighborHex.r), Math.abs(neighborHex.s)) <= MAP_RADIUS) {
        neighborTile.terrain = Terrain.Mountains;
      }
    }
  }
}
