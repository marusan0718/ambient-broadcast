const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

const state = {
  manual: { season: "auto", weather: "auto", time: "auto" },
  nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
  isPlaying: false,
  seed: (Date.now() >>> 0),
};

const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const modeLine = document.getElementById("modeLine");
const detailLine = document.getElementById("detailLine");
const countdown = document.getElementById("countdown");

// ====== UI: チップ選択（保持） ======
document.querySelectorAll(".chips").forEach(group => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const key = group.dataset.key;
    state.manual[key] = btn.dataset.val;
    [...group.querySelectorAll(".chip")].forEach(b => b.classList.toggle("is-active", b === btn));

    renderStatus();
    applyBackground();

    // 再生中なら、その場で“雰囲気”反映（なめらかに）
    if (engine) engine.update(getEnv());
  });
});


// ====== 再生/停止 ======
playBtn.addEventListener("click", async () => {
  try {
    if (!state.isPlaying) {
      await startPreview();
      state.isPlaying = true;
      playBtn.classList.add("is-playing");
      playIcon.textContent = "❚❚";
    } else {
      stopPreview();
      state.isPlaying = false;
      playBtn.classList.remove("is-playing");
      playIcon.textContent = "▶︎";
    }
  } catch (e) {
    console.error(e);
    alert("再生できなかった…（iOSはボタン操作が必要だよ）");
  }
});

// ====== Auto決定 ======
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
  return (map[k] && map[k][v]) ? map[k][v] : v;
}

function getEnv(){
  const time = state.manual.time === "auto" ? getAutoTimeBlock() : state.manual.time;
  const weather = state.manual.weather; // auto/clear/cloudy/rain
  const season = state.manual.season;   // auto/spring/summer/autumn/winter

  return {
    time,
    weather,
    season,
    seed: state.seed,
  };
}

// ====== 表示 ======
function renderStatus(){
  const env = getEnv();
  const isManual = Object.values(state.manual).some(v => v !== "auto");
  modeLine.textContent =
    `${isManual ? "Manual" : "Auto"}: ${label("time",env.time)} / ${label("weather",env.weather)} / ${label("season",env.season)}`;

  detailLine.textContent = "生成プレビュー：チップを触ると雰囲気が変わるよ（急変しない）";

  const r = recipeFromEnv(env);
  recipeLine.textContent =
    `Recipe: tempo=${r.tempo}  density=${r.density.toFixed(2)}  rain=${r.rain.toFixed(2)}  birds=${r.birds.toFixed(2)}  bright=${r.brightness.toFixed(2)}  seed=${env.seed}`;
}

// ====== 背景（最小） ======
function applyBackground(){
  const time = state.manual.time === "auto" ? getAutoTimeBlock() : state.manual.time;
  const base = {
    morning:"#F4F8FF",
    day:"#FFFFFF",
    evening:"#FFF6EC",
    night:"#0F1724",
    late:"#070B14",
  }[time] || "#FFFFFF";

  let bg = base;
  if (state.manual.weather === "cloudy") bg = mix(bg, "#F3F4F6", 0.08);
  if (state.manual.weather === "rain")   bg = mix(bg, "#0B1220", 0.06);

  if (state.manual.season === "spring") bg = mix(bg, "#FFF1F2", 0.05);
  if (state.manual.season === "summer") bg = mix(bg, "#EFF6FF", 0.05);
  if (state.manual.season === "autumn") bg = mix(bg, "#FFF7ED", 0.05);
  if (state.manual.season === "winter") bg = mix(bg, "#F3F4F6", 0.05);

  document.documentElement.style.setProperty("--bg", bg);

  const dark = (time === "night" || time === "late");
  document.documentElement.style.setProperty("--fg", dark ? "#F9FAFB" : "#111827");
  document.documentElement.style.setProperty("--muted", dark ? "rgba(249,250,251,.55)" : "rgba(17,24,39,.55)");
  document.documentElement.style.setProperty("--chip", dark ? "rgba(249,250,251,.10)" : "rgba(17,24,39,.08)");
  document.documentElement.style.setProperty("--chipOn", dark ? "rgba(249,250,251,.16)" : "rgba(17,24,39,.14)");
  document.documentElement.style.setProperty("--ring", dark ? "rgba(249,250,251,.20)" : "rgba(17,24,39,.18)");
}

function mix(a,b,t){
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r)*t);
  const g = Math.round(A.g + (B.g - A.g)*t);
  const bl= Math.round(A.b + (B.b - A.b)*t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex){
  const h = hex.replace("#","");
  const v = h.length===3 ? h.split("").map(x=>x+x).join("") : h;
  const n = parseInt(v,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

// ====== 5分更新カウント ======
function tickCountdown(){
  const now = Date.now();
  let remain = state.nextUpdateAt - now;

  if (remain <= 0) {
    state.nextUpdateAt = now + UPDATE_INTERVAL_MS;
    // 5分ごとに seed を更新して“飽きない”
    state.seed = (state.seed + 1013904223) >>> 0;
    if (engine) engine.regenerate(getEnv());
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

// ====== 生成レシピ：入力→音のパラメータ ======
function recipeFromEnv(env){
  // tempo：体感の動き（BPM的なもの）
  let tempo = 50;
  if (env.time === "morning") tempo = 54;
  if (env.time === "day") tempo = 56;
  if (env.time === "evening") tempo = 52;
  if (env.time === "night") tempo = 46;
  if (env.time === "late") tempo = 42;

  // density：粒（ベル/水滴）の頻度
  let density = 0.35;
  if (env.time === "day") density += 0.06;
  if (env.time === "night" || env.time === "late") density -= 0.10;

  // brightness：フィルタの明るさ
  let brightness = 0.55;
  if (env.time === "morning" || env.time === "day") brightness += 0.10;
  if (env.time === "night" || env.time === "late") brightness -= 0.18;

  // weather：雨は水を増やす / 曇りは少し落ち着かせる
  let rain = 0.0;
  if (env.weather === "cloudy") { density -= 0.03; brightness -= 0.03; }
  if (env.weather === "rain")   { rain = 0.60; density += 0.04; brightness -= 0.08; }

  // birds：朝/昼だけ
  let birds = 0.0;
  if (env.time === "morning") birds = 0.55;
  if (env.time === "day") birds = 0.35;
  if (env.weather === "rain") birds *= 0.25; // 雨の日は控えめ

  // season：空気の色（キーと温度）
  let warmth = 0.55; // 0..1
  if (env.season === "spring") warmth += 0.10;
  if (env.season === "summer") warmth -= 0.05;
  if (env.season === "autumn") warmth += 0.05;
  if (env.season === "winter") warmth -= 0.10;

  density = clamp(density, 0.08, 0.70);
  brightness = clamp(brightness, 0.15, 0.85);

  return { tempo, density, brightness, rain, birds, warmth };
}

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

// ====== WebAudio Engine（軽量生成） ======
let engine = null;

async function startPreview(){
  if (!engine) engine = new AmbientEngine();
  await engine.start(getEnv());
  renderStatus();
}

function stopPreview(){
  engine?.stop();
}

// 疑似乱数（seed固定で再現）
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class AmbientEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.fx = null;
    this.layerA = null;
    this.layerB = null;
    this.active = "A";
    this.timers = [];
  }

  async start(env){
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();

    // 2レイヤーでクロスフェード（急変しない）
    this.layerA = this._createLayer();
    this.layerB = this._createLayer();
    this.layerA.gain.gain.value = 1.0;
    this.layerB.gain.gain.value = 0.0;

    this.layerA.gain.connect(this.master);
    this.layerB.gain.connect(this.master);

    // 初期生成
    this._renderToLayer(this.layerA, env);
    this._renderToLayer(this.layerB, env);

    this.active = "A";
    this._scheduleLoop(env);
  }

  stop(){
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    if (this.ctx) {
      // iOSで完全closeより suspendが安定することが多い
      this.ctx.suspend();
    }
  }

  update(env){
    // いまのレイヤーに対して、フィルタ/レベルをなめらか調整
    const r = recipeFromEnv(env);
    const L = (this.active === "A") ? this.layerA : this.layerB;
    if (!L) return;

    const now = this.ctx.currentTime;
    L.filter.frequency.cancelScheduledValues(now);
    const cutoff = 600 + r.brightness * 4200; // 600..4800
    L.filter.frequency.setTargetAtTime(cutoff, now, 1.2);

    L.rainGain.gain.cancelScheduledValues(now);
    L.rainGain.gain.setTargetAtTime(r.rain * 0.18, now, 1.5);

    // 鳥頻度は次スケジュールで効く（即時には鳴らさない）
    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;
    L._warmth = r.warmth;
  }

  regenerate(env){
    // 次レイヤーに新しいseedで生成 → 30秒クロスフェード
    const from = (this.active === "A") ? this.layerA : this.layerB;
    const to   = (this.active === "A") ? this.layerB : this.layerA;

    this._renderToLayer(to, env);

    const now = this.ctx.currentTime;
    from.gain.gain.cancelScheduledValues(now);
    to.gain.gain.cancelScheduledValues(now);

    from.gain.gain.setTargetAtTime(0.0, now, 12.0); // 約30秒でほぼ0へ
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

    // routing
    padGain.connect(filter);
    bellGain.connect(filter);
    rainGain.connect(filter);
    filter.connect(g);

    // noise source（雨/水）
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
      _density: 0.35,
      _tempo: 50,
      _warmth: 0.55,
    };
  }

  _renderToLayer(L, env){
    // 既存Padを止める（古いのを整理）
    L._pads.forEach(o => { try { o.stop(); } catch(_){} });
    L._pads = [];

    const r = recipeFromEnv(env);
    L._birds = r.birds;
    L._density = r.density;
    L._tempo = r.tempo;
    L._warmth = r.warmth;

    const cutoff = 600 + r.brightness * 4200;
    L.filter.frequency.value = cutoff;
    L.rainGain.gain.value = r.rain * 0.18;

    // season → key（少しだけ）
    const keyMap = { spring: 60, summer: 62, autumn: 57, winter: 55, auto: 60 }; // MIDI root
    const root = keyMap[env.season] ?? 60;

    // 和音の雰囲気（自然寄りの穏やか）
    const prog = [
      [0, 4, 7, 11],   // maj7
      [2, 5, 9, 0+12], // sus/9
      [0, 3, 7, 10],   // m7
      [5, 9, 0+12, 4+12], // 6/9
    ];

    const rng = mulberry32(env.seed);
    const pick = prog[Math.floor(rng()*prog.length)];
    const chord = pick.map(x => root + x);

    // pad：3〜4音をゆっくり鳴らす（複数osc）
    chord.forEach((m, i) => {
      const o = this.ctx.createOscillator();
      const type = (r.warmth > 0.6) ? "triangle" : "sine";
      o.type = type;
      o.frequency.value = midiToHz(m);

      const og = this.ctx.createGain();
      og.gain.value = 0.0;

      // じわっと入って、ずっと居る
      const now = this.ctx.currentTime;
      og.gain.setValueAtTime(0.0, now);
      og.gain.linearRampToValueAtTime(0.06 + i*0.008, now + 6.0);

      o.connect(og);
      og.connect(L.padGain);

      o.start();
      L._pads.push(o);
    });
  }

  _scheduleLoop(env){
    // 既存タイマーをクリアして組み直し
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];

    const L = (this.active === "A") ? this.layerA : this.layerB;
    if (!L) return;

    const rng = mulberry32(env.seed ^ 0x9E3779B9);

    const scheduleBell = () => {
      const density = L._density;
      // 密度が高いほど短い間隔（でも邪魔しない）
      const base = 2200; // ms
      const jitter = 2200;
      const interval = base + (1.0 - density) * jitter + rng()*900;

      this._bell(L, rng);

      this.timers.push(setTimeout(scheduleBell, interval));
    };

    const scheduleBird = () => {
      const p = L._birds;
      // 鳥は「たまに」だけ
      const interval = 8000 + rng()*14000;
      if (rng() < p) this._bird(L, rng);
      this.timers.push(setTimeout(scheduleBird, interval));
    };

    const scheduleDrop = () => {
      // 雨の日は水滴っぽい短音を追加
      const rain = (L.rainGain.gain.value / 0.18);
      const interval = 2500 + rng()*4000;
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

    // 周波数：明るさとseedで揺らす
    const base = 440 + rng()*880;
    o.frequency.setValueAtTime(base, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.05 + rng()*0.03, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.6 + rng()*0.8);

    o.connect(g);
    g.connect(L.bellGain);

    o.start(now);
    o.stop(now + 2.8);
  }

  _drop(L, rng){
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    const f1 = 900 + rng()*900;
    const f2 = 300 + rng()*200;
    o.frequency.setValueAtTime(f1, now);
    o.frequency.exponentialRampToValueAtTime(f2, now + 0.12);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.03 + rng()*0.02, now + 0.005);
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

    // 口笛っぽい上昇/下降
    const f0 = 1600 + rng()*900;
    const f1 = f0 + (rng()*600 - 300);
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
    o.stop(now + 0.5);
  }

  _whiteNoiseBuffer(seconds){
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * 0.35;
    return buf;
  }
}

function midiToHz(m){ return 440 * Math.pow(2, (m-69)/12); }

// init
renderStatus();
applyBackground();
tickCountdown();
