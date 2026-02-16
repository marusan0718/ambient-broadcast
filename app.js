/**
 * Ambient Tide — 明るく音楽 / 環境で変化
 * - 目的：怖くない、でも明るく、音楽として成立
 * - 仕組み：コード進行 + アルペジオ(旋律) + たまにモチーフ
 * - 変化：time/weather/season で key/tempo/density/brightness が変化
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
function midiToHz(m){ return 440 * Math.pow(2, (m-69)/12); }

function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function renderStatus(){
  const env = getEnv();
  const manual = Object.values(state.manual).some(v => v !== "auto");
  modeLine.textContent =
    `${manual ? "Manual" : "Auto"}: ${label("time", env.time)} / ${label("weather", env.weather)} / ${label("season", env.season)}`;
}

function fmt(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const m = String(Math.floor(total/60)).padStart(2,"0");
  const s = String(total%60).padStart(2,"0");
  return `${m}:${s}`;
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

let engine = null;

async function startPlayback(){
  if (!engine) engine = new BrightMusicEngine();
  await engine.start(getEnv());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ambient Tide" });
  }
}
function stopPlayback(){ engine?.stop(); }

// ===== 音作りの “怖くない明るさ” レシピ =====
function recipe(env){
  // tempo
  let bpm = 56;
  if (env.time === "morning") bpm = 62;
  if (env.time === "day") bpm = 64;
  if (env.time === "evening") bpm = 56;
  if (env.time === "night") bpm = 50;
  if (env.time === "late") bpm = 46;

  // density (どれくらい鳴るか)
  let density = 0.55;
  if (env.time === "night" || env.time === "late") density -= 0.18;

  // brightness (フィルタの開き具合)
  let bright = 0.70;
  if (env.time === "night" || env.time === "late") bright -= 0.18;

  // weather effect
  if (env.weather === "cloudy") { density -= 0.08; bright -= 0.06; }
  if (env.weather === "rain")   { density -= 0.10; bright -= 0.10; } // 雨でも暗くしすぎない

  density = clamp(density, 0.20, 0.78);
  bright = clamp(bright, 0.35, 0.85);

  // season key
  const seasonKey = {
    spring: 60,  // C
    summer: 62,  // D
    autumn: 60,  // C
    winter: 57,  // A
    auto: 60
  };
  const root = seasonKey[env.season] ?? 60;

  return { bpm, density, bright, root };
}

class BrightMusicEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.lpf = null;

    this.padBus = null;
    this.arpBus = null;

    this._timers = [];
    this._rng = null;

    this._chordNodes = [];
    this._bpm = 60;
    this._step = 0.5; // 8分相当
    this._bar = 2.0;  // 1小節相当(4/4の8分×8)

    this._root = 60;
    this._progIndex = 0;

    // 軽い空気感（怖くしない極薄ディレイ）
    this._delay = null;
    this._fb = null;
    this._wet = null;
  }

  async start(env){
    if (!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1.18; // そこそこ大きめ

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 3.5;
      this.comp.attack.value = 0.008;
      this.comp.release.value = 0.16;

      this.lpf = this.ctx.createBiquadFilter();
      this.lpf.type = "lowpass";
      this.lpf.frequency.value = 2600; // ✅ 明るめ（後でenvで動かす）
      this.lpf.Q.value = 0.7;

      this.padBus = this.ctx.createGain();
      this.padBus.gain.value = 0.90;

      this.arpBus = this.ctx.createGain();
      this.arpBus.gain.value = 0.55;

      // tiny delay (very subtle)
      this._delay = this.ctx.createDelay(0.35);
      this._delay.delayTime.value = 0.18;

      this._fb = this.ctx.createGain();
      this._fb.gain.value = 0.14;

      this._wet = this.ctx.createGain();
      this._wet.gain.value = 0.10; // 極薄

      // routing: (pad+arp) -> lpf -> master -> comp -> dest
      this.padBus.connect(this.lpf);
      this.arpBus.connect(this.lpf);

      // wet path
      this.lpf.connect(this._delay);
      this._delay.connect(this._fb);
      this._fb.connect(this._delay);
      this._delay.connect(this._wet);

      // dry + wet
      this.lpf.connect(this.master);
      this._wet.connect(this.master);

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
    const r = recipe(env);

    this._rng = mulberry32((env.seed ^ 0xBADA55) >>> 0);
    this._bpm = r.bpm;
    this._step = 60 / this._bpm / 2; // 8分
    this._bar = this._step * 8;      // 8分×8

    this._root = r.root;
    this._progIndex = 0;

    // 明るさ＝フィルタ開く（雨/夜でも閉めすぎない）
    const cutoff = 1600 + r.bright * 2600; // 1600〜4200
    this.lpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 1.0);

    // 密度＝アルペジオ音量/頻度に反映
    this.arpBus.gain.setTargetAtTime(0.40 + r.density * 0.35, this.ctx.currentTime, 1.0);

    this._playChordLoop();
    this._playArpLoop(env);
    this._maybeMotifLoop(env);
  }

  // --- Harmony ---
  _progression(root){
    // ✅ 安心寄り：I – IV – V – I（add2/add6/add9で音楽感）
    // 7thは使わない（不安感になりやすい）
    const I  = [0, 4, 7, 14];   // add9
    const IV = [5, 9, 12, 14];  // add2
    const V  = [7, 11, 14, 16]; // add6-ish
    return [I, IV, V, I].map(ch => ch.map(x => root + x));
  }

  _stopChord(){
    this._chordNodes.forEach(n => { try { n.osc.stop(); } catch(_){} });
    this._chordNodes = [];
  }

  _playChordLoop(){
    const prog = this._progression(this._root);
    const chord = prog[this._progIndex % prog.length];
    this._progIndex++;

    const now = this.ctx.currentTime;

    // fade out old
    this._chordNodes.forEach(n => {
      try {
        n.g.gain.setTargetAtTime(0.00001, now, 2.8);
        n.osc.stop(now + 5.0);
      } catch(_){}
    });
    this._chordNodes = [];

    // new chord: mid range (not too low), sine only, slow attack
    chord.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";

      // 低すぎ回避：半オク下ではなく、必要なら一部だけ下げる
      const midi = m - 7; // 5度下げくらい（明るさ維持）
      osc.frequency.setValueAtTime(midiToHz(midi), now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.00001, now);
      g.gain.exponentialRampToValueAtTime(0.08 + i*0.02, now + 2.2);
      g.gain.setTargetAtTime(0.07 + i*0.015, now + 3.2, 2.8);

      osc.connect(g);
      g.connect(this.padBus);

      osc.start(now);
      this._chordNodes.push({ osc, g });
    });

    // next chord every 2 bars (ゆったり)
    this._timers.push(setTimeout(() => this._playChordLoop(), (this._bar * 2) * 1000));
  }

  // --- Melody/Arp ---
  _scale(env){
    // 明るく：メジャーペンタベース。季節でちょい味変（でも不安にならない範囲）
    // spring/autumn: major pentatonic
    // summer: major scale（爽やか）
    // winter: major pentatonic（音域抑えめで透明）
    if (env.season === "summer") return [0,2,4,5,7,9,11]; // major
    return [0,2,4,7,9]; // major pentatonic
  }

  _melBase(env){
    // 明るくするため、前より上げる（でも高すぎない）
    if (env.time === "day") return 64;     // E4
    if (env.time === "morning") return 62; // D4
    if (env.time === "evening") return 60; // C4
    if (env.time === "night") return 57;   // A3
    if (env.time === "late") return 55;    // G3
    return 60;
  }

  _playArpLoop(env){
    const scale = this._scale(env);
    const base = this._melBase(env);
    const now = this.ctx.currentTime;

    // アルペジオパターン（音楽っぽいが、怖くなりにくい）
    // degree: 0..scaleLen-1
    const patterns = [
      [0,2,4,2, 0,2,4,2],
      [0,1,2,1, 0,1,2,1],
      [0,2,3,2, 0,2,3,2],
      [1,2,4,2, 1,2,4,2],
    ];
    const pat = patterns[Math.floor(this._rng()*patterns.length)];

    // 密度：時間/天気を軽く反映（regen時にarpBusも変えてる）
    let p = 0.72;
    if (env.time === "night") p = 0.55;
    if (env.time === "late") p = 0.45;
    if (env.weather === "rain") p -= 0.10;
    p = clamp(p, 0.35, 0.80);

    if (this._rng() < p){
      // 開始度数（0〜2）で雰囲気が変わるが、怖くならない範囲
      const deg0 = Math.floor(this._rng()*3);

      pat.forEach((d, i) => {
        const deg = clamp(deg0 + d, 0, scale.length - 1);
        let midi = base + scale[deg];

        // 高すぎ禁止：B4(71)まで
        midi = Math.min(midi, 71);

        const t0 = now + i * this._step;
        this._tone(midi, t0, this._step * 0.92, 0.020);
      });
    }

    // 次は1小節ごと（音楽感）
    this._timers.push(setTimeout(() => this._playArpLoop(env), this._bar * 1000));
  }

  // たまに “歌っぽい”モチーフ（短い、明るい、怖くならない）
  _maybeMotifLoop(env){
    const scale = [0,2,4,7,9]; // 安全固定（モチーフは必ずペンタ）
    const base = this._melBase(env) + 2; // ちょい上で明るく
    const now = this.ctx.currentTime;

    let p = 0.18;
    if (env.time === "morning") p += 0.06;
    if (env.time === "day") p += 0.04;
    if (env.weather === "rain") p -= 0.05;
    if (env.time === "late") p -= 0.08;
    p = clamp(p, 0.08, 0.28);

    if (this._rng() < p){
      // 8音モチーフ（隣接中心）
      const tpl = [0,1,2,1, 0,1,0,0];
      const deg0 = Math.floor(this._rng()*2);

      tpl.forEach((d, i) => {
        const deg = clamp(deg0 + d, 0, scale.length - 1);
        let midi = base + scale[deg];
        midi = Math.min(midi, 71);

        const t0 = now + i * (this._step * 0.95);
        this._tone(midi, t0, this._step * 0.90, 0.022);
      });
    }

    // 12〜22秒ごと
    const next = 12000 + this._rng()*10000;
    this._timers.push(setTimeout(() => this._maybeMotifLoop(env), next));
  }

  _tone(midi, t0, dur, peak=0.02){
    const o = this.ctx.createOscillator();
    o.type = "sine"; // 安全（刺さらない）

    o.frequency.setValueAtTime(midiToHz(midi), t0);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.00001, t0);
    // なめらか、でも暗すぎない
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.10);
    g.gain.setTargetAtTime(0.00001, t0 + dur, 0.14);

    o.connect(g);
    g.connect(this.arpBus);

    o.start(t0);
    o.stop(t0 + dur + 0.30);
  }

  _tapBeep(){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = 440;
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.0008, now + 0.01);
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
