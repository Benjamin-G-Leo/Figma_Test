import { Particle } from './types';

export class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private maxParticles: number = 80;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  createExplosion(x: number, y: number, color: string, count: number = 20): void {
    if (this.particles.length + count > this.maxParticles) {
      count = this.maxParticles - this.particles.length;
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      const life = Math.random() * 30 + 20;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: Math.random() * 3 + 1
      });
    }
  }

  createCollection(x: number, y: number): void {
    this.createExplosion(x, y, '#ffff00', 8);
  }

  createCollision(x: number, y: number): void {
    this.createExplosion(x, y, '#ff00ff', 25);
  }

  createTrail(x: number, y: number, color: string = '#00ffff'): void {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      life: 10,
      maxLife: 10,
      color,
      size: Math.random() * 2 + 0.5
    });
  }

  update(deltaTime: number = 1): void {
    const frameScale = Math.min(deltaTime, 2);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * frameScale;
      p.y += p.vy * frameScale;
      p.life -= frameScale;
      p.size *= Math.pow(0.9, frameScale);
      p.vx *= Math.pow(0.92, frameScale);
      p.vy *= Math.pow(0.92, frameScale);

      if (p.life <= 0 || p.size < 0.1) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color.replace(/[\d.]+\)/, `${alpha})`);
      this.ctx.fill();

      // Add glow to active particles
      if (alpha > 0.5) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color.replace(/[\d.]+\)/, `${alpha * 0.3})`);
        this.ctx.fill();
      }
    }
  }

  clear(): void {
    this.particles = [];
  }
}
