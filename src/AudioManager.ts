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

type IntroEndedHandler = (() => void) | null;

type SingleMusicTrack = {
  kind: "single";
  el: HTMLAudioElement;
  baseVolume: number;
};

type IntroLoopMusicTrack = {
  kind: "introLoop";
  introEl: HTMLAudioElement;
  loopEl: HTMLAudioElement;
  baseVolume: number;
  playToken: number;
  introEndedHandler: IntroEndedHandler;
};

type MusicTrack = SingleMusicTrack | IntroLoopMusicTrack;

export default class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private musicTracks = new Map<string, MusicTrack>();
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
    el.volume = baseVolume * this.musicVolume;
    this.musicTracks.set(key, {
      kind: "single",
      el,
      baseVolume,
    });
  }

  registerMusicIntroLoop(key: string, introUrl: string, loopUrl: string, opts: MusicOptions = {}): void {
    const baseVolume = opts.volume ?? 1;
    const introEl = new Audio(introUrl);
    introEl.preload = "auto";
    introEl.loop = false;
    introEl.volume = baseVolume * this.musicVolume;

    const loopEl = new Audio(loopUrl);
    loopEl.preload = "auto";
    loopEl.loop = true;
    loopEl.volume = baseVolume * this.musicVolume;

    this.musicTracks.set(key, {
      kind: "introLoop",
      introEl,
      loopEl,
      baseVolume,
      playToken: 0,
      introEndedHandler: null,
    });
  }

  async playMusic(key: string): Promise<void> {
    const track = this.musicTracks.get(key);
    if (!track) return;
    if (!this.unlocked) return;

    if (track.kind === "single") {
      if (!track.el.paused && !track.el.ended) return;
      try {
        await track.el.play();
      } catch (err) {
        console.warn("music play error", err);
      }
      return;
    }

    const { introEl, loopEl } = track;
    if ((!introEl.paused && !introEl.ended) || (!loopEl.paused && !loopEl.ended)) {
      return;
    }
    track.playToken += 1;
    const token = track.playToken;

    if (track.introEndedHandler) {
      introEl.removeEventListener("ended", track.introEndedHandler);
      track.introEndedHandler = null;
    }

    introEl.pause();
    introEl.currentTime = 0;
    loopEl.pause();
    loopEl.currentTime = 0;

    const onIntroEnded = async () => {
      if (track.playToken !== token) return;
      try {
        await loopEl.play();
      } catch (err) {
        console.warn("music loop play error", err);
      }
    };
    track.introEndedHandler = onIntroEnded;
    introEl.addEventListener("ended", onIntroEnded, { once: true });

    try {
      await introEl.play();
    } catch (err) {
      console.warn("music intro play error", err);
    }
  }

  stopMusic(key: string): void {
    const track = this.musicTracks.get(key);
    if (!track) return;

    if (track.kind === "single") {
      track.el.pause();
      track.el.currentTime = 0;
      return;
    }

    track.playToken += 1;
    if (track.introEndedHandler) {
      track.introEl.removeEventListener("ended", track.introEndedHandler);
      track.introEndedHandler = null;
    }
    track.introEl.pause();
    track.introEl.currentTime = 0;
    track.loopEl.pause();
    track.loopEl.currentTime = 0;
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    for (const track of this.musicTracks.values()) {
      if (track.kind === "single") {
        track.el.volume = track.baseVolume * this.musicVolume;
      } else {
        const volume = track.baseVolume * this.musicVolume;
        track.introEl.volume = volume;
        track.loopEl.volume = volume;
      }
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
