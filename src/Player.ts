import { Particle } from './types';

export class Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  trail: { x: number; y: number; life: number }[] = [];
  maxTrail: number = 15;
  speed: number;
  baseSpeed: number;
  glowIntensity: number = 1;
  pulsePhase: number = 0;
  invincible: boolean = false;
  invincibilityTimer: number = 0;
  color: string = '#00ffff';

  constructor(x: number, y: number, speed: number = 6) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 15;
    this.speed = speed;
    this.baseSpeed = speed;
  }

  update(): void {
    // Smooth movement with lerp
    this.vx *= 0.85;
    this.vy *= 0.85;
    
    this.x += this.vx;
    this.y += this.vy;

    // Update trail
    this.trail.push({ x: this.x, y: this.y, life: 1 });
    if (this.trail.length > this.maxTrail) {
      this.trail.shift();
    }
    this.trail.forEach(t => t.life -= 0.05);

    // Update invincibility
    if (this.invincible) {
      this.invincibilityTimer--;
      if (this.invincibilityTimer <= 0) {
        this.invincible = false;
      }
    }

    // Update pulse
    this.pulsePhase += 0.1;
    this.glowIntensity = 0.7 + Math.sin(this.pulsePhase) * 0.3;
  }

  move(dx: number, dy: number): void {
    this.vx = dx * this.speed;
    this.vy = dy * this.speed;
  }

  setSpeed(newSpeed: number): void {
    this.speed = newSpeed;
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    // Draw trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      if (t.life <= 0) continue;
      
      const alpha = t.life * 0.3;
      const trailRadius = this.radius * (i / this.trail.length);
      
      const gradient = ctx.createRadialGradient(
        t.x, t.y, 0,
        t.x, t.y, trailRadius * 2
      );
      gradient.addColorStop(0, `rgba(0, 255, 255, ${alpha})`);
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      
      ctx.beginPath();
      ctx.arc(t.x, t.y, trailRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw glow
    const glowRadius = this.radius * (1.5 + this.glowIntensity * 0.3);
    const glowGradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, glowRadius
    );
    glowGradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
    glowGradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.3)');
    glowGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Draw core
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    
    const coreGradient = ctx.createRadialGradient(
      this.x - this.radius * 0.3, this.y - this.radius * 0.3, 0,
      this.x, this.y, this.radius
    );
    coreGradient.addColorStop(0, '#ffffff');
    coreGradient.addColorStop(0.5, '#00ffff');
    coreGradient.addColorStop(1, '#0066ff');
    
    ctx.fillStyle = coreGradient;
    ctx.fill();

    // Draw border
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ffff';
    ctx.stroke();

    // Draw inner detail
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
  }

  checkBounds(canvasWidth: number, canvasHeight: number, margin: number = 0): void {
    this.x = Math.max(margin + this.radius, Math.min(canvasWidth - margin - this.radius, this.x));
    this.y = Math.max(margin + this.radius, Math.min(canvasHeight - margin - this.radius, this.y));
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.trail = [];
    this.invincible = true;
    this.invincibilityTimer = 60;
  }
}