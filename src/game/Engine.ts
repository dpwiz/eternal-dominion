import { Hex, hexDistance, hexNeighbor, hexToString, hexToPixel, pixelToHex, stringToHex } from './HexMath';
import { GameState, Terrain, MobUnit, FriendlyType, FriendlyState, EngineerState } from './Types';
import { ALL_TECHS, FUSIONS } from './Content';
import { World, Component } from './World';
import { PRNG } from './Random';

export const HEX_SIZE = 26;
export const MAP_RADIUS = 10;
export const OUTSIDE_RADIUS = MAP_RADIUS + 1;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function getWaveComposition(turn: number, threatLevel: number) {
  let text = 'Scouts';
  let scout = 0;
  let warrior = 0;
  let brute = 0;

  let region = '';
  let t = 0;
  if (turn === 1) { region = 'start'; t = 0; }
  else if (turn <= 12) { region = 'early'; t = (turn - 2) / 10; }
  else if (turn <= 28) { region = 'mid'; t = (turn - 13) / 15; }
  else if (turn <= 39) { region = 'end'; t = (turn - 29) / 10; }
  else { region = 'final'; t = 1; }

  // Clamp threatLevel for the generic patterns
  const tl = Math.min(threatLevel, 3);
  
  if (tl === 0) {
    if (region === 'start') { scout = 0.5; }
    else if (region === 'early') { scout = lerp(0.5, 1.0, t); }
    else if (region === 'mid') { scout = lerp(1.0, 1.5, t); }
    else if (region === 'end') { scout = lerp(1.5, 0.0, t); warrior = lerp(0.0, 1.5, t); }
    else { warrior = 3.0; }
  } else if (tl === 1) {
    if (region === 'start') { scout = 0.8; }
    else if (region === 'early') { scout = lerp(0.8, 1.2, t); warrior = lerp(0.0, 0.5, t); }
    else if (region === 'mid') { scout = lerp(1.2, 1.5, t); warrior = lerp(0.5, 1.0, t); }
    else if (region === 'end') { scout = lerp(1.5, 0.0, t); warrior = lerp(1.0, 2.0, t); }
    else { warrior = 3.0; brute = 1.0; }
  } else if (tl === 2) {
    if (region === 'start') { scout = 1.0; warrior = 0.5; }
    else if (region === 'early') { scout = lerp(1.0, 1.5, t); warrior = lerp(0.5, 1.5, t); }
    else if (region === 'mid') { scout = lerp(1.5, 2.0, t); warrior = lerp(1.5, 2.0, t); }
    else if (region === 'end') { scout = lerp(2.0, 0.0, t); warrior = 2.0; brute = lerp(0.0, 0.5, t); }
    else { warrior = 3.0; brute = 1.5; }
  } else {
    if (region === 'start') { scout = 1.5; warrior = 1.0; brute = 0.2; }
    else if (region === 'early') { scout = lerp(1.5, 2.0, t); warrior = lerp(1.0, 1.5, t); brute = lerp(0.2, 0.5, t); }
    else if (region === 'mid') { scout = lerp(2.0, 0.0, t); warrior = lerp(1.5, 2.0, t); brute = lerp(0.5, 1.0, t); }
    else if (region === 'end') { warrior = lerp(2.0, 0.0, t); brute = lerp(1.0, 2.0, t); }
    else { brute = 3.0; }
  }

  if (brute > 0 && warrior > 0 && scout > 0) text = 'Scouts, Warriors, Brutes';
  else if (brute > 0 && warrior > 0) text = 'Warriors, Brutes';
  else if (brute > 0) text = 'Massive Brute Swarm';
  else if (warrior > 0 && scout > 0) text = 'Scouts, Warriors';
  else if (warrior > 0) text = 'Warriors';
  else text = 'Scouts';

  scout *= 2;

  return { scout, warrior, brute, text };
}


export function getHex(store: any, id: number): import('./HexMath').Hex | null {
  if (!store.has(id)) return null;
  const q = store.get(id, 0);
  const r = store.get(id, 1);
  if (q === 32767 && r === 32767) return null;
  return { q, r, s: -q-r };
}
export function setHex(store: any, id: number, hex: import('./HexMath').Hex | null) {
  if (!hex) {
    store.set(id, 32767, 0);
    store.set(id, 32767, 1);
  } else {
    store.set(id, hex.q || 0, 0);
    store.set(id, hex.r || 0, 1);
  }
}

export class GameEngine {
  state: GameState;
  world: World;
  costs: Map<string, number> = new Map();
  voidCosts: Map<string, number> = new Map();
  spawnPoints: Hex[] = [];
  safePoints: Hex[] = [];
  onStateChange?: (state: GameState) => void;
  scoutSpawnTimer = 0;
  warriorSpawnTimer = 0;
  bruteSpawnTimer = 0;
  reinforcementTimer = 0;
  threatLevel: number;
  safeEdges: boolean[];
  seed: number;
  rng: PRNG;
  centerTerrain: Terrain;
  borderTerrain: (Terrain | null)[];

  savedImprovements: Record<string, -1 | 0 | 1 | 2>;

  constructor(
    threatLevel: number = 0, 
    safeEdges: boolean[] = [false, false, false, false, false, false], 
    seed: number = 12345,
    centerTerrain: Terrain = Terrain.Plains,
    borderTerrain: (Terrain | null)[] = [null, null, null, null, null, null],
    savedImprovements: Record<string, -1 | 0 | 1 | 2> = {}
  ) {
    this.threatLevel = threatLevel;
    this.safeEdges = safeEdges;
    this.seed = seed;
    this.rng = new PRNG(seed);
    this.centerTerrain = centerTerrain;
    this.borderTerrain = borderTerrain;
    this.savedImprovements = savedImprovements;
    this.world = new World(10000);
    this.state = this.getInitialState();
    this.generateMap();
  }

  getInitialState(): GameState {
    return {
      tiles: new Map(),
      safePoints: [],
      threatPoints: [],
      cities: [],
      enemies: [],
      friendlyUnits: [],
      projectiles: [],
      particles: [],
      engineers: [],
      techs: [],
      fusions: [],
      supplies: 20,
      turn: 1,
      time: 0,
      spawnRates: { scout: 0, warrior: 0, brute: 0, reinforcement: 0 },
      currentSpawnRates: { scout: 0, warrior: 0, brute: 0, reinforcement: 0 },
      xp: 0,
      level: 1,
      xpToNext: 100,
      phase: 'START',
      focusedHex: null,
      pendingTechPicks: [],
      stats: { threatsKilled: 0, citiesLost: 0, cumulativeXp: 0 }
    };
  }

  getTerrainBaseProbabilities(t: Terrain) {
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

  getTerrainBlend(q: number, r: number, s: number, directions: any[]) {
    if (q === 0 && r === 0 && s === 0) return new Map([[this.centerTerrain, 1.0]]);
    
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

    const tA = this.borderTerrain[bestI] ?? this.centerTerrain;
    const tB = this.borderTerrain[(bestI+1)%6] ?? this.centerTerrain;
    
    const weights = new Map<Terrain, number>();
    weights.set(this.centerTerrain, gamma);
    weights.set(tA, (weights.get(tA) || 0) + alpha);
    weights.set(tB, (weights.get(tB) || 0) + beta);
    return weights;
  }

  generateMap() {
    this.spawnPoints = [];
    this.safePoints = [];
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
            if (this.safeEdges[i]) {
              isSafe = true;
            }
          }
        }
        
        if (isSafe) {
            this.state.safePoints.push(hex);
        } else {
            this.state.threatPoints.push(hex);
        }
      }
    }

    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      for (let r = Math.max(-MAP_RADIUS, -q - MAP_RADIUS); r <= Math.min(MAP_RADIUS, -q + MAP_RADIUS); r++) {
        const s = -q - r;
        const hex = { q, r, s };
        const isEdge = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === MAP_RADIUS;
        
        let terrain = Terrain.Plains;
        const weights = this.getTerrainBlend(q, r, s, _hexDirections);
        let pM = 0, pH = 0, pF = 0, pP = 0, pV = 0;
        for (const [t, w] of weights.entries()) {
           const base = this.getTerrainBaseProbabilities(t);
           pM += w * base.m;
           pH += w * base.h;
           pF += w * base.f;
           pP += w * base.p;
           pV += w * base.v;
        }

        const rand = this.rng.next();
        if (rand < pV) terrain = Terrain.Void;
        else if (rand < pV + pM) terrain = Terrain.Mountains;
        else if (rand < pV + pM + pH) terrain = Terrain.Hills;
        else if (rand < pV + pM + pH + pF) terrain = Terrain.Forest;
        else terrain = Terrain.Plains;

        const key = hexToString(hex);
        let improvementLevel: -1 | 0 | 1 | 2 = 0;
        
        if (this.savedImprovements && this.savedImprovements[key] !== undefined) {
           improvementLevel = this.savedImprovements[key];
        }
        this.state.tiles.set(key, { hex, terrain, improvementLevel });
        if (improvementLevel === 2) {
           // Re-create pre-existing city
           this.createCity(hex);
        }

        if (isEdge) {
          const dots = _hexDirections.map(d => d.q * q + d.r * r + d.s * s);
          const maxDot = Math.max(...dots);
          
          let isSafe = false;
          for (let i = 0; i < 6; i++) {
            if (dots[i] === maxDot) {
              if (this.safeEdges[i]) {
                isSafe = true;
              }
            }
          }
          
          if (isSafe) {
            this.safePoints.push(hex);
          } else {
            this.spawnPoints.push(hex);
          }
        }
      }
    }

    // Second pass: All tiles adjacent to Void are forced to Mountains
    const voidTiles: string[] = [];
    for (const [key, tile] of this.state.tiles.entries()) {
      if (tile.terrain === Terrain.Void && Math.max(Math.abs(tile.hex.q), Math.abs(tile.hex.r), Math.abs(tile.hex.s)) <= MAP_RADIUS) {
        voidTiles.push(key);
      }
    }
    for (const key of voidTiles) {
      const tile = this.state.tiles.get(key)!;
      for (let i = 0; i < 6; i++) {
        const neighborHex = hexNeighbor(tile.hex, i);
        const neighborKey = hexToString(neighborHex);
        const neighborTile = this.state.tiles.get(neighborKey);
        // Do not overwrite edges (MAP_RADIUS + 1) or other void tiles
        if (neighborTile && neighborTile.terrain !== Terrain.Void && Math.max(Math.abs(neighborHex.q), Math.abs(neighborHex.r), Math.abs(neighborHex.s)) <= MAP_RADIUS) {
          neighborTile.terrain = Terrain.Mountains;
        }
      }
    }
  }

  handleHexClick(hex: Hex) {
    const key = hexToString(hex);
    const tile = this.state.tiles.get(key);
    if (!tile || tile.terrain === Terrain.Mountains || tile.terrain === Terrain.Void) return false;

    if (this.state.phase === 'START') {
      if (tile.improvementLevel === 2) return false;
      this.state.supplies -= 1;
      this.createCity(hex);
      this.state.phase = 'PLAYING';
      this.updateFlowField();
      this.notify(true);
      return true;
    } else if (this.state.phase === 'PLAYING') {
      if (this.state.supplies <= 0) return false;
      if (tile.improvementLevel === 2) return false;
      
      let hasAdj = false;
      for (let i = 0; i < 6; i++) {
        const nHex = hexNeighbor(hex, i);
        const nTile = this.state.tiles.get(hexToString(nHex));
        if (nTile && (nTile.improvementLevel || 0) >= 1) {
          hasAdj = true;
          break;
        }
      }
      
      if (!hasAdj) return false;
      this.state.focusedHex = hex;
      this.notify(true);
      return true;
    }
    return false;
  }

  createCity(hex: Hex) {
    const key = hexToString(hex);
    const tile = this.state.tiles.get(key);
    if (tile) tile.improvementLevel = 2;

    let maxHp = 100;
    if (this.hasTech('Pottery')) maxHp += 50;
    if (this.hasTech('Masonry')) maxHp += 50;

    const cityId = this.world.createEntity();
    this.state.cities.push({
      id: cityId,
      timeSinceLastDamage: 0,
      size: 1
    });
    this.world.setComponent(cityId, Component.HexPosition, [hex.q, hex.r]);
    this.world.setComponent(cityId, Component.Health, maxHp);
    this.world.setComponent(cityId, Component.MaxHealth, maxHp);
    const cityPos = hexToPixel(hex, HEX_SIZE);
    this.world.setComponent(cityId, Component.Position, [cityPos.x, cityPos.y]);
  }

  hasTech(id: string) { return this.state.techs.includes(id); }
  hasFusion(id: string) { return this.state.fusions.includes(id); }

  getEnemySize(type: MobUnit): number {
    return type === MobUnit.Scout ? 1 : (type === MobUnit.Warrior ? 2 : 4);
  }

  getFriendlySize(unit: import('./Types').FriendlyUnit): number {
    const sFriendlyType = this.world.getStore(Component.FriendlyType);

    if (sFriendlyType.get(unit.id, 0) === FriendlyType.Guard) return 2;
    if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) {
      const idx = unit.cavalryIndex ?? 0;
      if (idx === 0) return 1;
      if (idx === 1) return 2;
      return 4;
    }
    if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) {
      let size = 1;
      if (this.hasTech('Animism')) size += 1;
      if (this.hasFusion('Theology')) size += 1;
      return size;
    }
    if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) return 1;
    return 1;
  }

  assignTargets() {
    const sHexPosition = this.world.getStore(Component.HexPosition);
    const sMobType = this.world.getStore(Component.MobType);
    const sFriendlyType = this.world.getStore(Component.FriendlyType);

    const sPosition = this.world.getStore(Component.Position);
    const hostiles = this.state.enemies.filter(e => !e.isConverted);
    const hostileSlots = new Map<number, number>();
    const onOutpost = new Map<number, boolean>();

    for (const e of hostiles) {
        hostileSlots.set(e.id, 0);
        onOutpost.set(e.id, this.costs.get(hexToString(getHex(sHexPosition, e.id)!)) === 0);
    }

    interface Attacker {
        id: number; type: 'friendly'|'converted'; size: number;
        x: number; y: number; cityId?: number; entity: any;
    }
    const attackers: Attacker[] = [];
    for (const e of this.state.enemies) if (e.isConverted) attackers.push({ id: e.id, type: 'converted', size: this.getEnemySize(sMobType.get(e.id, 0)), x: sPosition.get(e.id, 0), y: sPosition.get(e.id, 1), entity: e });
    for (const u of this.state.friendlyUnits) {
       if (sFriendlyType.get(u.id, 0) === FriendlyType.Archer || sFriendlyType.get(u.id, 0) === FriendlyType.Mystic) continue;
       attackers.push({ id: u.id, type: 'friendly', size: this.getFriendlySize(u), x: sPosition.get(u.id, 0), y: sPosition.get(u.id, 1), cityId: u.cityId, entity: u });
    }

    attackers.sort((a,b) => b.size - a.size);

    const baseRadius = 1;

    for (const att of attackers) {
        let bestTarget: import('./Types').Enemy | null = null;
        let bestDist = Infinity;
        
        const attIsVoidspawn = att.type === 'converted' && att.entity.isVoidspawn;

        // 1. Same size (duel)
        for (const h of hostiles) {
            const hTile = this.state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
            const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
            if (isTargetInaccessible) continue;

            const hSize = this.getEnemySize(sMobType.get(h.id, 0));
            const filled = hostileSlots.get(h.id)!;
            if (hSize === att.size && hSize - filled >= att.size) {
                if (att.type === 'friendly') {
                    const city = this.state.cities.find(c => c.id === att.cityId);
                    let range = baseRadius;
                    if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                       if (this.hasTech('HorsebackRiding')) range += 2;
                       if (this.hasTech('AnimalHusbandry')) range += 1;
                       if (this.hasFusion('WarChariots')) range += 1;
                    }
                    if (city && hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, h.id)!) > range) continue;
                }
                const dist = Math.hypot(sPosition.get(h.id, 0) - att.x, sPosition.get(h.id, 1) - att.y);
                if (dist < bestDist) { bestDist = dist; bestTarget = h; }
            }
        }

        // 2. Larger size (harass)
        if (!bestTarget) {
            bestDist = Infinity;
            for (const h of hostiles) {
                const hTile = this.state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
                const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
                if (isTargetInaccessible) continue;

                const hSize = this.getEnemySize(sMobType.get(h.id, 0));
                const filled = hostileSlots.get(h.id)!;
                if (hSize > att.size && hSize - filled >= att.size) {
                    if (att.type === 'friendly') {
                        const city = this.state.cities.find(c => c.id === att.cityId);
                        let range = baseRadius;
                        if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                           if (this.hasTech('HorsebackRiding')) range += 2;
                           if (this.hasTech('AnimalHusbandry')) range += 1;
                           if (this.hasFusion('WarChariots')) range += 1;
                        }
                        if (city && hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, h.id)!) > range) continue;
                    }
                    const dist = Math.hypot(sPosition.get(h.id, 0) - att.x, sPosition.get(h.id, 1) - att.y);
                    if (dist < bestDist) { bestDist = dist; bestTarget = h; }
                }
            }
        }

        // 3. Smaller size (crush / overkill)
        if (!bestTarget) {
            bestDist = Infinity;
            for (const h of hostiles) {
                const hTile = this.state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
                const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
                if (isTargetInaccessible) continue;

                const hSize = this.getEnemySize(sMobType.get(h.id, 0));
                const filled = hostileSlots.get(h.id)!;
                // If it has NO attackers right now, we can overkill it. 
                // Or if we just don't care because everyone else is busy!
                if (hSize < att.size && filled === 0) {
                    if (att.type === 'friendly') {
                        const city = this.state.cities.find(c => c.id === att.cityId);
                        let range = baseRadius;
                        if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                           if (this.hasTech('HorsebackRiding')) range += 2;
                           if (this.hasTech('AnimalHusbandry')) range += 1;
                           if (this.hasFusion('WarChariots')) range += 1;
                        }
                        if (city && hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, h.id)!) > range) continue;
                    }
                    const dist = Math.hypot(sPosition.get(h.id, 0) - att.x, sPosition.get(h.id, 1) - att.y);
                    if (dist < bestDist) { bestDist = dist; bestTarget = h; }
                }
            }
        }

        if (bestTarget) {
            att.entity.targetId = bestTarget.id;
            hostileSlots.set(bestTarget.id, hostileSlots.get(bestTarget.id)! + att.size);
        } else {
            att.entity.targetId = null;
        }
    }
  }

  update(dt: number) {
    // Note: VICTORY/GAME_OVER completely halts ticking via this gate. Do not bypass for game state.
    if (this.state.phase !== 'PLAYING') return;

    this.assignTargets();

    this.state.time += dt;
    const currentTurn = Math.floor(this.state.time / 10) + 1;

    if (currentTurn > this.state.turn) {
      this.state.turn = currentTurn;
      this.onTurnChange(currentTurn);
    }

    const hostileEnemies = this.state.enemies.filter(e => !e.isConverted).length;
    if (this.state.time >= 400 && hostileEnemies === 0) {
      this.state.phase = 'VICTORY';
      this.notify(true);
      return;
    }

    if (this.state.time < 400) {
      const turn = this.state.turn;
      const wavePhase = this.state.time % 10;
      
      const comp = getWaveComposition(turn, this.threatLevel);

      const baseInterval = Math.max(0.2, 1.5 - (turn * 0.02) - (this.threatLevel * 0.15));
      const baseRate = 1 / baseInterval;
      
      const rateMultiplier = 7.5 * Math.pow(wavePhase, 1.5) * Math.exp(-wavePhase);
      const modulatedRate = baseRate * rateMultiplier;

      this.state.spawnRates = {
        scout: comp.scout * baseRate,
        warrior: comp.warrior * baseRate,
        brute: comp.brute * baseRate,
        reinforcement: 1 * baseRate // Reinforcements spawn at constant rate relative, modulated
      };

      this.state.currentSpawnRates = {
        scout: comp.scout * modulatedRate,
        warrior: comp.warrior * modulatedRate,
        brute: comp.brute * modulatedRate,
        reinforcement: modulatedRate
      };

      if (this.state.currentSpawnRates.scout > 0) {
        this.scoutSpawnTimer -= this.state.currentSpawnRates.scout * dt;
        while (this.scoutSpawnTimer <= 0) {
          this.scoutSpawnTimer += 1.0;
          this.spawnEnemy(MobUnit.Scout);
        }
      } else {
        this.scoutSpawnTimer = 1.0;
      }

      if (this.state.currentSpawnRates.warrior > 0) {
        this.warriorSpawnTimer -= this.state.currentSpawnRates.warrior * dt;
        while (this.warriorSpawnTimer <= 0) {
          this.warriorSpawnTimer += 1.0;
          this.spawnEnemy(MobUnit.Warrior);
        }
      } else {
        this.warriorSpawnTimer = 1.0;
      }

      if (this.state.currentSpawnRates.brute > 0) {
        this.bruteSpawnTimer -= this.state.currentSpawnRates.brute * dt;
        while (this.bruteSpawnTimer <= 0) {
          this.bruteSpawnTimer += 1.0;
          this.spawnEnemy(MobUnit.Brute);
        }
      } else {
        this.bruteSpawnTimer = 1.0;
      }

      if (this.state.currentSpawnRates.reinforcement > 0) {
        this.reinforcementTimer -= this.state.currentSpawnRates.reinforcement * dt;
        while (this.reinforcementTimer <= 0) {
          this.reinforcementTimer += 1.0;
          this.spawnReinforcements();
        }
      } else {
        this.reinforcementTimer = 1.0;
      }
    }
    this.updateEnemies(dt);
    this.updateEngineer(dt);
    this.updateCombat(dt);
    this.updateParticles(dt);
    this.checkLevelUp();

    this.notify(this.state.phase !== 'PLAYING');
  }

  updateEngineer(dt: number) {
    const sHexPosition = this.world.getStore(Component.HexPosition);
    const sTargetHex = this.world.getStore(Component.TargetHex);
    const sEngineerState = this.world.getStore(Component.EngineerState);

    const sPosition = this.world.getStore(Component.Position);

    if (this.state.focusedHex && this.state.phase === 'PLAYING') {
      const targetHex = this.state.focusedHex;
      
      const adjCandidates: import('./HexMath').Hex[] = [];
      for (let i = 0; i < 6; i++) {
        const nHex = hexNeighbor(targetHex, i);
        const nTile = this.state.tiles.get(hexToString(nHex));
        if (nTile && (nTile.improvementLevel || 0) >= 2) {
          adjCandidates.push(nHex);
        }
      }

      if (adjCandidates.length === 0) {
        let minDist = Infinity;
        let closestCity: import('./Types').City | null = null;
        for (const city of this.state.cities) {
          const dist = hexDistance(getHex(sHexPosition, city.id)!, targetHex);
          if (dist < minDist) {
            minDist = dist;
            closestCity = city;
          }
        }
        if (closestCity) {
          adjCandidates.push(getHex(sHexPosition, closestCity.id)!);
        }
      }

      while (this.state.engineers.length < 4 && adjCandidates.length > 0) {
        // Pick a random adjacent candidate to spawn from
        const candHex = adjCandidates[Math.floor(Math.random() * adjCandidates.length)];
        const pos = hexToPixel(candHex, HEX_SIZE);
        const engId = this.world.createEntity();
        this.state.engineers.push({
          id: engId,
          workTimer: Math.random(), // Stagger work timers
          offsetX: 0,
          offsetY: 0
        });
        this.world.setComponent(engId, Component.Position, [pos.x, pos.y]);
        this.world.setComponent(engId, Component.EngineerState, EngineerState.MovingToWork);
        this.world.setComponent(engId, Component.TargetHex, [this.state.focusedHex.q, this.state.focusedHex.r]);
        this.world.setComponent(engId, Component.HomeHex, [candHex.q, candHex.r]);
        this.world.setComponent(engId, Component.HexPosition, [candHex.q, candHex.r]);
      }
      
      for (const eng of this.state.engineers) {
         const currentTarget = getHex(sTargetHex, eng.id);
         if (!currentTarget || hexToString(currentTarget) !== hexToString(this.state.focusedHex)) {
           if (this.state.focusedHex) {
               this.world.setComponent(eng.id, Component.TargetHex, [this.state.focusedHex.q, this.state.focusedHex.r]);
           }
           sEngineerState.set(eng.id, EngineerState.MovingToWork, 0);
         }
      }
    } else {
      for (const eng of this.state.engineers) {
        if (sEngineerState.get(eng.id, 0) !== EngineerState.Returning) {
          sEngineerState.set(eng.id, EngineerState.Returning, 0);
        }
      }
    }

    const speed = 40;
    this.state.engineers = this.state.engineers.filter(eng => {
      const currentTarget = getHex(sTargetHex, eng.id);
      
      if (sEngineerState.get(eng.id, 0) === EngineerState.MovingToWork && currentTarget) {
        const targetPos = hexToPixel(currentTarget, HEX_SIZE);
        const dx = targetPos.x - sPosition.get(eng.id, 0);
        const dy = targetPos.y - sPosition.get(eng.id, 1);
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          sPosition.set(eng.id, sPosition.get(eng.id, 0) + ((dx / dist) * speed * dt), 0);
          sPosition.set(eng.id, sPosition.get(eng.id, 1) + ((dy / dist) * speed * dt), 1);
        } else {
          sEngineerState.set(eng.id, EngineerState.Working, 0);
          eng.offsetX = (Math.random() - 0.5) * HEX_SIZE;
          eng.offsetY = (Math.random() - 0.5) * HEX_SIZE;
        }
      } else if (sEngineerState.get(eng.id, 0) === EngineerState.Working && currentTarget) {
        const basePos = hexToPixel(currentTarget, HEX_SIZE);
        const targetX = basePos.x + eng.offsetX;
        const targetY = basePos.y + eng.offsetY;
        
        const dx = targetX - sPosition.get(eng.id, 0);
        const dy = targetY - sPosition.get(eng.id, 1);
        const dist = Math.hypot(dx, dy);
        
        if (dist > 1) {
           sPosition.set(eng.id, sPosition.get(eng.id, 0) + ((dx / dist) * Math.min(dist, speed * dt)), 0);
           sPosition.set(eng.id, sPosition.get(eng.id, 1) + ((dy / dist) * Math.min(dist, speed * dt)), 1);
        }
        
        eng.workTimer += dt;
        if (eng.workTimer >= 1.0) {
           eng.workTimer -= 1.0;
           eng.offsetX = (Math.random() - 0.5) * HEX_SIZE * 0.8;
           eng.offsetY = (Math.random() - 0.5) * HEX_SIZE * 0.8;
           const xpMult = this.hasTech('Writing') ? 1.25 : 1.0;
           const xpGain = 1 * xpMult;
           this.state.xp += xpGain;
           this.state.stats.cumulativeXp += xpGain;
           this.spawnSparks(sPosition.get(eng.id, 0), sPosition.get(eng.id, 1), '#aaaaaa', 2);
        }
      } else if (sEngineerState.get(eng.id, 0) === EngineerState.Returning) {
        let closestPos: { x: number, y: number } | null = null;
        let minDist = Infinity;
        
        if (currentTarget) {
          const tHex = currentTarget;
          for (let i = 0; i < 6; i++) {
            const nHex = hexNeighbor(tHex, i);
            const nTile = this.state.tiles.get(hexToString(nHex));
            if (nTile && (nTile.improvementLevel || 0) >= 2) {
              const pos = hexToPixel(nHex, HEX_SIZE);
              const dist = Math.hypot(pos.x - sPosition.get(eng.id, 0), pos.y - sPosition.get(eng.id, 1));
              if (dist < minDist) {
                minDist = dist;
                closestPos = pos;
              }
            }
          }
        }
        
        // Fallback if no adjacent safe hexes found
        if (!closestPos) {
           for (const city of this.state.cities) {
             const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
             const dist = Math.hypot(pos.x - sPosition.get(eng.id, 0), pos.y - sPosition.get(eng.id, 1));
             if (dist < minDist) {
               minDist = dist;
               closestPos = pos;
             }
           }
        }

        if (closestPos) {
          const dx = closestPos.x - sPosition.get(eng.id, 0);
          const dy = closestPos.y - sPosition.get(eng.id, 1);
          if (minDist > 2) {
            sPosition.set(eng.id, sPosition.get(eng.id, 0) + ((dx / minDist) * speed * dt), 0);
            sPosition.set(eng.id, sPosition.get(eng.id, 1) + ((dy / minDist) * speed * dt), 1);
          } else {
            this.world.destroyEntity(eng.id);
            return false; // Remove engineer
          }
        } else {
            this.world.destroyEntity(eng.id);
            return false; // Remove engineer
        }
      }
      const hex = pixelToHex(sPosition.get(eng.id, 0), sPosition.get(eng.id, 1), HEX_SIZE);
      setHex(sHexPosition, eng.id, hex);
      return true; // Keep engineer
    });
  }

  spawnSparks(x: number, y: number, color: string, count: number = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color
      });
    }
  }

  updateParticles(dt: number) {
    this.state.particles = this.state.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 2;
      return p.life > 0;
    });
  }

  getRandomEdgeSpawnPos(spawnHex: Hex): {x: number, y: number} {
    const outsideNeighbors: import('./HexMath').Hex[] = [];
    for (let i = 0; i < 6; i++) {
      const nHex = hexNeighbor(spawnHex, i);

      if (Math.max(Math.abs(nHex.q), Math.abs(nHex.r), Math.abs(nHex.s)) > MAP_RADIUS) {
        outsideNeighbors.push(nHex);
      }
    }
    
    if (outsideNeighbors.length === 0) {
      return hexToPixel(spawnHex, HEX_SIZE);
    }
    
    const nHex = outsideNeighbors[Math.floor(Math.random() * outsideNeighbors.length)];
    const p0 = hexToPixel(spawnHex, HEX_SIZE);
    const p1 = hexToPixel(nHex, HEX_SIZE);
    
    // Midpoint is the geometric edge center
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist === 0) return p0;

    const vx = dx / dist;
    const vy = dy / dist;
    
    // Perpendicular vector along the edge line
    const px = -vy;
    const py = vx;
    
    // Assumes HEX_SIZE is the circumradius (center to corner)
    const randomOffset = (Math.random() - 0.5) * HEX_SIZE;
    
    const edgeX = mx + px * randomOffset;
    const edgeY = my + py * randomOffset;
    
    // Calculate the actual vector from the edge point to the hex center
    const cx = p0.x - edgeX;
    const cy = p0.y - edgeY;
    const centerDist = Math.hypot(cx, cy);
    
    if (centerDist === 0) return { x: edgeX, y: edgeY };
    
    // Pull back 1 unit directly towards p0
    return {
      x: edgeX + (cx / centerDist) * 1,
      y: edgeY + (cy / centerDist) * 1
    };
  }

  spawnReinforcements() {
    if (!this.validReinforcementSpawns || this.validReinforcementSpawns.length === 0) return;

    const turn = this.state.turn;
    const type = MobUnit.Scout;
    const spawnHex = this.validReinforcementSpawns[Math.floor(Math.random() * this.validReinforcementSpawns.length)];
    const pos = this.getRandomEdgeSpawnPos(spawnHex);

    const tile = this.state.tiles.get(hexToString(spawnHex));
    const isVoidspawn = tile ? tile.terrain === Terrain.Void : false;

    let hp = 20, speed = 1.6, damage = 2;
    hp *= (1 + turn * 0.1);
    damage *= (1 + turn * 0.05);

    // XXX: Spawning reinforcements as converted scouts
    // XXX: The reinforcements are roaming, so pushed into the enemies (should just be "roaming" then) array
    const eId = this.world.createEntity();
    this.state.enemies.push({
      id: eId,
      
      isConverted: true, isVoidspawn
    });
    this.world.setComponent(eId, Component.Position, [pos.x, pos.y]);
    this.world.setComponent(eId, Component.Health, hp);
    this.world.setComponent(eId, Component.MaxHealth, hp);
    this.world.setComponent(eId, Component.Speed, speed);
    this.world.setComponent(eId, Component.Damage, damage);
    this.world.setComponent(eId, Component.HexPosition, [spawnHex.q, spawnHex.r]);
    this.world.setComponent(eId, Component.MobType, type);
  }

  spawnEnemy(type: MobUnit) {
    if (!this.validEnemySpawns || this.validEnemySpawns.length === 0) return;

    let spawnHex = this.validEnemySpawns[Math.floor(Math.random() * this.validEnemySpawns.length)];
    let tile = this.state.tiles.get(hexToString(spawnHex));
    let cost = this.costs.get(hexToString(spawnHex));
    let isVoidspawn = (tile && tile.terrain === Terrain.Void) || (cost === undefined || cost >= 999);

    // Give it up to 10 tries to ensure standard units don't spawn on voidspawn-only paths
    for (let attempts = 0; attempts < 10; attempts++) {
       if (!isVoidspawn && cost !== undefined && cost < 999) break; // Valid normie
       if (isVoidspawn) break; // Valid void
       // Re-roll
       spawnHex = this.validEnemySpawns[Math.floor(Math.random() * this.validEnemySpawns.length)];
       tile = this.state.tiles.get(hexToString(spawnHex));
       cost = this.costs.get(hexToString(spawnHex));
       isVoidspawn = (tile && tile.terrain === Terrain.Void) || (cost === undefined || cost >= 999);
    }
    
    // Hard bail if still invalid pathing
    if (!isVoidspawn && (cost === undefined || cost >= 999)) return;
    const voidC = this.voidCosts.get(hexToString(spawnHex));
    if (isVoidspawn && (voidC === undefined)) return;

    const pos = this.getRandomEdgeSpawnPos(spawnHex);

    let hp = 20, speed = 1.5, damage = 1;
    if (type === MobUnit.Warrior) { hp = 50; speed = 1.0; damage = 2.5; }
    if (type === MobUnit.Brute) { hp = 150; speed = 0.6; damage = 7.5; }

    const turn = this.state.turn;
    hp *= (1 + turn * 0.1);
    damage *= (1 + turn * 0.05);

    // Threat 3+ regions grant bonus HP and damage modifier: 1.333^(threat - 3)
    if (this.threatLevel >= 3) {
      const modifier = Math.pow(1.333, this.threatLevel - 3);
      hp *= modifier;
      damage *= modifier;
    }

    const eId = this.world.createEntity();
    this.state.enemies.push({
      id: eId,
      
      isConverted: false, isVoidspawn
    });
    this.world.setComponent(eId, Component.Position, [pos.x, pos.y]);
    this.world.setComponent(eId, Component.Health, hp);
    this.world.setComponent(eId, Component.MaxHealth, hp);
    this.world.setComponent(eId, Component.Speed, speed);
    this.world.setComponent(eId, Component.Damage, damage);
    this.world.setComponent(eId, Component.HexPosition, [spawnHex.q, spawnHex.r]);
    this.world.setComponent(eId, Component.MobType, type);
  }

  validReinforcementSpawns: Hex[] = [];
  validEnemySpawns: Hex[] = [];

  updateFlowField() {
    const sHexPosition = this.world.getStore(Component.HexPosition);
    this.costs.clear();
    this.voidCosts.clear();
    const queue: { hex: Hex, cost: number }[] = [];
    const voidQueue: { hex: Hex, cost: number }[] = [];

    for (const city of this.state.cities) {
      const key = hexToString(getHex(sHexPosition, city.id)!);
      this.costs.set(key, 0);
      this.voidCosts.set(key, 0);
      queue.push({ hex: getHex(sHexPosition, city.id)!, cost: 0 });
      voidQueue.push({ hex: getHex(sHexPosition, city.id)!, cost: 0 });
    }

    // Standard flow field
    while (queue.length > 0) {
      queue.sort((a, b) => b.cost - a.cost);
      const current = queue.pop()!;
      const currentKey = hexToString(current.hex);

      if (current.cost > this.costs.get(currentKey)!) continue;

      for (let i = 0; i < 6; i++) {
        const neighbor = hexNeighbor(current.hex, i);
        const nKey = hexToString(neighbor);
        const tile = this.state.tiles.get(nKey);

        if (!tile) continue;

        let enterCost = 1;
        if (tile.improvementLevel === -1) enterCost = 3;
        else if (tile.terrain === Terrain.Void) enterCost = 999;
        else if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) enterCost = 2;
        else if (tile.terrain === Terrain.Mountains) enterCost = 5;

        // Prevent horizontal propagation along the invisible map border
        const currentHex = current.hex || { q: 0, r: 0, s: 0 };
        const neighborHexSafe = neighbor || { q: 0, r: 0, s: 0 };
        const isCurrentEdge = Math.max(Math.abs(currentHex.q), Math.abs(currentHex.r), Math.abs(currentHex.s)) > MAP_RADIUS;
        const isNeighborEdge = Math.max(Math.abs(neighborHexSafe.q), Math.abs(neighborHexSafe.r), Math.abs(neighborHexSafe.s)) > MAP_RADIUS;
        if (isCurrentEdge && isNeighborEdge) {
           enterCost = 99999;
        }

        const newCost = current.cost + enterCost;
        if (!this.costs.has(nKey) || newCost < this.costs.get(nKey)!) {
          this.costs.set(nKey, newCost);
          queue.push({ hex: neighbor, cost: newCost });
        }
      }
    }

    // Voidspawn flow field (void terrain is perfectly fine to walk on)
    while (voidQueue.length > 0) {
      voidQueue.sort((a, b) => b.cost - a.cost);
      const current = voidQueue.pop()!;
      const currentKey = hexToString(current.hex);

      if (current.cost > this.voidCosts.get(currentKey)!) continue;

      for (let i = 0; i < 6; i++) {
        const neighbor = hexNeighbor(current.hex, i);
        const nKey = hexToString(neighbor);
        const tile = this.state.tiles.get(nKey);

        if (!tile) continue;

        let enterCost = 1;
        if (tile.improvementLevel === -1) enterCost = 3;
        else if (tile.terrain === Terrain.Void) enterCost = 1; // Voidwalk
        else if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) enterCost = 2;
        else if (tile.terrain === Terrain.Mountains) enterCost = 2; // Mountainwalk

        // Prevent horizontal propagation along the invisible map border
        const currentHex2 = current.hex || { q: 0, r: 0, s: 0 };
        const neighborHexSafe2 = neighbor || { q: 0, r: 0, s: 0 };
        const isCurrentEdge2 = Math.max(Math.abs(currentHex2.q), Math.abs(currentHex2.r), Math.abs(currentHex2.s)) > MAP_RADIUS;
        const isNeighborEdge2 = Math.max(Math.abs(neighborHexSafe2.q), Math.abs(neighborHexSafe2.r), Math.abs(neighborHexSafe2.s)) > MAP_RADIUS;
        if (isCurrentEdge2 && isNeighborEdge2) {
           enterCost = 99999;
        }

        const newCost = current.cost + enterCost;
        if (!this.voidCosts.has(nKey) || newCost < this.voidCosts.get(nKey)!) {
          this.voidCosts.set(nKey, newCost);
          voidQueue.push({ hex: neighbor, cost: newCost });
        }
      }
    }

    this.validReinforcementSpawns = this.safePoints.filter(hex => {
      const key = hexToString(hex);
      const tile = this.state.tiles.get(key);
      if (!tile || tile.terrain === Terrain.Void) return false;
      const cost = this.costs.get(key);
      return cost !== undefined && cost < 999;
    });

    this.validEnemySpawns = this.spawnPoints.filter(hex => {
      const key = hexToString(hex);
      const cost = this.costs.get(key);
      const voidCost = this.voidCosts.get(key);
      
      const passableNormally = cost !== undefined && cost < 999;
      const passableAsVoidspawn = voidCost !== undefined;
      
      return passableNormally || passableAsVoidspawn;
    });
  }

  getFlowDirection(hex: Hex, isVoidspawn: boolean = false): { bestNeighbor: Hex, lowestCost: number } | null {
    const map = isVoidspawn ? this.voidCosts : this.costs;
    let currentCost = map.get(hexToString(hex));
    if (currentCost === undefined) currentCost = 9999;
    if (currentCost === 0) return null;

    let bestNeighbor = hex;
    let lowestCost = currentCost;

    for (let i = 0; i < 6; i++) {
        const neighbor = hexNeighbor(hex, i);
        let cost = map.get(hexToString(neighbor));
        
        if (cost !== undefined) {
           if (cost < lowestCost) {
              lowestCost = cost;
              bestNeighbor = neighbor;
           }
        }
    }
    
    if (lowestCost >= currentCost) return null;
    return { bestNeighbor, lowestCost };
  }

  updateEnemies(dt: number) {
    const sHealth = this.world.getStore(Component.Health);
    const sSpeed = this.world.getStore(Component.Speed);
    const sDamage = this.world.getStore(Component.Damage);

    const sHexPosition = this.world.getStore(Component.HexPosition);
    const sMobType = this.world.getStore(Component.MobType);

    const sPosition = this.world.getStore(Component.Position);
    for (const enemy of this.state.enemies) {
      const currentTile = this.state.tiles.get(hexToString(getHex(sHexPosition, enemy.id)!));
      let terrainCost = 1;
      if (currentTile) {
        if (currentTile.improvementLevel === -1) terrainCost = 3;
        else if (currentTile.terrain === Terrain.Void) terrainCost = enemy.isVoidspawn ? 1 : 25;
        else if (currentTile.terrain === Terrain.Forest || currentTile.terrain === Terrain.Hills) terrainCost = 2;
        else if (currentTile.terrain === Terrain.Mountains) terrainCost = enemy.isVoidspawn ? 2 : 5; // Mountainwalker!
      } else {
        terrainCost = enemy.isVoidspawn ? 1 : 25;
      }
      
      let activeSpeed = sSpeed.get(enemy.id, 0);
      if (sMobType.get(enemy.id, 0) === MobUnit.Brute && currentTile?.improvementLevel === -1) {
        activeSpeed += 1.0;
      }
      let actualSpeed = activeSpeed / terrainCost;

      if (enemy.isConverted) {
        const target = enemy.targetId ? this.state.enemies.find(e => e.id === enemy.targetId) : null;

        if (target) {
          const dx = sPosition.get(target.id, 0) - sPosition.get(enemy.id, 0);
          const dy = sPosition.get(target.id, 1) - sPosition.get(enemy.id, 1);
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            const nextX = sPosition.get(enemy.id, 0) + (dx / dist) * actualSpeed * HEX_SIZE * dt;
            const nextY = sPosition.get(enemy.id, 1) + (dy / dist) * actualSpeed * HEX_SIZE * dt;
            const nextHex = pixelToHex(nextX, nextY, HEX_SIZE);
            const nextTile = this.state.tiles.get(hexToString(nextHex));

            if (!enemy.isVoidspawn && nextTile && nextTile.terrain === Terrain.Void) {
              enemy.targetId = undefined; // Drop geometric lock to prevent walking into void
            } else {
              sPosition.set(enemy.id, nextX, 0);
              sPosition.set(enemy.id, nextY, 1);
              setHex(sHexPosition, enemy.id, nextHex);
            }
          } else {
            sHealth.set(target.id, sHealth.get(target.id, 0) - (sDamage.get(enemy.id, 0) * dt), 0); // Converted strikes Hostile
            sHealth.set(enemy.id, sHealth.get(enemy.id, 0) - (sDamage.get(target.id, 0) * 0.5 * dt), 0); // Hostile passive feedback
            if (Math.random() < dt * 10) this.spawnSparks(sPosition.get(target.id, 0), sPosition.get(target.id, 1), sMobType.get(target.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 1);
            if (Math.random() < dt * 10) this.spawnSparks(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), '#ffffff', 1);
          }
        } else {
          // Fallback: move to most damaged outpost intelligently
          const flow = this.getFlowDirection(getHex(sHexPosition, enemy.id)!, false);
          if (flow) {
            const targetPos = hexToPixel(flow.bestNeighbor, HEX_SIZE);
            const dx = targetPos.x - sPosition.get(enemy.id, 0);
            const dy = targetPos.y - sPosition.get(enemy.id, 1);
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
              sPosition.set(enemy.id, sPosition.get(enemy.id, 0) + ((dx / dist) * actualSpeed * HEX_SIZE * dt), 0);
              sPosition.set(enemy.id, sPosition.get(enemy.id, 1) + ((dy / dist) * actualSpeed * HEX_SIZE * dt), 1);
              setHex(sHexPosition, enemy.id, pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE));
            }
          } else {
             const originPix = hexToPixel({q:0, r:0, s:0}, HEX_SIZE);
             const dox = originPix.x - sPosition.get(enemy.id, 0);
             const doy = originPix.y - sPosition.get(enemy.id, 1);
             const ddist = Math.hypot(dox, doy);
             if (ddist > 0) {
                sPosition.set(enemy.id, sPosition.get(enemy.id, 0) + ((dox / ddist) * actualSpeed * HEX_SIZE * dt), 0);
                sPosition.set(enemy.id, sPosition.get(enemy.id, 1) + ((doy / ddist) * actualSpeed * HEX_SIZE * dt), 1);
                setHex(sHexPosition, enemy.id, pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE));
             }
          }
        }
        continue;
      }

      const enemySize = this.getEnemySize(sMobType.get(enemy.id, 0));
      let filledSlots = 0;
      for (const u of this.state.friendlyUnits) {
        if (u.targetId === enemy.id && Math.hypot(sPosition.get(u.id, 0) - sPosition.get(enemy.id, 0), sPosition.get(u.id, 1) - sPosition.get(enemy.id, 1)) < 15) {
          filledSlots += this.getFriendlySize(u);
        }
      }
      for (const e of this.state.enemies) {
        if (e.isConverted && e.targetId === enemy.id && Math.hypot(sPosition.get(e.id, 0) - sPosition.get(enemy.id, 0), sPosition.get(e.id, 1) - sPosition.get(enemy.id, 1)) < 15) {
          filledSlots += this.getEnemySize(sMobType.get(e.id, 0));
        }
      }

      const speedMult = Math.max(0, 1 - (filledSlots / enemySize));
      actualSpeed *= speedMult;

      const flow = this.getFlowDirection(getHex(sHexPosition, enemy.id)!, enemy.isVoidspawn);
      if (!flow) {
         // Fallback if fully out of flow bounds: move towards origin (0,0)
         const originPix = hexToPixel({q:0, r:0, s:0}, HEX_SIZE);
         const dox = originPix.x - sPosition.get(enemy.id, 0);
         const doy = originPix.y - sPosition.get(enemy.id, 1);
         const ddist = Math.hypot(dox, doy);
         if (ddist > 0) {
            sPosition.set(enemy.id, sPosition.get(enemy.id, 0) + ((dox / ddist) * actualSpeed * HEX_SIZE * dt), 0);
            sPosition.set(enemy.id, sPosition.get(enemy.id, 1) + ((doy / ddist) * actualSpeed * HEX_SIZE * dt), 1);
            setHex(sHexPosition, enemy.id, pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE));
         }
      } else {
        const targetPos = hexToPixel(flow.bestNeighbor, HEX_SIZE);
        const dx = targetPos.x - sPosition.get(enemy.id, 0);
        const dy = targetPos.y - sPosition.get(enemy.id, 1);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          const moveDist = Math.min(dist, actualSpeed * HEX_SIZE * dt);

          // NOTE: Previously tried to stop enemies at outpost walls here, but it broke engagement ranges
          // reverting to naive movement where enemies walk into zero-cost areas and engage directly
          sPosition.set(enemy.id, sPosition.get(enemy.id, 0) + ((dx / dist) * moveDist), 0);
          sPosition.set(enemy.id, sPosition.get(enemy.id, 1) + ((dy / dist) * moveDist), 1);
          setHex(sHexPosition, enemy.id, pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE));
        }
      }
      
      // Strict Boundary Enforcer:
      // If a unit physically drifts perfectly outside the visible mapped tiles (MAP_RADIUS),
      // we physically drag them back into the map core (0,0) before the next frame renders.
      const boundedHex = pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE);
      const isOutside = Math.max(Math.abs(boundedHex.q), Math.abs(boundedHex.r), Math.abs(boundedHex.s)) > MAP_RADIUS;
      if (isOutside) {
         const centerPix = hexToPixel({q:0, r:0, s:0}, HEX_SIZE);
         const cx = centerPix.x - sPosition.get(enemy.id, 0);
         const cy = centerPix.y - sPosition.get(enemy.id, 1);
         const cDist = Math.hypot(cx, cy);
         if (cDist > 0) {
             const speedCap = Math.max(15, activeSpeed * HEX_SIZE * 2.0); // Make boundary correction fast and dominant
             sPosition.set(enemy.id, sPosition.get(enemy.id, 0) + ((cx / cDist) * speedCap * dt), 0);
             sPosition.set(enemy.id, sPosition.get(enemy.id, 1) + ((cy / cDist) * speedCap * dt), 1);
             setHex(sHexPosition, enemy.id, pixelToHex(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), HEX_SIZE));
         }
      }
    }
  }

  updateCitySizes() {
    const sHexPosition = this.world.getStore(Component.HexPosition);
    for (const city of this.state.cities) {
      let adjCount = 0;
      for (const other of this.state.cities) {
        if (city.id !== other.id && hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, other.id)!) === 1) {
          adjCount++;
        }
      }
      city.size = 1 + adjCount;
    }
  }

  updateCombat(dt: number) {
    const sHealth = this.world.getStore(Component.Health);
    const sMaxHealth = this.world.getStore(Component.MaxHealth);
    const sSpeed = this.world.getStore(Component.Speed);
    const sDamage = this.world.getStore(Component.Damage);

    const sHexPosition = this.world.getStore(Component.HexPosition);
    const sMobType = this.world.getStore(Component.MobType);
    const sFriendlyType = this.world.getStore(Component.FriendlyType);
    const sFriendlyState = this.world.getStore(Component.FriendlyState);

    const sPosition = this.world.getStore(Component.Position);

    this.updateCitySizes();
    const dmgMult = (this.hasTech('BronzeWorking') ? 1.3 : 1.0) * 1.2;

    for (const city of this.state.cities) {
      let cityHp = sHealth.get(city.id, 0);
      if (cityHp > 0) {
        if (this.hasTech('Irrigation')) {
          const regen = this.hasFusion('Aqueducts') ? 15 : 5;
          cityHp = Math.min(sMaxHealth.get(city.id, 0), cityHp + regen * dt);
        }

        city.timeSinceLastDamage += dt;
        if (city.timeSinceLastDamage >= 3) {
          cityHp = Math.min(sMaxHealth.get(city.id, 0), cityHp + 2 * dt);
        }
        sHealth.set(city.id, cityHp, 0);
      }
    }

    // Ensure correct number of defenders and specialists per city
    for (const city of this.state.cities) {
      const tile = this.state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));
      const targetDefenders = Math.min(6, city.size);
      let currentDefenders = 0;
      let currentCavalry = 0;
      let currentArchers = 0;
      let currentMystics = 0;
      
      for (const unit of this.state.friendlyUnits) {
        if (unit.cityId === city.id) {
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Guard) currentDefenders++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) currentCavalry++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) currentArchers++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) currentMystics++;
        }
      }
      
      if (currentDefenders < targetDefenders) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = this.world.createEntity();
        this.state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          targetId: null,
          angle: Math.random() * Math.PI * 2
        });
        this.world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        this.world.setComponent(uId, Component.Health, 50);
        this.world.setComponent(uId, Component.MaxHealth, 50);
        this.world.setComponent(uId, Component.FriendlyType, FriendlyType.Guard);
        this.world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetCavalry = 0;
      if (tile?.terrain === Terrain.Plains) {
        if (this.hasTech('HorsebackRiding')) targetCavalry += 1;
        if (this.hasTech('AnimalHusbandry')) targetCavalry += 1;
        if (this.hasFusion('WarChariots')) targetCavalry += 1;
      }
      if (currentCavalry < targetCavalry) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = this.world.createEntity();
        this.state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          cavalryIndex: currentCavalry,
          targetId: null,
          angle: Math.random() * Math.PI * 2
        });
        this.world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        this.world.setComponent(uId, Component.Health, 100);
        this.world.setComponent(uId, Component.MaxHealth, 100);
        this.world.setComponent(uId, Component.FriendlyType, FriendlyType.Cavalry);
        this.world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetArchers = 0;
      if (tile?.terrain === Terrain.Hills) {
         if (this.hasTech('Archery')) targetArchers += 1;
         if (this.hasTech('Crossbows')) targetArchers += 1;
         if (this.hasFusion('MountainFortress')) targetArchers += 1;
      }
      if (currentArchers < targetArchers) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = this.world.createEntity();
        this.state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          archerIndex: currentArchers,
          targetId: null,
          angle: Math.random() * Math.PI * 2,
          cooldown: 0
        });
        this.world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        this.world.setComponent(uId, Component.Health, 50);
        this.world.setComponent(uId, Component.MaxHealth, 50);
        this.world.setComponent(uId, Component.FriendlyType, FriendlyType.Archer);
        this.world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetMystics = 0;
      if (tile?.terrain === Terrain.Forest) {
         if (this.hasTech('Mysticism')) targetMystics = 1;
      }
      if (currentMystics < targetMystics) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = this.world.createEntity();
        this.state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          
          mysticIndex: currentMystics,
          targetId: null,
          
          angle: Math.random() * Math.PI * 2,
          cooldown: 0
        });
        this.world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        this.world.setComponent(uId, Component.Health, 50);
        this.world.setComponent(uId, Component.MaxHealth, 50);
        this.world.setComponent(uId, Component.FriendlyType, FriendlyType.Mystic);
        this.world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }
    }

    // Update friendly units
    this.state.friendlyUnits = this.state.friendlyUnits.filter(unit => {
      const city = this.state.cities.find(c => c.id === unit.cityId);
      if (!city) { this.world.destroyEntity(unit.id); return false; }

      const cityPos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
      const tile = this.state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));

      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) {
        unit.cooldown = (unit.cooldown || 0) - dt;
        if (unit.cooldown <= 0) {
          unit.cooldown = this.hasTech('Archery') ? 1.5 : 2.5;
          let range = 1;
          if (this.hasTech('Crossbows')) range += 1;
          if (this.hasFusion('MountainFortress')) range += 1;
          const archDmg = 50;

          let farthest: import('./Types').Enemy | null = null;
          let maxDist = -1;
          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            const dist = hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, enemy.id)!);
            if (dist <= range && dist > maxDist) {
              maxDist = dist;
              farthest = enemy;
            }
          }
          if (farthest) {
            const pId = this.world.createEntity();
            this.state.projectiles.push({
              id: pId,
              targetId: farthest.id
            });
            this.world.setComponent(pId, Component.Damage, archDmg);
            this.world.setComponent(pId, Component.Speed, 250);
            this.world.setComponent(pId, Component.Position, [sPosition.get(unit.id, 0), sPosition.get(unit.id, 1)]);
          }
        }
        
        let orbitOffset = (unit.archerIndex || 0) * (Math.PI * 2 / 3);
        unit.angle += dt * 0.5;
        const targetX = cityPos.x + Math.cos(unit.angle + orbitOffset) * 8;
        const targetY = cityPos.y + Math.sin(unit.angle + orbitOffset) * 8;
        
        const nextX = sPosition.get(unit.id, 0) + (targetX - sPosition.get(unit.id, 0)) * 5 * dt;
        const nextY = sPosition.get(unit.id, 1) + (targetY - sPosition.get(unit.id, 1)) * 5 * dt;
        const nextTile = this.state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
        if (!(nextTile && nextTile.terrain === Terrain.Void)) {
            sPosition.set(unit.id, nextX, 0);
            sPosition.set(unit.id, nextY, 1);
        }

        return true;
      }

      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) {
        unit.cooldown = (unit.cooldown || 0) - dt;
        if (unit.cooldown <= 0) {
          unit.cooldown = this.hasTech('Animism') ? 3 : 5;
          const baseRadius = 1;
          let range = baseRadius;
          if (this.hasTech('Animism')) range += 1;
          if (this.hasFusion('Theology')) range += 1;
          
          const convertChance = this.hasFusion('Theology') ? (this.hasTech('Animism') ? 0.2 : 0.1) : 0;
          let convertedOne = false;
          const baseDamage = this.hasTech('Animism') ? 100 : 50;
          
          const cityPx = { x: sPosition.get(city.id, 0), y: sPosition.get(city.id, 1) };
          // HEX_SIZE is centre-to-vertex; centre-to-centre between adjacent hexes is HEX_SIZE * sqrt(3).
          const ringPx = HEX_SIZE * Math.sqrt(3);
          const innerPx = baseRadius * ringPx;
          const outerPx = range * ringPx;

          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            const hexDist = hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, enemy.id)!);
            if (hexDist > range) continue;

            const ex = sPosition.get(enemy.id, 0);
            const ey = sPosition.get(enemy.id, 1);
            const pixelDist = Math.hypot(ex - cityPx.x, ey - cityPx.y);

            let damageMult = 1.0;
            if (range > baseRadius && pixelDist > innerPx) {
              damageMult = Math.max(0, (outerPx - pixelDist) / (outerPx - innerPx));
            }
            const damage = baseDamage * damageMult;
            
            if (damage > 0) {
              sHealth.set(enemy.id, sHealth.get(enemy.id, 0) - damage, 0);
            }
            this.spawnSparks(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), sMobType.get(enemy.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 8);
            this.spawnSparks(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), '#a855f7', 5);
            if (convertChance > 0 && Math.random() < convertChance && !convertedOne && sHealth.get(enemy.id, 0) > 0 && !enemy.isVoidspawn) {
              enemy.isConverted = true;
              convertedOne = true;
            }
          }
        }

        unit.angle += dt * 2;
        const targetX = cityPos.x;
        const targetY = cityPos.y - 12 + Math.sin(unit.angle) * 4;
        
        const nextX = sPosition.get(unit.id, 0) + (targetX - sPosition.get(unit.id, 0)) * 5 * dt;
        const nextY = sPosition.get(unit.id, 1) + (targetY - sPosition.get(unit.id, 1)) * 5 * dt;
        const nextTile = this.state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
        if (!(nextTile && nextTile.terrain === Terrain.Void)) {
            sPosition.set(unit.id, nextX, 0);
            sPosition.set(unit.id, nextY, 1);
        }

        return true;
      }

      const isCavalry = sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry;
      const hillBonus = (this.hasTech('Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
      const damage = (isCavalry ? (this.hasFusion('WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
      const speed = (isCavalry ? (this.hasFusion('WarChariots') ? 3.0 : 2.0) : 1.0) * HEX_SIZE;

      const unitTile = this.state.tiles.get(hexToString(pixelToHex(sPosition.get(unit.id, 0), sPosition.get(unit.id, 1), HEX_SIZE)));
      let unitTerrainCost = 1;
      if (unitTile) {
        if (unitTile.improvementLevel === -1) unitTerrainCost = 3;
        else if (unitTile.terrain === Terrain.Void) unitTerrainCost = 25;
        else if (unitTile.terrain === Terrain.Forest || unitTile.terrain === Terrain.Hills) unitTerrainCost = 2;
        else if (unitTile.terrain === Terrain.Mountains) unitTerrainCost = 5;
      } else {
        unitTerrainCost = 25;
      }
      const actualSpeed = speed / unitTerrainCost;

      if (unit.targetId) {
        const target = this.state.enemies.find(e => e.id === unit.targetId);
        if (target) {
          const dx = sPosition.get(target.id, 0) - sPosition.get(unit.id, 0);
          const dy = sPosition.get(target.id, 1) - sPosition.get(unit.id, 1);
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            const nextX = sPosition.get(unit.id, 0) + (dx / dist) * actualSpeed * dt;
            const nextY = sPosition.get(unit.id, 1) + (dy / dist) * actualSpeed * dt;
            const nextHex = pixelToHex(nextX, nextY, HEX_SIZE);
            const nextTile = this.state.tiles.get(hexToString(nextHex));
            
            if (nextTile && nextTile.terrain === Terrain.Void) {
               unit.targetId = null;
            } else {
               sPosition.set(unit.id, nextX, 0);
               sPosition.set(unit.id, nextY, 1);
            }
          } else {
            // Physical reach - deal damage
            sHealth.set(target.id, sHealth.get(target.id, 0) - (damage * dt), 0);
            if (Math.random() < dt * 10) this.spawnSparks(sPosition.get(target.id, 0), sPosition.get(target.id, 1), sMobType.get(target.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 1);
            // Target deals damage back to guard (feedback)
            sHealth.set(unit.id, sHealth.get(unit.id, 0) - (sDamage.get(target.id, 0) * 0.5 * dt), 0);
            if (Math.random() < dt * 10) this.spawnSparks(sPosition.get(unit.id, 0), sPosition.get(unit.id, 1), isCavalry ? '#22c55e' : '#4287f5', 1);
      if (sHealth.get(unit.id, 0) <= 0) { this.world.destroyEntity(unit.id); return false; }
          }
        }
        sFriendlyState.set(unit.id, FriendlyState.Engaging, 0);
      } else {
        const dx = cityPos.x - sPosition.get(unit.id, 0);
        const dy = cityPos.y - sPosition.get(unit.id, 1);
        const dist = Math.hypot(dx, dy);
        
        // Determine the maximum distance the unit will consider 'home base'
        let orbitRadius = HEX_SIZE * 0.6;
        if (isCavalry) {
          let orbitDist = 1;
          if (this.hasTech('HorsebackRiding')) orbitDist += 2;
          if (this.hasTech('AnimalHusbandry')) orbitDist += 1;
          if (this.hasFusion('WarChariots')) orbitDist += 1;
          orbitRadius = (orbitDist * Math.sqrt(3)/2 + 0.5) * HEX_SIZE;
        }
        
        if (dist > orbitRadius + HEX_SIZE * 0.5) {
          sFriendlyState.set(unit.id, FriendlyState.Returning, 0);
          const nextX = sPosition.get(unit.id, 0) + (dx / dist) * actualSpeed * dt;
          const nextY = sPosition.get(unit.id, 1) + (dy / dist) * actualSpeed * dt;
          const nextTile = this.state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
          if (!(nextTile && nextTile.terrain === Terrain.Void)) {
            sPosition.set(unit.id, nextX, 0);
            sPosition.set(unit.id, nextY, 1);
          }
        } else {
          if (sHealth.get(unit.id, 0) < sMaxHealth.get(unit.id, 0) && isCavalry) {
            sFriendlyState.set(unit.id, FriendlyState.Healing, 0);
          } else {
            sFriendlyState.set(unit.id, FriendlyState.Idle, 0);
          }

          sHealth.set(unit.id, Math.min(sMaxHealth.get(unit.id, 0), sHealth.get(unit.id, 0) + (sFriendlyState.get(unit.id, 0) === FriendlyState.Healing ? 10 : 5) * dt), 0);
          
          if (isCavalry) {
            unit.angle += dt * (this.hasFusion('WarChariots') ? 1.5 : 1.0);
            
            const targetX = cityPos.x + Math.cos(unit.angle) * orbitRadius;
            const targetY = cityPos.y + Math.sin(unit.angle) * orbitRadius;
            
            const mdx = targetX - sPosition.get(unit.id, 0);
            const mdy = targetY - sPosition.get(unit.id, 1);
            const mdist = Math.hypot(mdx, mdy);
            if (mdist > 0) {
              const moveDist = Math.min(mdist, actualSpeed * dt);
              const nextX = sPosition.get(unit.id, 0) + (mdx / mdist) * moveDist;
              const nextY = sPosition.get(unit.id, 1) + (mdy / mdist) * moveDist;
              const nextTile = this.state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
              if (nextTile && nextTile.terrain === Terrain.Void) {
                unit.angle += dt * 3; // Skim over bad spot faster in orbit 
              } else {
                sPosition.set(unit.id, nextX, 0);
                sPosition.set(unit.id, nextY, 1);
              }
            }
          } else {
            unit.angle += dt * 2;
            const targetX = cityPos.x + Math.cos(unit.angle) * (HEX_SIZE * 0.6);
            const targetY = cityPos.y + Math.sin(unit.angle) * (HEX_SIZE * 0.6);
            
            const nextX = sPosition.get(unit.id, 0) + (targetX - sPosition.get(unit.id, 0)) * 5 * dt;
            const nextY = sPosition.get(unit.id, 1) + (targetY - sPosition.get(unit.id, 1)) * 5 * dt;
            const nextTile = this.state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
            if (!(nextTile && nextTile.terrain === Terrain.Void)) {
                sPosition.set(unit.id, nextX, 0);
                sPosition.set(unit.id, nextY, 1);
            }
          }
        }
      }

      const boundedHex = pixelToHex(sPosition.get(unit.id, 0), sPosition.get(unit.id, 1), HEX_SIZE);
      const isOutside = Math.max(Math.abs(boundedHex.q), Math.abs(boundedHex.r), Math.abs(boundedHex.s)) > MAP_RADIUS;
      if (isOutside) {
         const centerPix = hexToPixel({q:0, r:0, s:0}, HEX_SIZE);
         const cx = centerPix.x - sPosition.get(unit.id, 0);
         const cy = centerPix.y - sPosition.get(unit.id, 1);
         const cDist = Math.hypot(cx, cy);
         if (cDist > 0) {
             const speedCap = Math.max(15, actualSpeed * 2.0);
             sPosition.set(unit.id, sPosition.get(unit.id, 0) + ((cx / cDist) * speedCap * dt), 0);
             sPosition.set(unit.id, sPosition.get(unit.id, 1) + ((cy / cDist) * speedCap * dt), 1);
         }
      }

      return true;
    });

    // Update projectiles
    this.state.projectiles = this.state.projectiles.filter(p => {
      const target = this.state.enemies.find(e => e.id === p.targetId);
      if (!target) {
        this.world.destroyEntity(p.id);
        return false;
      }
      const dx = sPosition.get(target.id, 0) - sPosition.get(p.id, 0);
      const dy = sPosition.get(target.id, 1) - sPosition.get(p.id, 1);
      const dist = Math.hypot(dx, dy);
      if (dist < 5) {
        sHealth.set(target.id, sHealth.get(target.id, 0) - (sDamage.get(p.id, 0)), 0);
        this.spawnSparks(sPosition.get(target.id, 0), sPosition.get(target.id, 1), sMobType.get(target.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 5);
        this.world.destroyEntity(p.id);
        return false;
      }
      sPosition.set(p.id, sPosition.get(p.id, 0) + ((dx / dist) * sSpeed.get(p.id, 0) * dt), 0);
      sPosition.set(p.id, sPosition.get(p.id, 1) + ((dy / dist) * sSpeed.get(p.id, 0) * dt), 1);

      return true;
    });

    const cityPatrolDamage = new Map<number, number>();
    for (const city of this.state.cities) { cityPatrolDamage.set(city.id, 0); }
    for (const unit of this.state.friendlyUnits) {
      if (sFriendlyState.get(unit.id, 0) === FriendlyState.Idle || sFriendlyState.get(unit.id, 0) === FriendlyState.Healing) {
        const city = this.state.cities.find(c => c.id === unit.cityId);
        if (!city) continue;
        const tile = this.state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));
        const isCavalry = sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry;
        const hillBonus = (this.hasTech('Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
        const damage = (isCavalry ? (this.hasFusion('WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
        cityPatrolDamage.set(unit.cityId, (cityPatrolDamage.get(unit.cityId) || 0) + damage);
      }
    }

    for (const enemy of this.state.enemies) {
      if (enemy.isConverted) continue;
      const cost = this.costs.get(hexToString(getHex(sHexPosition, enemy.id)!));
      if (cost === 0) {
        const city = this.state.cities.find(c => hexToString(getHex(sHexPosition, c.id)!) === hexToString(getHex(sHexPosition, enemy.id)!));
        if (city) {
          const armor = this.hasTech('Masonry') ? (this.hasFusion('Aqueducts') ? 3 : 1) : 0;
          const dmg = Math.max(1, sDamage.get(enemy.id, 0) - armor) * dt;
          sHealth.set(city.id, Math.max(0, sHealth.get(city.id, 0) - dmg), 0);
          city.timeSinceLastDamage = 0;
          
          const patrolDmg = cityPatrolDamage.get(city.id) || 0;
          if (patrolDmg > 0) {
            sHealth.set(enemy.id, sHealth.get(enemy.id, 0) - (patrolDmg * 0.5 * dt), 0); // Patrol feedback damage
            if (Math.random() < dt * 10) this.spawnSparks(sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), '#ffffff', 1);
          }

          const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
          if (Math.random() < dt * 10) this.spawnSparks(pos.x, pos.y, '#ffffff', 1);
        }
      }
    }

    const xpMult = this.hasTech('Writing') ? 1.25 : 1.0;
    this.state.enemies = this.state.enemies.filter(e => {
      if (sHealth.get(e.id, 0) <= 0) {
        const xpGain = (sMaxHealth.get(e.id, 0) * 0.1) * xpMult;
        this.state.xp += xpGain;
        this.state.stats.cumulativeXp += xpGain;
        this.state.stats.threatsKilled++;
        this.world.destroyEntity(e.id);
        return false;
      }

      return true;
    });

    const initialCities = this.state.cities.length;
    this.state.cities = this.state.cities.filter(c => {
        if (sHealth.get(c.id, 0) <= 0) { this.world.destroyEntity(c.id); return false; }
        return true;
    });
    if (this.state.cities.length < initialCities) {
      this.state.stats.citiesLost += (initialCities - this.state.cities.length);
      for (const tile of this.state.tiles.values()) {
        if (tile.improvementLevel === 2) {
          const hasCity = this.state.cities.some(c => hexToString(getHex(sHexPosition, c.id)!) === hexToString(tile.hex));
          if (!hasCity) {
            tile.improvementLevel = -1;
          }
        }
      }
      this.updateFlowField();
    }

    if (this.state.cities.length === 0 && this.state.phase === 'PLAYING') {
      this.state.phase = 'GAME_OVER';
    }
  }

  checkLevelUp() {
    if (this.state.xp >= this.state.xpToNext) {
      this.state.xp -= this.state.xpToNext;
      this.state.level++;
      this.state.xpToNext = Math.floor(this.state.xpToNext * 1.5);

      const available = ALL_TECHS.filter(t => {
        if (this.state.techs.includes(t.id)) return false;
        if (t.id === 'AnimalHusbandry' && !this.state.techs.includes('HorsebackRiding')) return false;
        if (t.id === 'Crossbows' && !this.state.techs.includes('Archery')) return false;
        if (t.id === 'Animism' && !this.state.techs.includes('Mysticism')) return false;
        return true;
      });
      const shuffled = [...available].sort(() => 0.5 - Math.random());
      const picks = shuffled.slice(0, 3);
      picks.push({
        id: 'Resupply',
        name: 'Resupply',
        description: 'Skip this development and gain +2 Supply instead.'
      });

      if (picks.length > 0) {
        this.state.pendingTechPicks.push(picks);
        if (this.state.phase === 'PLAYING') {
          this.state.phase = 'LEVEL_UP';
        }
      }
    }
  }

  pickTech(techId: string) {
    if (techId === 'Resupply') {
      this.state.supplies += 2;
      this.state.pendingTechPicks.shift();
      if (this.state.pendingTechPicks.length === 0) {
        this.state.phase = 'PLAYING';
      }
      this.notify(true);
      return;
    }

    const sHealth = this.world.getStore(Component.Health);
    const sMaxHealth = this.world.getStore(Component.MaxHealth);
    this.state.techs.push(techId);
    this.state.pendingTechPicks.shift();

    if (techId === 'Masonry') {
      for (const city of this.state.cities) {
        let maxHp = sMaxHealth.get(city.id, 0);
        this.world.setComponent(city.id, Component.MaxHealth, maxHp + 50);
        
        sHealth.set(city.id, sHealth.get(city.id, 0) + 50, 0);
      }
    }

    for (const fusion of FUSIONS) {
      if (!this.state.fusions.includes(fusion.id)) {
        if (fusion.req.every(req => this.state.techs.includes(req))) {
          this.state.fusions.push(fusion.id);
        }
      }
    }

    if (this.state.pendingTechPicks.length === 0) {
      this.state.phase = 'PLAYING';
    }
    this.notify(true);
  }

  onTurnChange(turn: number) {
    if (this.state.focusedHex) {
      const tile = this.state.tiles.get(hexToString(this.state.focusedHex));
      if (tile) {
        if (tile.improvementLevel === -1) {
          tile.improvementLevel = 1;
        } else {
          tile.improvementLevel = ((tile.improvementLevel || 0) + 1) as -1 | 0 | 1 | 2;
        }
        this.state.supplies -= 1;
        if (tile.improvementLevel === 2) {
          this.createCity(tile.hex);
          this.state.focusedHex = null;
        } else if (this.state.supplies <= 0) {
          this.state.focusedHex = null;
        }
        this.updateFlowField();
      }
    }
  }

  lastNotifyTime = 0;

  notify(force: boolean = false) {
    if (this.onStateChange) {
      const now = performance.now();
      if (force || now - this.lastNotifyTime > 66) { // ~15 FPS
        this.onStateChange({ ...this.state });
        this.lastNotifyTime = now;
      }
    }
  }

  instaWin() {
    this.state.phase = 'VICTORY';
    for (const e of this.state.enemies) this.world.destroyEntity(e.id);
    this.state.enemies = [];
    for (const p of this.state.projectiles) this.world.destroyEntity(p.id);
    this.state.projectiles = [];
    this.state.particles = [];
    this.notify(true);
  }

  instaLevelUp() {
    if (this.state.phase === 'PLAYING') {
      this.state.xp = this.state.xpToNext;
      this.checkLevelUp();
      this.notify(true);
    }
  }

  instaLose() {
    const sHealth = this.world.getStore(Component.Health);
    if (this.state.phase === 'START') {
      this.state.phase = 'GAME_OVER';
      this.notify(true);
      return;
    }
    
    for (const city of this.state.cities) {
        sHealth.set(city.id, 0, 0);
    }
  }
}