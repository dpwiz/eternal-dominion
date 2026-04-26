import { GameState, Terrain } from '../Types';
import { World, Component } from '../World';
import { Hex, hexToString, hexNeighbor } from '../HexMath';
import { MAP_RADIUS } from '../Const';
import { getHex } from '../helpers/ecs';

export function updateFlowField(state: GameState, world: World, safePoints: Hex[], spawnPoints: Hex[]) {
  const sHexPosition = world.getStore(Component.HexPosition);
  const costs = new Map<string, number>();
  const voidCosts = new Map<string, number>();
  const queue: { hex: Hex, cost: number }[] = [];
  const voidQueue: { hex: Hex, cost: number }[] = [];

  for (const city of state.cities) {
    const key = hexToString(getHex(sHexPosition, city.id)!);
    costs.set(key, 0);
    voidCosts.set(key, 0);
    queue.push({ hex: getHex(sHexPosition, city.id)!, cost: 0 });
    voidQueue.push({ hex: getHex(sHexPosition, city.id)!, cost: 0 });
  }

  // Standard flow field
  while (queue.length > 0) {
    queue.sort((a, b) => b.cost - a.cost);
    const current = queue.pop()!;
    const currentKey = hexToString(current.hex);

    if (current.cost > costs.get(currentKey)!) continue;

    for (let i = 0; i < 6; i++) {
      const neighbor = hexNeighbor(current.hex, i);
      const nKey = hexToString(neighbor);
      const tile = state.tiles.get(nKey);

      if (!tile) continue;

      let enterCost = 1;
      if (tile.improvementLevel === -1) enterCost = 3;
      else if (tile.terrain === Terrain.Void) enterCost = 999;
      else if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) enterCost = 2;
      else if (tile.terrain === Terrain.Mountains) enterCost = 5;

      const currentHex = current.hex || { q: 0, r: 0, s: 0 };
      const neighborHexSafe = neighbor || { q: 0, r: 0, s: 0 };
      const isCurrentEdge = Math.max(Math.abs(currentHex.q), Math.abs(currentHex.r), Math.abs(currentHex.s)) > MAP_RADIUS;
      const isNeighborEdge = Math.max(Math.abs(neighborHexSafe.q), Math.abs(neighborHexSafe.r), Math.abs(neighborHexSafe.s)) > MAP_RADIUS;
      if (isCurrentEdge && isNeighborEdge) {
         enterCost = 99999;
      }

      const newCost = current.cost + enterCost;
      if (!costs.has(nKey) || newCost < costs.get(nKey)!) {
        costs.set(nKey, newCost);
        queue.push({ hex: neighbor, cost: newCost });
      }
    }
  }

  // Voidspawn flow field
  while (voidQueue.length > 0) {
    voidQueue.sort((a, b) => b.cost - a.cost);
    const current = voidQueue.pop()!;
    const currentKey = hexToString(current.hex);

    if (current.cost > voidCosts.get(currentKey)!) continue;

    for (let i = 0; i < 6; i++) {
      const neighbor = hexNeighbor(current.hex, i);
      const nKey = hexToString(neighbor);
      const tile = state.tiles.get(nKey);

      if (!tile) continue;

      let enterCost = 1;
      if (tile.improvementLevel === -1) enterCost = 3;
      else if (tile.terrain === Terrain.Void) enterCost = 1; // Voidwalk
      else if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) enterCost = 2;
      else if (tile.terrain === Terrain.Mountains) enterCost = 2; // Mountainwalk

      const currentHex2 = current.hex || { q: 0, r: 0, s: 0 };
      const neighborHexSafe2 = neighbor || { q: 0, r: 0, s: 0 };
      const isCurrentEdge2 = Math.max(Math.abs(currentHex2.q), Math.abs(currentHex2.r), Math.abs(currentHex2.s)) > MAP_RADIUS;
      const isNeighborEdge2 = Math.max(Math.abs(neighborHexSafe2.q), Math.abs(neighborHexSafe2.r), Math.abs(neighborHexSafe2.s)) > MAP_RADIUS;
      if (isCurrentEdge2 && isNeighborEdge2) {
         enterCost = 99999;
      }

      const newCost = current.cost + enterCost;
      if (!voidCosts.has(nKey) || newCost < voidCosts.get(nKey)!) {
        voidCosts.set(nKey, newCost);
        voidQueue.push({ hex: neighbor, cost: newCost });
      }
    }
  }

  const validReinforcementSpawns = safePoints.filter(hex => {
    const key = hexToString(hex);
    const tile = state.tiles.get(key);
    if (!tile || tile.terrain === Terrain.Void) return false;
    const cost = costs.get(key);
    return cost !== undefined && cost < 999;
  });

  const validEnemySpawns = spawnPoints.filter(hex => {
    const key = hexToString(hex);
    const cost = costs.get(key);
    const voidCost = voidCosts.get(key);
    
    const passableNormally = cost !== undefined && cost < 999;
    const passableAsVoidspawn = voidCost !== undefined;
    
    return passableNormally || passableAsVoidspawn;
  });
  
  return { costs, voidCosts, validReinforcementSpawns, validEnemySpawns };
}

export function getFlowDirection(hex: Hex, costs: Map<string, number>, voidCosts: Map<string, number>, isVoidspawn: boolean = false): { bestNeighbor: Hex, lowestCost: number } | null {
  const map = isVoidspawn ? voidCosts : costs;
  let currentCost = map.get(hexToString(hex));
  if (currentCost === undefined) currentCost = 9999;
  if (currentCost === 0) return null;

  let bestNeighbor = hex;
  let lowestCost = currentCost;

  for (let i = 0; i < 6; i++) {
      const neighbor = hexNeighbor(hex, i);
      const cost = map.get(hexToString(neighbor));
      
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
