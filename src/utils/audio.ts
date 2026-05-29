import bgmUrl from "../../bgm.mp3";

type OscillatorKind = OscillatorType;

const EFFECT_VOLUME_MULTIPLIER = 2.2;

class GameAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmElement: HTMLAudioElement | null = null;
  private enabled = false;
  private bgmRequested = false;
  private volume = 0.32;

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    if (!enabled) {
      this.stopBgm();
      return;
    }

    const context = this.ensureContext();

    if (context?.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // File-based BGM can still be attempted even if Web Audio remains locked.
      }
    }

    if (this.bgmRequested) {
      this.startBgm();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context?.currentTime ?? 0, 0.015);
    }

    if (this.bgmElement) {
      this.bgmElement.volume = this.volume;
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
    this.scheduleTone(659.25, start, 0.08, 0.055 * EFFECT_VOLUME_MULTIPLIER, "triangle");
    this.scheduleTone(880, start + 0.055, 0.08, 0.05 * EFFECT_VOLUME_MULTIPLIER, "triangle");
    this.scheduleTone(1174.66, start + 0.11, 0.12, 0.045 * EFFECT_VOLUME_MULTIPLIER, "sine");
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
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  private startBgm(): void {
    const bgmElement = this.ensureBgmElement();

    if (!bgmElement) {
      return;
    }

    bgmElement.volume = this.volume;

    if (bgmElement.paused) {
      void bgmElement.play().catch(() => {});
    }
  }

  private stopBgm(): void {
    if (this.bgmElement) {
      this.bgmElement.pause();
    }
  }

  private ensureBgmElement(): HTMLAudioElement | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.bgmElement) {
      this.bgmElement = new Audio(bgmUrl);
      this.bgmElement.loop = true;
      this.bgmElement.preload = "auto";
      this.bgmElement.volume = this.volume;
    }

    return this.bgmElement;
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
