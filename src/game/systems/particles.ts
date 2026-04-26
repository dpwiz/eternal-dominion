import { GameState } from '../Types';

export function spawnSparks(state: GameState, x: number, y: number, color: string, count: number = 5) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 40;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color
    });
  }
}

export function tick(state: GameState, dt: number) {
  state.particles = state.particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 2;
    return p.life > 0;
  });
}
