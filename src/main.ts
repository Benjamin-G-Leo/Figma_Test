import { Game } from './Game';
import { BackgroundRenderer } from './BackgroundRenderer';

// Game configuration
const config = {
  gameWidth: window.innerWidth,
  gameHeight: window.innerHeight,
  playerSpeed: 6,
  obstacleSpawnInterval: 90,
  baseSpeed: 2,
  speedMultiplier: 1.5,
  orbCollectRadius: 20,
  obstacleRadius: 25
};

class NeonRush {
  private game: Game | null = null;
  private bgRenderer: BackgroundRenderer;
  private isAnimating: boolean = false;
  private lastBackgroundFrame = 0;

  constructor() {
    this.bgRenderer = new BackgroundRenderer();
    this.init();
  }

  private init(): void {
    // Set up UI event listeners
    this.setupUI();
    this.resizeGameCanvas();
    window.addEventListener('resize', () => this.resizeGameCanvas());
    this.updateMenuHighScore();
    
    // Start background animation
    this.animateBackground();
  }

  private resizeGameCanvas(): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas || this.game) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private setupUI(): void {
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const restartFromPauseBtn = document.getElementById('restart-from-pause-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const soundToggle = document.getElementById('sound-toggle');

    startBtn?.addEventListener('click', () => this.startGame());
    pauseBtn?.addEventListener('click', () => this.pauseGame());
    resumeBtn?.addEventListener('click', () => this.resumeGame());
    restartFromPauseBtn?.addEventListener('click', () => this.restartGame());
    playAgainBtn?.addEventListener('click', () => this.restartGame());
    mainMenuBtn?.addEventListener('click', () => this.returnToMenu());
    
    // Sound toggle
    soundToggle?.addEventListener('click', () => {
      const icon = soundToggle.querySelector('.icon') as HTMLElement;
      if (!icon) return;

      const audioEnabled = localStorage.getItem('voltRunnerAudio') !== 'false';
      if (audioEnabled) {
        icon.textContent = '🔇';
      } else {
        icon.textContent = '🔊';
      }
      const nextAudioEnabled = !audioEnabled;
      localStorage.setItem('voltRunnerAudio', nextAudioEnabled ? 'true' : 'false');
      this.game?.setAudioEnabled(nextAudioEnabled);
    });
    const audioEnabled = localStorage.getItem('voltRunnerAudio') !== 'false';
    const soundIcon = soundToggle?.querySelector('.icon');
    if (soundIcon) soundIcon.textContent = audioEnabled ? '🔊' : '🔇';

    // Keyboard pause
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.game) {
          const gameScreen = document.getElementById('hud');
          if (gameScreen && !gameScreen.classList.contains('active')) return;
          
          if (this.game) {
            if (document.getElementById('main-menu')?.classList.contains('active')) return;
            this.togglePause();
          }
        }
      }
    });
  }

  private startGame(): void {
    // Hide menu
    const menu = document.getElementById('main-menu');
    menu?.classList.remove('active');
    
    // Show HUD
    const hud = document.getElementById('hud');
    hud?.classList.add('active');
    hud?.classList.remove('hidden');
    
    // Create game if not exists
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!this.game) {
      this.game = new Game(canvas, config);
    }
    
    // Start game
    this.bgRenderer.resume();
    this.game.start();
    this.updateMenuHighScore();
  }

  private pauseGame(): void {
    if (this.game) {
      if (this.game.getState() === 'playing') {
        this.showPauseOverlay();
        this.game.pause();
        this.bgRenderer.pause();
      }
    }
  }

  private resumeGame(): void {
    this.hidePauseOverlay();
    if (this.game) {
      this.game.resume();
      this.bgRenderer.resume();
    }
  }

  private togglePause(): void {
    if (this.game?.getState() === 'playing') {
      this.game.pause();
      this.bgRenderer.pause();
      this.showPauseOverlay();
    } else if (this.game?.getState() === 'paused') {
      this.game.resume();
      this.bgRenderer.resume();
      this.hidePauseOverlay();
    }
  }

  private restartGame(): void {
    this.hidePauseOverlay();
    this.bgRenderer.resume();
    const finalMenu = document.getElementById('game-over');
    finalMenu?.classList.add('hidden');
    finalMenu?.classList.remove('show');
    const hud = document.getElementById('hud');
    hud?.classList.remove('hidden');
    
    if (this.game) {
      this.game.restart();
    }
  }

  private returnToMenu(): void {
    if (this.game) {
      this.game.cleanup();
      this.game = null;
    }
    this.bgRenderer.resume();
    
    // Show menu
    const menu = document.getElementById('main-menu');
    menu?.classList.add('active');
    
    // Hide HUD and game over
    const hud = document.getElementById('hud');
    hud?.classList.remove('active');
    
    const gameOver = document.getElementById('game-over');
    gameOver?.classList.add('hidden');
    gameOver?.classList.remove('show');
    document.getElementById('pause-overlay')?.classList.add('hidden');
    
    this.updateMenuHighScore();
  }

  private showPauseOverlay(): void {
    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const score = this.game?.getScore() ?? 0;
      const pauseScore = document.getElementById('pause-score');
      if (pauseScore) pauseScore.textContent = score.toString();
    }
  }

  private hidePauseOverlay(): void {
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  private updateMenuHighScore(): void {
    const saved = localStorage.getItem('voltRunnerHighScore') ?? localStorage.getItem('neonRushHighScore');
    const menuHighScore = document.getElementById('menu-high-score');
    if (saved && menuHighScore) {
      menuHighScore.textContent = saved;
    }
  }

  private animateBackground(): void {
    if (this.isAnimating) {
      requestAnimationFrame(() => this.animateBackground());
      return;
    }
    
    this.bgRenderer.update();
    this.bgRenderer.render();
    this.isAnimating = true;
    
    const animate = (timestamp: number) => {
      if (timestamp - this.lastBackgroundFrame >= 33) {
        this.bgRenderer.update();
        this.bgRenderer.render();
        this.lastBackgroundFrame = timestamp;
      }
      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new NeonRush();
});