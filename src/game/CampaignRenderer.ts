import { CampaignEngine } from './Campaign';
import { hexToPixel, hexToString } from './HexMath';
import { Terrain } from './Types';

export class CampaignRenderer {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  camera = { x: 0, y: 0, zoom: 1 };
  HEX_SIZE = 40; // in between survival 20 and previous 60

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
    this.camera.x = this.width / 2;
    this.camera.y = this.height / 2;
  }

  draw(engine: CampaignEngine, hoverHex: string | null) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.translate(this.camera.x, this.camera.y);

    for (const tile of engine.tiles.values()) {

      const pos = hexToPixel(tile.hex, this.HEX_SIZE);
      let color = '#a3d977'; // Plains
      if (tile.terrain === Terrain.Hills) color = '#d9b377';
      if (tile.terrain === Terrain.Forest) color = '#4d8c39';
      if (tile.terrain === Terrain.Mountains) color = '#7a7a7a';

      let transparentBorder = false;

      if (tile.status === 'HIDDEN') {
        color = '#0f172a'; // slate-900 (void / completely unknown)
        this.ctx.globalAlpha = 1.0;
        transparentBorder = true; // no borders for the void
      } else if (tile.status === 'SHROUDED') {
        this.ctx.globalAlpha = 0.35; // Dim the color to show terrain through the shroud
        transparentBorder = true;
      } else {
        this.ctx.globalAlpha = 1.0;
      }

      this.drawHex(pos.x, pos.y, this.HEX_SIZE - 2, color, transparentBorder);

      // Render borders / UI
      if (tile.status === 'CLAIMABLE') {
        if (hoverHex === hexToString(tile.hex)) {
          this.ctx.beginPath();
          this.drawHexPath(pos.x, pos.y, this.HEX_SIZE - 2);
          this.ctx.lineWidth = 4;
          this.ctx.strokeStyle = 'white';
          this.ctx.stroke();
        }
      } else if (tile.status === 'CLEARED' && hoverHex === hexToString(tile.hex)) {
          this.ctx.beginPath();
          this.drawHexPath(pos.x, pos.y, this.HEX_SIZE - 2);
          this.ctx.lineWidth = 4;
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          this.ctx.stroke();
      }

      if (tile.status === 'CLEARED') {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`✓`, pos.x, pos.y);
      }
    }

    this.ctx.restore();
  }

  drawHex(x: number, y: number, size: number, color: string, transparentBorder: boolean = false) {
    this.ctx.beginPath();
    this.drawHexPath(x, y, size);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = transparentBorder ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
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
}
