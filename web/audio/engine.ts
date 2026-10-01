// ============================================================================
//  engine.ts: the sound engine.
//
//  Everything is made live with the browser's Web Audio API (oscillators,
//  filters, envelopes), so no audio files are needed. If you drop your own files
//  into user-audio/ they replace the matching built-in sound.
//
//  Three layers:
//    1. MUSIC   a slow chord pad that changes with Claude's mood (calm when
//               waiting, brighter and quicker when working, wobbling out of
//               tune when something fails).
//    2. NOTES   every tool call plays one note, chosen by its color-code kind.
//    3. SOUNDS  glassy clicks and chimes for the interface and for events.
//
//  Browsers keep audio silent until you click something, so nothing plays until
//  start() is called from the "Start Session" button.
// ============================================================================
import { config } from '@config';
import type { Kind } from '@shared/events';

export type Mood = 'idle' | 'thinking' | 'working' | 'done' | 'glitching';
export type Bus = 'music' | 'tools' | 'ui' | 'alerts';
export interface Levels {
  master: number;
  music: number;
  tools: number;
  ui: number;
  alerts: number;
  muted: boolean;
}

/** Every sound that can be replaced by a file in user-audio/ (file name = this name). */
export const SOUND_NAMES = [
  'click', 'send', 'ask', 'allow', 'deny', 'course', 'dish', 'done', 'error',
  'tool-read', 'tool-search', 'tool-edit', 'tool-create', 'tool-delete', 'tool-run', 'tool-other',
  'music-idle', 'music-working',
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];
/** The sounds that play once (the two `music-` ones are loops). */
export type PlayName = Exclude<SoundName, `music-${string}`>;

/** Which volume slider each sound belongs to. */
const BUS_OF: Record<PlayName, Bus> = {
  click: 'ui', send: 'ui', allow: 'ui', deny: 'ui',
  ask: 'alerts', course: 'alerts', dish: 'alerts', done: 'alerts', error: 'alerts',
  'tool-read': 'tools', 'tool-search': 'tools', 'tool-edit': 'tools', 'tool-create': 'tools', 'tool-delete': 'tools', 'tool-run': 'tools', 'tool-other': 'tools',
};

const A = config.audio;
const BUSES: Bus[] = ['music', 'tools', 'ui', 'alerts'];
/** MIDI note number -> frequency in Hz (69 = the A above middle C = 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** The "glass" tone: a sine plus two inharmonic overtones that die away quickly. [frequency ratio, loudness] */
const GLASS: Array<[number, number]> = [[1, 1], [2.76, 0.32], [5.4, 0.12]];
/** Which chord notes the arpeggio walks through. */
const ARP = [0, 2, 1, 3, 4, 3, 1, 2];

class Engine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus = {} as Record<Bus, GainNode>;
  /** Every music voice plugs in here; the low-pass filter after it is what makes the music "brighter". */
  private musicIn!: GainNode;
  private musicFilter!: BiquadFilterNode;
  /** A slow LFO whose depth (in cents) detunes every pad voice. 0 = in tune. */
  private wobble!: GainNode;
  private noise!: AudioBuffer;
  /** Your own sounds from user-audio/, by name. */
  private custom = new Map<string, AudioBuffer>();
  private loops: { idle?: GainNode; working?: GainNode } = {};
  private levels: Levels = { ...A.volumes, muted: false };
  private mood: Mood = 'idle';
  private calm = false;
  private timer: number | undefined;
  private wobbleTimer: number | undefined;
  private lastPlayed = new Map<string, number>();
  // the music clock
  private nextTime = 0;
  private step = 0;
  private chord = 0;
  private chordEnd = 0;
  private notes: number[] = A.chords[0];
  /** Called when the list of your own sounds changes (so the sound menu can show it). */
  onCustomChange: (names: string[]) => void = () => {};

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }
  customNames() {
    return [...this.custom.keys()];
  }

  // ---- start / stop ----------------------------------------------------------
  /** Must be called from a click: browsers refuse to make sound before that. */
  async start() {
    if (this.ctx) return void (await this.ctx.resume());
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // master -> compressor (keeps loud moments from clipping) -> speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);

    // one shared reverb ("the room"); each volume bus sends a little of itself into it
    const verb = ctx.createConvolver();
    verb.buffer = this.makeRoom(2.4);
    const wet = ctx.createGain();
    wet.gain.value = A.reverb;
    verb.connect(wet).connect(this.master);
    for (const name of BUSES) {
      const g = ctx.createGain();
      g.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = name === 'music' ? 0.5 : 0.35;
      g.connect(send).connect(verb);
      this.bus[name] = g;
    }

    // music path: voices -> musicIn -> low-pass filter -> music volume
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.Q.value = 0.7;
    this.musicFilter.frequency.value = A.moods.idle.cutoff;
    this.musicFilter.connect(this.bus.music);
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.musicFilter);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.3;
    this.wobble = ctx.createGain();
    this.wobble.gain.value = 0;
    lfo.connect(this.wobble);
    lfo.start();

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.applyLevels(true);
    await ctx.resume();
    await this.loadCustom();
    this.applyMood(true);
    this.nextTime = ctx.currentTime + 0.1;
    this.chord = 0;
    this.chordEnd = 0;
    this.timer = window.setInterval(() => this.tick(), 40);
  }

  /** Back to silence (and free the audio hardware). */
  stop() {
    window.clearInterval(this.timer);
    window.clearTimeout(this.wobbleTimer);
    this.timer = undefined;
    this.loops = {};
    this.custom.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.onCustomChange([]);
  }

  // ---- settings from the app -----------------------------------------------------
  setLevels(l: Levels) {
    this.levels = l;
    this.applyLevels(false);
  }
  setCalm(calm: boolean) {
    this.calm = calm;
    this.applyMood(false);
  }
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.applyMood(false);
  }

  private applyLevels(now: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => (now ? (g.gain.value = v) : g.gain.setTargetAtTime(v, t, 0.04));
    set(this.master, this.levels.muted ? 0 : this.levels.master);
    for (const b of BUSES) set(this.bus[b], this.levels[b]);
  }

  /** Move the music's brightness, loudness and warble to match the mood. */
  private applyMood(now: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = A.moods[this.mood];
    const ramp = (p: AudioParam, v: number, tc: number) => (now ? (p.value = v) : p.setTargetAtTime(v, t, tc));
    ramp(this.musicFilter.frequency, m.cutoff, 0.7);
    ramp(this.musicIn.gain, m.level, 0.5);
    ramp(this.wobble.gain, this.calm ? 0 : m.wobble, 0.15); // calm mode never warbles
    // if you supplied loops, cross-fade between them instead
    const wantWorking = this.mood === 'working' || this.mood === 'glitching';
    const a = this.loops.idle;
    const b = this.loops.working;
    if (a || b) {
      const on = wantWorking ? (b ?? a) : (a ?? b);
      for (const g of [a, b]) if (g) ramp(g.gain, g === on ? 1 : 0, 0.8);
    }
  }

  // ---- the music clock ----------------------------------------------------------------
  private bpm() {
    return A.moods[this.mood].bpm;
  }

  /** Runs every 40 ms and schedules the next notes a little ahead of time (so timing stays tight). */
  private tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.loops.idle || this.loops.working) return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05; // tab was asleep: don't play catch-up
    while (this.nextTime < ctx.currentTime + 0.18) {
      if (this.nextTime >= this.chordEnd) this.startChord(this.nextTime);
      this.playStep(this.nextTime);
      this.nextTime += 60 / this.bpm() / 4; // one 16th note
      this.step++;
    }
  }

  private startChord(t: number) {
    this.notes = A.chords[this.chord % A.chords.length];
    this.chord++;
    const len = (A.beatsPerChord * 60) / this.bpm();
    this.chordEnd = t + len;
    for (const n of this.notes) this.pad(n, t, len);
    this.pad(this.notes[0] - 12, t, len); // a low root underneath
  }

  /** One pad voice: two slightly detuned saw waves with a slow fade in and out. */
  private pad(midi: number, t: number, len: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(A.padLevel, t + 1.2);
    g.gain.setValueAtTime(A.padLevel, t + len);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 2);
    g.connect(this.musicIn);
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(midi);
      o.detune.value = cents;
      this.wobble.connect(o.detune);
      o.connect(g);
      o.start(t);
      o.stop(t + len + 2.1);
      o.onended = () => {
        try {
          this.wobble.disconnect(o.detune);
        } catch {
          /* the audio context was already closed */
        }
      };
    }
  }

  /** What to play on this 16th-note step, depending on the mood. */
  private playStep(t: number) {
    const s = this.step;
    const n = this.notes;
    const m = this.mood;
    const calm = this.calm;
    const pick = (i: number, up: number) => n[i % n.length] + up;
    const working = m === 'working' && !calm;

    if (m === 'idle' || m === 'done') {
      // a rare, soft bell
      if (s % 8 === 0 && Math.random() < 0.5) this.glass(pick(Math.floor(Math.random() * n.length), 24), t, { dur: 2.2, gain: 0.05, bus: 'music' });
    } else if (working) {
      // a quick arpeggio, a soft pulse and a hi-hat tick
      this.pluck(pick(ARP[s % 8], s % 16 >= 8 ? 24 : 12), t, s % 4 === 0 ? 1 : 0.55);
      if (s % 2 === 1) this.hat(t, 0.5);
      if (s % 8 === 0) this.kick(t);
    } else if (s % 2 === 0 && Math.random() < 0.75) {
      // thinking (and glitching): a slow, sparse arpeggio
      const detune = m === 'glitching' && !calm ? (Math.random() - 0.5) * 90 : 0;
      this.pluck(pick(ARP[(s / 2) % 8], 12), t, 0.5, detune);
      // in a glitch, now and then a note a half-step too high: sweet, but wrong
      if (m === 'glitching' && !calm && Math.random() < 0.2) this.glass(pick(1, 25), t, { dur: 0.9, gain: 0.05, bus: 'music' });
    }
  }

  // ---- building blocks ------------------------------------------------------------------
  /** A glassy chime: a sine with two overtones that fade faster than the main tone. */
  private glass(midi: number, t: number, o: { dur?: number; gain?: number; bus: Bus }) {
    const ctx = this.ctx!;
    const dur = o.dur ?? 0.5;
    const out = this.bus[o.bus];
    GLASS.forEach(([ratio, amp], i) => {
      const f = hz(midi) * ratio;
      if (f > 14000) return;
      const d = dur / (1 + i * 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((o.gain ?? 0.2) * amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + d + 0.05);
    });
  }

  /** A short plucked note that goes through the music filter (so it gets brighter with the mood). */
  private pluck(midi: number, t: number, vel: number, cents = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(midi);
    o.detune.value = cents;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.musicIn);
    o.start(t);
    o.stop(t + 0.35);
  }

  private hat(t: number, vel: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp).connect(g).connect(this.bus.music);
    src.start(t, Math.random() * 0.5, 0.06);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.bus.music);
    o.start(t);
    o.stop(t + 0.22);
  }

  /** A burst of shimmering noise (used for the "you earned a dish" sparkle). */
  private sparkle(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(hp).connect(g).connect(this.bus.alerts);
    src.start(t, 0, 0.65);
  }

  /** "Something broke": two saws a half-step apart sliding down, and the music warbles out of tune for a moment. */
  private stab(t: number) {
    const ctx = this.ctx!;
    if (this.calm) return this.glass(50, t, { dur: 0.8, gain: 0.12, bus: 'alerts' }); // calm mode: one soft low chime
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    lp.connect(g).connect(this.bus.alerts);
    for (const m of [50, 51]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz(m), t);
      o.frequency.exponentialRampToValueAtTime(hz(m) * 0.78, t + 0.55);
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.65);
    }
    this.wobble.gain.setTargetAtTime(60, t, 0.02);
    window.clearTimeout(this.wobbleTimer);
    this.wobbleTimer = window.setTimeout(() => this.applyMood(false), 2400);
  }

  /** A made-up small room: noise that fades away. */
  private makeRoom(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  // ---- one-shot sounds -------------------------------------------------------------------
  /** Play a named sound (your own file if you provided one, otherwise the built-in one). */
  play(name: PlayName) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - (this.lastPlayed.get(name) ?? -1) < 0.035) return; // never stack the same sound within a few ms
    this.lastPlayed.set(name, t);
    const buf = this.custom.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.bus[BUS_OF[name]]);
      return src.start();
    }
    const bus = BUS_OF[name];
    switch (name) {
      case 'click':
        return this.glass(88, t, { dur: 0.08, gain: 0.1, bus });
      case 'send':
        this.glass(84, t, { dur: 0.25, gain: 0.12, bus });
        return this.glass(88, t + 0.05, { dur: 0.3, gain: 0.12, bus });
      case 'ask': // a rising "may I?"
        this.glass(79, t, { dur: 0.5, gain: 0.16, bus });
        return this.glass(86, t + 0.12, { dur: 0.9, gain: 0.16, bus });
      case 'allow':
        this.glass(84, t, { dur: 0.3, gain: 0.14, bus });
        return this.glass(91, t + 0.07, { dur: 0.5, gain: 0.14, bus });
      case 'deny':
        this.glass(67, t, { dur: 0.4, gain: 0.16, bus });
        return this.glass(62, t + 0.1, { dur: 0.6, gain: 0.16, bus });
      case 'course': // a service bell
        this.glass(93, t, { dur: 1.2, gain: 0.2, bus });
        return this.glass(81, t, { dur: 1, gain: 0.12, bus });
      case 'dish': // a sparkling arpeggio
        [84, 88, 91, 96].forEach((m, i) => this.glass(m, t + i * 0.065, { dur: 1, gain: 0.15, bus }));
        return this.sparkle(t + 0.05);
      case 'done': // the music resolves to its home chord and a bright arpeggio rings over it
        this.chord = 0;
        this.chordEnd = 0;
        [77, 81, 84, 88, 91].forEach((m, i) => this.glass(m, t + i * 0.085, { dur: 1.6, gain: 0.15, bus }));
        return this.sparkle(t + 0.2);
      case 'error':
        return this.stab(t);
      default: {
        // tool-<kind>: one note per tool call
        const kind = name.slice(5) as Kind;
        const note = A.toolNotes[kind] ?? 69;
        return this.glass(note, t, { dur: kind === 'delete' ? 0.7 : 0.45, gain: 0.13, bus });
      }
    }
  }

  /** The note a tool call plays. */
  toolNote(kind: Kind) {
    this.play(`tool-${kind}` as PlayName);
  }

  // ---- your own files -------------------------------------------------------------------------
  private async loadCustom() {
    const ctx = this.ctx!;
    try {
      const { files } = (await (await fetch('/api/audio')).json()) as { files: string[] };
      await Promise.all(
        files.map(async (file) => {
          const base = file.replace(/\.[^.]+$/, '');
          if (!(SOUND_NAMES as readonly string[]).includes(base)) return; // not one of our sound names: ignore
          try {
            const bytes = await (await fetch(`/api/audio/${encodeURIComponent(file)}`)).arrayBuffer();
            this.custom.set(base, await ctx.decodeAudioData(bytes));
          } catch {
            /* not a playable audio file: skip it */
          }
        }),
      );
    } catch {
      /* no backend or no folder: just use the built-in sounds */
    }
    // looping background music supplied by you replaces the generated music
    for (const which of ['idle', 'working'] as const) {
      const buf = this.custom.get(`music-${which}`);
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.bus.music);
      src.start();
      this.loops[which] = g;
    }
    this.onCustomChange(this.customNames());
  }
}

export const engine = new Engine();
