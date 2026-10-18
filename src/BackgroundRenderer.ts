import { Particle } from './types';

export class BackgroundRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width: number = 0;
  private height: number = 0;
  private time: number = 0;
  private gridOffset: number = 0;
  private isPaused: boolean = false;

  constructor() {
    this.canvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    this.initParticles();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  private initParticles(): void {
    const particleCount = Math.min(80, Math.floor(this.width * this.height / 15000));
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: Math.random() * 100,
        maxLife: 100,
        color: this.getRandomColor(),
        size: Math.random() * 2 + 0.5
      });
    }
  }

  private getRandomColor(): string {
    const colors = [
      'rgba(255, 0, 255, 0.6)',
      'rgba(0, 255, 255, 0.6)',
      'rgba(138, 43, 226, 0.6)',
      'rgba(255, 255, 255, 0.5)'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update(): void {
    if (this.isPaused) return;

    this.time += 0.005;
    this.gridOffset += 0.2;
    
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      
      if (p.x < 0 || p.x > this.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.height) p.vy *= -1;
      
      if (p.life <= 0) {
        p.x = Math.random() * this.width;
        p.y = Math.random() * this.height;
        p.life = p.maxLife;
        p.color = this.getRandomColor();
      }
    });
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawGrid();
    this.drawGradient();
    this.drawParticles();
  }

  private drawGrid(): void {
    this.ctx.strokeStyle = 'rgba(255, 0, 255, 0.03)';
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    
    for (let x = this.gridOffset % gridSize; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = this.gridOffset % gridSize; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  private drawGradient(): void {
    const gradient = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, 0,
      this.width / 2, this.height / 2, this.width * 0.7
    );
    gradient.addColorStop(0, 'rgba(15, 5, 28, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color.replace(/[\d.]+\)/, `${alpha})`);
      this.ctx.fill();
    }
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#00ffff';
    this.ctx.shadowBlur = 0;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }
}
