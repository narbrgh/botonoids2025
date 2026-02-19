type SfxOptions = {
  volume?: number;
  rate?: number;
  pitchMin?: number;
  pitchMax?: number;
};

type MusicOptions = {
  loop?: boolean;
  volume?: number;
};

export default class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private musicEls = new Map<string, HTMLAudioElement>();
  private musicBaseVolumes = new Map<string, number>();
  private unlocked = false;
  private musicVolume = 1;
  private sfxVolume = 1;

  private readonly defaultPitchMin: number;
  private readonly defaultPitchMax: number;

  constructor(opts?: { sfxPitchMin?: number; sfxPitchMax?: number }) {
    this.defaultPitchMin = opts?.sfxPitchMin ?? 0.95;
    this.defaultPitchMax = opts?.sfxPitchMax ?? 1.05;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.masterGain.gain.value = 1;
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    this.unlocked = true;
  }

  async loadSfx(key: string, url: string): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("audio load failed", url, res.status);
        return;
      }
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      this.buffers.set(key, decoded);
    } catch (err) {
      console.warn("audio load error", url, err);
    }
  }

  registerMusic(key: string, url: string, opts: MusicOptions = {}): void {
    const el = new Audio(url);
    el.loop = opts.loop ?? true;
    el.preload = "auto";
    const baseVolume = opts.volume ?? 1;
    this.musicBaseVolumes.set(key, baseVolume);
    el.volume = baseVolume * this.musicVolume;
    this.musicEls.set(key, el);
  }

  async playMusic(key: string): Promise<void> {
    const el = this.musicEls.get(key);
    if (!el) return;
    if (!this.unlocked) return;
    try {
      await el.play();
    } catch (err) {
      console.warn("music play error", err);
    }
  }

  stopMusic(key: string): void {
    const el = this.musicEls.get(key);
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    for (const [key, el] of this.musicEls) {
      const base = this.musicBaseVolumes.get(key) ?? 1;
      el.volume = base * this.musicVolume;
    }
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
    this.ensureContext();
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  playSfx(key: string, opts: SfxOptions = {}): void {
    if (!this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(key);
    if (!buf) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buf;

    const pitchMin = opts.pitchMin ?? this.defaultPitchMin;
    const pitchMax = opts.pitchMax ?? this.defaultPitchMax;
    const rate = opts.rate ?? (pitchMin + Math.random() * (pitchMax - pitchMin));
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
