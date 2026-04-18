import { Hex, hexDistance, hexNeighbor, hexToString, hexToPixel, pixelToHex, hexRound } from './HexMath';
import { GameState, Terrain, Enemy, Tech } from './Types';
import { ALL_TECHS, FUSIONS } from './Content';

export const HEX_SIZE = 20;
export const MAP_RADIUS = 12;

export function getWaveEnemies(turn: number, threatLevel: number): ('Scout' | 'Warrior' | 'Brute')[] {
  const effectiveTurn = turn + (threatLevel * 5);
  if (effectiveTurn > 35) return ['Brute'];
  if (effectiveTurn > 30) return ['Warrior', 'Brute'];
  if (effectiveTurn > 20) return ['Scout', 'Warrior', 'Brute'];
  if (effectiveTurn > 10) return ['Scout', 'Warrior'];
  return ['Scout'];
}

export function getWaveEnemiesText(turn: number, threatLevel: number): string {
  const effectiveTurn = turn + (threatLevel * 5);
  if (effectiveTurn > 35) return 'Massive Brute Swarm';
  if (effectiveTurn > 30) return 'Warriors, Brutes';
  if (effectiveTurn > 20) return 'Scouts, Warriors, Brutes';
  if (effectiveTurn > 10) return 'Scouts, Warriors';
  return 'Scouts';
}

export class GameEngine {
  state: GameState;
  costs: Map<string, number> = new Map();
  spawnPoints: Hex[] = [];
  safePoints: Hex[] = [];
  onStateChange?: (state: GameState) => void;
  spawnTimer = 0;
  reinforcementTimer = 0;
  currentSpawnRate = 0;
  threatLevel: number;
  safeEdges: boolean[];

  constructor(threatLevel: number = 0, safeEdges: boolean[] = [false, false, false, false, false, false]) {
    this.threatLevel = threatLevel;
    this.safeEdges = safeEdges;
    this.state = this.getInitialState();
    this.generateMap();
  }

  getInitialState(): GameState {
    return {
      tiles: new Map(),
      cities: [],
      enemies: [],
      friendlyUnits: [],
      projectiles: [],
      particles: [],
      techs: [],
      fusions: [],
      turn: 1,
      time: 0,
      spawnRate: 0,
      xp: 0,
      level: 1,
      xpToNext: 100,
      phase: 'START',
      availableCities: 1,
      pendingTechPicks: [],
      stats: { threatsKilled: 0, citiesLost: 0, cumulativeXp: 0 }
    };
  }

  generateMap() {
    this.spawnPoints = [];
    this.safePoints = [];
    const _hexDirections = [
      { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
      { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
    ];

    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      for (let r = Math.max(-MAP_RADIUS, -q - MAP_RADIUS); r <= Math.min(MAP_RADIUS, -q + MAP_RADIUS); r++) {
        const s = -q - r;
        const hex = { q, r, s };
        
        const isEdge = Math.abs(q) === MAP_RADIUS || Math.abs(r) === MAP_RADIUS || Math.abs(s) === MAP_RADIUS;
        
        let terrain = Terrain.Plains;
        const rand = Math.random();
        if (rand < 0.05) terrain = Terrain.Mountains;
        else if (rand < 0.20) terrain = Terrain.Hills;
        else if (rand < 0.40) terrain = Terrain.Forest;

        let borderType: 'safe' | 'threat' | undefined = undefined;

        if (isEdge) {
          const dots = _hexDirections.map(d => d.q * q + d.r * r + d.s * s);
          const maxDot = Math.max(...dots);
          
          let isSafe = false;
          for (let i = 0; i < 6; i++) {
             if (dots[i] === maxDot && this.safeEdges[i]) {
                isSafe = true;
             }
          }

          if (isSafe) {
             borderType = 'safe';
             this.safePoints.push(hex);
          } else {
             borderType = 'threat';
             this.spawnPoints.push(hex);
          }
        }

        this.state.tiles.set(hexToString(hex), { hex, terrain, borderType });
      }
    }
  }

  placeCity(hex: Hex) {
    if (this.state.availableCities <= 0) return false;
    const key = hexToString(hex);
    const tile = this.state.tiles.get(key);
    if (!tile || tile.terrain === Terrain.Mountains) return false;

    for (const city of this.state.cities) {
      if (hexDistance(city.hex, hex) < 3) return false;
    }

    let maxHp = 100;
    if (this.hasTech('Pottery')) maxHp += 50;
    if (this.hasTech('Masonry')) maxHp += 50;

    const cityId = Math.random().toString();
    this.state.cities.push({
      id: cityId,
      hex,
      hp: maxHp,
      maxHp,
      archeryCooldown: 0,
      mysticismCooldown: 0,
      timeSinceLastDamage: 0,
      size: 1
    });

    this.state.availableCities--;
    if (this.state.phase === 'START') {
      this.state.phase = 'PLAYING';
    }
    this.updateFlowField();
    this.notify(true);
    return true;
  }

  hasTech(id: string) { return this.state.techs.includes(id); }
  hasFusion(id: string) { return this.state.fusions.includes(id); }

  getEnemySize(type: 'Scout' | 'Warrior' | 'Brute'): number {
    return type === 'Scout' ? 1 : (type === 'Warrior' ? 2 : 4);
  }

  getFriendlySize(unit: import('./Types').FriendlyUnit): number {
    if (unit.type === 'guard') return 2;
    if (unit.type === 'cavalry') {
      const idx = unit.cavalryIndex ?? 0;
      return idx + 1 + (this.hasFusion('WarChariots') ? 1 : 0);
    }
    return 1;
  }

  assignTargets() {
    const hostiles = this.state.enemies.filter(e => !e.isConverted);
    const hostileSlots = new Map<string, number>();
    const onOutpost = new Map<string, boolean>();

    for (const e of hostiles) {
        hostileSlots.set(e.id, 0);
        onOutpost.set(e.id, this.costs.get(hexToString(e.hex)) === 0);
    }

    interface Attacker {
        id: string; type: 'friendly'|'converted'; size: number;
        x: number; y: number; cityId?: string; entity: any;
    }
    const attackers: Attacker[] = [];
    for (const e of this.state.enemies) if (e.isConverted) attackers.push({ id: e.id, type: 'converted', size: this.getEnemySize(e.type), x: e.x, y: e.y, entity: e });
    for (const u of this.state.friendlyUnits) attackers.push({ id: u.id, type: 'friendly', size: this.getFriendlySize(u), x: u.x, y: u.y, cityId: u.cityId, entity: u });

    attackers.sort((a,b) => b.size - a.size);

    const baseRadius = this.hasTech('Exploration') ? 4 : 2;

    for (const att of attackers) {
        let bestTarget: import('./Types').Enemy | null = null;
        let bestDist = Infinity;

        // 1. Same size (duel)
        for (const h of hostiles) {
            const hSize = this.getEnemySize(h.type);
            const filled = hostileSlots.get(h.id)!;
            if (hSize === att.size && hSize - filled >= att.size) {
                if (att.type === 'friendly') {
                    const city = this.state.cities.find(c => c.id === att.cityId);
                    if (city && !onOutpost.get(h.id) && hexDistance(city.hex, h.hex) > baseRadius) continue;
                }
                const dist = Math.hypot(h.x - att.x, h.y - att.y);
                if (dist < bestDist) { bestDist = dist; bestTarget = h; }
            }
        }

        // 2. Larger size (harass)
        if (!bestTarget) {
            bestDist = Infinity;
            for (const h of hostiles) {
                const hSize = this.getEnemySize(h.type);
                const filled = hostileSlots.get(h.id)!;
                if (hSize > att.size && hSize - filled >= att.size) {
                    if (att.type === 'friendly') {
                        const city = this.state.cities.find(c => c.id === att.cityId);
                        if (city && !onOutpost.get(h.id) && hexDistance(city.hex, h.hex) > baseRadius) continue;
                    }
                    const dist = Math.hypot(h.x - att.x, h.y - att.y);
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
    if (this.state.phase !== 'PLAYING') return;

    this.assignTargets();

    this.state.time += dt;
    const currentTurn = Math.floor(this.state.time / 10) + 1;

    if (currentTurn > this.state.turn && this.state.turn < 40) {
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
      
      const baseInterval = Math.max(0.2, 1.5 - (turn * 0.02) - (this.threatLevel * 0.15));
      const baseRate = 1 / baseInterval;
      
      const rateMultiplier = 7.5 * Math.pow(wavePhase, 1.5) * Math.exp(-wavePhase);
      const currentRate = baseRate * rateMultiplier;
      this.currentSpawnRate = currentRate;
      this.state.spawnRate = currentRate;

      this.spawnTimer -= currentRate * dt;
      while (this.spawnTimer <= 0) {
        this.spawnTimer += 1.0;
        this.spawnEnemies();
        this.spawnReinforcements();
      }
    }
    this.updateEnemies(dt);
    this.updateCombat(dt);
    this.updateParticles(dt);
    this.checkLevelUp();

    this.notify(this.state.phase !== 'PLAYING');
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

  spawnReinforcements() {
    if (this.safePoints.length === 0) return;

    const turn = this.state.turn;
    const type = 'Scout';
    const spawnHex = this.safePoints[Math.floor(Math.random() * this.safePoints.length)];
    const pos = hexToPixel(spawnHex, HEX_SIZE);

    let hp = 20, speed = 1.6, damage = 2;
    hp *= (1 + turn * 0.1);
    damage *= (1 + turn * 0.05);

    this.state.enemies.push({
      id: Math.random().toString(),
      hex: spawnHex,
      x: pos.x,
      y: pos.y,
      hp, maxHp: hp, type, speed, damage, isConverted: true
    });
  }

  spawnEnemies() {
    if (this.spawnPoints.length === 0) return;

    const turn = this.state.turn;
    const possibleTypes = getWaveEnemies(turn, this.threatLevel);

    const type = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
    const spawnHex = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    const pos = hexToPixel(spawnHex, HEX_SIZE);

    let hp = 20, speed = 1.5, damage = 1;
    if (type === 'Warrior') { hp = 50; speed = 1.0; damage = 2.5; }
    if (type === 'Brute') { hp = 150; speed = 0.6; damage = 7.5; }

    hp *= (1 + turn * 0.1);
    damage *= (1 + turn * 0.05);

    this.state.enemies.push({
      id: Math.random().toString(),
      hex: spawnHex,
      x: pos.x,
      y: pos.y,
      hp, maxHp: hp, type, speed, damage, isConverted: false
    });
  }

  updateFlowField() {
    this.costs.clear();
    const queue: { hex: Hex, cost: number }[] = [];

    for (const city of this.state.cities) {
      const key = hexToString(city.hex);
      this.costs.set(key, 0);
      queue.push({ hex: city.hex, cost: 0 });
    }

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
        if (tile.terrain === Terrain.Forest || tile.terrain === Terrain.Hills) enterCost = 2;
        else if (tile.terrain === Terrain.Mountains) enterCost = 5;

        const newCost = current.cost + enterCost;
        if (!this.costs.has(nKey) || newCost < this.costs.get(nKey)!) {
          this.costs.set(nKey, newCost);
          queue.push({ hex: neighbor, cost: newCost });
        }
      }
    }
  }

  updateEnemies(dt: number) {
    for (const enemy of this.state.enemies) {
      const currentTile = this.state.tiles.get(hexToString(enemy.hex));
      let terrainCost = 1;
      if (currentTile) {
        if (currentTile.terrain === Terrain.Forest || currentTile.terrain === Terrain.Hills) terrainCost = 2;
        else if (currentTile.terrain === Terrain.Mountains) terrainCost = 5;
      }
      let actualSpeed = enemy.speed / terrainCost;

      if (enemy.isConverted) {
        const target = enemy.targetId ? this.state.enemies.find(e => e.id === enemy.targetId) : null;

        if (target) {
          const dx = target.x - enemy.x;
          const dy = target.y - enemy.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            enemy.x += (dx / dist) * actualSpeed * HEX_SIZE * dt;
            enemy.y += (dy / dist) * actualSpeed * HEX_SIZE * dt;
            enemy.hex = pixelToHex(enemy.x, enemy.y, HEX_SIZE);
          } else {
            target.hp -= enemy.damage * dt; // Converted strikes Hostile
            enemy.hp -= target.damage * 0.5 * dt; // Hostile passive feedback
            if (Math.random() < dt * 10) this.spawnSparks(target.x, target.y, target.type === 'Brute' ? '#8b0000' : '#ff0000', 1);
            if (Math.random() < dt * 10) this.spawnSparks(enemy.x, enemy.y, '#ffffff', 1);
          }
        } else {
          // Fallback: move to most damaged outpost
          let bestCity = null;
          let minRatio = Infinity;
          for (const c of this.state.cities) {
            const ratio = c.hp / c.maxHp;
            if (ratio < minRatio) { minRatio = ratio; bestCity = c; }
          }
          if (bestCity) {
            const cp = hexToPixel(bestCity.hex, HEX_SIZE);
            const dx = cp.x - enemy.x;
            const dy = cp.y - enemy.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 15) {
              enemy.x += (dx / dist) * actualSpeed * HEX_SIZE * dt;
              enemy.y += (dy / dist) * actualSpeed * HEX_SIZE * dt;
              enemy.hex = pixelToHex(enemy.x, enemy.y, HEX_SIZE);
            }
          }
        }
        continue;
      }

      const enemySize = this.getEnemySize(enemy.type);
      let filledSlots = 0;
      for (const u of this.state.friendlyUnits) {
        if (u.targetId === enemy.id && Math.hypot(u.x - enemy.x, u.y - enemy.y) < 15) {
          filledSlots += this.getFriendlySize(u);
        }
      }
      for (const e of this.state.enemies) {
        if (e.isConverted && e.targetId === enemy.id && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 15) {
          filledSlots += this.getEnemySize(e.type);
        }
      }

      const speedMult = Math.max(0, 1 - (filledSlots / enemySize));
      actualSpeed *= speedMult;

      const currentCost = this.costs.get(hexToString(enemy.hex)) ?? 9999;
      if (currentCost === 0) continue;

      let bestNeighbor = enemy.hex;
      let lowestCost = currentCost;

      for (let i = 0; i < 6; i++) {
        const neighbor = hexNeighbor(enemy.hex, i);
        const cost = this.costs.get(hexToString(neighbor));
        if (cost !== undefined && cost < lowestCost) {
          lowestCost = cost;
          bestNeighbor = neighbor;
        }
      }

      const targetPos = hexToPixel(bestNeighbor, HEX_SIZE);
      const dx = targetPos.x - enemy.x;
      const dy = targetPos.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const moveDist = Math.min(dist, actualSpeed * HEX_SIZE * dt);
        enemy.x += (dx / dist) * moveDist;
        enemy.y += (dy / dist) * moveDist;
        enemy.hex = pixelToHex(enemy.x, enemy.y, HEX_SIZE);
      }
    }
  }

  updateCombat(dt: number) {
    const baseRadius = this.hasTech('Exploration') ? 4 : 2;
    const dmgMult = (this.hasTech('BronzeWorking') ? 1.3 : 1.0) * 1.2;

    for (const city of this.state.cities) {
      const tile = this.state.tiles.get(hexToString(city.hex));
      const hillBonus = (this.hasTech('Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;

      if (this.hasTech('Archery')) {
        city.archeryCooldown -= dt;
        if (city.archeryCooldown <= 0) {
          city.archeryCooldown = 2;
          const range = (this.hasFusion('MountainFortress') && tile?.terrain === Terrain.Hills) ? 8 : 4;
          const archDmg = (this.hasFusion('MountainFortress') && tile?.terrain === Terrain.Hills) ? 200 : 50;

          let farthest: Enemy | null = null;
          let maxDist = -1;
          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            const dist = hexDistance(city.hex, enemy.hex);
            if (dist <= range && dist > maxDist) {
              maxDist = dist;
              farthest = enemy;
            }
          }
          if (farthest) {
            const cityPos = hexToPixel(city.hex, HEX_SIZE);
            this.state.projectiles.push({
              id: Math.random().toString(),
              x: cityPos.x,
              y: cityPos.y,
              targetId: farthest.id,
              damage: archDmg,
              speed: 250
            });
          }
        }
      }

      if (this.hasTech('Mysticism')) {
        city.mysticismCooldown -= dt;
        if (city.mysticismCooldown <= 0) {
          city.mysticismCooldown = 5;
          let convertedOne = false;
          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            if (hexDistance(city.hex, enemy.hex) <= baseRadius) {
              enemy.hp -= 100;
              this.spawnSparks(enemy.x, enemy.y, enemy.type === 'Brute' ? '#8b0000' : '#ff0000', 8);
              this.spawnSparks(enemy.x, enemy.y, '#a855f7', 5);
              if (this.hasFusion('Theology') && !convertedOne && enemy.hp > 0) {
                enemy.isConverted = true;
                convertedOne = true;
              }
            }
          }
        }
      }

      if (this.hasTech('Irrigation')) {
        const regen = this.hasFusion('Aqueducts') ? 15 : 5;
        city.hp = Math.min(city.maxHp, city.hp + regen * dt);
      }

      city.timeSinceLastDamage += dt;
      if (city.timeSinceLastDamage >= 3) {
        city.hp = Math.min(city.maxHp, city.hp + 2 * dt);
      }
    }

    // Ensure correct number of defenders per city
    for (const city of this.state.cities) {
      const targetDefenders = Math.min(6, city.size);
      let currentDefenders = 0;
      let currentCavalry = 0;
      for (const unit of this.state.friendlyUnits) {
        if (unit.cityId === city.id) {
          if (unit.type === 'guard') currentDefenders++;
          if (unit.type === 'cavalry') currentCavalry++;
        }
      }
      
      if (currentDefenders < targetDefenders) {
        const pos = hexToPixel(city.hex, HEX_SIZE);
        this.state.friendlyUnits.push({
          id: Math.random().toString(),
          cityId: city.id,
          type: 'guard',
          x: pos.x,
          y: pos.y,
          targetId: null,
          state: 'idle',
          angle: Math.random() * Math.PI * 2,
          hp: 50,
          maxHp: 50
        });
      }

      let targetCavalry = 0;
      if (this.hasTech('HorsebackRiding')) targetCavalry = 1;
      if (this.hasTech('AnimalHusbandry')) targetCavalry = 2;

      if (currentCavalry < targetCavalry) {
        const pos = hexToPixel(city.hex, HEX_SIZE);
        this.state.friendlyUnits.push({
          id: Math.random().toString(),
          cityId: city.id,
          type: 'cavalry',
          x: pos.x,
          y: pos.y,
          targetId: null,
          state: 'idle',
          angle: Math.random() * Math.PI * 2,
          hp: 100,
          maxHp: 100
        });
      }
    }

    // Update friendly units
    this.state.friendlyUnits = this.state.friendlyUnits.filter(unit => {
      const city = this.state.cities.find(c => c.id === unit.cityId);
      if (!city) return false;

      const cityPos = hexToPixel(city.hex, HEX_SIZE);
      const tile = this.state.tiles.get(hexToString(city.hex));
      const isCavalry = unit.type === 'cavalry';
      const hillBonus = (this.hasTech('Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
      const damage = (isCavalry ? (this.hasFusion('WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
      const speed = (isCavalry ? (this.hasFusion('WarChariots') ? 3.0 : 2.0) : 1.0) * HEX_SIZE;

      const unitTile = this.state.tiles.get(hexToString(pixelToHex(unit.x, unit.y, HEX_SIZE)));
      let unitTerrainCost = 1;
      if (unitTile) {
        if (unitTile.terrain === Terrain.Forest || unitTile.terrain === Terrain.Hills) unitTerrainCost = 2;
        else if (unitTile.terrain === Terrain.Mountains) unitTerrainCost = 5;
      }
      const actualSpeed = speed / unitTerrainCost;

      if (unit.targetId) {
        const target = this.state.enemies.find(e => e.id === unit.targetId);
        if (target) {
          const dx = target.x - unit.x;
          const dy = target.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            unit.x += (dx / dist) * actualSpeed * dt;
            unit.y += (dy / dist) * actualSpeed * dt;
          } else {
            // Physical reach - deal damage
            target.hp -= damage * dt;
            if (Math.random() < dt * 10) this.spawnSparks(target.x, target.y, target.type === 'Brute' ? '#8b0000' : '#ff0000', 1);
            // Target deals damage back to guard (feedback)
            unit.hp -= target.damage * 0.5 * dt;
            if (Math.random() < dt * 10) this.spawnSparks(unit.x, unit.y, isCavalry ? '#22c55e' : '#4287f5', 1);
            if (unit.hp <= 0) return false;
          }
        }
        unit.state = 'engaging';
      } else {
        const dx = cityPos.x - unit.x;
        const dy = cityPos.y - unit.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 15) {
          unit.state = 'returning';
          unit.x += (dx / dist) * actualSpeed * dt;
          unit.y += (dy / dist) * actualSpeed * dt;
        } else {
          if (unit.hp < unit.maxHp && isCavalry) {
            unit.state = 'healing';
          } else {
            unit.state = 'idle';
          }

          unit.hp = Math.min(unit.maxHp, unit.hp + (unit.state === 'healing' ? 10 : 5) * dt);
          
          if (isCavalry) {
            unit.angle += dt * (this.hasFusion('WarChariots') ? 1.5 : 1.0);
            const orbitRadius = 4.0 * HEX_SIZE; 
            const targetX = cityPos.x + Math.cos(unit.angle) * orbitRadius;
            const targetY = cityPos.y + Math.sin(unit.angle) * orbitRadius;
            
            const mdx = targetX - unit.x;
            const mdy = targetY - unit.y;
            const mdist = Math.hypot(mdx, mdy);
            if (mdist > 0) {
              const moveDist = Math.min(mdist, actualSpeed * dt);
              unit.x += (mdx / mdist) * moveDist;
              unit.y += (mdy / mdist) * moveDist;
            }
          } else {
            unit.angle += dt * 2;
            const targetX = cityPos.x + Math.cos(unit.angle) * 12;
            const targetY = cityPos.y + Math.sin(unit.angle) * 12;
            unit.x += (targetX - unit.x) * 5 * dt;
            unit.y += (targetY - unit.y) * 5 * dt;
          }
        }
      }
      return true;
    });

    // Update projectiles
    this.state.projectiles = this.state.projectiles.filter(p => {
      const target = this.state.enemies.find(e => e.id === p.targetId);
      if (!target) return false;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 5) {
        target.hp -= p.damage;
        this.spawnSparks(target.x, target.y, target.type === 'Brute' ? '#8b0000' : '#ff0000', 5);
        return false;
      }
      p.x += (dx / dist) * p.speed * dt;
      p.y += (dy / dist) * p.speed * dt;
      return true;
    });

    const cityPatrolDamage = new Map<string, number>();
    for (const city of this.state.cities) { cityPatrolDamage.set(city.id, 0); }
    for (const unit of this.state.friendlyUnits) {
      if (unit.state === 'idle' || unit.state === 'healing') {
        const city = this.state.cities.find(c => c.id === unit.cityId);
        if (!city) continue;
        const tile = this.state.tiles.get(hexToString(city.hex));
        const isCavalry = unit.type === 'cavalry';
        const hillBonus = (this.hasTech('Mining') && tile?.terrain === Terrain.Hills) ? 1.5 : 1.0;
        const damage = (isCavalry ? (this.hasFusion('WarChariots') ? 30 : 10) : 15) * dmgMult * hillBonus;
        cityPatrolDamage.set(unit.cityId, (cityPatrolDamage.get(unit.cityId) || 0) + damage);
      }
    }

    for (const enemy of this.state.enemies) {
      if (enemy.isConverted) continue;
      const cost = this.costs.get(hexToString(enemy.hex));
      if (cost === 0) {
        const city = this.state.cities.find(c => hexToString(c.hex) === hexToString(enemy.hex));
        if (city) {
          const armor = this.hasTech('Masonry') ? (this.hasFusion('Aqueducts') ? 3 : 1) : 0;
          const dmg = Math.max(1, enemy.damage - armor) * dt;
          city.hp -= dmg;
          city.timeSinceLastDamage = 0;
          
          const patrolDmg = cityPatrolDamage.get(city.id) || 0;
          if (patrolDmg > 0) {
            enemy.hp -= patrolDmg * 0.5 * dt; // Patrol feedback damage
            if (Math.random() < dt * 10) this.spawnSparks(enemy.x, enemy.y, '#ffffff', 1);
          }

          const pos = hexToPixel(city.hex, HEX_SIZE);
          if (Math.random() < dt * 10) this.spawnSparks(pos.x, pos.y, '#ffffff', 1);
        }
      }
    }

    const xpMult = this.hasTech('Writing') ? 1.25 : 1.0;
    this.state.enemies = this.state.enemies.filter(e => {
      if (e.hp <= 0) {
        const xpGain = (e.maxHp * 0.1) * xpMult;
        this.state.xp += xpGain;
        this.state.stats.cumulativeXp += xpGain;
        this.state.stats.threatsKilled++;
        return false;
      }
      return true;
    });

    const initialCities = this.state.cities.length;
    this.state.cities = this.state.cities.filter(c => c.hp > 0);
    if (this.state.cities.length < initialCities) {
      this.state.stats.citiesLost += (initialCities - this.state.cities.length);
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

      const available = ALL_TECHS.filter(t => !this.state.techs.includes(t.id));
      const shuffled = [...available].sort(() => 0.5 - Math.random());
      const picks = shuffled.slice(0, 3);
      if (picks.length > 0) {
        this.state.pendingTechPicks.push(picks);
        if (this.state.phase === 'PLAYING') {
          this.state.phase = 'LEVEL_UP';
        }
      }
    }
  }

  pickTech(techId: string) {
    this.state.techs.push(techId);
    this.state.pendingTechPicks.shift();

    if (techId === 'Masonry') {
      for (const city of this.state.cities) {
        city.maxHp += 50;
        city.hp += 50;
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
    if (turn === 10 || turn === 20 || turn === 30) {
      this.state.availableCities++;
    }
    for (const city of this.state.cities) {
      city.size++;
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
    this.state.enemies = [];
    this.notify(true);
  }

  instaLose() {
    this.state.phase = 'GAME_OVER';
    this.notify(true);
  }
}
