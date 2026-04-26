import { GameState, Terrain, FriendlyType } from '../Types';
import { World, Component } from '../World';
import { hexToString, hexDistance } from '../HexMath';
import { getHex, getEnemySize, getFriendlySize } from '../helpers/ecs';
import { hasTech, hasFusion } from './tech';

export function assignTargets(state: GameState, world: World, costs: Map<string, number>) {
  const sHexPosition = world.getStore(Component.HexPosition);
  const sMobType = world.getStore(Component.MobType);
  const sFriendlyType = world.getStore(Component.FriendlyType);

  const sPosition = world.getStore(Component.Position);
  const hostiles = state.enemies.filter(e => !e.isConverted);
  const hostileSlots = new Map<number, number>();
  const onOutpost = new Map<number, boolean>();

  for (const e of hostiles) {
      hostileSlots.set(e.id, 0);
      onOutpost.set(e.id, costs.get(hexToString(getHex(sHexPosition, e.id)!)) === 0);
  }

  interface Attacker {
      id: number; type: 'friendly'|'converted'; size: number;
      x: number; y: number; cityId?: number; entity: any;
  }
  const attackers: Attacker[] = [];
  for (const e of state.enemies) if (e.isConverted) attackers.push({ id: e.id, type: 'converted', size: getEnemySize(sMobType.get(e.id, 0)), x: sPosition.get(e.id, 0), y: sPosition.get(e.id, 1), entity: e });
  for (const u of state.friendlyUnits) {
     if (sFriendlyType.get(u.id, 0) === FriendlyType.Archer || sFriendlyType.get(u.id, 0) === FriendlyType.Mystic) continue;
     attackers.push({ id: u.id, type: 'friendly', size: getFriendlySize(u, world, state), x: sPosition.get(u.id, 0), y: sPosition.get(u.id, 1), cityId: u.cityId, entity: u });
  }

  attackers.sort((a,b) => b.size - a.size);

  const baseRadius = 1;

  for (const att of attackers) {
      let bestTarget: import('../Types').Enemy | null = null;
      let bestDist = Infinity;
      
      const attIsVoidspawn = att.type === 'converted' && att.entity.isVoidspawn;

      // 1. Same size (duel)
      for (const h of hostiles) {
          const hTile = state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
          const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
          if (isTargetInaccessible) continue;

          const hSize = getEnemySize(sMobType.get(h.id, 0));
          const filled = hostileSlots.get(h.id)!;
          if (hSize === att.size && hSize - filled >= att.size) {
              if (att.type === 'friendly') {
                  const city = state.cities.find(c => c.id === att.cityId);
                  let range = baseRadius;
                  if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                     if (hasTech(state, 'HorsebackRiding')) range += 2;
                     if (hasTech(state, 'AnimalHusbandry')) range += 1;
                     if (hasFusion(state, 'WarChariots')) range += 1;
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
              const hTile = state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
              const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
              if (isTargetInaccessible) continue;

              const hSize = getEnemySize(sMobType.get(h.id, 0));
              const filled = hostileSlots.get(h.id)!;
              if (hSize > att.size && hSize - filled >= att.size) {
                  if (att.type === 'friendly') {
                      const city = state.cities.find(c => c.id === att.cityId);
                      let range = baseRadius;
                      if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                         if (hasTech(state, 'HorsebackRiding')) range += 2;
                         if (hasTech(state, 'AnimalHusbandry')) range += 1;
                         if (hasFusion(state, 'WarChariots')) range += 1;
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
              const hTile = state.tiles.get(hexToString(getHex(sHexPosition, h.id)!));
              const isTargetInaccessible = (!hTile || hTile.terrain === Terrain.Void) && !attIsVoidspawn;
              if (isTargetInaccessible) continue;

              const hSize = getEnemySize(sMobType.get(h.id, 0));
              const filled = hostileSlots.get(h.id)!;
              // If it has NO attackers right now, we can overkill it. 
              // Or if we just don't care because everyone else is busy!
              if (hSize < att.size && filled === 0) {
                  if (att.type === 'friendly') {
                      const city = state.cities.find(c => c.id === att.cityId);
                      let range = baseRadius;
                      if (att.type === 'friendly' && sFriendlyType.get(att.id, 0) === FriendlyType.Cavalry) {
                         if (hasTech(state, 'HorsebackRiding')) range += 2;
                         if (hasTech(state, 'AnimalHusbandry')) range += 1;
                         if (hasFusion(state, 'WarChariots')) range += 1;
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
