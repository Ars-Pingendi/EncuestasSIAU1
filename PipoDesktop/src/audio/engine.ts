// Motor de audio: <audio> → Web Audio (ecualizador de 10 bandas, graves, envolvente,
// amplificación con limitador) → salida elegida.
import { BANDS_HZ, BASS_HZ, LOUDNESS_MAX_DB, Q, bassDb, preampDb, type EqParams } from './presets';

const SMOOTH = 0.03;

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

export class AudioEngine {
  readonly el: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private pre!: GainNode;
  private bands: BiquadFilterNode[] = [];
  private bass!: BiquadFilterNode;
  private ll!: GainNode;
  private lr!: GainNode;
  private rl!: GainNode;
  private rr!: GainNode;
  private loud!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private vol!: GainNode;
  private _analyser: AnalyserNode | null = null;
  private eq: EqParams = { enabled: false, bands: Array(10).fill(0), bass: 0, width: 0, loudness: 0 };
  private volume = 1;
  private sinkId = '';

  constructor() {
    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
  }

  get analyser(): AnalyserNode | null {
    return this._analyser;
  }

  private ensureGraph() {
    if (this.ctx) return;
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    const src = ctx.createMediaElementSource(this.el);

    // Asegura dos canales (los archivos mono se duplican a izquierda y derecha).
    const up = ctx.createGain();
    up.channelCount = 2;
    up.channelCountMode = 'explicit';
    up.channelInterpretation = 'speakers';

    this.pre = ctx.createGain();
    this.bands = BANDS_HZ.map((hz) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = hz;
      f.Q.value = Q;
      f.gain.value = 0;
      return f;
    });
    this.bass = ctx.createBiquadFilter();
    this.bass.type = 'lowshelf';
    this.bass.frequency.value = BASS_HZ;
    this.bass.gain.value = 0;

    // Ensanchador estéreo (medio/lateral) para el «sonido envolvente».
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    this.ll = ctx.createGain();
    this.lr = ctx.createGain();
    this.rl = ctx.createGain();
    this.rr = ctx.createGain();

    this.loud = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.knee.value = 0;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    this.vol = ctx.createGain();
    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = 2048;
    this._analyser.smoothingTimeConstant = 0.78;

    src.connect(up).connect(this.pre);
    let node: AudioNode = this.pre;
    for (const b of this.bands) {
      node.connect(b);
      node = b;
    }
    node.connect(this.bass).connect(split);
    split.connect(this.ll, 0);
    split.connect(this.rl, 0);
    split.connect(this.lr, 1);
    split.connect(this.rr, 1);
    this.ll.connect(merge, 0, 0); // L → L
    this.lr.connect(merge, 0, 0); // R → L
    this.rl.connect(merge, 0, 1); // L → R
    this.rr.connect(merge, 0, 1); // R → R
    merge.connect(this.loud).connect(this.limiter).connect(this.vol).connect(this._analyser).connect(ctx.destination);

    this.applyEq(true);
    this.applyVolume(true);
    if (this.sinkId) void this.setSink(this.sinkId);
  }

  private param(p: AudioParam, value: number, immediate: boolean) {
    if (!this.ctx) return;
    if (immediate) p.value = value;
    else p.setTargetAtTime(value, this.ctx.currentTime, SMOOTH);
  }

  private applyEq(immediate = false) {
    if (!this.ctx) return;
    const e = this.eq;
    const on = e.enabled;
    this.param(this.pre.gain, dbToGain(preampDb(e)), immediate);
    this.bands.forEach((b, i) => this.param(b.gain, on ? e.bands[i] ?? 0 : 0, immediate));
    this.param(this.bass.gain, on ? bassDb(e) : 0, immediate);
    const w = on ? 1 + (e.width / 100) * 1.2 : 1;
    this.param(this.ll.gain, (1 + w) / 2, immediate);
    this.param(this.rr.gain, (1 + w) / 2, immediate);
    this.param(this.lr.gain, (1 - w) / 2, immediate);
    this.param(this.rl.gain, (1 - w) / 2, immediate);
    this.param(this.loud.gain, dbToGain(on ? (e.loudness / 100) * LOUDNESS_MAX_DB : 0), immediate);
    // Limitador suave: solo actúa cuando el ecualizador está activo.
    this.limiter.threshold.value = on ? -1.5 : 0;
    this.limiter.ratio.value = on ? 20 : 1;
  }

  private applyVolume(immediate = false) {
    if (!this.ctx) return;
    // Curva perceptual: el control lineal de 0 a 1 se vuelve cuadrático.
    this.param(this.vol.gain, this.volume * this.volume, immediate);
  }

  setEq(params: EqParams) {
    this.eq = { ...params, bands: [...params.bands] };
    this.applyEq();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  async setSink(deviceId: string): Promise<boolean> {
    this.sinkId = deviceId === 'default' ? '' : deviceId;
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx?.setSinkId) return false;
    try {
      await ctx.setSinkId(this.sinkId);
      return true;
    } catch (err) {
      console.warn('No se pudo cambiar la salida de audio', err);
      return false;
    }
  }

  load(url: string) {
    this.el.src = url;
    this.el.load();
  }

  async play() {
    this.ensureGraph();
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();
    await this.el.play();
  }

  pause() {
    this.el.pause();
  }

  stop() {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

export const engine = new AudioEngine();
