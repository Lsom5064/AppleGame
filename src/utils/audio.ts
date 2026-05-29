type OscillatorKind = OscillatorType;

const BGM_STEP_SEC = 0.24;
const BGM_LOOKAHEAD_MS = 120;
const BGM_NOTES = [392, 0, 523.25, 0, 493.88, 0, 440, 0, 392, 0, 329.63, 0, 349.23, 0, 392, 0];

class GameAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = false;
  private bgmRequested = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private nextBgmNoteAt = 0;

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    if (!enabled) {
      this.stopBgm();
      return;
    }

    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    if (this.bgmRequested) {
      this.startBgm();
    }
  }

  setBgmPlaying(playing: boolean): void {
    this.bgmRequested = playing;

    if (!playing || !this.enabled) {
      this.stopBgm();
      return;
    }

    this.startBgm();
  }

  playAppleClear(): void {
    const context = this.getReadyContext();

    if (!context) {
      return;
    }

    const start = context.currentTime;
    this.scheduleTone(659.25, start, 0.08, 0.055, "triangle");
    this.scheduleTone(880, start + 0.055, 0.08, 0.05, "triangle");
    this.scheduleTone(1174.66, start + 0.11, 0.12, 0.045, "sine");
  }

  dispose(): void {
    this.stopBgm();
  }

  private getReadyContext(): AudioContext | null {
    if (!this.enabled) {
      return null;
    }

    const context = this.ensureContext();

    if (!context || context.state !== "running") {
      return null;
    }

    return context;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.context) {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextConstructor) {
        return null;
      }

      this.context = new AudioContextConstructor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.32;
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  private startBgm(): void {
    const context = this.getReadyContext();

    if (!context || this.bgmTimer !== null) {
      return;
    }

    this.nextBgmNoteAt = context.currentTime;
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), BGM_LOOKAHEAD_MS);
    this.scheduleBgm();
  }

  private stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    this.bgmStep = 0;
    this.nextBgmNoteAt = 0;
  }

  private scheduleBgm(): void {
    const context = this.getReadyContext();

    if (!context) {
      this.stopBgm();
      return;
    }

    while (this.nextBgmNoteAt < context.currentTime + 0.45) {
      const note = BGM_NOTES[this.bgmStep % BGM_NOTES.length];

      if (note > 0) {
        this.scheduleTone(note, this.nextBgmNoteAt, 0.16, 0.018, "triangle");

        if (this.bgmStep % 8 === 0) {
          this.scheduleTone(note / 2, this.nextBgmNoteAt, 0.22, 0.012, "sine");
        }
      }

      this.bgmStep += 1;
      this.nextBgmNoteAt += BGM_STEP_SEC;
    }
  }

  private scheduleTone(
    frequency: number,
    startAt: number,
    duration: number,
    volume: number,
    type: OscillatorKind
  ): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const endAt = startAt + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  }
}

export const gameAudio = new GameAudioEngine();
