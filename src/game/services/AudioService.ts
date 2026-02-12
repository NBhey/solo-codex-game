interface ToneOptions {
  frequency: number;
  durationMs: number;
  volume: number;
  waveform: OscillatorType;
  delayMs?: number;
}

interface AudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class AudioService {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private enabled = true;
  private musicTimerId: number | null = null;
  private musicStep = 0;
  private musicRequested = false;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.syncMasterGain();

    if (!enabled) {
      this.stopMusic();
      return;
    }

    if (this.musicRequested) {
      this.startMusic();
    }
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context || context.state !== 'suspended') {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Ignore browser auto-play policy failures.
    }
  }

  startMusic(): void {
    this.musicRequested = true;
    if (!this.enabled || this.musicTimerId !== null) {
      return;
    }

    void this.unlock();

    const melody = [220, 261.63, 329.63, 293.66, 246.94, 329.63, 392, 293.66];
    this.musicTimerId = window.setInterval(() => {
      const freq = melody[this.musicStep % melody.length];
      this.playTone({
        frequency: freq,
        durationMs: 220,
        volume: 0.038,
        waveform: 'triangle'
      });

      if (this.musicStep % 2 === 0) {
        this.playTone({
          frequency: freq * 0.5,
          durationMs: 190,
          volume: 0.022,
          waveform: 'sine',
          delayMs: 40
        });
      }

      this.musicStep += 1;
    }, 280);
  }

  stopMusic(): void {
    if (this.musicTimerId === null) {
      return;
    }

    window.clearInterval(this.musicTimerId);
    this.musicTimerId = null;
  }

  playUiClick(): void {
    this.playTone({
      frequency: 700,
      durationMs: 70,
      volume: 0.05,
      waveform: 'square'
    });
  }

  playShoot(): void {
    this.playTone({
      frequency: 560,
      durationMs: 80,
      volume: 0.06,
      waveform: 'sawtooth'
    });
  }

  playEnemyShoot(): void {
    this.playTone({
      frequency: 290,
      durationMs: 90,
      volume: 0.05,
      waveform: 'square'
    });
  }

  playHit(): void {
    this.playTone({
      frequency: 170,
      durationMs: 150,
      volume: 0.08,
      waveform: 'sawtooth'
    });
  }

  playRevive(): void {
    this.playTone({
      frequency: 440,
      durationMs: 130,
      volume: 0.07,
      waveform: 'triangle'
    });
    this.playTone({
      frequency: 660,
      durationMs: 180,
      volume: 0.06,
      waveform: 'triangle',
      delayMs: 120
    });
  }

  playWin(): void {
    this.playTone({
      frequency: 523.25,
      durationMs: 120,
      volume: 0.06,
      waveform: 'triangle'
    });
    this.playTone({
      frequency: 659.25,
      durationMs: 140,
      volume: 0.06,
      waveform: 'triangle',
      delayMs: 130
    });
    this.playTone({
      frequency: 783.99,
      durationMs: 190,
      volume: 0.06,
      waveform: 'triangle',
      delayMs: 260
    });
  }

  private playTone(options: ToneOptions): void {
    if (!this.enabled) {
      return;
    }

    const context = this.ensureContext();
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      return;
    }

    const osc = context.createOscillator();
    const gain = context.createGain();
    const delaySeconds = (options.delayMs ?? 0) / 1000;
    const startAt = context.currentTime + delaySeconds;
    const durationSeconds = Math.max(0.02, options.durationMs / 1000);
    const endAt = startAt + durationSeconds;
    const peakVolume = Math.max(0.0001, options.volume);
    const attackAt = startAt + Math.min(0.02, durationSeconds * 0.35);

    osc.type = options.waveform;
    osc.frequency.setValueAtTime(options.frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peakVolume, attackAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(startAt);
    osc.stop(endAt + 0.01);
  }

  private ensureContext(): AudioContext | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (this.context) {
      return this.context;
    }

    const audioContextCtor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!audioContextCtor) {
      return undefined;
    }

    this.context = new audioContextCtor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.syncMasterGain();
    return this.context;
  }

  private syncMasterGain(): void {
    if (!this.masterGain || !this.context) {
      return;
    }

    const currentTime = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(currentTime);
    this.masterGain.gain.setTargetAtTime(this.enabled ? 0.7 : 0.0001, currentTime, 0.05);
  }
}

export const audioService = new AudioService();
