import { GameState, Terrain, FriendlyType, FriendlyState, MobUnit } from '../Types';
import { World, Component } from '../World';
import { hexToString, hexToPixel, pixelToHex, hexDistance } from '../HexMath';
import { HEX_SIZE, MAP_RADIUS } from '../Const';
import * as Particles from './particles';
import { getHex, getFriendlySize } from '../helpers/ecs';
import { hasTech, hasFusion } from './tech';

// We just copy the updateCitySizes locally because Engine.updateCombat calls this.updateCitySizes()
function updateCitySizes(state: GameState, world: World) {
  const sHexPosition = world.getStore(Component.HexPosition);
  for (const city of state.cities) {
    let adjCount = 0;
    for (const other of state.cities) {
      if (city.id !== other.id && hexDistance(getHex(sHexPosition, city.id), getHex(sHexPosition, other.id)) === 1) {
        adjCount++;
      }
    }
    city.size = 1 + adjCount;
  }
}

export function updateCombat(state: GameState, world: World, dt: number, costs: Map<string, number>, onFlowFieldUpdate: () => void) {
  const replaceUpdateCitySizes = () => { updateCitySizes(state, world); }; // proxy
  // Replace references
      const sHealth = world.getStore(Component.Health);
    const sMaxHealth = world.getStore(Component.MaxHealth);
    const sSpeed = world.getStore(Component.Speed);
    const sDamage = world.getStore(Component.Damage);

    const sHexPosition = world.getStore(Component.HexPosition);
    const sMobType = world.getStore(Component.MobType);
    const sFriendlyType = world.getStore(Component.FriendlyType);
    const sFriendlyState = world.getStore(Component.FriendlyState);

    const sPosition = world.getStore(Component.Position);

    updateCitySizes(state, world);
    const dmgMult = (hasTech(state, 'BronzeWorking') ? 1.3 : 1.0) * 1.2;

    for (const city of state.cities) {
      let cityHp = sHealth.get(city.id, 0);
      if (cityHp > 0) {
        if (hasTech(state, 'Irrigation')) {
          const regen = hasFusion(state, 'Aqueducts') ? 15 : 5;
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
    for (const city of state.cities) {
      const tile = state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));
      const targetDefenders = Math.min(6, city.size);
      let currentDefenders = 0;
      let currentCavalry = 0;
      let currentArchers = 0;
      let currentMystics = 0;
      
      for (const unit of state.friendlyUnits) {
        if (unit.cityId === city.id) {
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Guard) currentDefenders++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) currentCavalry++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) currentArchers++;
          if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) currentMystics++;
        }
      }
      
      if (currentDefenders < targetDefenders) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = world.createEntity();
        state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          targetId: null,
          angle: Math.random() * Math.PI * 2
        });
        world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        world.setComponent(uId, Component.Health, 50);
        world.setComponent(uId, Component.MaxHealth, 50);
        world.setComponent(uId, Component.FriendlyType, FriendlyType.Guard);
        world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetCavalry = 0;
      if (tile?.terrain === Terrain.Plains) {
        if (hasTech(state, 'HorsebackRiding')) targetCavalry += 1;
        if (hasTech(state, 'AnimalHusbandry')) targetCavalry += 1;
        if (hasFusion(state, 'WarChariots')) targetCavalry += 1;
      }
      if (currentCavalry < targetCavalry) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = world.createEntity();
        state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          cavalryIndex: currentCavalry,
          targetId: null,
          angle: Math.random() * Math.PI * 2
        });
        world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        world.setComponent(uId, Component.Health, 100);
        world.setComponent(uId, Component.MaxHealth, 100);
        world.setComponent(uId, Component.FriendlyType, FriendlyType.Cavalry);
        world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetArchers = 0;
      if (tile?.terrain === Terrain.Hills) {
         if (hasTech(state, 'Archery')) targetArchers += 1;
         if (hasTech(state, 'Crossbows')) targetArchers += 1;
         if (hasFusion(state, 'MountainFortress')) targetArchers += 1;
      }
      if (currentArchers < targetArchers) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = world.createEntity();
        state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          archerIndex: currentArchers,
          targetId: null,
          angle: Math.random() * Math.PI * 2,
          cooldown: 0
        });
        world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        world.setComponent(uId, Component.Health, 50);
        world.setComponent(uId, Component.MaxHealth, 50);
        world.setComponent(uId, Component.FriendlyType, FriendlyType.Archer);
        world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }

      let targetMystics = 0;
      if (tile?.terrain === Terrain.Forest) {
         if (hasTech(state, 'Mysticism')) targetMystics = 1;
      }
      if (currentMystics < targetMystics) {
        const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
        const uId = world.createEntity();
        state.friendlyUnits.push({
          id: uId,
          cityId: city.id,
          
          mysticIndex: currentMystics,
          targetId: null,
          
          angle: Math.random() * Math.PI * 2,
          cooldown: 0
        });
        world.setComponent(uId, Component.Position, [pos.x, pos.y]);
        world.setComponent(uId, Component.Health, 50);
        world.setComponent(uId, Component.MaxHealth, 50);
        world.setComponent(uId, Component.FriendlyType, FriendlyType.Mystic);
        world.setComponent(uId, Component.FriendlyState, FriendlyState.Idle);
      }
    }

    // Update friendly units
    state.friendlyUnits = state.friendlyUnits.filter(unit => {
      const city = state.cities.find(c => c.id === unit.cityId);
      if (!city) { world.destroyEntity(unit.id); return false; }

      const cityPos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
      const tile = state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));

      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) {
        unit.cooldown = (unit.cooldown || 0) - dt;
        if (unit.cooldown <= 0) {
          unit.cooldown = hasTech(state, 'Archery') ? 1.5 : 2.5;
          let range = 1;
          if (hasTech(state, 'Crossbows')) range += 1;
          if (hasFusion(state, 'MountainFortress')) range += 1;
          const archDmg = 50;

          let farthest: import('../Types').Enemy | null = null;
          let maxDist = -1;
          for (const enemy of state.enemies) {
            if (enemy.isConverted) continue;
            const dist = hexDistance(getHex(sHexPosition, city.id)!, getHex(sHexPosition, enemy.id)!);
            if (dist <= range && dist > maxDist) {
              maxDist = dist;
              farthest = enemy;
            }
          }
          if (farthest) {
            const pId = world.createEntity();
            state.projectiles.push({
              id: pId,
              targetId: farthest.id
            });
            world.setComponent(pId, Component.Damage, archDmg);
            world.setComponent(pId, Component.Speed, 250);
            world.setComponent(pId, Component.Position, [sPosition.get(unit.id, 0), sPosition.get(unit.id, 1)]);
          }
        }
        
        let orbitOffset = (unit.archerIndex || 0) * (Math.PI * 2 / 3);
        unit.angle += dt * 0.5;
        const targetX = cityPos.x + Math.cos(unit.angle + orbitOffset) * 8;
        const targetY = cityPos.y + Math.sin(unit.angle + orbitOffset) * 8;
        
        const nextX = sPosition.get(unit.id, 0) + (targetX - sPosition.get(unit.id, 0)) * 5 * dt;
        const nextY = sPosition.get(unit.id, 1) + (targetY - sPosition.get(unit.id, 1)) * 5 * dt;
        const nextTile = state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
        if (!(nextTile && nextTile.terrain === Terrain.Void)) {
            sPosition.set(unit.id, nextX, 0);
            sPosition.set(unit.id, nextY, 1);
        }

        return true;
      }

      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) {
        unit.cooldown = (unit.cooldown || 0) - dt;
        if (unit.cooldown <= 0) {
          unit.cooldown = hasTech(state, 'Animism') ? 3 : 5;
          const baseRadius = 1;
          let range = baseRadius;
          if (hasTech(state, 'Animism')) range += 1;
          if (hasFusion(state, 'Theology')) range += 1;
          
          const convertChance = hasFusion(state, 'Theology') ? (hasTech(state, 'Animism') ? 0.2 : 0.1) : 0;
          let convertedOne = false;
          const baseDamage = hasTech(state, 'Animism') ? 100 : 50;
          
          const cityPx = { x: sPosition.get(city.id, 0), y: sPosition.get(city.id, 1) };
          // HEX_SIZE is centre-to-vertex; centre-to-centre between adjacent hexes is HEX_SIZE * sqrt(3).
          const ringPx = HEX_SIZE * Math.sqrt(3);
          const innerPx = baseRadius * ringPx;
          const outerPx = range * ringPx;

          for (const enemy of state.enemies) {
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
            Particles.spawnSparks(state, sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), sMobType.get(enemy.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 8);
            Particles.spawnSparks(state, sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), '#a855f7', 5);
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
        const nextTile = state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
        if (!(nextTile && nextTile.terrain === Terrain.Void)) {
            sPosition.set(unit.id, nextX, 0);
            sPosition.set(unit.id, nextY, 1);
        }

        return true;
      }

      const isCavalry = sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry;
      const hillBonus = (hasTech(state, 'Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
      const damage = (isCavalry ? (hasFusion(state, 'WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
      const speed = (isCavalry ? (hasFusion(state, 'WarChariots') ? 3.0 : 2.0) : 1.0) * HEX_SIZE;

      const unitTile = state.tiles.get(hexToString(pixelToHex(sPosition.get(unit.id, 0), sPosition.get(unit.id, 1), HEX_SIZE)));
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
        const target = state.enemies.find(e => e.id === unit.targetId);
        if (target) {
          const dx = sPosition.get(target.id, 0) - sPosition.get(unit.id, 0);
          const dy = sPosition.get(target.id, 1) - sPosition.get(unit.id, 1);
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            const nextX = sPosition.get(unit.id, 0) + (dx / dist) * actualSpeed * dt;
            const nextY = sPosition.get(unit.id, 1) + (dy / dist) * actualSpeed * dt;
            const nextHex = pixelToHex(nextX, nextY, HEX_SIZE);
            const nextTile = state.tiles.get(hexToString(nextHex));
            
            if (nextTile && nextTile.terrain === Terrain.Void) {
               unit.targetId = null;
            } else {
               sPosition.set(unit.id, nextX, 0);
               sPosition.set(unit.id, nextY, 1);
            }
          } else {
            // Physical reach - deal damage
            sHealth.set(target.id, sHealth.get(target.id, 0) - (damage * dt), 0);
            target.engagedSlots = (target.engagedSlots || 0) + getFriendlySize(unit, world, state);
            if (Math.random() < dt * 10) Particles.spawnSparks(state, sPosition.get(target.id, 0), sPosition.get(target.id, 1), sMobType.get(target.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 1);
            // Target deals damage back to guard (feedback)
            sHealth.set(unit.id, sHealth.get(unit.id, 0) - (sDamage.get(target.id, 0) * 0.5 * dt), 0);
            if (Math.random() < dt * 10) Particles.spawnSparks(state, sPosition.get(unit.id, 0), sPosition.get(unit.id, 1), isCavalry ? '#22c55e' : '#4287f5', 1);
      if (sHealth.get(unit.id, 0) <= 0) { world.destroyEntity(unit.id); return false; }
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
          if (hasTech(state, 'HorsebackRiding')) orbitDist += 2;
          if (hasTech(state, 'AnimalHusbandry')) orbitDist += 1;
          if (hasFusion(state, 'WarChariots')) orbitDist += 1;
          orbitRadius = (orbitDist * Math.sqrt(3)/2 + 0.5) * HEX_SIZE;
        }
        
        if (dist > orbitRadius + HEX_SIZE * 0.5) {
          sFriendlyState.set(unit.id, FriendlyState.Returning, 0);
          const nextX = sPosition.get(unit.id, 0) + (dx / dist) * actualSpeed * dt;
          const nextY = sPosition.get(unit.id, 1) + (dy / dist) * actualSpeed * dt;
          const nextTile = state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
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
            unit.angle += dt * (hasFusion(state, 'WarChariots') ? 1.5 : 1.0);
            
            const targetX = cityPos.x + Math.cos(unit.angle) * orbitRadius;
            const targetY = cityPos.y + Math.sin(unit.angle) * orbitRadius;
            
            const mdx = targetX - sPosition.get(unit.id, 0);
            const mdy = targetY - sPosition.get(unit.id, 1);
            const mdist = Math.hypot(mdx, mdy);
            if (mdist > 0) {
              const moveDist = Math.min(mdist, actualSpeed * dt);
              const nextX = sPosition.get(unit.id, 0) + (mdx / mdist) * moveDist;
              const nextY = sPosition.get(unit.id, 1) + (mdy / mdist) * moveDist;
              const nextTile = state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
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
            const nextTile = state.tiles.get(hexToString(pixelToHex(nextX, nextY, HEX_SIZE)));
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
    state.projectiles = state.projectiles.filter(p => {
      const target = state.enemies.find(e => e.id === p.targetId);
      if (!target) {
        world.destroyEntity(p.id);
        return false;
      }
      const dx = sPosition.get(target.id, 0) - sPosition.get(p.id, 0);
      const dy = sPosition.get(target.id, 1) - sPosition.get(p.id, 1);
      const dist = Math.hypot(dx, dy);
      if (dist < 5) {
        sHealth.set(target.id, sHealth.get(target.id, 0) - (sDamage.get(p.id, 0)), 0);
        Particles.spawnSparks(state, sPosition.get(target.id, 0), sPosition.get(target.id, 1), sMobType.get(target.id, 0) === MobUnit.Brute ? '#8b0000' : '#ff0000', 5);
        world.destroyEntity(p.id);
        return false;
      }
      sPosition.set(p.id, sPosition.get(p.id, 0) + ((dx / dist) * sSpeed.get(p.id, 0) * dt), 0);
      sPosition.set(p.id, sPosition.get(p.id, 1) + ((dy / dist) * sSpeed.get(p.id, 0) * dt), 1);

      return true;
    });

    const cityPatrolDamage = new Map<number, number>();
    for (const city of state.cities) { cityPatrolDamage.set(city.id, 0); }
    for (const unit of state.friendlyUnits) {
      if (sFriendlyState.get(unit.id, 0) === FriendlyState.Idle || sFriendlyState.get(unit.id, 0) === FriendlyState.Healing) {
        const city = state.cities.find(c => c.id === unit.cityId);
        if (!city) continue;
        const tile = state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));
        const isCavalry = sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry;
        const hillBonus = (hasTech(state, 'Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
        const damage = (isCavalry ? (hasFusion(state, 'WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
        cityPatrolDamage.set(unit.cityId, (cityPatrolDamage.get(unit.cityId) || 0) + damage);
      }
    }

    for (const enemy of state.enemies) {
      if (enemy.isConverted) continue;
      const cost = costs.get(hexToString(getHex(sHexPosition, enemy.id)!));
      if (cost === 0) {
        const city = state.cities.find(c => hexToString(getHex(sHexPosition, c.id)!) === hexToString(getHex(sHexPosition, enemy.id)!));
        if (city) {
          const armor = hasTech(state, 'Masonry') ? (hasFusion(state, 'Aqueducts') ? 3 : 1) : 0;
          const dmg = Math.max(1, sDamage.get(enemy.id, 0) - armor) * dt;
          sHealth.set(city.id, Math.max(0, sHealth.get(city.id, 0) - dmg), 0);
          city.timeSinceLastDamage = 0;
          
          const patrolDmg = cityPatrolDamage.get(city.id) || 0;
          if (patrolDmg > 0) {
            sHealth.set(enemy.id, sHealth.get(enemy.id, 0) - (patrolDmg * 0.5 * dt), 0); // Patrol feedback damage
            if (Math.random() < dt * 10) Particles.spawnSparks(state, sPosition.get(enemy.id, 0), sPosition.get(enemy.id, 1), '#ffffff', 1);
          }

          const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
          if (Math.random() < dt * 10) Particles.spawnSparks(state, pos.x, pos.y, '#ffffff', 1);
        }
      }
    }

    const xpMult = hasTech(state, 'Writing') ? 1.25 : 1.0;
    state.enemies = state.enemies.filter(e => {
      if (sHealth.get(e.id, 0) <= 0) {
        const xpGain = (sMaxHealth.get(e.id, 0) * 0.1) * xpMult;
        state.xp += xpGain;
        state.stats.cumulativeXp += xpGain;
        state.stats.threatsKilled++;
        world.destroyEntity(e.id);
        return false;
      }

      return true;
    });

    const initialCities = state.cities.length;
    state.cities = state.cities.filter(c => {
        if (sHealth.get(c.id, 0) <= 0) { world.destroyEntity(c.id); return false; }
        return true;
    });
    if (state.cities.length < initialCities) {
      state.stats.citiesLost += (initialCities - state.cities.length);
      for (const tile of state.tiles.values()) {
        if (tile.improvementLevel === 2) {
          const hasCity = state.cities.some(c => hexToString(getHex(sHexPosition, c.id)!) === hexToString(tile.hex));
          if (!hasCity) {
            tile.improvementLevel = -1;
          }
        }
      }
      onFlowFieldUpdate();
    }

    if (state.cities.length === 0 && state.phase === 'PLAYING') {
      state.phase = 'GAME_OVER';
    }
}
