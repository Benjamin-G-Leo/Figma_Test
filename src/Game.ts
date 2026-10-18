import { Player } from './Player';
import { Obstacle } from './Obstacle';
import { Orb } from './Orb';
import { ParticleSystem } from './ParticleSystem';
import { AudioManager } from './AudioManager';
import { GameConfig, GameStats, GameState } from './types';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private state: GameState = 'menu';

  private player: Player;
  private obstacles: Obstacle[] = [];
  private orbs: Orb[] = [];
  private particleSystem: ParticleSystem;
  private audioManager: AudioManager;
  private touchTarget: { x: number; y: number } | null = null;

  private stats: GameStats = {
    score: 0,
    highScore: 0,
    combo: 1,
    maxCombo: 1,
    survivalTime: 0,
    speed: 1.0,
    obstaclesPassed: 0
  };

  private obstacleTimer: number = 0;
  private orbTimer: number = 0;
  private lastTime: number = 0;
  private animationFrame: number | null = null;
  private keys: Record<string, boolean> = {};
  private readonly maxObstacles = 24;
  private readonly maxOrbs = 5;

  private scoreElement: HTMLElement;
  private highScoreElement: HTMLElement;
  private comboElement: HTMLElement;
  private speedElement: HTMLElement;
  private timerElement: HTMLElement;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.config = config;

    this.player = new Player(config.gameWidth / 2, config.gameHeight / 2, config.playerSpeed);
    this.particleSystem = new ParticleSystem();
    this.audioManager = new AudioManager({
      volume: 0.18,
      enabled: localStorage.getItem('voltRunnerAudio') !== 'false'
    });

    this.scoreElement = document.getElementById('score-display')!;
    this.highScoreElement = document.getElementById('hud-high-score')!;
    this.comboElement = document.getElementById('combo-display')!;
    this.speedElement = document.getElementById('speed-display')!;
    this.timerElement = document.getElementById('timer-display')!;

    this.loadHighScore();

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.handleResize();
  }

  getState(): GameState {
    return this.state;
  }

  getScore(): number {
    return this.stats.score;
  }

  setAudioEnabled(enabled: boolean): void {
    this.audioManager.setEnabled(enabled);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.keys[e.code] = true;

    if (e.code === 'Space' && this.state === 'paused') {
      this.resume();
    } else if (e.code === 'Space' && this.state === 'gameover') {
      this.restart();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.buttons === 0) return;

    this.touchTarget = {
      x: e.clientX,
      y: e.clientY
    };
  }

  private handlePointerUp(): void {
    this.touchTarget = null;
  }

  private handleResize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.config.gameWidth = window.innerWidth;
    this.config.gameHeight = window.innerHeight;
    this.player.checkBounds(this.config.gameWidth, this.config.gameHeight, 50);
  }

  start(): void {
    void this.audioManager.initialize();
    this.state = 'playing';
    document.getElementById('game-over')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.remove('show');
    document.getElementById('pause-overlay')?.classList.add('hidden');
    this.resetGame();
    this.lastTime = performance.now();
    this.loop();
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.lastTime = performance.now();
      this.loop();
    }
  }

  restart(): void {
    void this.audioManager.initialize();
    this.resetGame();
    this.state = 'playing';
    this.lastTime = performance.now();
    this.loop();
  }

  gameOver(): void {
    this.state = 'gameover';
    this.audioManager.play('collision');
    this.audioManager.play('gameOver');
    this.updateHighScore();
    document.getElementById('pause-overlay')?.classList.add('hidden');
    const gameOver = document.getElementById('game-over');
    gameOver?.classList.remove('hidden');
    gameOver?.classList.add('show');
    document.body.classList.add('game-shake');
    window.setTimeout(() => document.body.classList.remove('game-shake'), 420);
  }

  private resetGame(): void {
    this.stats = {
      score: 0,
      highScore: this.stats.highScore,
      combo: 1,
      maxCombo: 1,
      survivalTime: 0,
      speed: 1.0,
      obstaclesPassed: 0
    };

    this.obstacles = [];
    this.orbs = [];
    this.particleSystem.clear();

    this.player.reset(this.config.gameWidth / 2, this.config.gameHeight / 2);

    this.obstacleTimer = 0;
    this.orbTimer = 0;
    this.updateUI();
  }

  private update(): void {
    if (this.state !== 'playing') return;
    
    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 16.67;
    this.lastTime = now;
    
    this.handleInput(deltaTime);
    this.player.update(deltaTime);
    this.stats.survivalTime += deltaTime / 60;
    this.updateSpeed();
    this.updateObstacles(deltaTime);
    this.updateOrbs(deltaTime);
    this.spawnObstacles(deltaTime);
    this.spawnOrbs(deltaTime);
    this.checkCollisions();
    this.particleSystem.update(deltaTime);
    this.updateUI();
  }

  private handleInput(deltaTime: number): void {
    let dx = 0;
    let dy = 0;
    
    if (this.keys.ArrowUp || this.keys.KeyW) dy = -1;
    if (this.keys.ArrowDown || this.keys.KeyS) dy = 1;
    if (this.keys.ArrowLeft || this.keys.KeyA) dx = -1;
    if (this.keys.ArrowRight || this.keys.KeyD) dx = 1;
    
    if (dx !== 0 && dy !== 0) {
      const norm = Math.sqrt(dx * dx + dy * dy);
      dx /= norm;
      dy /= norm;
    }

    if (this.touchTarget) {
      const targetDx = this.touchTarget.x - this.player.x;
      const targetDy = this.touchTarget.y - this.player.y;
      const distance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
      if (distance > 12) {
        dx = targetDx / distance;
        dy = targetDy / distance;
      } else {
        dx = 0;
        dy = 0;
      }
    }
    
    this.player.move(dx, dy);
    this.player.checkBounds(this.config.gameWidth, this.config.gameHeight, 50);
  }

  private updateSpeed(): void {
    const scoreSpeedIncrease = Math.floor(this.stats.score / 10) * 0.05;
    const survivalSpeedIncrease = Math.floor(this.stats.survivalTime / 10) * 0.1;
    this.stats.speed = Math.min(3, 1.0 + scoreSpeedIncrease + survivalSpeedIncrease);
    this.speedElement.textContent = `${this.stats.speed.toFixed(1)}x`;
  }

  private updateObstacles(deltaTime: number): void {
    this.obstacles.forEach(obstacle => {
      obstacle.update(this.stats.speed, deltaTime);
      obstacle.checkBounds(this.config.gameWidth, this.config.gameHeight);
    });
    
    this.obstacles = this.obstacles.filter(obstacle => 
      obstacle.isActive &&
      obstacle.x > -50 && obstacle.x < this.config.gameWidth + 50 &&
      obstacle.y > -50 && obstacle.y < this.config.gameHeight + 50
    );
  }

  private updateOrbs(deltaTime: number): void {
    this.orbs.forEach(orb => {
      orb.update(this.stats.speed * 0.5, deltaTime);
      orb.checkBounds(this.config.gameWidth, this.config.gameHeight);
    });
    
    this.orbs = this.orbs.filter(orb => orb.isActive);
  }

  private spawnObstacles(deltaTime: number): void {
    this.obstacleTimer -= deltaTime;
    if (this.obstacleTimer <= 0 && this.obstacles.length < this.maxObstacles) {
      const spawnInterval = Math.max(
        this.config.obstacleSpawnInterval - (this.stats.score * 0.1),
        30
      );
      this.obstacleTimer = spawnInterval;
      
      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      let vx: number, vy: number;
      
      switch (side) {
        case 0:
          x = Math.random() * this.config.gameWidth;
          y = -25;
          vx = (Math.random() - 0.5) * 2;
          vy = Math.random() * 2 + 1;
          break;
        case 1:
          x = this.config.gameWidth + 25;
          y = Math.random() * this.config.gameHeight;
          vx = -(Math.random() * 2 + 1);
          vy = (Math.random() - 0.5) * 2;
          break;
        case 2:
          x = Math.random() * this.config.gameWidth;
          y = this.config.gameHeight + 25;
          vx = (Math.random() - 0.5) * 2;
          vy = -(Math.random() * 2 + 1);
          break;
        case 3:
          x = -25;
          y = Math.random() * this.config.gameHeight;
          vx = Math.random() * 2 + 1;
          vy = (Math.random() - 0.5) * 2;
          break;
      }
      
      const types: ('square' | 'triangle' | 'diamond' | 'hexagon')[] = 
        ['square', 'triangle', 'diamond', 'hexagon'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      const obstacle = new Obstacle(x, y, 2, type);
      obstacle.vx = vx;
      obstacle.vy = vy;
      this.obstacles.push(obstacle);
    }
  }

  private spawnOrbs(deltaTime: number): void {
    this.orbTimer -= deltaTime;
    if (this.orbTimer <= 0 && this.orbs.length < this.maxOrbs) {
      const spawnInterval = Math.max(
        180 - (this.stats.score * 0.5),
        60
      );
      this.orbTimer = spawnInterval;
      
      const margin = Math.min(100, Math.max(30, Math.min(this.config.gameWidth, this.config.gameHeight) / 4));
      const x = margin + Math.random() * Math.max(1, this.config.gameWidth - 2 * margin);
      const y = margin + Math.random() * Math.max(1, this.config.gameHeight - 2 * margin);
      
      const orb = new Orb(x, y);
      this.orbs.push(orb);
    }
  }

  private checkCollisions(): void {
    this.orbs.forEach(orb => {
      if (!orb.isActive) return;
      
      const dx = this.player.x - orb.x;
      const dy = this.player.y - orb.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.player.radius + orb.radius) {
        this.collectOrb(orb);
      }
    });
    
    this.obstacles.forEach(obstacle => {
      if (!obstacle.isActive) return;
      
      const dx = this.player.x - obstacle.x;
      const dy = this.player.y - obstacle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.player.radius + obstacle.radius) {
        this.collideWithObstacle(obstacle);
      }
    });
  }

  private collectOrb(orb: Orb): void {
    orb.isActive = false;
    const points = Math.floor(10 * this.stats.combo);
    this.stats.score += points;
    this.stats.combo++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    
    this.particleSystem.createCollection(orb.x, orb.y);
    this.audioManager.play('collect');
    this.showFloatingScore(orb.x, orb.y, points);
    this.updateUI();
  }

  private collideWithObstacle(obstacle: Obstacle): void {
    obstacle.isActive = false;
    this.particleSystem.createCollision(this.player.x, this.player.y);
    this.stats.combo = 1;
    this.player.invincible = true;
    this.player.invincibilityTimer = 30;
    this.gameOver();
  }

  private updateUI(): void {
    this.scoreElement.textContent = this.stats.score.toString();
    this.scoreElement.classList.remove('score-pop');
    void this.scoreElement.offsetWidth;
    this.scoreElement.classList.add('score-pop');
    this.comboElement.textContent = `${this.stats.combo}x`;
    
    const minutes = Math.floor(this.stats.survivalTime / 60);
    const seconds = Math.floor(this.stats.survivalTime % 60);
    this.timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private loadHighScore(): void {
    const saved = localStorage.getItem('voltRunnerHighScore') ?? localStorage.getItem('neonRushHighScore');
    if (saved) {
      this.stats.highScore = parseInt(saved, 10);
    }
    this.highScoreElement.textContent = this.stats.highScore.toString();
  }

  private updateHighScore(): void {
    if (this.stats.score > this.stats.highScore) {
      this.stats.highScore = this.stats.score;
      localStorage.setItem('voltRunnerHighScore', this.stats.highScore.toString());
      this.highScoreElement.textContent = this.stats.highScore.toString();
      
      const badge = document.getElementById('new-high-score');
      if (badge) {
        badge.classList.remove('hidden');
        setTimeout(() => badge.classList.add('hidden'), 3000);
      }
      this.audioManager.play('highScore');
    }
    
    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = this.stats.score.toString();
    
    const gameOverHighScoreEl = document.getElementById('game-over-high-score');
    if (gameOverHighScoreEl) gameOverHighScoreEl.textContent = this.stats.highScore.toString();
    
    const survivalTimeEl = document.getElementById('survival-time');
    if (survivalTimeEl) {
      const minutes = Math.floor(this.stats.survivalTime / 60);
      const seconds = Math.floor(this.stats.survivalTime % 60);
      survivalTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    const maxComboEl = document.getElementById('max-combo');
    if (maxComboEl) maxComboEl.textContent = `${this.stats.maxCombo}x`;
  }

  private loop(): void {
    if (this.state !== 'playing') return;
    
    this.update();
    this.render();
    
    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.config.gameWidth, this.config.gameHeight);
    
    this.obstacles.forEach(obstacle => {
      if (obstacle.isActive) obstacle.draw(this.ctx);
    });
    
    this.orbs.forEach(orb => {
      if (orb.isActive) orb.draw(this.ctx);
    });
    
    this.player.draw(this.ctx, this.config.gameWidth, this.config.gameHeight);
    this.particleSystem.draw();
  }

  cleanup(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);

    this.particleSystem.clear();
    this.audioManager.cleanup();
  }

  private showFloatingScore(x: number, y: number, points: number): void {
    const scoreChange = document.createElement('div');
    scoreChange.className = 'score-change';
    scoreChange.textContent = `+${points}`;
    scoreChange.style.left = `${x}px`;
    scoreChange.style.top = `${y}px`;
    document.getElementById('ui-layer')?.appendChild(scoreChange);
    scoreChange.addEventListener('animationend', () => scoreChange.remove(), { once: true });
  }
}