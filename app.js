/**
 * Ambient Tide — WebAudio 生成プレビュー（ミニマル）
 * - チップ（時間/天気/季節）でその場で雰囲気が変わる
 * - 5分ごとに seed を更新して「同条件でも少し違う」
 * - iPhone無音対策：resume / 初回テスト音 / 音量控えめだけど聞こえる
 */

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// ====== UI ======
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

// ====== Helpers ======
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

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
  return {
    time,
    weather: state.manual.weather,
    season: state.manual.season,
    seed: state.seed,
  };
}

// ====== Background (simple, stylish) ======
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

// ====== UI bind ======
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

// ====== Status ======
function renderStatus(){
  const env = getEnv();
  const manual = Object.values(state.manual).some(v => v !== "auto");
  modeLine.textContent =
    `${manual ? "Manual" : "Auto"}: ${label("time", env.time)} / ${label("weather", env.weather)} / ${label("season", env.season)}`;
}

// ====== Countdown / auto update ======
function tickCountdown(){
  const now = Date.now();
  let remain = state.nextUpdateAt - now;

  if (remain <= 0) {
    state.nextUpdateAt = now + UPDATE_INTERVAL_MS;
    // seed更新：同条件でも少し変わる
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

// ====== Recipe mapping (input -> sound parameters) ======
function recipeFromEnv(env){
  // tempo（イベント間隔の基準）
  let tempo = 52;
  if (env.time === "morning") tempo = 55;
  if (env.time === "day") tempo = 56;
  if (env.time === "evening") tempo = 52;
  if (env.time === "night") tempo = 46;
  if (env.time === "late") tempo = 42;

  // density（粒の多さ）
  let density = 0.30;
  if (env.time === "day") density += 0.06;
  if (env.time === "night" || env.time === "late") density -= 0.10;

  // brightness（フィルタの明るさ）
  let brightness = 0.55;
  if (env.time === "morning" || env.time === "day") brightness += 0.10;
  if (env.time === "night" || env.time === "late") brightness -= 0.20;

  // weather
  let rain = 0.0;
  if (env.weather === "cloudy") { density -= 0.03; brightness -= 0.03; }
  if (env.weather === "rain")   { rain = 0.65; density += 0.04; brightness -= 0.08; }

  // birds（朝/昼に控えめ）
  let birds = 0.0;
  if (env.time === "morning") birds = 0.55;
  if (env.time === "day") birds = 0.32;
  if (env.weather === "rain") birds *= 0.20;

  // season warmth（音色の温度）
  let warmth = 0.55;
  if (env.season === "spring") warmth += 0.10;
  if (env.season === "summer") warmth -= 0.06;
  if (env.season === "autumn") warmth += 0.05;
  if (env.season === "winter") warmth -= 0.10;

  density = clamp(density, 0.08, 0.70);
  brightness = clamp(brightness, 0.15, 0.85);

  return { tempo, density, brightness, rain, birds, warmth };
}

// ====== PRNG for repeatable generation per seed ======
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function midiToHz(m){ return 440 * Math.pow(2, (m-69)/12); }

// ====== WebAudio Engine ======
let engine = null;

async function startPlayback(){
  if (!engine) engine = new AmbientEngine();
  await engine.start(getEnv());

  // ロック画面表示（タイトルだけでもOK）
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Ambient Tide",
      artist: "",
      album: "",
    });
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
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.95;
      this.master.connect(this.ctx.destination);
    }

    // iOS対策：ユーザー操作直後に必ずresume
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // iOSで「無音スタート」回避：極小のテスト音（すぐ消える）
    this._tapBeep();

    // 2レイヤー構成でクロスフェード
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
    if (this.ctx) {
      // iOSはcloseよりsuspendが安定しやすい
      this.ctx.suspend();
    }
  }

  update(env){
    const r = recipeFromEnv(env);
    const L = (this.active === "A") ? this.layerA : this.layerB;
    if (!L) return;

    const now = this.ctx.currentTime;

    const cutoff = 700 + r.brightness * 4200; // 700..4900
    L.filter.frequency.cancelScheduledValues(now);
    L.filter.frequency.setTargetAtTime(cutoff, now, 1.2);

    L.rainGain.gain.cancelScheduledValues(now);
    L.rainGain.gain.setTargetAtTime(r.rain * 0.20, now, 1.6);

    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;
    L._warmth = r.warmth;
  }

  regenerate(env){
    const from = (this.active === "A") ? this.layerA : this.layerB;
    const to   = (this.active === "A") ? this.layerB : this.layerA;

    this._renderToLayer(to, env);

    const now = this.ctx.currentTime;
    from.gain.gain.cancelScheduledValues(now);
    to.gain.gain.cancelScheduledValues(now);

    // ゆっくり変える（邪魔しない）
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
    bellGain.gain.value = 0.14;

    const rainGain = this.ctx.createGain();
    rainGain.gain.value = 0.0;

    padGain.connect(filter);
    bellGain.connect(filter);
    rainGain.connect(filter);
    filter.connect(g);

    // rain/noise generator
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
      rainGain,
      _pads: [],
      _birds: 0.0,
      _density: 0.30,
      _tempo: 52,
      _warmth: 0.55,
    };
  }

  _renderToLayer(L, env){
    L._pads.forEach(o => { try { o.stop(); } catch(_){} });
    L._pads = [];

    const r = recipeFromEnv(env);
    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;
    L._warmth = r.warmth;

    const cutoff = 700 + r.brightness * 4200;
    L.filter.frequency.value = cutoff;
    L.rainGain.gain.value = r.rain * 0.20;

    const keyMap = { spring: 60, summer: 62, autumn: 57, winter: 55, auto: 60 };
    const root = keyMap[env.season] ?? 60;

    const prog = [
      [0, 4, 7, 11],         // maj7
      [2, 5, 9, 12],         // sus/9
      [0, 3, 7, 10],         // m7
      [5, 9, 12, 16],        // 6/9
    ];

    const rng = mulberry32(env.seed);
    const pick = prog[Math.floor(rng()*prog.length)];
    const chord = pick.map(x => root + x);

    chord.forEach((m, i) => {
      const o = this.ctx.createOscillator();
      o.type = (r.warmth > 0.6) ? "triangle" : "sine";
      o.frequency.value = midiToHz(m);

      const og = this.ctx.createGain();
      og.gain.value = 0.0;

      const now = this.ctx.currentTime;
      const target = 0.060 + i*0.010;
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
      const base = 2400;
      const jitter = 2200;
      const interval = base + (1.0 - density) * jitter + rng()*900;

      this._bell(L, rng);
      this.timers.push(setTimeout(scheduleBell, interval));
    };

    const scheduleBird = () => {
      const p = L._birds;
      const interval = 9000 + rng()*14000;
      if (rng() < p) this._bird(L, rng);
      this.timers.push(setTimeout(scheduleBird, interval));
    };

    const scheduleDrop = () => {
      const rain = (L.rainGain.gain.value / 0.20);
      const interval = 2600 + rng()*4200;
      if (rng() < rain * 0.85) this._drop(L, rng);
      this.timers.push(setTimeout(scheduleDrop, interval));
    };

    scheduleBell();
    scheduleBird();
    scheduleDrop();
  }

  _bell(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";

    const base = 420 + rng()*980;
    o.frequency.setValueAtTime(base, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.055 + rng()*0.03, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.7 + rng()*0.9);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 3.0);
  }

  _drop(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    const f1 = 900 + rng()*900;
    const f2 = 320 + rng()*220;
    o.frequency.setValueAtTime(f1, now);
    o.frequency.exponentialRampToValueAtTime(f2, now + 0.12);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.03 + rng()*0.02, now + 0.006);
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

    const f0 = 1600 + rng()*900;
    const f1 = f0 + (rng()*650 - 325);
    o.frequency.setValueAtTime(f0, now);
    o.frequency.linearRampToValueAtTime(f1, now + 0.18);
    o.frequency.linearRampToValueAtTime(f0*0.92, now + 0.36);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.018 + rng()*0.012, now + 0.02);
    g.gain.linearRampToValueAtTime(0.0, now + 0.42);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 0.55);
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

// ====== init ======
applyBackground();
renderStatus();
tickCountdown();
