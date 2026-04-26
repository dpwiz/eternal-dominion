import { GameState, EngineerState } from '../Types';
import { World, Component } from '../World';
import { hexNeighbor, hexToString, hexToPixel, pixelToHex, hexDistance } from '../HexMath';
import { getHex, setHex } from '../helpers/ecs';
import { HEX_SIZE } from '../Const';
import * as Particles from './particles';

export function tick(state: GameState, world: World, dt: number) {
  const sHexPosition = world.getStore(Component.HexPosition);
  const sTargetHex = world.getStore(Component.TargetHex);
  const sEngineerState = world.getStore(Component.EngineerState);

  const sPosition = world.getStore(Component.Position);

  if (state.focusedHex && state.phase === 'PLAYING') {
    const targetHex = state.focusedHex;
    
    const adjCandidates: import('../HexMath').Hex[] = [];
    for (let i = 0; i < 6; i++) {
      const nHex = hexNeighbor(targetHex, i);
      const nTile = state.tiles.get(hexToString(nHex));
      if (nTile && (nTile.improvementLevel || 0) >= 2) {
        adjCandidates.push(nHex);
      }
    }

    if (adjCandidates.length === 0) {
      let minDist = Infinity;
      let closestCity: import('../Types').City | null = null;
      for (const city of state.cities) {
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

    while (state.engineers.length < 4 && adjCandidates.length > 0) {
      // Pick a random adjacent candidate to spawn from
      const candHex = adjCandidates[Math.floor(Math.random() * adjCandidates.length)];
      const pos = hexToPixel(candHex, HEX_SIZE);
      const engId = world.createEntity();
      state.engineers.push({
        id: engId,
        workTimer: Math.random(), // Stagger work timers
        offsetX: 0,
        offsetY: 0
      });
      world.setComponent(engId, Component.Position, [pos.x, pos.y]);
      world.setComponent(engId, Component.EngineerState, EngineerState.MovingToWork);
      world.setComponent(engId, Component.TargetHex, [state.focusedHex.q, state.focusedHex.r]);
      world.setComponent(engId, Component.HomeHex, [candHex.q, candHex.r]);
      world.setComponent(engId, Component.HexPosition, [candHex.q, candHex.r]);
    }
    
    for (const eng of state.engineers) {
       const currentTarget = getHex(sTargetHex, eng.id);
       if (!currentTarget || hexToString(currentTarget) !== hexToString(state.focusedHex)) {
         if (state.focusedHex) {
             world.setComponent(eng.id, Component.TargetHex, [state.focusedHex.q, state.focusedHex.r]);
         }
         sEngineerState.set(eng.id, EngineerState.MovingToWork, 0);
       }
    }
  } else {
    for (const eng of state.engineers) {
      if (sEngineerState.get(eng.id, 0) !== EngineerState.Returning) {
        sEngineerState.set(eng.id, EngineerState.Returning, 0);
      }
    }
  }

  const speed = 40;
  state.engineers = state.engineers.filter(eng => {
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
         const xpMult = state.techs.includes('Writing') ? 1.25 : 1.0;
         const xpGain = 1 * xpMult;
         state.xp += xpGain;
         state.stats.cumulativeXp += xpGain;
         Particles.spawnSparks(state, sPosition.get(eng.id, 0), sPosition.get(eng.id, 1), '#aaaaaa', 2);
      }
    } else if (sEngineerState.get(eng.id, 0) === EngineerState.Returning) {
      let closestPos: { x: number, y: number } | null = null;
      let minDist = Infinity;
      
      if (currentTarget) {
        const tHex = currentTarget;
        for (let i = 0; i < 6; i++) {
          const nHex = hexNeighbor(tHex, i);
          const nTile = state.tiles.get(hexToString(nHex));
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
         for (const city of state.cities) {
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
          world.destroyEntity(eng.id);
          return false; // Remove engineer
        }
      } else {
          world.destroyEntity(eng.id);
          return false; // Remove engineer
      }
    }
    const hex = pixelToHex(sPosition.get(eng.id, 0), sPosition.get(eng.id, 1), HEX_SIZE);
    setHex(sHexPosition, eng.id, hex);
    return true; // Keep engineer
  });
}
