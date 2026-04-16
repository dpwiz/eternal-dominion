import { GameState, Terrain } from './Types';
import { hexToPixel } from './HexMath';
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
    this.camera.y = this.height / 2;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
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
    }

    for (const city of state.cities) {
      const pos = hexToPixel(city.hex, HEX_SIZE);
      this.drawHex(pos.x, pos.y, HEX_SIZE, '#ffffff');
      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(pos.x - 10, pos.y - 15, 20 * (city.hp / city.maxHp), 4);

      const radius = state.techs.includes('Exploration') ? 4 : 2;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, radius * HEX_SIZE * 1.5, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.stroke();
    }

    // Draw friendly units
    for (const unit of state.friendlyUnits) {
      this.ctx.beginPath();
      this.ctx.arc(unit.x, unit.y, unit.type === 'cavalry' ? 5 : 4, 0, Math.PI * 2);
      this.ctx.fillStyle = unit.type === 'cavalry' ? '#22c55e' : '#4287f5';
      this.ctx.fill();
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      if (unit.hp < unit.maxHp) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(unit.x - 4, unit.y - 8, 8 * (unit.hp / unit.maxHp), 2);
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
      this.ctx.arc(enemy.x, enemy.y, 6, 0, Math.PI * 2);
      this.ctx.fillStyle = enemy.isConverted ? '#00ffff' : (enemy.type === 'Brute' ? '#8b0000' : enemy.type === 'Warrior' ? '#ff4500' : '#ff8c00');
      this.ctx.fill();
      this.ctx.strokeStyle = '#000';
      this.ctx.stroke();

      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(enemy.x - 6, enemy.y - 10, 12 * (enemy.hp / enemy.maxHp), 3);
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
