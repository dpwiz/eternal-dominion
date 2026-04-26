import { Hex, hexDistance, hexNeighbor, hexToString, hexToPixel, pixelToHex, stringToHex } from './HexMath';
import { GameState, Terrain, MobUnit, FriendlyType, FriendlyState, EngineerState } from './Types';
import { ALL_TECHS, FUSIONS } from './Content';
import { World, Component } from './World';
import { PRNG } from './Random';

import { HEX_SIZE, MAP_RADIUS, OUTSIDE_RADIUS } from './Const';
import { getWaveComposition } from './helpers/waves';
import * as Particles from './systems/particles';
import * as Tech from './systems/tech';
import * as Engineers from './systems/engineers';
import * as MapGen from './systems/mapgen';
import * as Spawn from './systems/spawn';
import * as Flow from './systems/flow';
import * as Targeting from './systems/targeting';
import * as Combat from './systems/combat';
import * as Movement from './systems/movement';
import { getEnemySize, getFriendlySize, getHex, setHex } from './helpers/ecs';

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
    MapGen.generateMap(this.state, this.rng, this.centerTerrain, this.borderTerrain, this.safeEdges, this.savedImprovements, this.createCity.bind(this), this.spawnPoints, this.safePoints);
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

  validReinforcementSpawns: import('./HexMath').Hex[] = [];
  validEnemySpawns: import('./HexMath').Hex[] = [];

  updateFlowField() {
    const result = Flow.updateFlowField(this.state, this.world, this.safePoints, this.spawnPoints);
    this.costs = result.costs;
    this.voidCosts = result.voidCosts;
    this.validReinforcementSpawns = result.validReinforcementSpawns;
    this.validEnemySpawns = result.validEnemySpawns;
  }

  getFlowDirection(hex: import('./HexMath').Hex, isVoidspawn: boolean = false): { bestNeighbor: import('./HexMath').Hex, lowestCost: number } | null {
    return Flow.getFlowDirection(hex, this.costs, this.voidCosts, isVoidspawn);
  }

  assignTargets() {
    Targeting.assignTargets(this.state, this.world, this.costs);
  }

  update(dt: number) {
    if (this.state.phase !== 'PLAYING') return;

    Targeting.assignTargets(this.state, this.world, this.costs);

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

    Spawn.tickSpawns(this.state, this.world, dt, this.threatLevel, this.validEnemySpawns, this.validReinforcementSpawns, this.costs, this.voidCosts, this);

    Movement.updateEnemies(this.state, this.world, dt, this.costs, this.voidCosts);
    Engineers.tick(this.state, this.world, dt);
    this.updateCombat(dt);
    Particles.tick(this.state, dt);
    Tech.checkLevelUp(this.state);

    this.notify(this.state.phase !== 'PLAYING');
  }

  updateCombat(dt: number) {
    Combat.updateCombat(this.state, this.world, dt, this.costs, () => this.updateFlowField());
  }

  pickTech(techId: string) {
    Tech.pickTech(this.state, this.world, techId);
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
      Tech.checkLevelUp(this.state);
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