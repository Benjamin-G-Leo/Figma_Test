import { Particle } from './types';

export class Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  rotation: number;
  pulsePhase: number;
  color: string = '#ffff00';
  isActive: boolean = true;
  spinSpeed: number;
  lifetime = 10;

  constructor(x: number, y: number, radius: number = 12) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = (Math.random() - 0.5) * 1.5;
    this.angle = Math.random() * Math.PI * 2;
    this.rotation = 0;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.spinSpeed = 0.03;
  }

  update(speedMultiplier: number = 1, deltaTime: number = 1): void {
    const frameScale = Math.min(deltaTime, 2);
    this.x += this.vx * speedMultiplier * frameScale;
    this.y += this.vy * speedMultiplier * frameScale;
    this.rotation += this.spinSpeed * speedMultiplier * frameScale;
    this.pulsePhase += 0.08 * speedMultiplier * frameScale;
    this.lifetime -= frameScale / 60;
    if (this.lifetime <= 0) this.isActive = false;

    // Wrap around screen edges
    // Keep orb within reasonable bounds
  }

  checkBounds(width: number, height: number): void {
    if (this.x - this.radius < 0 || this.x + this.radius > width) {
      this.vx *= -1;
    }
    if (this.y - this.radius < 0 || this.y + this.radius > height) {
      this.vy *= -1;
    }
    this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const pulse = 1 + Math.sin(this.pulsePhase) * 0.2;
    const drawRadius = this.radius * pulse;

    // Outer glow
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, drawRadius * 2.5);
    glowGradient.addColorStop(0, 'rgba(255, 255, 0, 0.6)');
    glowGradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.2)');
    glowGradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

    ctx.beginPath();
    ctx.fillStyle = glowGradient;
    ctx.arc(0, 0, drawRadius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner glow
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, drawRadius * 1.5);
    innerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    innerGlow.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
    innerGlow.addColorStop(1, 'rgba(255, 255, 0, 0)');

    ctx.beginPath();
    ctx.fillStyle = innerGlow;
    ctx.arc(0, 0, drawRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Core circle
    ctx.beginPath();
    ctx.arc(0, 0, drawRadius, 0, Math.PI * 2);

    const coreGradient = ctx.createRadialGradient(-drawRadius * 0.3, -drawRadius * 0.3, 0, 0, 0, drawRadius);
    coreGradient.addColorStop(0, '#ffffff');
    coreGradient.addColorStop(0.4, '#ffff00');
    coreGradient.addColorStop(1, '#ffaa00');

    ctx.fillStyle = coreGradient;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ffff00';
    ctx.stroke();

    // Rotating rings
    ctx.beginPath();
    ctx.arc(0, 0, drawRadius * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, drawRadius * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = (Math.random() - 0.5) * 1.5;
    this.isActive = true;
    this.lifetime = 10;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }
}
