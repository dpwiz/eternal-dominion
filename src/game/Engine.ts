import { Hex, hexDistance, hexNeighbor, hexToString, hexToPixel, pixelToHex, hexRound } from './HexMath';
import { GameState, Terrain, Enemy, Tech } from './Types';
import { ALL_TECHS, FUSIONS } from './Content';

export const HEX_SIZE = 20;
export const MAP_RADIUS = 12;

export class GameEngine {
  state: GameState;
  costs: Map<string, number> = new Map();
  spawnPoints: Hex[] = [];
  onStateChange?: (state: GameState) => void;
  spawnTimer = 0;

  constructor() {
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
      xp: 0,
      level: 1,
      xpToNext: 100,
      phase: 'START',
      availableCities: 1,
      pendingTechPicks: [],
      stats: { threatsKilled: 0, citiesLost: 0 }
    };
  }

  generateMap() {
    this.spawnPoints = [];
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

        if (isEdge) {
          this.spawnPoints.push(hex);
        }

        this.state.tiles.set(hexToString(hex), { hex, terrain });
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

    const maxHp = this.hasTech('Pottery') ? 150 : 100;
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
    this.notify();
    return true;
  }

  hasTech(id: string) { return this.state.techs.includes(id); }
  hasFusion(id: string) { return this.state.fusions.includes(id); }

  update(dt: number) {
    if (this.state.phase !== 'PLAYING') return;

    this.state.time += dt;
    const currentTurn = Math.floor(this.state.time / 10) + 1;

    if (currentTurn > this.state.turn && this.state.turn < 40) {
      this.state.turn = currentTurn;
      this.onTurnChange(currentTurn);
    }

    if (this.state.time >= 400 && this.state.enemies.length === 0) {
      this.state.phase = 'VICTORY';
      this.notify();
      return;
    }

    if (this.state.time < 400) {
      this.spawnEnemies(dt);
    }
    this.updateEnemies(dt);
    this.updateCombat(dt);
    this.updateParticles(dt);
    this.checkLevelUp();

    this.notify();
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

  spawnEnemies(dt: number) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const turn = this.state.turn;
    let interval = 1.5;
    let types: ('Scout'|'Warrior'|'Brute')[] = ['Scout'];

    if (turn > 10) { interval = 1.0; types = ['Scout', 'Warrior']; }
    if (turn > 20) { interval = 0.75; types = ['Scout', 'Warrior', 'Brute']; }
    if (turn > 30) { interval = 0.5; types = ['Warrior', 'Brute']; }
    if (turn > 35) { interval = 0.25; types = ['Brute']; }

    this.spawnTimer = interval;

    const type = types[Math.floor(Math.random() * types.length)];
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
      const actualSpeed = enemy.speed / terrainCost;

      if (enemy.isConverted) {
        let target: Enemy | null = null;
        let minDist = Infinity;
        for (const e of this.state.enemies) {
          if (!e.isConverted) {
            const dist = Math.hypot(e.x - enemy.x, e.y - enemy.y);
            if (dist < minDist) { minDist = dist; target = e; }
          }
        }
        if (target) {
          const dx = target.x - enemy.x;
          const dy = target.y - enemy.y;
          if (minDist > 5) {
            enemy.x += (dx / minDist) * actualSpeed * HEX_SIZE * dt;
            enemy.y += (dy / minDist) * actualSpeed * HEX_SIZE * dt;
            enemy.hex = pixelToHex(enemy.x, enemy.y, HEX_SIZE);
          } else {
            target.hp -= enemy.damage * dt;
            if (Math.random() < dt * 10) this.spawnSparks(target.x, target.y, target.type === 'Brute' ? '#8b0000' : '#ff0000', 1);
          }
        }
        continue;
      }

      const currentCost = this.costs.get(hexToString(enemy.hex)) ?? 9999;
      if (currentCost === 0) continue;

      const isEngaged = this.state.friendlyUnits.some(u => u.targetId === enemy.id && u.state === 'melee');
      if (isEngaged) continue;

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

    // Pre-calculate current claims
    const currentClaims = new Map<string, number>();
    for (const unit of this.state.friendlyUnits) {
      if (unit.targetId) {
        currentClaims.set(unit.targetId, (currentClaims.get(unit.targetId) || 0) + 1);
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

      if (unit.state === 'idle') {
        unit.hp = Math.min(unit.maxHp, unit.hp + 5 * dt); // Regenerate while idle
        
        if (isCavalry) {
          unit.angle += dt * (this.hasFusion('WarChariots') ? 1.5 : 1.0);
          const orbitRadius = 4.0 * HEX_SIZE; 
          const targetX = cityPos.x + Math.cos(unit.angle) * orbitRadius;
          const targetY = cityPos.y + Math.sin(unit.angle) * orbitRadius;
          
          const dx = targetX - unit.x;
          const dy = targetY - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            const moveDist = Math.min(dist, actualSpeed * dt);
            unit.x += (dx / dist) * moveDist;
            unit.y += (dy / dist) * moveDist;
          }

          const currentHex = pixelToHex(unit.x, unit.y, HEX_SIZE);
          let target: Enemy | null = null;
          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            if (hexDistance(enemy.hex, currentHex) <= 1) {
              target = enemy;
              break;
            }
          }
          if (target) {
            unit.targetId = target.id;
            unit.state = 'engaging';
          }
        } else {
          unit.angle += dt * 2;
          const targetX = cityPos.x + Math.cos(unit.angle) * 12;
          const targetY = cityPos.y + Math.sin(unit.angle) * 12;
          unit.x += (targetX - unit.x) * 5 * dt;
          unit.y += (targetY - unit.y) * 5 * dt;

          let closest: Enemy | null = null;
          let minDist = Infinity;
          for (const enemy of this.state.enemies) {
            if (enemy.isConverted) continue;
            
            const claimCapacity = enemy.type === 'Brute' ? 3 : (enemy.type === 'Warrior' ? 2 : 1);
            const claims = currentClaims.get(enemy.id) || 0;
            if (claims >= claimCapacity) continue;

            if (hexDistance(city.hex, enemy.hex) <= baseRadius) {
              const dist = Math.hypot(enemy.x - cityPos.x, enemy.y - cityPos.y);
              if (dist < minDist) {
                minDist = dist;
                closest = enemy;
              }
            }
          }
          if (closest) {
            unit.targetId = closest.id;
            unit.state = 'engaging';
            currentClaims.set(closest.id, (currentClaims.get(closest.id) || 0) + 1);
          }
        }
      } else if (unit.state === 'engaging') {
        const target = this.state.enemies.find(e => e.id === unit.targetId);
        if (!target || target.isConverted || (!isCavalry && hexDistance(city.hex, target.hex) > baseRadius)) {
          unit.state = 'returning';
          unit.targetId = null;
        } else {
          const dx = target.x - unit.x;
          const dy = target.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 5) {
            unit.state = 'melee';
          } else {
            unit.x += (dx / dist) * actualSpeed * dt;
            unit.y += (dy / dist) * actualSpeed * dt;
          }
        }
      } else if (unit.state === 'melee') {
        const target = this.state.enemies.find(e => e.id === unit.targetId);
        if (!target || target.isConverted) {
          if (isCavalry) {
            if (unit.hp > unit.maxHp * 0.5) {
              unit.state = 'idle';
            } else {
              unit.state = 'returning';
            }
          } else {
            unit.state = 'returning';
          }
          unit.targetId = null;
        } else {
          // Deal damage to target
          target.hp -= damage * dt;
          if (Math.random() < dt * 10) this.spawnSparks(target.x, target.y, target.type === 'Brute' ? '#8b0000' : '#ff0000', 1);
          // Target deals damage to guard
          unit.hp -= target.damage * dt;
          if (Math.random() < dt * 10) this.spawnSparks(unit.x, unit.y, isCavalry ? '#22c55e' : '#4287f5', 1);
          if (unit.hp <= 0) return false;
        }
      } else if (unit.state === 'returning') {
        const dx = cityPos.x - unit.x;
        const dy = cityPos.y - unit.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 15) {
          if (isCavalry && unit.hp < unit.maxHp) {
            unit.state = 'healing';
          } else {
            unit.state = 'idle';
          }
        } else {
          unit.x += (dx / dist) * actualSpeed * dt;
          unit.y += (dy / dist) * actualSpeed * dt;
        }
      } else if (unit.state === 'healing') {
        unit.hp = Math.min(unit.maxHp, unit.hp + 10 * dt);
        unit.angle += dt * 2;
        const targetX = cityPos.x + Math.cos(unit.angle) * 12;
        const targetY = cityPos.y + Math.sin(unit.angle) * 12;
        unit.x += (targetX - unit.x) * 5 * dt;
        unit.y += (targetY - unit.y) * 5 * dt;
        
        if (unit.hp >= unit.maxHp) {
          unit.state = 'idle';
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
          
          const pos = hexToPixel(city.hex, HEX_SIZE);
          if (Math.random() < dt * 10) this.spawnSparks(pos.x, pos.y, '#ffffff', 1);
        }
      }
    }

    const xpMult = this.hasTech('Writing') ? 1.25 : 1.0;
    this.state.enemies = this.state.enemies.filter(e => {
      if (e.hp <= 0) {
        this.state.xp += (e.maxHp * 0.1) * xpMult;
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
    this.notify();
  }

  onTurnChange(turn: number) {
    if (turn === 10 || turn === 20 || turn === 30) {
      this.state.availableCities++;
    }
    for (const city of this.state.cities) {
      city.size++;
    }
  }

  notify() {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }
}
