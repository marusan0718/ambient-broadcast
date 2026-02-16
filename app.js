const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// いったん仮の音源（あとで差し替え）
// まずは同じフォルダに test.mp3 を置く想定
const AUDIO_URL = "test.mp3";

const state = {
  manual: { season: "auto", weather: "auto", time: "auto" },
  nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
  isPlaying: false,
};

const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const player = document.getElementById("player");
const modeLine = document.getElementById("modeLine");
const detailLine = document.getElementById("detailLine");
const countdown = document.getElementById("countdown");

// チップ選択（保持）
document.querySelectorAll(".chips").forEach(group => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const key = group.dataset.key;
    state.manual[key] = btn.dataset.val;

    [...group.querySelectorAll(".chip")].forEach(b => b.classList.toggle("is-active", b === btn));
    renderStatus();
    applyBackground();
  });
});

// 再生/停止
playBtn.addEventListener("click", async () => {
  try {
    if (!state.isPlaying) {
      player.src = AUDIO_URL;
      player.loop = true; // まずは検証用にループ
      await player.play();

      state.isPlaying = true;
      playBtn.classList.add("is-playing");
      playIcon.textContent = "❚❚";
    } else {
      player.pause();
      state.isPlaying = false;
      playBtn.classList.remove("is-playing");
      playIcon.textContent = "▶︎";
    }
  } catch (e) {
    console.error(e);
    alert("再生できなかった…（最初の再生はボタン操作が必要だよ）");
  }
});

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

function renderStatus(){
  const time = state.manual.time === "auto" ? getAutoTimeBlock() : state.manual.time;
  const weather = state.manual.weather;
  const season = state.manual.season;

  const isManual = Object.values(state.manual).some(v => v !== "auto");
  modeLine.textContent = `${isManual ? "Manual" : "Auto"}: ${label("time",time)} / ${label("weather",weather)} / ${label("season",season)}`;
  detailLine.textContent = "右下に更新までのカウントが出るよ（5分ごと）";
}

function tickCountdown(){
  const now = Date.now();
  let remain = state.nextUpdateAt - now;

  if (remain <= 0) {
    state.nextUpdateAt = now + UPDATE_INTERVAL_MS;
    // このタイミングでAuto入力更新（今は見た目だけ再計算）
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

// 背景（最小：単色＋微補正）
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

// init
renderStatus();
applyBackground();
tickCountdown();