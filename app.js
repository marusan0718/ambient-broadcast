/**
 * Ambient Tide — 怖さゼロ優先（超安全）
 * - 短調/maj7/鋭い倍音を排除
 * - 安心進行 I–IV–V–I（add2/add6中心）
 * - メロディ：メジャーペンタ固定・隣接移動のみ・低音域
 * - LPFで高域を強制カット
 * - 音量：マスター + コンプレッサ（ただし安全に）
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

// 背景（シンプル）
function applyBackground(){
  const t = (state.manual.time === "auto") ? getAutoTimeBlock() : state.manual.time;

  const base = {
    morning:"#F5F8FF",
    day:"#FFFFFF",
    evening:"#FFF6EC",
    night:"#0B1220",
    late:"#070B14",
  }[t] || "#FFFFFF";

  let bg = base;
  if (state.manual.weather === "cloudy") bg = mix(bg, "#F3F4F6", 0.08);
  if (state.manual.weather === "rain")   bg = mix(bg, "#0B1220", 0.06);

  if (state.manual.season === "spring") bg = mix(bg, "#FFF1F2", 0.05);
  if (state.manual.season === "summer") bg = mix(bg, "#EFF6FF", 0.05);
  if (state.manual.season === "autumn") bg = mix(bg, "#FFF7ED", 0.05);
  if (state.manual.season === "winter") bg = mix(bg, "#F3F4F6", 0.05);

  const dark = (t === "night" || t === "late");
  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--fg", dark ? "#F9FAFB" : "#0f172a");
  document.documentElement.style.setProperty("--muted", dark ? "rgba(249,250,251,.55)" : "rgba(15,23,42,.55)");
  document.documentElement.style.setProperty("--ring", dark ? "rgba(249,250,251,.20)" : "rgba(15,23,42,.18)");
  document.documentElement.style.setProperty("--chip", dark ? "rgba(249,250,251,.10)" : "rgba(15,23,42,.08)");
  document.documentElement.style.setProperty("--chipOn", dark ? "rgba(249,250,251,.16)" : "rgba(15,23,42,.14)");
}
function mix(a,b,t){
  const A = toRgb(a), B = toRgb(b);
  const r = Math.round(A.r + (B.r - A.r)*t);
  const g = Math.round(A.g + (B.g - A.g)*t);
  const bl= Math.round(A.b + (B.b - A.b)*t);
  return `rgb(${r},${g},${bl})`;
}
function toRgb(x){
  if (x.startsWith("rgb")) {
    const m = x.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return { r:+m[1], g:+m[2], b:+m[3] };
  }
  const h = x.replace("#","");
  const v = h.length===3 ? h.split("").map(c=>c+c).join("") : h;
  const n = parseInt(v,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
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
    applyBackground();

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
    applyBackground();

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

// PRNG
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
  if (!engine) engine = new SafeMusicEngine();
  await engine.start(getEnv());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ambient Tide" });
  }
}
function stopPlayback(){ engine?.stop(); }

class SafeMusicEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.lpf = null;

    this.padBus = null;
    this.melBus = null;

    this._chord = [];
    this._timers = [];
    this._rng = null;

    this._bpm = 54;
    this._step = 60 / this._bpm; // 4分
    this._bar = this._step * 4;  // 1小節
    this._progIndex = 0;
  }

  async start(env){
    if (!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1.15; // まず安全に（必要なら 1.25）

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -20;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 3.5;
      this.comp.attack.value = 0.006;
      this.comp.release.value = 0.16;

      this.lpf = this.ctx.createBiquadFilter();
      this.lpf.type = "lowpass";
      this.lpf.frequency.value = 1600; // ✅ 高域を強制カット（怖さゼロ用）

      this.padBus = this.ctx.createGain();
      this.padBus.gain.value = 0.95;

      this.melBus = this.ctx.createGain();
      this.melBus.gain.value = 0.55;

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
    this._rng = mulberry32((env.seed ^ 0xC0FFEE) >>> 0);
    this._progIndex = 0;

    // 夜はさらに暗く＝カットオフ低め
    const cutoff = (env.time === "night" || env.time === "late") ? 1400 : 1600;
    this.lpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 1.2);

    // テンポも落ち着かせる
    this._bpm = (env.time === "late") ? 44 : (env.time === "night") ? 48 : 54;
    this._step = 60 / this._bpm;
    this._bar = this._step * 4;

    this._playChordLoop(env);
    this._playMelodyLoop(env);
  }

  _root(env){
    // ずっとメジャー。季節でほんの少しキーを変えるだけ（不安定にしない）
    if (env.season === "summer") return 62; // D
    if (env.season === "winter") return 57; // A（低めで安心）
    return 60; // C
  }

  _progression(root){
    // ✅ I – IV – V – I（全部メジャー方向）
    // しかも 7th は使わず add2/add6 で柔らかくする
    const I  = [0, 4, 7, 14];   // add9
    const IV = [5, 9, 12, 14];  // add2
    const V  = [7, 11, 14, 16]; // add6寄り（不安な7th禁止）
    return [I, IV, V, I].map(ch => ch.map(x => root + x));
  }

  _stopChord(){
    this._chord.forEach(o => { try { o.stop(); } catch(_){} });
    this._chord = [];
  }

  _playChordLoop(env){
    const root = this._root(env);
    const prog = this._progression(root);
    const chord = prog[this._progIndex % prog.length];
    this._progIndex++;

    const now = this.ctx.currentTime;

    // 前のコードをゆっくり消す
    this._chord.forEach(node => {
      try {
        if (node._g) node._g.gain.setTargetAtTime(0.00001, now, 2.8);
        node.stop(now + 5.0);
      } catch(_){}
    });
    this._chord = [];

    // 新しいコード（低め・sineのみ）
    chord.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";

      const midi = m - 12; // 1オクターブ下げて安心
      osc.frequency.setValueAtTime(midiToHz(midi), now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.00001, now);
      g.gain.exponentialRampToValueAtTime(0.085 + i*0.015, now + 2.4);
      g.gain.setTargetAtTime(0.07 + i*0.010, now + 3.2, 2.8);

      osc.connect(g);
      g.connect(this.padBus);

      osc._g = g;
      osc.start(now);
      this._chord.push(osc);
    });

    // 次のコードは1小節〜2小節
    const next = (this._rng() < 0.65 ? 1 : 2) * this._bar;
    this._timers.push(setTimeout(() => this._playChordLoop(env), next * 1000));
  }

  _safeScale(){
    // ✅ 明るく安全：メジャー・ペンタトニック固定
    return [0, 2, 4, 7, 9];
  }

  _melBase(env){
    // ✅ 低め固定（怖さ排除）
    if (env.time === "day") return 60;     // C4
    if (env.time === "morning") return 59; // B3
    if (env.time === "evening") return 57; // A3
    if (env.time === "night") return 53;   // F3
    if (env.time === "late") return 52;    // E3
    return 57;
  }

  _playMelodyLoop(env){
    const scale = this._safeScale();
    const base = this._melBase(env);

    const now = this.ctx.currentTime;

    // “音楽っぽい”けど安全：階段状で上下するだけ（跳躍禁止）
    const templates = [
      [0,1,2,1, 0,1,0,null],
      [0,0,1,2, 1,0,1,null],
      [1,2,2,1, 0,1,0,null],
      [0,1,1,2, 2,1,0,null],
    ];
    const tpl = templates[Math.floor(this._rng()*templates.length)];

    // 1〜2小節ごとに、鳴る/休む（夜は休み多め）
    let p = 0.55;
    if (env.time === "night") p = 0.38;
    if (env.time === "late") p = 0.28;
    if (env.weather === "rain") p -= 0.08;
    p = clamp(p, 0.18, 0.60);

    if (this._rng() < p){
      let deg0 = Math.floor(this._rng()*2); // 0 or 1
      tpl.forEach((d, i) => {
        if (d === null) return;
        const deg = clamp(deg0 + d, 0, scale.length - 1);
        const midi = base + scale[deg];

        // 8分音符でゆっくり（主張しすぎない）
        const t0 = now + i * (this._step/2);
        this._tone(midi, t0, (this._step/2)*0.95);
      });
    }

    const nextBars = (this._rng() < 0.65 ? 1 : 2);
    this._timers.push(setTimeout(() => this._playMelodyLoop(env), (this._bar * nextBars) * 1000));
  }

  _tone(midi, t0, dur){
    const o = this.ctx.createOscillator();
    o.type = "sine"; // ✅ いちばん安全

    // 上限：C5より上は出さない
    const m = Math.min(midi, 72);
    o.frequency.setValueAtTime(midiToHz(m), t0);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.00001, t0);
    g.gain.exponentialRampToValueAtTime(0.028, t0 + 0.14);
    g.gain.setTargetAtTime(0.00001, t0 + dur, 0.14);

    o.connect(g);
    g.connect(this.melBus);

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
applyBackground();
renderStatus();
tickCountdown();
