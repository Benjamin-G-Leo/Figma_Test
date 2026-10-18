import { AudioConfig } from './types';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  private sounds: Map<string, AudioBuffer> = new Map();
  private activeSources: AudioBufferSourceNode[] = [];

  constructor(private config: AudioConfig) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.config.volume;
      this.masterGain.connect(this.audioContext.destination);
      this.isInitialized = true;
      
      await this.loadDefaultSounds();
    } catch (error) {
      console.warn('Failed to initialize audio system:', error);
    }
  }

  private async loadDefaultSounds(): Promise<void> {
    const sounds = [
      'collect',
      'collision',
      'click',
      'gameOver',
      'highScore'
    ];
    
    for (const soundName of sounds) {
      try {
        const buffer = await this.createDefaultSound(soundName);
        this.sounds.set(soundName, buffer);
      } catch (error) {
        console.warn(`Failed to load sound ${soundName}:`, error);
      }
    }
  }

  private async createDefaultSound(type: string): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('Audio context not initialized');
    
    const duration = 0.2;
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < length; i++) {
      let value = 0;
      const t = i / length;
      
      switch (type) {
        case 'collect':
          // Rising chirp
          value = Math.sin(t * 2 * Math.PI * (400 + 800 * t)) * (1 - t) * 0.3;
          break;
        case 'collision':
          // Low boom
          value = Math.sin(t * 2 * Math.PI * 100) * Math.exp(-t * 15) * 0.5;
          break;
        case 'click':
          // Sharp click
          value = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 0.4;
          break;
        case 'gameOver':
          // Descending tone
          value = Math.sin(t * 2 * Math.PI * (200 - 150 * t)) * Math.exp(-t * 3) * 0.4;
          break;
        case 'highScore':
          // Arpeggio
          const freq = 300 + Math.sin(t * Math.PI * 8) * 100;
          value = Math.sin(t * 2 * Math.PI * freq) * (1 - t) * 0.3;
          break;
        default:
          value = Math.sin(t * 2 * Math.PI * 440) * (1 - t) * 0.2;
      }
      
      data[i] = value;
    }
    
    return buffer;
  }

  play(soundName: string): void {
    if (!this.config.enabled || !this.isInitialized || !this.audioContext) return;
    
    const buffer = this.sounds.get(soundName);
    if (!buffer) return;
    
    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.masterGain!);
      source.start(0);
      
      this.activeSources.push(source);
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) this.activeSources.splice(index, 1);
      };
    } catch (error) {
      console.warn(`Failed to play sound ${soundName}:`, error);
    }
  }

  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.config.volume;
    }
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  suspend(): void {
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend();
    }
  }

  resume(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  cleanup(): void {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    this.activeSources = [];
    
    if (this.audioContext?.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.masterGain = null;
    this.isInitialized = false;
  }
}