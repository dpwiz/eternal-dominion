import { GameState, Terrain } from './Types';
import { hexToPixel, hexToString } from './HexMath';
import { HEX_SIZE } from './Engine';

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

  draw(state: GameState) {
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

      this.drawHex(pos.x, pos.y, HEX_SIZE - 1, color);

      if (tile.improvementLevel === 1) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, HEX_SIZE * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      if (state.focusedHex === hexToString(tile.hex)) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = pos.x + (HEX_SIZE - 2) * Math.cos(angle);
          const hy = pos.y + (HEX_SIZE - 2) * Math.sin(angle);
          if (i === 0) this.ctx.moveTo(hx, hy);
          else this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();
        this.ctx.strokeStyle = '#fbbf24'; // amber-400
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([4, 2]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }

      if (tile.borderType === 'safe') {
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // sky-400
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(2, 132, 199, 0.5)'; // sky-600
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      } else if (tile.borderType === 'threat') {
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'; // red-500
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(185, 28, 28, 0.5)'; // red-700
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    for (const city of state.cities) {
      const tile = state.tiles.get(hexToString(city.hex));
      const pos = hexToPixel(city.hex, HEX_SIZE);
      this.drawHex(pos.x, pos.y, HEX_SIZE, '#ffffff');
      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(pos.x - HEX_SIZE / 2, pos.y - HEX_SIZE * 0.75, HEX_SIZE * (city.hp / city.maxHp), 4);

      if (tile) {
         if (tile.terrain === Terrain.Plains) this.ctx.strokeStyle = '#a3d977';
         else if (tile.terrain === Terrain.Hills) this.ctx.strokeStyle = '#d9b377';
         else if (tile.terrain === Terrain.Forest) this.ctx.strokeStyle = '#4d8c39';
         else this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

         let drawRadius = HEX_SIZE * 1.75;
         if (tile.terrain === Terrain.Plains) {
            let r = 0;
            if (state.techs.includes('HorsebackRiding')) r += 1;
            if (state.techs.includes('AnimalHusbandry')) r += 1;
            if (state.fusions.includes('SwiftRiders')) r += 1;
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

    const hasWarChariots = state.fusions.includes('WarChariots');

    // Draw friendly units
    for (const unit of state.friendlyUnits) {
      this.ctx.beginPath();
      
      let unitSize = 1;
      if (unit.type === 'guard') unitSize = 2;
      else if (unit.type === 'cavalry') {
         const idx = unit.cavalryIndex ?? 0;
         if (idx === 0) unitSize = 1;
         else if (idx === 1) unitSize = 2;
         else unitSize = 4;
      }
      else if (unit.type === 'mystic') {
         if (state.fusions.includes('Theology')) unitSize = 4;
         else if (state.techs.includes('Animism')) unitSize = 2;
         else unitSize = 1;
      }
      const radius = unitSize <= 1 ? 4 : (unitSize === 2 ? 6 : 8);
      
      this.ctx.arc(unit.x, unit.y, radius, 0, Math.PI * 2);

      let fillColor = '#4287f5'; // guard
      if (unit.type === 'cavalry') fillColor = '#22c55e';
      else if (unit.type === 'archer') fillColor = '#eab308'; // yellow-500
      else if (unit.type === 'mystic') fillColor = '#a855f7'; // purple-500

      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      if (unit.hp < unit.maxHp) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(unit.x - radius, unit.y - radius - 4, radius * 2 * (unit.hp / unit.maxHp), 2);
      }
    }

    // Draw projectiles
    for (const p of state.projectiles) {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
      
      const target = state.enemies.find(e => e.id === p.targetId);
      if (target) {
         const dx = target.x - p.x;
         const dy = target.y - p.y;
         const dist = Math.hypot(dx, dy);
         if (dist > 0) {
           this.ctx.beginPath();
           this.ctx.moveTo(p.x, p.y);
           this.ctx.lineTo(p.x - (dx/dist)*10, p.y - (dy/dist)*10);
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
      
      const size = enemy.type === 'Scout' ? 1 : (enemy.type === 'Warrior' ? 2 : 3);
      const radius = size === 1 ? 4 : (size === 2 ? 6 : 8);

      this.ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = enemy.isConverted ? '#38bdf8' : (enemy.type === 'Brute' ? '#8b0000' : enemy.type === 'Warrior' ? '#ff4500' : '#ff8c00');
      this.ctx.fill();
      this.ctx.strokeStyle = enemy.isConverted ? '#0284c7' : '#000';
      this.ctx.stroke();

      this.ctx.fillStyle = enemy.isConverted ? '#22c55e' : '#ff0000';
      this.ctx.fillRect(enemy.x - radius, enemy.y - radius - 4, radius * 2 * (enemy.hp / enemy.maxHp), 3);
    }

    this.ctx.restore();
  }

  drawHex(x: number, y: number, size: number, color: string) {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + size * Math.cos(angle);
      const hy = y + size * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(hx, hy);
      else this.ctx.lineTo(hx, hy);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    this.ctx.stroke();
  }
}
