import { ScoreStore } from './types';

const HIGH_SCORE_KEY = 'voltRunnerHighScore';
const LEGACY_HIGH_SCORE_KEY = 'neonRushHighScore';

// Guest best score, kept in this browser only. Keys must not be renamed.
export const localScoreStore: ScoreStore = {
  load(): number {
    const saved = localStorage.getItem(HIGH_SCORE_KEY) ?? localStorage.getItem(LEGACY_HIGH_SCORE_KEY);
    const parsed = saved ? parseInt(saved, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  },
  save(score: number): void {
    localStorage.setItem(HIGH_SCORE_KEY, score.toString());
  }
};
