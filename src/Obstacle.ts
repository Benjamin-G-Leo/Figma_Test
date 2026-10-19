import { Particle } from './types';

export class Obstacle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  rotation: number;
  pulsePhase: number;
  color: string;
  type: 'square' | 'triangle' | 'diamond' | 'hexagon';
  isActive: boolean = true;
  lifetime = 12;

  constructor(
    x: number,
    y: number,
    speed: number,
    type: 'square' | 'triangle' | 'diamond' | 'hexagon',
    color: string = '#ff00ff',
    radius: number = 25
  ) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.vx = (Math.random() - 0.5) * speed;
    this.vy = (Math.random() - 0.5) * speed;
    this.type = type;
    this.color = color;
    this.angle = Math.random() * Math.PI * 2;
    this.rotation = 0;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(speedMultiplier: number = 1, deltaTime: number = 1): void {
    const frameScale = Math.min(deltaTime, 2);
    this.x += this.vx * speedMultiplier * frameScale;
    this.y += this.vy * speedMultiplier * frameScale;
    this.rotation += 0.02 * speedMultiplier * frameScale;
    this.pulsePhase += 0.05 * speedMultiplier * frameScale;
    this.lifetime -= frameScale / 60;
    if (this.lifetime <= 0) this.isActive = false;
  }

  checkBounds(width: number, height: number): void {
    if (this.x - this.radius < 0 || this.x + this.radius > width) {
      this.vx *= -1;
      this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
    }
    if (this.y - this.radius < 0 || this.y + this.radius > height) {
      this.vy *= -1;
      this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const pulse = 1 + Math.sin(this.pulsePhase) * 0.15;

    // Glow
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * pulse * 2);
    glowGradient.addColorStop(0, `rgba(255, 0, 255, 0.5)`);
    glowGradient.addColorStop(0.5, `rgba(255, 0, 255, 0.1)`);
    glowGradient.addColorStop(1, 'rgba(255, 0, 255, 0)');

    ctx.beginPath();
    ctx.fillStyle = glowGradient;
    this.drawShape(ctx, this.radius * pulse * 2);
    ctx.fill();

    // Core shape
    ctx.beginPath();
    this.drawShape(ctx, this.radius * pulse);

    const coreGradient = ctx.createLinearGradient(-this.radius * pulse, -this.radius * pulse, this.radius * pulse, this.radius * pulse);
    coreGradient.addColorStop(0, '#ff00ff');
    coreGradient.addColorStop(0.5, '#00ffff');
    coreGradient.addColorStop(1, '#ff00ff');

    ctx.fillStyle = coreGradient;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff00ff';
    ctx.stroke();

    ctx.restore();
  }

  private drawShape(ctx: CanvasRenderingContext2D, size: number): void {
    switch (this.type) {
      case 'square':
        ctx.rect(-size / 2, -size / 2, size, size);
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -size / 1.5);
        ctx.lineTo(size / 1.5, size / 1.5);
        ctx.lineTo(-size / 1.5, size / 1.5);
        ctx.closePath();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(0, size / 2);
        ctx.lineTo(-size / 2, 0);
        ctx.closePath();
        break;
      case 'hexagon':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const theta = (Math.PI / 3) * i - Math.PI / 6;
          ctx.lineTo(size / 2 * Math.cos(theta), size / 2 * Math.sin(theta));
        }
        ctx.closePath();
        break;
    }
  }

  reset(x: number, y: number, speed: number, type: 'square' | 'triangle' | 'diamond' | 'hexagon'): void {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * speed;
    this.vy = (Math.random() - 0.5) * speed;
    this.type = type;
    this.isActive = true;
    this.lifetime = 12;
    this.rotation = 0;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }
}
