import { Game } from './Game';
import { BackgroundRenderer } from './BackgroundRenderer';
import {
  Account,
  authEnabled,
  createCloudScoreStore,
  fetchCloudScore,
  getAccount,
  signIn,
  signOut,
  signUp
} from './auth';
import { localScoreStore } from './ScoreStore';
import { ScoreStore } from './types';

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
  private account: Account | null = null;
  private scoreStore: ScoreStore = localScoreStore;
  private authMode: 'login' | 'signup' = 'login';

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

    // Login screen or menu, depending on session
    void this.initAccount();
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

    // Auto-pause when the player leaves the tab or window
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseGame();
    });
    window.addEventListener('blur', () => this.pauseGame());

    // Keyboard pause
    window.addEventListener('keydown', (e) => {
      // Let the login form take typing (including spaces)
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      if (e.code === 'Space') {
        // Outside the game screens leave Space alone, so buttons work from the keyboard
        if (!this.game || !document.getElementById('hud')?.classList.contains('active')) return;
        e.preventDefault();
        if (e.repeat) return;
        if (this.game) {
          const gameScreen = document.getElementById('hud');
          if (gameScreen && !gameScreen.classList.contains('active')) return;
          
          if (document.getElementById('main-menu')?.classList.contains('active')) return;

          if (this.game.getState() === 'gameover') {
            this.restartGame();
          } else {
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
      this.game = new Game(canvas, config, this.scoreStore);
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
    const menuHighScore = document.getElementById('menu-high-score');
    if (menuHighScore) menuHighScore.textContent = this.scoreStore.load().toString();
  }

  // ===== Accounts =====

  private async initAccount(): Promise<void> {
    if (!authEnabled) {
      this.showScreen('main-menu');
      return;
    }

    this.setupAuthUI();
    const account = await getAccount();
    if (account) await this.useAccount(account);
    else this.useGuest();
    this.showScreen(account || this.isGuestSession() ? 'main-menu' : 'auth-screen');
  }

  private showScreen(id: 'main-menu' | 'auth-screen'): void {
    for (const screenId of ['main-menu', 'auth-screen']) {
      document.getElementById(screenId)?.classList.toggle('active', screenId === id);
    }
  }

  private isGuestSession(): boolean {
    try {
      return sessionStorage.getItem('voltRunnerGuest') === '1';
    } catch {
      return false;
    }
  }

  private rememberGuest(isGuest: boolean): void {
    try {
      if (isGuest) sessionStorage.setItem('voltRunnerGuest', '1');
      else sessionStorage.removeItem('voltRunnerGuest');
    } catch {
      // Storage blocked: guest choice just won't survive a reload.
    }
  }

  private async useAccount(account: Account): Promise<void> {
    const best = await fetchCloudScore(account);
    this.account = account;
    this.scoreStore = createCloudScoreStore(account, best);
    this.refreshAccountUI();
  }

  private useGuest(): void {
    this.account = null;
    this.scoreStore = localScoreStore;
    this.refreshAccountUI();
  }

  private refreshAccountUI(): void {
    const bar = document.getElementById('account-bar');
    const name = document.getElementById('account-name');
    const button = document.getElementById('account-btn');
    if (bar) bar.hidden = !authEnabled;
    if (name) name.textContent = this.account ? this.account.username.toUpperCase() : 'GUEST';
    if (button) button.textContent = this.account ? 'LOG OUT' : 'LOG IN';
    this.updateMenuHighScore();
  }

  private setupAuthUI(): void {
    const byId = (id: string) => document.getElementById(id);

    byId('tab-login')?.addEventListener('click', () => this.setAuthMode('login'));
    byId('tab-signup')?.addEventListener('click', () => this.setAuthMode('signup'));
    byId('auth-form')?.addEventListener('submit', (e) => void this.submitAuth(e));

    byId('guest-btn')?.addEventListener('click', () => {
      this.useGuest();
      this.rememberGuest(true);
      this.showScreen('main-menu');
    });

    byId('account-btn')?.addEventListener('click', async () => {
      if (this.account) {
        await signOut();
        this.useGuest();
        this.rememberGuest(true);
      } else {
        this.setAuthMode('login');
        this.showScreen('auth-screen');
      }
    });
  }

  private setAuthMode(mode: 'login' | 'signup'): void {
    this.authMode = mode;
    const signup = mode === 'signup';
    const usernameField = document.getElementById('field-username');
    if (usernameField) usernameField.hidden = !signup;
    document.getElementById('tab-login')?.classList.toggle('active', !signup);
    document.getElementById('tab-signup')?.classList.toggle('active', signup);
    document.getElementById('tab-login')?.setAttribute('aria-selected', String(!signup));
    document.getElementById('tab-signup')?.setAttribute('aria-selected', String(signup));
    const submit = document.getElementById('auth-submit');
    if (submit) submit.textContent = signup ? 'CREATE ACCOUNT' : 'LOG IN';
    const password = document.getElementById('auth-password') as HTMLInputElement | null;
    if (password) password.autocomplete = signup ? 'new-password' : 'current-password';
    this.setAuthMessage('');
  }

  private setAuthMessage(text: string, isInfo = false): void {
    const message = document.getElementById('auth-message');
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('info', isInfo);
  }

  private async submitAuth(e: Event): Promise<void> {
    e.preventDefault();
    const field = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    const username = field('auth-username').trim();
    const email = field('auth-email').trim();
    const password = field('auth-password');
    const signup = this.authMode === 'signup';

    if (signup && !/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      this.setAuthMessage('Username: 3-16 letters, numbers or _');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.setAuthMessage('Enter a valid email address');
      return;
    }
    if (password.length < 6) {
      this.setAuthMessage('Password needs at least 6 characters');
      return;
    }

    const submit = document.getElementById('auth-submit') as HTMLButtonElement | null;
    if (submit) submit.disabled = true;
    this.setAuthMessage('');

    try {
      const result = signup ? await signUp(username, email, password) : await signIn(email, password);
      if (!result.ok) {
        this.setAuthMessage(result.error);
        return;
      }
      if (result.account === null) {
        this.setAuthMode('login');
        this.setAuthMessage('Account created. Check your email to confirm, then log in.', true);
        return;
      }
      await this.useAccount(result.account);
      this.rememberGuest(false);
      (document.getElementById('auth-password') as HTMLInputElement).value = '';
      this.showScreen('main-menu');
    } catch (error) {
      console.warn('Auth failed:', error);
      this.setAuthMessage('Something went wrong. Try again.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  private animateBackground(): void {
    if (this.isAnimating) {
      requestAnimationFrame(() => this.animateBackground());
      return;
    }
    
    this.bgRenderer.update();
    this.bgRenderer.render();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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