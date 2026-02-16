const UPDATE_INTERVAL = 5 * 60 * 1000;

const state = {
  manual: { time:"auto", weather:"auto", season:"auto" },
  nextUpdate: Date.now() + UPDATE_INTERVAL,
  playing:false,
  seed:Date.now()
};

const playBtn=document.getElementById("playBtn");
const playIcon=document.getElementById("playIcon");
const modeLine=document.getElementById("modeLine");
const countdown=document.getElementById("countdown");

let ctx, master, timer;

document.querySelectorAll(".chips").forEach(group=>{
  group.addEventListener("click",e=>{
    const btn=e.target.closest(".chip");
    if(!btn) return;
    const key=group.dataset.key;
    state.manual[key]=btn.dataset.val;
    [...group.querySelectorAll(".chip")]
      .forEach(b=>b.classList.toggle("is-active",b===btn));
    updateStatus();
  });
});

playBtn.onclick=async()=>{
  if(!state.playing){
    await start();
    state.playing=true;
    playIcon.textContent="❚❚";
  }else{
    stop();
    state.playing=false;
    playIcon.textContent="▶︎";
  }
};

async function start(){
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  master=ctx.createGain();
  master.gain.value=.8;
  master.connect(ctx.destination);
  generate();
  tick();
}

function stop(){
  clearTimeout(timer);
  ctx.close();
}

function generate(){
  const now=ctx.currentTime;
  const o=ctx.createOscillator();
  const g=ctx.createGain();
  o.type="sine";
  o.frequency.value=200+Math.random()*200;
  g.gain.setValueAtTime(0,now);
  g.gain.linearRampToValueAtTime(.05,now+.5);
  g.gain.exponentialRampToValueAtTime(.0001,now+4);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(now+4);

  if(state.manual.weather==="rain"){
    const n=ctx.createOscillator();
    const ng=ctx.createGain();
    n.type="triangle";
    n.frequency.value=800+Math.random()*800;
    ng.gain.setValueAtTime(0,now);
    ng.gain.linearRampToValueAtTime(.02,now+.1);
    ng.gain.exponentialRampToValueAtTime(.0001,now+1);
    n.connect(ng);
    ng.connect(master);
    n.start();
    n.stop(now+1);
  }

  timer=setTimeout(generate,3000);
}

function tick(){
  const remain=state.nextUpdate-Date.now();
  if(remain<=0){
    state.seed=Date.now();
    state.nextUpdate=Date.now()+UPDATE_INTERVAL;
  }
  countdown.textContent="次の更新まで "+format(remain);
  requestAnimationFrame(tick);
}

function format(ms){
  const s=Math.max(0,Math.floor(ms/1000));
  const m=String(Math.floor(s/60)).padStart(2,"0");
  const ss=String(s%60).padStart(2,"0");
  return m+":"+ss;
}

function updateStatus(){
  modeLine.textContent=
    (state.manual.time||"")+" "+
    (state.manual.weather||"")+" "+
    (state.manual.season||"");
}
