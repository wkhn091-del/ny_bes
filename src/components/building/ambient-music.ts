/**
 * Generative background music for the building tour, synthesised live with Web Audio (no audio
 * files, nothing third-party). Night: deep pad chords, slow piano-like notes and a low city hum.
 * Day: brighter chords, a soft plucked pattern and a light shaker. Starts only on a click.
 */

type Mood = 'day' | 'night';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Chord progressions (MIDI notes) per mood; the melody picks from each chord's own notes plus a ninth. */
const PROGRESSIONS: Record<Mood, number[][]> = {
  night: [
    [45, 52, 57, 60, 64, 71],
    [41, 48, 53, 57, 64, 67],
    [36, 43, 48, 55, 59, 64],
    [43, 50, 55, 59, 62, 69],
  ],
  day: [
    [48, 55, 60, 64, 67, 74],
    [45, 52, 57, 60, 64, 71],
    [41, 48, 53, 57, 60, 69],
    [43, 50, 55, 59, 62, 67],
  ],
};
const CHORD_SECONDS: Record<Mood, number> = { night: 8, day: 4.8 };
const STEP_SECONDS: Record<Mood, number> = { night: 0.6, day: 0.3 };
const LOOKAHEAD = 0.25;

export class AmbientMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private hum: { gain: GainNode; source: AudioBufferSourceNode } | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private mood: Mood = 'night';
  private nextStep = 0;
  private step = 0;

  get playing(): boolean {
    return this.timer !== null;
  }

  async start(mood: Mood) {
    this.mood = mood;
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    await ctx.resume();
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8);
    this.setHum();
    if (this.timer === null) {
      this.nextStep = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 90);
    }
  }

  stop() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (this.timer === null) void ctx.suspend();
    }, 2000);
  }

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.setHum();
  }

  dispose() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);
    this.reverb = reverb;

    const len = ctx.sampleRate * 4;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5;
    }
    const white = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const w = white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.noise = white;

    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(lp).connect(gain).connect(master);
    source.start();
    this.hum = { gain, source };
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private setHum() {
    if (!this.ctx || !this.hum) return;
    this.hum.gain.gain.setTargetAtTime(this.mood === 'night' ? 0.16 : 0.07, this.ctx.currentTime, 1.5);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextStep < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.nextStep);
      this.nextStep += STEP_SECONDS[this.mood];
      this.step += 1;
    }
  }

  private playStep(t: number) {
    const mood = this.mood;
    const stepsPerChord = Math.round(CHORD_SECONDS[mood] / STEP_SECONDS[mood]);
    const chordIndex = Math.floor(this.step / stepsPerChord) % PROGRESSIONS[mood].length;
    const chord = PROGRESSIONS[mood][chordIndex]!;
    const inChord = this.step % stepsPerChord;

    if (inChord === 0) {
      this.pad(chord, t, CHORD_SECONDS[mood] + 1.5, mood === 'night' ? 0.05 : 0.035);
      this.bass(chord[0]! - 12, t, CHORD_SECONDS[mood], mood === 'night' ? 0.12 : 0.1);
    }
    if (mood === 'night') {
      if (Math.random() < 0.22) this.pluck(chord[2 + Math.floor(Math.random() * 4)]! + 12, t, 3.2, 0.07);
    } else {
      const pattern = [1, 0, 0.6, 0, 0.8, 0, 0.6, 0.4];
      const hit = pattern[inChord % pattern.length]!;
      if (hit > 0 && Math.random() < 0.85) this.pluck(chord[1 + ((inChord >> 1) % 5)]! + 12, t, 1.1, 0.055 * hit);
      if (inChord % 2 === 1) this.shaker(t, 0.025);
    }
  }

  private voice(type: OscillatorType, freq: number, t: number, attack: number, hold: number, release: number, level: number, cutoff: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + attack);
    env.gain.setTargetAtTime(0, t + attack + hold, release / 4);
    osc.connect(filter).connect(env);
    env.connect(this.master!);
    env.connect(this.reverb!);
    osc.start(t);
    osc.stop(t + attack + hold + release + 0.1);
  }

  private pad(chord: number[], t: number, length: number, level: number) {
    for (const n of chord.slice(1)) {
      for (const detune of [-4, 4]) {
        const f = midi(n) * Math.pow(2, detune / 1200);
        this.voice('sawtooth', f, t, 1.6, length - 2.4, 2.4, level / chord.length, this.mood === 'night' ? 900 : 1600);
      }
    }
  }

  private bass(n: number, t: number, length: number, level: number) {
    this.voice('sine', midi(n), t, 0.08, length - 0.6, 0.8, level, 400);
  }

  private pluck(n: number, t: number, length: number, level: number) {
    this.voice('triangle', midi(n), t, 0.005, 0.02, length, level, this.mood === 'night' ? 2400 : 3600);
    this.voice('sine', midi(n) * 2, t, 0.005, 0.01, length * 0.5, level * 0.35, 5000);
  }

  private shaker(t: number, level: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(hp).connect(env).connect(this.master!);
    src.start(t, Math.random() * 3, 0.1);
  }
}
