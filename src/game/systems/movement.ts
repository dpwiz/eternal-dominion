import { GameState, Terrain, MobUnit } from '../Types';
import { World, Component } from '../World';
import { hexToString, hexToPixel, pixelToHex } from '../HexMath';
import { HEX_SIZE } from '../Const';
import * as Flow from './flow';
import * as Particles from './particles';
import { getEnemySize } from '../helpers/ecs';

export function updateEnemies(state: GameState, world: World, dt: number, costs: Map<string, number>, voidCosts: Map<string, number>) {
  const sPosition = world.getStore(Component.Position);
  const sHexPosition = world.getStore(Component.HexPosition);
  const sSpeed = world.getStore(Component.Speed);
  const sHealth = world.getStore(Component.Health);
  const sDamage = world.getStore(Component.Damage);
  const sMobType = world.getStore(Component.MobType);

  for (const enemy of state.enemies) {
    const enemyType: MobUnit = sMobType.get(enemy.id, 0);
    let speed = sSpeed.get(enemy.id, 0);
    // Backward compatibility for existing saves with very slow unmultiplied speeds
    if (speed > 0 && speed < 5) {
      speed *= HEX_SIZE;
      sSpeed.set(enemy.id, speed, 0);
    }

    const isVoidspawn = !!enemy.isVoidspawn;

    const currentX = sPosition.get(enemy.id, 0);
    const currentY = sPosition.get(enemy.id, 1);
    const currentHex = pixelToHex(currentX, currentY, HEX_SIZE);

    if (enemy.isConverted) {
      if (enemy.targetId) {
        const targetX = sPosition.get(enemy.targetId, 0);
        const targetY = sPosition.get(enemy.targetId, 1);
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          const nextX = currentX + (dx / dist) * speed * dt;
          const nextY = currentY + (dy / dist) * speed * dt;
          const nextHex = pixelToHex(nextX, nextY, HEX_SIZE);
          const nextTile = state.tiles.get(hexToString(nextHex));
          if (nextTile && nextTile.terrain === Terrain.Void && !isVoidspawn) {
            enemy.targetId = null; // can't chase
          } else {
            sPosition.set(enemy.id, nextX, 0);
            sPosition.set(enemy.id, nextY, 1);
            sHexPosition.set(enemy.id, nextHex.q, 0);
            sHexPosition.set(enemy.id, nextHex.r, 1);
          }
        } else {
          // Combat
          sHealth.set(enemy.targetId, sHealth.get(enemy.targetId, 0) - sDamage.get(enemy.id, 0) * dt, 0);
          sHealth.set(enemy.id, sHealth.get(enemy.id, 0) - sDamage.get(enemy.targetId, 0) * 0.5 * dt, 0);
          const target = state.enemies.find(e => e.id === enemy.targetId);
          if (target) {
            target.engagedSlots = (target.engagedSlots || 0) + getEnemySize(enemyType);
            if (Math.random() < dt * 10) Particles.spawnSparks(state, sPosition.get(enemy.targetId, 0), sPosition.get(enemy.targetId, 1), sMobType.get(enemy.targetId, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 1);
          }
          if (Math.random() < dt * 5) Particles.spawnSparks(state, sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), sMobType.get(enemy.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 1);
        }
      } else {
        let city = state.cities.find(c => c.id === enemy.outpostId);
        if (!city && state.cities.length > 0) {
          city = state.cities[Math.floor(Math.random() * state.cities.length)];
          enemy.outpostId = city.id;
        }

        if (city) {
          const targetX = sPosition.get(city.id, 0);
          const targetY = sPosition.get(city.id, 1);
          const dx = targetX - currentX;
          const dy = targetY - currentY;
          const dist = Math.hypot(dx, dy);
          if (dist > HEX_SIZE) {
            const nextX = currentX + (dx / dist) * speed * dt;
            const nextY = currentY + (dy / dist) * speed * dt;
            const nextHex = pixelToHex(nextX, nextY, HEX_SIZE);
            const nextTile = state.tiles.get(hexToString(nextHex));
            if (!(nextTile && nextTile.terrain === Terrain.Void && !isVoidspawn)) {
               sPosition.set(enemy.id, nextX, 0);
               sPosition.set(enemy.id, nextY, 1);
               sHexPosition.set(enemy.id, nextHex.q, 0);
               sHexPosition.set(enemy.id, nextHex.r, 1);
            }
          }
        }
      }
      continue;
    }

    // Normal Hostiles follow flow field
    if (enemy.engagedSlots && enemy.engagedSlots > 0) {
      const hostileSize = getEnemySize(enemyType);
      const speedMultiplier = Math.max(0, 1 - enemy.engagedSlots / hostileSize);
      enemy.engagedSlots = 0; // consume the flag
      if (speedMultiplier === 0) continue; // skip movement this frame to lock into melee
      speed *= speedMultiplier; // slow down proportionally
    }
    const flow = Flow.getFlowDirection(currentHex, costs, voidCosts, isVoidspawn);
    if (flow) {
      const targetPos = hexToPixel(flow.bestNeighbor, HEX_SIZE);
      const dx = targetPos.x - currentX;
      const dy = targetPos.y - currentY;
      const dist = Math.hypot(dx, dy);

      if (dist > 5) {
        // terrain
        let unitTerrainCost = 1;
        const tile = state.tiles.get(hexToString(currentHex));
        if (tile) {
           if (tile.improvementLevel === -1) unitTerrainCost = 3;
           else if (tile.terrain === Terrain.Void && !isVoidspawn) unitTerrainCost = 999;
           else if (tile.terrain === Terrain.Void && isVoidspawn) unitTerrainCost = 1;
           else if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) unitTerrainCost = 2;
           else if (tile.terrain === Terrain.Mountains) unitTerrainCost = (isVoidspawn ? 2 : 5);
        }

        const actualSpeed = speed / unitTerrainCost;
        const moveDist = Math.min(dist, actualSpeed * dt);
        const nextX = currentX + (dx / dist) * moveDist;
        const nextY = currentY + (dy / dist) * moveDist;
        sPosition.set(enemy.id, nextX, 0);
        sPosition.set(enemy.id, nextY, 1);

        const newHex = pixelToHex(nextX, nextY, HEX_SIZE);
        sHexPosition.set(enemy.id, newHex.q, 0);
        sHexPosition.set(enemy.id, newHex.r, 1);
      }
    }
  }
}
