export interface Point2D {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  survivalTime: number;
  speed: number;
  obstaclesPassed: number;
}

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover';

export interface AudioConfig {
  volume: number;
  enabled: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Position {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

export interface Animation {
  x: number;
  y: number;
  text: string;
  created: number;
}

export interface GameOver {
  finalScore: number;
  highScore: number;
  survivalTime: number;
  maxCombo: number;
}

export interface MenuData {
  highScore: number;
  currentScore: number;
}

export interface UIElements {
  score: HTMLElement;
  highScore: HTMLElement;
  combo: HTMLElement;
  speed: HTMLElement;
  timer: HTMLElement;
}

export interface GameConfig {
  gameWidth: number;
  gameHeight: number;
  playerSpeed: number;
  obstacleSpawnInterval: number;
  baseSpeed: number;
  speedMultiplier: number;
  orbCollectRadius: number;
  obstacleRadius: number;
}