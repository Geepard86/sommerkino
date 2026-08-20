
const CFG=window.SOMMERKINO_CONFIG;
const {createClient}=supabase;
const sb=createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const CHANNEL="sommerkino:"+CFG.ROOM;
const params=new URLSearchParams(location.search);
const isHost=params.get("host")===CFG.HOST_PASSWORD;
const ICONS=["🏓","🐍","🍿","🦫","🦈","🎬","📼","📺","🛼","🪩","🍉","🕶️"];
let questions=[],channel=null,me=null,hostPresenceKey=null,hostReady=false,joined=false,timer=null;
let state={phase:"lobby",q:0,players:{},answers:{},version:0};

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function status(x){$("#status").textContent=x}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function boot(){
  try{
    questions=await fetch("questions.json",{cache:"no-store"}).then(r=>r.json());
    channel=sb.channel(CHANNEL,{config:{broadcast:{ack:true},presence:{key:isHost?"host":crypto.randomUUID()}}});
    channel
      .on("broadcast",{event:"sommerkino"},({payload})=>onMessage(payload))
      .on("presence",{event:"sync"},()=>onPresence())
      .on("presence",{event:"join"},()=>onPresence())
      .on("presence",{event:"leave"},()=>onPresence());
    await subscribe();
    if(isHost) initHost(); else renderJoin();
  }catch(e){showError(e)}
}
async function subscribe(){
  status("CONNECTING");
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(fn)=>{if(done)return;done=true;fn()};
    channel.subscribe(async s=>{
      if(s==="SUBSCRIBED"){finish(resolve)}
      if(s==="CHANNEL_ERROR"||s==="TIMED_OUT"){finish(()=>reject(new Error(s)))}
    });
    setTimeout(()=>finish(()=>reject(new Error("TIMEOUT"))),10000);
  }).then(()=>{status("ONLINE")}).catch(e=>{
    status("RETRY");
    setTimeout(()=>location.reload(),2500);
    throw e;
  });
}
function onPresence(){
  const ps=channel.presenceState();
  hostReady=Object.values(ps).some(arr=>arr.some(x=>x.role==="host"));
  if(!isHost && joined && !hostReady) status("HOST OFFLINE");
  else if(joined) status("ONLINE");
}
async function broadcast(payload){await channel.send({type:"broadcast",event:"sommerkino",payload})}
function onMessage(m){
  if(!m||!m.type)return;
  if(isHost) hostMessage(m);
  else playerMessage(m);
}

function initHost(){
  hostPresenceKey="host";
  channel.track({role:"host",name:"BEAMER",online_at:new Date().toISOString()});
  renderHost();
  broadcast({type:"host_state",s:publicState()});
}
function publicState(){
  return {phase:state.phase,q:state.q,players:Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,{id:p.id,name:p.name,icon:p.icon,score:p.score}]))};
}
function hostMessage(m){
  if(m.type==="join"){
    const p=m.p;
    if(!p||!p.id||!p.name)return;
    state.players[p.id]={id:p.id,name:String(p.name).slice(0,18),icon:p.icon||"🍿",score:state.players[p.id]?.score||0};
    broadcast({type:"host_state",s:publicState()});
    renderHost();
  }
  if(m.type==="answer"){
    if(state.phase!=="question")return;
    if(!state.players[m.id]||state.answers[m.id]!==undefined)return;
    state.answers[m.id]=m.a;
    if(Object.keys(state.answers).length>=Object.keys(state.players).length)showResult();
    renderHost();
  }
  if(m.type==="leave"){delete state.players[m.id];delete state.answers[m.id];renderHost();broadcast({type:"host_state",s:publicState()})}
}
function playerMessage(m){
  if(m.type==="host_state"){state=m.s;renderPlayer()}
  if(m.type==="answer_ok")showSaved();
  if(m.type==="refresh")location.reload();
}
function startQuestion(){
  state.phase="question";state.answers={};state.version++;
  broadcast({type:"host_state",s:publicState()});
  renderHost();
  const q=questions[state.q];
  if(q.time){
    let t=q.time;
    timer=setInterval(()=>{t--;const el=$("#hosttimer");if(el)el.textContent=t;if(t<=0){clearInterval(timer);showResult()}},1000);
  }
}
function showResult(){
  if(state.phase!=="question")return;
  if(timer)clearInterval(timer);
  const q=questions[state.q];
  Object.entries(state.answers).forEach(([id,a])=>{
    if(state.players[id])state.players[id].score+=scoreFor(q,a);
  });
  state.phase="result";state.version++;
  broadcast({type:"host_state",s:publicState()});renderHost();
}
function next(){
  if(state.phase!=="result")return;
  if(state.q>=questions.length-1){state.phase="finished";broadcast({type:"host_state",s:publicState()});renderHost();return}
  state.q++;startQuestion();
}
function reset(){location.reload()}
function scoreFor(q,a){
  if(q.type==="mc"||q.type==="tf")return a===q.answer?100:0;
  if(q.type==="estimate")return Math.max(0,100-Math.round(Math.abs(Number(a)-q.answer)/q.answer*100));
  if(q.type==="emoji"||q.type==="who")return String(a).trim().toLowerCase()===String(q.answer).trim().toLowerCase()?100:0;
  if(q.type==="sort")return JSON.stringify(a)===JSON.stringify(q.answer)?100:0;
  return 0;
}
function solution(q){
  if(q.type==="mc")return esc(q.options[q.answer]);
  if(q.type==="tf")return q.answer?"WAHR":"FALSCH";
  if(q.type==="sort")return q.answer.map(esc).join(" → ");
  return esc(String(q.answer)+(q.unit?" "+q.unit:""));
}
function renderHost(){
  const players=Object.values(state.players).sort((a,b)=>b.score-a.score);
  const rows=players.map((p,i)=>`<div class="row"><span class="rank">${i+1}.</span><span>${p.icon} ${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");
  let body;
  if(state.phase==="lobby")body=`<div class="hero"><h1>🎞️ SOMMERKINO<br>HOST</h1><p>RAUM</p><div class="room">${CFG.ROOM}</div><p>Spieler öffnen die normale URL.</p><div class="notice">Spieler: <b>${location.href.split("?")[0]}</b></div><button class="btn lime" id="start">▶ QUIZ STARTEN</button><h2>${players.length} SPIELER</h2>${rows||"<p>Noch niemand da.</p>"}</div>`;
  else if(state.phase==="finished")body=`<div class="hero"><h1>🏆 FILM AB!</h1>${rows}<br><button class="btn lime" id="reset">NEUES SPIEL</button></div>`;
  else body=`<div class="small">FRAGE ${state.q+1} / ${questions.length}</div><div class="progress"><i style="width:${((state.q+1)/questions.length)*100}%"></i></div><div class="question">${esc(questions[state.q].q)}</div>${state.phase==="question"?`<div class="timer" id="hosttimer">${questions[state.q].time||"∞"}</div><div class="notice">${Object.keys(state.answers).length} / ${players.length} Antworten</div>`:`<div class="fact"><b>RICHTIGE LÖSUNG</b><br>${solution(questions[state.q])}</div>`}<h2>LEADERBOARD</h2>${rows||"<p>Keine Spieler.</p>"}${state.phase==="result"?`<br><button class="btn lime" id="next">${state.q===questions.length-1?"ERGEBNIS":"NÄCHSTE FRAGE"} ▶</button>`:""}`;
  $("#app").innerHTML=`<section class="panel">${body}</section>`;
  if($("#start"))$("#start").onclick=startQuestion;
  if($("#next"))$("#next").onclick=next;
  if($("#reset"))$("#reset").onclick=reset;
}
function renderJoin(){
  $("#app").innerHTML=`<section class="panel hero"><h1>📼 SOMMERKINO<br>QUIZ 2000</h1><p>RAUM</p><div class="room">${CFG.ROOM}</div><p>Wie heißt du?</p><input id="name" maxlength="18" placeholder="DEIN NAME"><p>Dein Film-Maskottchen:</p><div class="grid">${ICONS.map((i,n)=>`<button class="btn ${n===2?"pink":""}" data-icon="${i}"><span class="icon">${i}</span>${i}</button>`).join("")}</div><br><button class="btn lime" id="join">▶ BEITRETEN</button><p class="small muted">Der Beamer startet das Quiz.</p></section>`;
  let selected="🍿";
  document.querySelectorAll("[data-icon]").forEach(b=>b.onclick=()=>{selected=b.dataset.icon;document.querySelectorAll("[data-icon]").forEach(x=>x.classList.remove("pink"));b.classList.add("pink")});
  $("#join").onclick=async()=>{const name=$("#name").value.trim();if(!name)return;me={id:crypto.randomUUID(),name,icon:selected};joined=true;await channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});await broadcast({type:"join",p:me});renderWaiting()};
  $("#name").onkeydown=e=>{if(e.key==="Enter")$("#join").click()};
}
function renderWaiting(){
  $("#app").innerHTML=`<section class="panel hero"><h1>✓ DU BIST DRIN!</h1><div class="room">${me.icon} ${esc(me.name)}</div><p>Warte auf den Beamer …</p><div class="notice">Raum: ${CFG.ROOM}</div></section>`;
}
function submit(a){
  broadcast({type:"answer",id:me.id,a});
  document.querySelectorAll("button,input").forEach(x=>x.disabled=true);
  showSaved();
}
function showSaved(){
  if(!$("#app .fact"))$("#app .panel").insertAdjacentHTML("beforeend",`<p class="fact">✓ Antwort gespeichert.<br>Schau auf die Leinwand!</p>`);
}
function renderPlayer(){
  if(state.phase==="lobby"){renderWaiting();return}
  if(state.phase==="finished"){const p=state.players[me.id];$("#app").innerHTML=`<section class="panel hero"><h1>🏆 FERTIG!</h1><p>${me.icon} ${esc(me.name)}</p><p>Dein Punktestand: <b>${p?p.score:"—"}</b></p><p>Danke fürs Mitspielen!</p></section>`;return}
  const q=questions[state.q];
  let controls="";
  if(q.type==="mc")controls=`<div class="answers">${q.options.map((o,i)=>`<button class="btn choice" data-a="${i}">${String.fromCharCode(65+i)}) ${esc(o)}</button>`).join("")}</div>`;
  if(q.type==="tf")controls=`<div class="answers"><button class="btn choice" data-a="true">WAHR</button><button class="btn choice" data-a="false">FALSCH</button></div>`;
  if(q.type==="estimate")controls=`<input id="answer" type="number" step="0.1" placeholder="${q.unit||"Wert"}"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="emoji")controls=`<input id="answer" placeholder="FILMTITEL"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="who")controls=`<div>${q.hints.map((h,i)=>`<p class="small">Hinweis ${i+1}: ${esc(h)}</p>`).join("")}</div><input id="answer" placeholder="WER BIN ICH?"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="sort")controls=`<div id="sortlist"></div><button class="btn lime" id="send">REIHENFOLGE ABSENDEN</button>`;
  $("#app").innerHTML=`<section class="panel"><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question">${esc(q.q)}</div>${q.time?`<div class="timer">${q.time}</div>`:""}${controls}</section>`;
  document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>submit(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a)));
  if(q.type==="sort"){
    let order=[...q.items];
    const draw=()=>{$("#sortlist").innerHTML=order.map((x,i)=>`<button class="btn choice sortitem" data-i="${i}">${i+1}. ${esc(x)}</button>`).join("");document.querySelectorAll(".sortitem").forEach(b=>b.onclick=()=>{let i=+b.dataset.i;if(i<order.length-1){[order[i],order[i+1]]=[order[i+1],order[i]];draw()}})};
    draw();$("#send").onclick=()=>submit(order);
  }else if($("#send"))$("#send").onclick=()=>submit(q.type==="estimate"?Number($("#answer").value):$("#answer").value.trim());
}
function showError(e){$("#app").innerHTML=`<section class="panel hero"><h1>⚠ CONNECTION ERROR</h1><p>${esc(e.message||e)}</p><button class="btn lime" onclick="location.reload()">RETRY</button></section>`;status("ERROR")}
window.addEventListener("beforeunload",()=>{if(channel&&me)broadcast({type:"leave",id:me.id})});
boot();
