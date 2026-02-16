/**
 * Ambient Tide — “怖くない + もっと音楽” 版
 * - 高音の粒/鳥/雨滴は一旦ゼロ（怖さの主因を排除）
 * - ゆっくりしたコード進行 + 優しいメロディ（階段状モチーフ）
 * - iOS対策：resume + 極小beep
 * - 音量：マスター増幅 + コンプレッサ
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

    if (engine && state.playing) engine.update(getEnv());
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
  if (!engine) engine = new MusicEngine();
  await engine.start(getEnv());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ambient Tide" });
  }
}

function stopPlayback(){
  engine?.stop();
}

class MusicEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.comp = null;

    this.bus = null;     // 音楽バス（LPF通す）
    this.lpf = null;

    this.padGain = null;
    this.melGain = null;

    this.timers = [];
    this.active = false;

    this._seed = 0;
    this._rng = null;

    this._bpm = 56;
    this._stepSec = 60 / this._bpm / 2; // 8分音符相当

    this._progIndex = 0;
    this._chordOsc = [];
  }

  async start(env){
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1.35; // 音量（大きすぎたら 1.15）

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.005;
      this.comp.release.value = 0.15;

      // バス + LPF（怖い高音を物理的にカット）
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 1.0;

      this.lpf = this.ctx.createBiquadFilter();
      this.lpf.type = "lowpass";
      this.lpf.frequency.value = 2400; // 高音の刺さりを抑える

      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = 0.35;

      this.melGain = this.ctx.createGain();
      this.melGain.gain.value = 0.14;  // メロディは“聞こえるけど邪魔しない”

      // routing
      this.padGain.connect(this.bus);
      this.melGain.connect(this.bus);
      this.bus.connect(this.lpf);
      this.lpf.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._tapBeep();

    this.active = true;
    this.regenerate(env);
  }

  stop(){
    this.active = false;
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this._stopChord();
    if (this.ctx) this.ctx.suspend();
  }

  update(env){
    // 時間帯でテンポ/明るさを少し調整（怖くならない範囲）
    this._bpm = 56;
    if (env.time === "morning") this._bpm = 58;
    if (env.time === "day") this._bpm = 60;
    if (env.time === "evening") this._bpm = 56;
    if (env.time === "night") this._bpm = 50;
    if (env.time === "late") this._bpm = 46;

    this._stepSec = 60 / this._bpm / 2;

    // LPF（夜はさらに暗く）
    const cutoff = (env.time === "night" || env.time === "late") ? 1800 : 2400;
    this.lpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 1.0);
  }

  regenerate(env){
    this.update(env);

    this._seed = env.seed >>> 0;
    this._rng = mulberry32(this._seed ^ 0xA5A5A5A5);
    this._progIndex = 0;

    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];

    // 新しいコードへ（ゆっくりフェード）
    this._playChord(env, true);

    // メロディループ開始
    this._scheduleMelody(env);
  }

  // ===== Chords =====
  _keyRoot(env){
    // 安定するキー中心（怖くならない）
    // 春夏：C/D、秋：C、冬：A(低め)寄り
    if (env.season === "summer") return 62; // D
    if (env.season === "winter") return 57; // A
    return 60; // C
  }

  _progression(root){
    // “安心する”進行：I → IV → vi → V（全部メジャー/穏やか系ボイシング）
    // (maj7, add9 っぽい柔らかさ)
    const I  = [0, 4, 7, 11];
    const IV = [5, 9, 12, 16];
    const vi = [9, 12, 16, 19];
    const V  = [7, 11, 14, 16]; // V(add6)寄り
    return [I, IV, vi, V].map(ch => ch.map(x => root + x));
  }

  _stopChord(){
    this._chordOsc.forEach(o => { try { o.stop(); } catch(_){} });
    this._chordOsc = [];
  }

  _playChord(env, first=false){
    if (!this.active) return;

    const root = this._keyRoot(env);
    const prog = this._progression(root);
    const chord = prog[this._progIndex % prog.length];

    // 1コードあたりの長さ（8〜12秒）
    const dur = 8.5 + this._rng()*3.5;

    // 古いコードはゆっくり消す
    const now = this.ctx.currentTime;
    this._chordOsc.forEach(node => {
      try {
        if (node._gain) node._gain.gain.setTargetAtTime(0.00001, now, 3.0);
        node.stop(now + 6.0);
      } catch(_){}
    });
    this._chordOsc = [];

    // 新しいコードを作る（低め・柔らかい）
    chord.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = (i === 0) ? "sine" : "triangle"; // 柔らかい

      // 低めに寄せる（怖い高音を避ける）
      const midi = m - 12; // 1オクターブ下げ
      osc.frequency.setValueAtTime(midiToHz(midi), now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.00001, now);
      g.gain.exponentialRampToValueAtTime(0.08 + i*0.02, now + 2.2); // ふわっと立ち上げ
      g.gain.setTargetAtTime(0.06 + i*0.015, now + 3.0, 2.5);

      osc.connect(g);
      g.connect(this.padGain);

      osc._gain = g;
      osc.start(now);
      this._chordOsc.push(osc);
    });

    this._progIndex++;

    // 次のコード
    this.timers.push(setTimeout(() => this._playChord(env), dur * 1000));
  }

  // ===== Melody =====
  _safeScale(){
    // 怖くならない：メジャー・ペンタトニック
    return [0, 2, 4, 7, 9];
  }

  _pickMotifTemplate(){
    // “音楽っぽい”けど怖くない：上って戻る系（跳躍なし）
    const T = [
      [0,1,2,1, 0,1,0,null],   // やさしい往復
      [0,1,1,2, 1,0,null,0],   // ため→少し上→戻る
      [0,0,1,2, 2,1,0,null],   // じわ上がって戻る
      [1,2,3,2, 1,0,1,null],   // 少し明るめ
    ];
    return T[Math.floor(this._rng()*T.length)];
  }

  _melodyBaseMidi(env){
    // 旋律の音域：中低域固定（怖さ排除）
    if (env.time === "day") return 62;     // D4
    if (env.time === "morning") return 60; // C4
    if (env.time === "evening") return 59; // B3
    if (env.time === "night") return 55;   // G3
    if (env.time === "late") return 53;    // F3
    return 60;
  }

  _scheduleMelody(env){
    const scale = this._safeScale();
    const baseMidi = this._melodyBaseMidi(env);

    const motif = this._pickMotifTemplate();

    const playOnce = () => {
      if (!this.active) return;

      // どれくらい出すか（昼は少し多め、深夜はかなり少なめ）
      let p = 0.45;
      if (env.time === "night") p = 0.25;
      if (env.time === "late") p = 0.18;

      // 雨はメロディ控えめ（静かに）
      if (env.weather === "rain") p -= 0.08;
      p = clamp(p, 0.10, 0.55);

      if (this._rng() < p) {
        const now = this.ctx.currentTime;

        // 同じテンプレでも seed で“微妙に”ずらす（ただし跳躍はさせない）
        let startDeg = Math.floor(this._rng()*2); // 0 or 1
        motif.forEach((d, i) => {
          if (d === null) return;

          const deg = clamp(startDeg + d, 0, scale.length - 1);
          const midi = baseMidi + scale[deg];

          this._tone(midi, now + i * this._stepSec, this._stepSec * 0.95);
        });
      }

      // 次のフレーズ（6〜12秒）
      const gap = 6 + this._rng()*6;
      this.timers.push(setTimeout(playOnce, gap * 1000));
    };

    playOnce();
  }

  _tone(midi, t0, dur){
    const o = this.ctx.createOscillator();
    o.type = "triangle"; // 音楽感＋柔らかさ

    // 高すぎると怖いので上限を制限
    const safeMidi = Math.min(midi, 72); // C5まで
    o.frequency.setValueAtTime(midiToHz(safeMidi), t0);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.00001, t0);
    g.gain.exponentialRampToValueAtTime(0.030, t0 + 0.10); // 立ち上がりゆっくり
    g.gain.setTargetAtTime(0.00001, t0 + dur, 0.12);

    o.connect(g);
    g.connect(this.melGain);

    o.start(t0);
    o.stop(t0 + dur + 0.25);
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
