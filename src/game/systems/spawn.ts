import { GameState, MobUnit, Terrain } from '../Types';
import { World, Component } from '../World';
import { Hex, hexToString, hexNeighbor, hexToPixel } from '../HexMath';
import { HEX_SIZE, MAP_RADIUS } from '../Const';
import { getWaveComposition } from '../helpers/waves';

export function getRandomEdgeSpawnPos(spawnHex: Hex): {x: number, y: number} {
  const outsideNeighbors: import('../HexMath').Hex[] = [];
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
  
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist === 0) return p0;

  const vx = dx / dist;
  const vy = dy / dist;
  const px = -vy;
  const py = vx;
  
  const randomOffset = (Math.random() - 0.5) * HEX_SIZE;
  const edgeX = mx + px * randomOffset;
  const edgeY = my + py * randomOffset;
  const cx = p0.x - edgeX;
  const cy = p0.y - edgeY;
  const centerDist = Math.hypot(cx, cy);
  
  if (centerDist === 0) return { x: edgeX, y: edgeY };
  
  return {
    x: edgeX + (cx / centerDist) * 1,
    y: edgeY + (cy / centerDist) * 1
  };
}

export function spawnEnemy(
  state: GameState, world: World, type: MobUnit, threatLevel: number, 
  validEnemySpawns: Hex[], costs: Map<string, number>, voidCosts: Map<string, number>
) {
  if (!validEnemySpawns || validEnemySpawns.length === 0) return;

  let spawnHex = validEnemySpawns[Math.floor(Math.random() * validEnemySpawns.length)];
  let tile = state.tiles.get(hexToString(spawnHex));
  let cost = costs.get(hexToString(spawnHex));
  let isVoidspawn = (tile && tile.terrain === Terrain.Void) || (cost === undefined || cost >= 999);

  for (let attempts = 0; attempts < 10; attempts++) {
     if (!isVoidspawn && cost !== undefined && cost < 999) break; 
     if (isVoidspawn) break; 
     spawnHex = validEnemySpawns[Math.floor(Math.random() * validEnemySpawns.length)];
     tile = state.tiles.get(hexToString(spawnHex));
     cost = costs.get(hexToString(spawnHex));
     isVoidspawn = (tile && tile.terrain === Terrain.Void) || (cost === undefined || cost >= 999);
  }
  
  if (!isVoidspawn && (cost === undefined || cost >= 999)) return;
  const voidC = voidCosts.get(hexToString(spawnHex));
  if (isVoidspawn && (voidC === undefined)) return;

  const pos = getRandomEdgeSpawnPos(spawnHex);

  let hp = 20, speed = 1.5 * HEX_SIZE, damage = 1;
  if (type === MobUnit.Warrior) { hp = 50; speed = 1.0 * HEX_SIZE; damage = 2.5; }
  if (type === MobUnit.Brute) { hp = 150; speed = 0.6 * HEX_SIZE; damage = 7.5; }

  const turn = state.turn;
  hp *= (1 + turn * 0.1);
  damage *= (1 + turn * 0.05);

  if (threatLevel >= 3) {
    const modifier = Math.pow(1.333, threatLevel - 3);
    hp *= modifier;
    damage *= modifier;
  }

  const eId = world.createEntity();
  state.enemies.push({ id: eId, isConverted: false, isVoidspawn });
  world.setComponent(eId, Component.Position, [pos.x, pos.y]);
  world.setComponent(eId, Component.Health, hp);
  world.setComponent(eId, Component.MaxHealth, hp);
  world.setComponent(eId, Component.Speed, speed);
  world.setComponent(eId, Component.Damage, damage);
  world.setComponent(eId, Component.HexPosition, [spawnHex.q, spawnHex.r]);
  world.setComponent(eId, Component.MobType, type);
}

export function spawnReinforcements(state: GameState, world: World, validReinforcementSpawns: Hex[]) {
  if (!validReinforcementSpawns || validReinforcementSpawns.length === 0) return;

  const turn = state.turn;
  const type = MobUnit.Scout;
  const spawnHex = validReinforcementSpawns[Math.floor(Math.random() * validReinforcementSpawns.length)];
  const pos = getRandomEdgeSpawnPos(spawnHex);

  const tile = state.tiles.get(hexToString(spawnHex));
  const isVoidspawn = tile ? tile.terrain === Terrain.Void : false;

  let hp = 20, speed = 1.6 * HEX_SIZE, damage = 2;
  hp *= (1 + turn * 0.1);
  damage *= (1 + turn * 0.05);

  const eId = world.createEntity();
  
  let outpostId: number | undefined;
  if (state.cities.length > 0) {
    outpostId = state.cities[Math.floor(Math.random() * state.cities.length)].id;
  }

  state.enemies.push({ id: eId, isConverted: true, isVoidspawn, outpostId });
  world.setComponent(eId, Component.Position, [pos.x, pos.y]);
  world.setComponent(eId, Component.Health, hp);
  world.setComponent(eId, Component.MaxHealth, hp);
  world.setComponent(eId, Component.Speed, speed);
  world.setComponent(eId, Component.Damage, damage);
  world.setComponent(eId, Component.HexPosition, [spawnHex.q, spawnHex.r]);
  world.setComponent(eId, Component.MobType, type);
}

export function tickSpawns(
  state: GameState, world: World, dt: number, threatLevel: number, 
  validEnemySpawns: Hex[], validReinforcementSpawns: Hex[], 
  costs: Map<string, number>, voidCosts: Map<string, number>, timers: any
) {
  if (state.time >= 400) return;

  const turn = state.turn;
  const wavePhase = state.time % 10;
  
  const comp = getWaveComposition(turn, threatLevel);

  const baseInterval = Math.max(0.2, 1.5 - (turn * 0.02) - (threatLevel * 0.15));
  const baseRate = 1 / baseInterval;
  
  const rateMultiplier = 7.5 * Math.pow(wavePhase, 1.5) * Math.exp(-wavePhase);
  const modulatedRate = baseRate * rateMultiplier;

  state.spawnRates = {
    scout: comp.scout * baseRate,
    warrior: comp.warrior * baseRate,
    brute: comp.brute * baseRate,
    reinforcement: 1 * baseRate
  };

  state.currentSpawnRates = {
    scout: comp.scout * modulatedRate,
    warrior: comp.warrior * modulatedRate,
    brute: comp.brute * modulatedRate,
    reinforcement: modulatedRate
  };

  if (state.currentSpawnRates.scout > 0) {
    timers.scoutSpawnTimer -= state.currentSpawnRates.scout * dt;
    while (timers.scoutSpawnTimer <= 0) {
      timers.scoutSpawnTimer += 1.0;
      spawnEnemy(state, world, MobUnit.Scout, threatLevel, validEnemySpawns, costs, voidCosts);
    }
  } else {
    timers.scoutSpawnTimer = 1.0;
  }

  if (state.currentSpawnRates.warrior > 0) {
    timers.warriorSpawnTimer -= state.currentSpawnRates.warrior * dt;
    while (timers.warriorSpawnTimer <= 0) {
      timers.warriorSpawnTimer += 1.0;
      spawnEnemy(state, world, MobUnit.Warrior, threatLevel, validEnemySpawns, costs, voidCosts);
    }
  } else {
    timers.warriorSpawnTimer = 1.0;
  }

  if (state.currentSpawnRates.brute > 0) {
    timers.bruteSpawnTimer -= state.currentSpawnRates.brute * dt;
    while (timers.bruteSpawnTimer <= 0) {
      timers.bruteSpawnTimer += 1.0;
      spawnEnemy(state, world, MobUnit.Brute, threatLevel, validEnemySpawns, costs, voidCosts);
    }
  } else {
    timers.bruteSpawnTimer = 1.0;
  }

  if (state.currentSpawnRates.reinforcement > 0) {
    timers.reinforcementTimer -= state.currentSpawnRates.reinforcement * dt;
    while (timers.reinforcementTimer <= 0) {
      timers.reinforcementTimer += 1.0;
      spawnReinforcements(state, world, validReinforcementSpawns);
    }
  } else {
    timers.reinforcementTimer = 1.0;
  }
}
