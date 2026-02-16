/**
 * Ambient Tide — WebAudio 生成プレビュー（怖くない旋律・音量強め）
 * - チップ（時間/天気/季節）で雰囲気が変化
 * - 5分ごとに seed 更新 → 同条件でも少し違う
 * - 怖さ回避：明るいペンタトニック / 低め音域 / 跳躍なし / 柔らかいアタック
 * - 音量アップ：マスター増幅 + コンプレッサ
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
    alert("再生できなかった…（iPhoneはボタン操作の直後に音が必要だよ）");
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

// 入力→音パラメータ
function recipeFromEnv(env){
  let tempo = 52;
  if (env.time === "morning") tempo = 55;
  if (env.time === "day") tempo = 56;
  if (env.time === "evening") tempo = 52;
  if (env.time === "night") tempo = 46;
  if (env.time === "late") tempo = 42;

  let density = 0.28;
  if (env.time === "day") density += 0.06;
  if (env.time === "night" || env.time === "late") density -= 0.10;

  let brightness = 0.55;
  if (env.time === "morning" || env.time === "day") brightness += 0.10;
  if (env.time === "night" || env.time === "late") brightness -= 0.22;

  let rain = 0.0;
  if (env.weather === "cloudy") { density -= 0.03; brightness -= 0.03; }
  if (env.weather === "rain")   { rain = 0.70; density += 0.03; brightness -= 0.08; }

  let birds = 0.0;
  if (env.time === "morning") birds = 0.45;
  if (env.time === "day") birds = 0.25;
  if (env.weather === "rain") birds *= 0.20;

  let warmth = 0.55;
  if (env.season === "spring") warmth += 0.08;
  if (env.season === "summer") warmth -= 0.06;
  if (env.season === "autumn") warmth += 0.04;
  if (env.season === "winter") warmth -= 0.10;

  density = clamp(density, 0.08, 0.65);
  brightness = clamp(brightness, 0.15, 0.85);

  return { tempo, density, brightness, rain, birds, warmth };
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
  if (!engine) engine = new AmbientEngine();
  await engine.start(getEnv());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ambient Tide" });
  }
}

function stopPlayback(){
  engine?.stop();
}

class AmbientEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.layerA = null;
    this.layerB = null;
    this.active = "A";
    this.timers = [];
  }

  async start(env){
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // master
      this.master = this.ctx.createGain();
      this.master.gain.value = 1.30; // ✅ 音量アップ（大きすぎたら 1.15 に）
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();

    // ✅ コンプレッサ（音量を上げても刺さりにくい）
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;

    // つなぎ直し（毎回二重接続しないように destination直結はしない）
    // いったん master の出力先を作り直す
    try { this.master.disconnect(); } catch(_){}
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // iOS無音スタート回避の極小音
    this._tapBeep();

    // 2レイヤーでクロスフェード
    this.layerA = this._createLayer();
    this.layerB = this._createLayer();
    this.layerA.gain.gain.value = 1.0;
    this.layerB.gain.gain.value = 0.0;

    this.layerA.gain.connect(this.master);
    this.layerB.gain.connect(this.master);

    this._renderToLayer(this.layerA, env);
    this._renderToLayer(this.layerB, env);

    this.active = "A";
    this._scheduleLoop(env);
  }

  stop(){
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    if (this.ctx) this.ctx.suspend();
  }

  update(env){
    const r = recipeFromEnv(env);
    const L = (this.active === "A") ? this.layerA : this.layerB;
    if (!L) return;

    const now = this.ctx.currentTime;

    const cutoff = 700 + r.brightness * 4200;
    L.filter.frequency.cancelScheduledValues(now);
    L.filter.frequency.setTargetAtTime(cutoff, now, 1.2);

    L.rainGain.gain.cancelScheduledValues(now);
    L.rainGain.gain.setTargetAtTime(r.rain * 0.22, now, 1.6);

    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;
  }

  regenerate(env){
    const from = (this.active === "A") ? this.layerA : this.layerB;
    const to   = (this.active === "A") ? this.layerB : this.layerA;

    this._renderToLayer(to, env);

    const now = this.ctx.currentTime;
    from.gain.gain.cancelScheduledValues(now);
    to.gain.gain.cancelScheduledValues(now);

    from.gain.gain.setTargetAtTime(0.0, now, 12.0);
    to.gain.gain.setTargetAtTime(1.0, now, 12.0);

    this.active = (this.active === "A") ? "B" : "A";
    this._scheduleLoop(env);
  }

  _createLayer(){
    const g = this.ctx.createGain();

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;

    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.22;

    const bellGain = this.ctx.createGain();
    bellGain.gain.value = 0.11; // ✅ 粒を少し控えめに

    const melodyGain = this.ctx.createGain();
    melodyGain.gain.value = 0.06; // ✅ メロディは“気配”くらい

    const rainGain = this.ctx.createGain();
    rainGain.gain.value = 0.0;

    padGain.connect(filter);
    bellGain.connect(filter);
    melodyGain.connect(filter);
    rainGain.connect(filter);
    filter.connect(g);

    // rain/noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._whiteNoiseBuffer(2.0);
    noise.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1200;
    rainFilter.Q.value = 0.8;

    noise.connect(rainFilter);
    rainFilter.connect(rainGain);
    noise.start();

    return {
      gain: g,
      filter,
      padGain,
      bellGain,
      melodyGain,
      rainGain,
      _pads: [],
      _birds: 0.0,
      _density: 0.28,
      _tempo: 52,
    };
  }

  _renderToLayer(L, env){
    L._pads.forEach(o => { try { o.stop(); } catch(_){} });
    L._pads = [];

    const r = recipeFromEnv(env);
    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;

    const cutoff = 700 + r.brightness * 4200;
    L.filter.frequency.value = cutoff;
    L.rainGain.gain.value = r.rain * 0.22;

    // ✅ 安心する和音（メジャー寄り・高すぎない）
    const keyMap = { spring: 60, summer: 62, autumn: 60, winter: 57, auto: 60 };
    const root = keyMap[env.season] ?? 60;

    const prog = [
      [0, 4, 7, 11],   // maj7
      [0, 2, 7, 9],    // add2 / 6
      [0, 4, 7, 9],    // 6
      [0, 4, 7, 14],   // add9
    ];

    const rng = mulberry32(env.seed);
    const pick = prog[Math.floor(rng()*prog.length)];
    const chord = pick.map(x => root + x);

    chord.forEach((m, i) => {
      const o = this.ctx.createOscillator();
      o.type = "sine"; // ✅ 柔らかい
      o.frequency.value = midiToHz(m);

      const og = this.ctx.createGain();
      og.gain.value = 0.0;

      const now = this.ctx.currentTime;
      const target = 0.055 + i*0.010;
      og.gain.setValueAtTime(0.0, now);
      og.gain.linearRampToValueAtTime(target, now + 6.0);

      o.connect(og);
      og.connect(L.padGain);

      o.start();
      L._pads.push(o);
    });
  }

  _scheduleLoop(env){
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];

    const L = (this.active === "A") ? this.layerA : this.layerB;
    if (!L) return;

    const rng = mulberry32(env.seed ^ 0x9E3779B9);

    const scheduleBell = () => {
      const density = L._density;
      const base = 2600;
      const jitter = 2400;
      const interval = base + (1.0 - density) * jitter + rng()*900;

      this._bell(L, rng);
      this.timers.push(setTimeout(scheduleBell, interval));
    };

    const scheduleBird = () => {
      const p = L._birds;
      const interval = 10000 + rng()*16000;
      if (rng() < p) this._bird(L, rng);
      this.timers.push(setTimeout(scheduleBird, interval));
    };

    const scheduleDrop = () => {
      const rain = (L.rainGain.gain.value / 0.22);
      const interval = 2600 + rng()*4200;
      if (rng() < rain * 0.85) this._drop(L, rng);
      this.timers.push(setTimeout(scheduleDrop, interval));
    };

    // ✅ “怖くない旋律”モチーフ：たまにだけ出す
    const scheduleMelody = () => {
      let p = 0.18;
      if (env.time === "morning") p += 0.06;
      if (env.time === "day")     p += 0.04;
      if (env.time === "night")   p -= 0.12;
      if (env.time === "late")    p -= 0.16;
      if (env.weather === "rain") p -= 0.06;
      p = clamp(p, 0.02, 0.28);

      const interval = 16000 + rng()*18000; // 16〜34秒ごと
      if (rng() < p) this._motifSafe(L, env, rng);

      this.timers.push(setTimeout(scheduleMelody, interval));
    };

    scheduleBell();
    scheduleBird();
    scheduleDrop();
    scheduleMelody();
  }

  _bell(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";

    // 音域は刺さらないように少し抑えめ
    const base = 360 + rng()*760;
    o.frequency.setValueAtTime(base, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.030 + rng()*0.018, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.8 + rng()*0.9);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 3.0);
  }

  _drop(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    const f1 = 700 + rng()*700;
    const f2 = 260 + rng()*200;
    o.frequency.setValueAtTime(f1, now);
    o.frequency.exponentialRampToValueAtTime(f2, now + 0.12);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.022 + rng()*0.014, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.35);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 0.6);
  }

  _bird(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";

    // 鳥も高すぎると怖くなるので抑える
    const f0 = 1200 + rng()*650;
    const f1 = f0 + (rng()*420 - 210);

    o.frequency.setValueAtTime(f0, now);
    o.frequency.linearRampToValueAtTime(f1, now + 0.18);
    o.frequency.linearRampToValueAtTime(f0*0.94, now + 0.36);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.014 + rng()*0.010, now + 0.04);
    g.gain.linearRampToValueAtTime(0.0, now + 0.46);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 0.6);
  }

  // ✅ ここが「怖くない旋律」本体
  _motifSafe(L, env, rng){
    const now = this.ctx.currentTime;

    // 明るいメジャー・ペンタトニック固定
    const scale = [0, 2, 4, 7, 9];

    // 低め音域（C4中心）で安定
    let baseMidi = 60; // C4
    if (env.time === "morning") baseMidi = 62; // D4
    if (env.time === "day")     baseMidi = 64; // E4
    if (env.time === "evening") baseMidi = 60; // C4
    if (env.time === "night")   baseMidi = 57; // A3
    if (env.time === "late")    baseMidi = 55; // G3

    // 4音だけ。休符多め。跳躍禁止（隣・同音のみ）
    const motifLen = 4;
    let degree = Math.floor(rng() * scale.length);
    const degrees = [];

    for (let i=0;i<motifLen;i++){
      if (rng() < 0.25) { degrees.push(null); continue; }
      degrees.push(degree);

      const r = rng();
      if (r < 0.45) {
        // stay
      } else if (r < 0.75) {
        degree = Math.min(scale.length - 1, degree + 1);
      } else {
        degree = Math.max(0, degree - 1);
      }
    }

    // ゆっくり（主張しない）
    const step = 60 / 50;
    const noteDur = step * 0.9;

    degrees.forEach((deg, i) => {
      if (deg === null) return;

      // たまにだけ1オクターブ上（頻度かなり低め）
      const up = (rng() < 0.10) ? 12 : 0;
      const m = baseMidi + scale[deg] + up;
      const freq = midiToHz(m);

      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now + i * step);

      const g = this.ctx.createGain();
      const t0 = now + i * step;
      const t1 = t0 + noteDur;

      // アタック遅めで刺さらない
      g.gain.setValueAtTime(0.00001, t0);
      g.gain.exponentialRampToValueAtTime(0.020, t0 + 0.14);
      g.gain.exponentialRampToValueAtTime(0.00001, t1);

      o.connect(g);
      g.connect(L.melodyGain);

      o.start(t0);
      o.stop(t1 + 0.02);
    });
  }

  _whiteNoiseBuffer(seconds){
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * 0.35;
    return buf;
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
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.05);
  }
}

// init
applyBackground();
renderStatus();
tickCountdown();
