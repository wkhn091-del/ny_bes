import { PLAYLISTS, shuffledOrder, type Mood, type Track } from '@/content/music';

const VOLUME = 0.55;
const FADE_MS = 1200;

/**
 * Background playlist for the building tour: a shuffled day or night set of self-hosted tracks that
 * advances on its own, with skip and a cross-fade when the sky mood changes. Starts only on a click.
 * Only the current track is fetched (preload none). Volume fades are skipped where the browser
 * ignores `volume` (iOS), which is harmless.
 */
export class AmbientMusic {
  private audio: HTMLAudioElement | null = null;
  private mood: Mood = 'night';
  private queue: number[] = [];
  private last = -1;
  private fade: number | null = null;
  private on = false;

  constructor(private readonly onTrack: (track: Track | null) => void) {}

  get playing(): boolean {
    return this.on;
  }

  async start(mood: Mood) {
    this.on = true;
    if (this.audio && mood === this.mood && this.audio.src) {
      await this.play();
      return;
    }
    this.mood = mood;
    this.queue = [];
    await this.next();
  }

  stop() {
    this.on = false;
    const audio = this.audio;
    if (!audio) return;
    this.fadeTo(0, () => audio.pause());
    this.onTrack(null);
  }

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.queue = [];
    this.last = -1;
    if (this.on) void this.next();
  }

  skip() {
    if (this.on) void this.next();
  }

  dispose() {
    this.on = false;
    if (this.fade !== null) window.clearInterval(this.fade);
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.audio = null;
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', () => {
      if (this.on) void this.next(false);
    });
    this.audio = audio;
    return audio;
  }

  private async next(fadeOut = true) {
    const audio = this.element();
    const list = PLAYLISTS[this.mood];
    if (this.queue.length === 0) this.queue = shuffledOrder(list.length, Math.random, this.last);
    const index = this.queue.shift()!;
    this.last = index;
    const track = list[index]!;
    const swap = () => {
      audio.src = track.src;
      audio.volume = 0;
      this.onTrack(track);
      void this.play();
    };
    if (fadeOut && !audio.paused) this.fadeTo(0, swap);
    else swap();
  }

  private async play() {
    const audio = this.audio;
    if (!audio || !this.on) return;
    try {
      await audio.play();
      this.fadeTo(VOLUME);
    } catch {
      this.on = false;
      this.onTrack(null);
    }
  }

  private fadeTo(target: number, done?: () => void) {
    const audio = this.audio;
    if (!audio) return;
    if (this.fade !== null) window.clearInterval(this.fade);
    const from = audio.volume;
    const started = performance.now();
    this.fade = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - started) / FADE_MS);
      audio.volume = from + (target - from) * k;
      if (k < 1) return;
      window.clearInterval(this.fade!);
      this.fade = null;
      done?.();
    }, 50);
  }
}
