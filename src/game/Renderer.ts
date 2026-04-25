import { getHex } from './Engine';
import { GameState, Terrain, MobUnit, FriendlyType } from './Types';
import { hexToPixel, hexToString } from './HexMath';
import { HEX_SIZE, MAP_RADIUS } from './Engine';
import { World, Component } from './World';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  camera = { x: 0, y: 0, zoom: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.camera.x = this.width / 2;
    this.camera.y = this.height / 2 + HEX_SIZE * Math.sqrt(3);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.camera.x = this.width / 2;
    this.camera.y = this.height / 2 + HEX_SIZE * Math.sqrt(3);
  }

  draw(state: GameState, world: World) {
    const sPosition = world.getStore(Component.Position);
    const sHealth = world.getStore(Component.Health);
    const sMaxHealth = world.getStore(Component.MaxHealth);

    const sMobType = world.getStore(Component.MobType);
    const sFriendlyType = world.getStore(Component.FriendlyType);
    const sHexPosition = world.getStore(Component.HexPosition);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    for (const tile of state.tiles.values()) {
      const pos = hexToPixel(tile.hex, HEX_SIZE);
      let color = '#a3d977'; // Plains
      if (tile.terrain === Terrain.Hills) color = '#d9b377';
      if (tile.terrain === Terrain.Forest) color = '#4d8c39';
      if (tile.terrain === Terrain.Mountains) color = '#7a7a7a';
      if (tile.terrain === Terrain.Void) color = '#0f0e24'; // Extremely deep dark void

      const isPlayArea = Math.max(Math.abs((tile.hex || {q:0}).q), Math.abs((tile.hex || {r:0}).r), Math.abs((tile.hex || {s:0}).s)) <= MAP_RADIUS;

      if (isPlayArea) {
        let drawColor = color;
        if (tile.improvementLevel === -1) {
          // Tinted gray-ish ruins
          this.ctx.globalAlpha = 0.5;
          this.drawHex(pos.x, pos.y, HEX_SIZE - 1, '#111111');
          this.ctx.globalAlpha = 1.0;
          drawColor = '#4a4a4a'; // Overlay basic
        }
        this.drawHex(pos.x, pos.y, HEX_SIZE - 1,  tile.improvementLevel === -1 ? `color-mix(in srgb, ${color} 40%, #1a1a1a)` : color);
      }

      if (tile.improvementLevel === -1) {
         // Draw ruins rubble
         this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
         this.ctx.beginPath();
         this.ctx.moveTo(pos.x - 8, pos.y + 4);
         this.ctx.lineTo(pos.x - 2, pos.y - 6);
         this.ctx.lineTo(pos.x + 6, pos.y + 2);
         this.ctx.lineTo(pos.x + 10, pos.y - 4);
         this.ctx.lineTo(pos.x + 14, pos.y + 6);
         this.ctx.fill();
      }

      if (tile.improvementLevel === 1) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, HEX_SIZE * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      if (state.focusedHex && hexToString(state.focusedHex) === hexToString(tile.hex)) {
        this.ctx.beginPath();
        this.drawHexPath(pos.x, pos.y, HEX_SIZE - 2);
        this.ctx.strokeStyle = '#fbbf24'; // amber-400
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([4, 2]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    if (state.safePoints) {
      for (const hex of state.safePoints) {
        const pos = hexToPixel(hex, HEX_SIZE);
        this.ctx.beginPath();
        this.drawHexPath(pos.x, pos.y, HEX_SIZE - 1);
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // sky-400
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(2, 132, 199, 0.5)'; // sky-600
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    if (state.threatPoints) {
      for (const hex of state.threatPoints) {
        const pos = hexToPixel(hex, HEX_SIZE);
        this.ctx.beginPath();
        this.drawHexPath(pos.x, pos.y, HEX_SIZE - 1);
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'; // red-500
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(185, 28, 28, 0.5)'; // red-700
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    for (const city of state.cities) {
      const tile = state.tiles.get(hexToString(getHex(sHexPosition, city.id)!));
      const pos = hexToPixel(getHex(sHexPosition, city.id)!, HEX_SIZE);
      this.drawHex(pos.x, pos.y, HEX_SIZE, '#ffffff');

      const city_hp = sHealth.get(city.id);
      if (city_hp < sMaxHealth.get(city.id, 0)) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(pos.x - HEX_SIZE / 2, pos.y - HEX_SIZE * 0.75, HEX_SIZE * (city_hp / sMaxHealth.get(city.id, 0)), 4);
      }

      if (tile) {
         if (tile.terrain === Terrain.Plains) this.ctx.strokeStyle = '#a3d977';
         else if (tile.terrain === Terrain.Hills) this.ctx.strokeStyle = '#d9b377';
         else if (tile.terrain === Terrain.Forest) this.ctx.strokeStyle = '#4d8c39';
         else if (tile.terrain === Terrain.Void) this.ctx.strokeStyle = '#1e1b4b';
         else this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

         let drawRadius = HEX_SIZE * 1.75;
         if (tile.terrain === Terrain.Plains) {
            let r = 0;
            if (state.techs.includes('HorsebackRiding')) r += 1;
            if (state.techs.includes('AnimalHusbandry')) r += 1;
            if (state.fusions.includes('WarChariots')) r += 1;
            drawRadius = HEX_SIZE * (1 + r * 1.5);
         } else if (tile.terrain === Terrain.Hills) {
            let r = 0;
            if (state.techs.includes('Archery')) r += 1;
            if (state.techs.includes('Crossbows')) r += 1;
            if (state.fusions.includes('MountainFortress')) r += 1;
            drawRadius = HEX_SIZE * (1 + r * 1.5);
         } else if (tile.terrain === Terrain.Forest) {
            let r = 0;
            if (state.techs.includes('Mysticism')) r += 1;
            if (state.techs.includes('Animism')) r += 1;
            if (state.fusions.includes('Theology')) r += 1;
            drawRadius = HEX_SIZE * (1 + r * 1.5);
         }
         this.ctx.beginPath();
         this.ctx.arc(pos.x, pos.y, drawRadius, 0, Math.PI * 2);
         this.ctx.lineWidth = 1;
         this.ctx.stroke();
      }
    }

    // Draw friendly units
    for (const unit of state.friendlyUnits) {
      this.ctx.beginPath();
      
      let unitSize = 1;
      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Guard) unitSize = 2;
      else if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) {
         const idx = unit.cavalryIndex ?? 0;
         if (idx === 0) unitSize = 1;
         else if (idx === 1) unitSize = 2;
         else unitSize = 4;
      }
      else if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) {
         unitSize = 1;
         if (state.techs.includes('Animism')) unitSize += 1;
         if (state.fusions.includes('Theology')) unitSize += 1;
      }
      const radius = unitSize <= 1 ? 4 : (unitSize === 2 ? 6 : 8);
      
      let renderX = sPosition.get(unit.id, 0);
      let renderY = sPosition.get(unit.id, 1);
      if (sPosition.has(unit.id)) {
          renderX = sPosition.get(unit.id, 0);
          renderY = sPosition.get(unit.id, 1);
      }

      this.ctx.arc(renderX, renderY, radius, 0, Math.PI * 2);

      let fillColor = '#4287f5'; // guard
      if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) fillColor = '#22c55e';
      else if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) fillColor = '#eab308'; // yellow-500
      else if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) fillColor = '#a855f7'; // purple-500

      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      const unit_hp = sHealth.get(unit.id);
      if (unit_hp < sMaxHealth.get(unit.id, 0)) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(renderX - radius, renderY - radius - 4, radius * 2 * (unit_hp / sMaxHealth.get(unit.id, 0)), 2);
      }
    }

    // Draw projectiles
    for (const p of state.projectiles) {
      this.ctx.beginPath();
      this.ctx.arc(sPosition.get(p.id, 0), sPosition.get(p.id, 1), 3, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
      
      const target = state.enemies.find(e => e.id === p.targetId);
      if (target) {
         const dx = sPosition.get(target.id, 0) - sPosition.get(p.id, 0);
         const dy = sPosition.get(target.id, 1) - sPosition.get(p.id, 1);
         const dist = Math.hypot(dx, dy);
         if (dist > 0) {
           this.ctx.beginPath();
           this.ctx.moveTo(sPosition.get(p.id, 0), sPosition.get(p.id, 1));
           this.ctx.lineTo(sPosition.get(p.id, 0) - (dx/dist)*10, sPosition.get(p.id, 1) - (dy/dist)*10);
           this.ctx.strokeStyle = '#ffaa00';
           this.ctx.lineWidth = 2;
           this.ctx.stroke();
         }
      }
    }

    // Draw particles
    for (const p of state.particles) {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    }

    for (const enemy of state.enemies) {
      this.ctx.beginPath();
      
      const size = sMobType.get(enemy.id, 0) === MobUnit.Scout ? 1 : (sMobType.get(enemy.id, 0) === MobUnit.Warrior ? 2 : 3);
      const radius = size === 1 ? 4 : (size === 2 ? 6 : 8);

      let renderX = sPosition.get(enemy.id, 0);
      let renderY = sPosition.get(enemy.id, 1);
      if (sPosition.has(enemy.id)) {
          renderX = sPosition.get(enemy.id, 0);
          renderY = sPosition.get(enemy.id, 1);
      }

      this.ctx.arc(renderX, renderY, radius, 0, Math.PI * 2);
      
      let baseColor = enemy.isConverted ? '#38bdf8' : (sMobType.get(enemy.id, 0) === MobUnit.Brute ? '#8b0000' : sMobType.get(enemy.id, 0) === MobUnit.Warrior ? '#ff4500' : '#ff8c00');
      let strokeColor = enemy.isConverted ? '#0284c7' : '#000';
      
      if (!enemy.isConverted && enemy.isVoidspawn) {
         baseColor = '#4c1d95'; // purple-900 (Darker)
         strokeColor = '#7e22ce'; // purple-700
      } else if (enemy.isConverted && enemy.isVoidspawn) {
         baseColor = '#3b82f6'; // darker blue
         strokeColor = '#1d4ed8'; // deeper stroke
      }

      this.ctx.fillStyle = baseColor;
      this.ctx.fill();
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = enemy.isVoidspawn ? 2 : 1;
      this.ctx.stroke();
      this.ctx.lineWidth = 1;

      const enemy_hp = sHealth.get(enemy.id);
      if (enemy_hp < sMaxHealth.get(enemy.id, 0)) {
        this.ctx.fillStyle = enemy.isConverted ? '#22c55e' : '#ff0000';
        this.ctx.fillRect(renderX - radius, renderY - radius - 4, radius * 2 * (enemy_hp / sMaxHealth.get(enemy.id, 0)), 2);
      }
    }

    for (const eng of state.engineers) {
      this.ctx.beginPath();
      let renderX = sPosition.get(eng.id, 0);
      let renderY = sPosition.get(eng.id, 1);
      if (sPosition.has(eng.id)) {
          renderX = sPosition.get(eng.id, 0);
          renderY = sPosition.get(eng.id, 1);
      }
      this.ctx.arc(renderX, renderY, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawHexPath(x: number, y: number, size: number) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + size * Math.cos(angle);
      const hy = y + size * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(hx, hy);
      else this.ctx.lineTo(hx, hy);
    }
    this.ctx.closePath();
  }

  drawHex(x: number, y: number, size: number, color: string) {
    this.ctx.beginPath();
    this.drawHexPath(x, y, size);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    this.ctx.stroke();
  }
}