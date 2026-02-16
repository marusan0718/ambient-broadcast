/**
 * Ambient Tide — 怖さゼロ固定（FINAL）
 * ✅ 使うもの
 *  - 和音：I–IV–V–I（add2/add9のみ、7th禁止、短調禁止）
 *  - 波形：sineのみ（倍音で刺さるのを排除）
 *  - メロディ：メジャー・ペンタ固定、隣接移動のみ、低音域、上限A4
 *  - フィルタ：LPF 1200固定（高音を物理的に消す）
 *  - エンベロープ：超なめらか（急アタック禁止）
 *
 * ❌ 使わないもの
 *  - 鳥/水滴/ベル/ノイズ（高域・不規則で怖さが出やすい）
 *  - ランダム跳躍 / 不協和 / 7th / 短調
 */

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// UI
const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const modeLine = document.getElementById("modeLine");
const countdown = document.getElementById("countdown");

const state = {
  manual: { time: "auto", weather: "auto", season: "auto" },
  nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
  seed: (Date.now() >>> 0),
  playing: false,
};

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

function getAutoTimeBlock(){
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  if (h >= 19 && h < 24) return "night";
  return "late";
}

function label(k,v){
  const map = {
    time: { morning:"朝", day:"昼", evening:"夕", night:"夜", late:"深夜", auto:"Auto" },
    weather: { clear:"晴れ", cloudy:"くもり", rain:"雨", auto:"Auto" },
    season: { spring:"春", summer:"夏", autumn:"秋", winter:"冬", auto:"Auto" },
  };
  return map?.[k]?.[v] ?? v;
}

function getEnv(){
  const time = (state.manual.time === "auto") ? getAutoTimeBlock() : state.manual.time;
  return { time, weather: state.manual.weather, season: state.manual.season, seed: state.seed };
}

// UI bind
document.querySelectorAll(".chips").forEach(group => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;

    const key = group.dataset.key;
    state.manual[key] = btn.dataset.val;

    [...group.querySelectorAll(".chip")].forEach(b => b.classList.toggle("is-active", b === btn));

    renderStatus();
    if (engine && state.playing) engine.regenerate(getEnv());
  });
});

playBtn.addEventListener("click", async () => {
  try {
    if (!state.playing) {
      await startPlayback();
      state.playing = true;
      playIcon.textContent = "❚❚";
    } else {
      stopPlayback();
      state.playing = false;
      playIcon.textContent = "▶︎";
    }
  } catch (err) {
    console.error(err);
    alert("再生できなかった…（iPhoneはボタン操作直後に音が必要だよ）");
  }
});

function renderStatus(){
  const env = getEnv();
  const manual = Object.values(state.manual).some(v => v !== "auto");
  modeLine.textContent =
    `${manual ? "Manual" : "Auto"}: ${label("time", env.time)} / ${label("weather", env.weather)} / ${label("season", env.season)}`;
}

function tickCountdown(){
  const now = Date.now();
  let remain = state.nextUpdateAt - now;

  if (remain <= 0) {
    state.nextUpdateAt = now + UPDATE_INTERVAL_MS;
    state.seed = (state.seed + 1013904223) >>> 0;

    if (engine && state.playing) engine.regenerate(getEnv());
    renderStatus();

    remain = state.nextUpdateAt - now;
  }

  countdown.textContent = `次の更新まで ${fmt(remain)}`;
  requestAnimationFrame(tickCountdown);
}
function fmt(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const m = String(Math.floor(total/60)).padStart(2,"0");
  const s = String(total%60).padStart(2,"0");
  return `${m}:${s}`;
}

// PRNG（seedで統一感だけ出す。怖さ回避のためランダム性は弱め）
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function midiToHz(m){ return 440 * Math.pow(2, (m-69)/12); }

let engine = null;

async function startPlayback(){
  if (!engine) engine = new ZeroFearEngine();
  await engine.start(getEnv());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ambient Tide" });
  }
}
function stopPlayback(){ engine?.stop(); }

class ZeroFearEngine{
  constructor(){
    this.ctx = null;

    this.master = null;
    this.comp = null;
    this.lpf = null;

    this.padBus = null;
    this.melBus = null;

    this._timers = [];
    this._rng = null;

    this._chordNodes = [];
    this._bpm = 50;               // ゆっくり固定
    this._q = 60 / this._bpm;     // 4分
    this._e = this._q / 2;        // 8分
    this._bar = this._q * 4;      // 1小節
    this._progIndex = 0;
  }

  async start(env){
    if (!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // master（安全に）
      this.master = this.ctx.createGain();
      this.master.gain.value = 1.10;

      // compressor（軽め）
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -22;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 3.0;
      this.comp.attack.value = 0.01;
      this.comp.release.value = 0.18;

      // LPF：怖さゼロの要。高域は物理的に消す
      this.lpf = this.ctx.createBiquadFilter();
      this.lpf.type = "lowpass";
      this.lpf.frequency.value = 1200;   // ✅ 固定
      this.lpf.Q.value = 0.7;

      this.padBus = this.ctx.createGain();
      this.padBus.gain.value = 1.0;

      this.melBus = this.ctx.createGain();
      this.melBus.gain.value = 0.42;     // ✅ メロディ控えめ固定

      // routing
      this.padBus.connect(this.lpf);
      this.melBus.connect(this.lpf);
      this.lpf.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._tapBeep();

    this.regenerate(env);
  }

  stop(){
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    this._stopChord();
    if (this.ctx) this.ctx.suspend();
  }

  regenerate(env){
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    this._rng = mulberry32((env.seed ^ 0x12345678) >>> 0);
    this._progIndex = 0;

    // 全部固定（怖さゼロ優先）なので env で大きく変えない
    // ただし “統一感” のために seed だけ使う

    this._playChordLoop();
    this._playMelodyLoop();
  }

  _root(){
    // 固定：Cメジャー（最も安心）
    return 60; // C
  }

  _progression(root){
    // ✅ I – IV – V – I（add2/add9のみ）
    // 7th禁止 / 短調禁止 / トライトーン感の出る構成を避ける
    const I  = [0, 4, 7, 14];  // C E G D
    const IV = [5, 9, 12, 14]; // F A C D
    const V  = [7, 11, 14, 16];// G B D E
    return [I, IV, V, I].map(ch => ch.map(x => root + x));
  }

  _stopChord(){
    this._chordNodes.forEach(n => { try { n.osc.stop(); } catch(_){} });
    this._chordNodes = [];
  }

  _playChordLoop(){
    const root = this._root();
    const prog = this._progression(root);
    const chord = prog[this._progIndex % prog.length];
    this._progIndex++;

    const now = this.ctx.currentTime;

    // 旧コードをゆっくり消す
    this._chordNodes.forEach(n => {
      try {
        n.g.gain.setTargetAtTime(0.00001, now, 3.2);
        n.osc.stop(now + 6.0);
      } catch(_){}
    });
    this._chordNodes = [];

    // 新コード（sineのみ / 低め / ゆっくり立ち上げ）
    chord.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";

      const midi = m - 12; // 低め
      osc.frequency.setValueAtTime(midiToHz(midi), now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.00001, now);
      g.gain.exponentialRampToValueAtTime(0.10 + i*0.02, now + 3.0);
      g.gain.setTargetAtTime(0.085 + i*0.015, now + 4.0, 3.5);

      osc.connect(g);
      g.connect(this.padBus);

      osc.start(now);
      this._chordNodes.push({ osc, g });
    });

    // 次のコード：2小節固定（ゆったり）
    this._timers.push(setTimeout(() => this._playChordLoop(), (this._bar * 2) * 1000));
  }

  _scale(){
    // ✅ メジャー・ペンタ固定
    return [0, 2, 4, 7, 9];
  }

  _melBase(){
    // ✅ 低め固定：G3付近（安心）
    return 55; // G3
  }

  _playMelodyLoop(){
    const scale = this._scale();
    const base = this._melBase();

    const now = this.ctx.currentTime;

    // ✅ 完全固定の安全モチーフ（跳躍ゼロ）
    // 8分×8 = 1小節（うるさくしない）
    const tpl = [0,1,2,1, 0,1,0,null];

    // ✅ 出現率も固定で低め（主張させない）
    const play = (this._rng() < 0.40);

    if (play){
      // 開始度数は0 or 1（安定）
      const deg0 = (this._rng() < 0.5) ? 0 : 1;

      tpl.forEach((d, i) => {
        if (d === null) return;

        const deg = clamp(deg0 + d, 0, scale.length - 1);
        let midi = base + scale[deg];

        // ✅ 上限A4（69）までに固定（高音禁止）
        midi = Math.min(midi, 69);

        const t0 = now + i * this._e;
        this._tone(midi, t0, this._e * 0.95);
      });
    }

    // 次：2小節に1回（間を作る）
    this._timers.push(setTimeout(() => this._playMelodyLoop(), (this._bar * 2) * 1000));
  }

  _tone(midi, t0, dur){
    const o = this.ctx.createOscillator();
    o.type = "sine"; // ✅ 倍音なし

    o.frequency.setValueAtTime(midiToHz(midi), t0);

    const g = this.ctx.createGain();
    // ✅ なめらか（急アタック禁止）
    g.gain.setValueAtTime(0.00001, t0);
    g.gain.exponentialRampToValueAtTime(0.020, t0 + 0.18);
    g.gain.setTargetAtTime(0.00001, t0 + dur, 0.20);

    o.connect(g);
    g.connect(this.melBus);

    o.start(t0);
    o.stop(t0 + dur + 0.40);
  }

  _tapBeep(){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = 440;
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.0006, now + 0.01);
    g.gain.linearRampToValueAtTime(0.0, now + 0.03);
    o.connect(g);
    g.connect(this.comp);
    o.start(now);
    o.stop(now + 0.05);
  }
}

// init
renderStatus();
tickCountdown();
