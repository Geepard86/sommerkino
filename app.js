
const CFG=window.SOMMERKINO_CONFIG;
const {createClient}=supabase;
const sb=createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ROOM="sommerkino:"+CFG.ROOM;
const isHost=new URLSearchParams(location.search).get("host")===CFG.HOST_PASSWORD;
const ICONS=["🏓","🐍","🍿","🐻","🦫","🦈","🪰","🎬","📽️","🎞️","🎟️","📺","📼","📷","🛹","🚐","🌵","📹","👻","💀","👄"];
const PLAYER_KEY="sommerkino-player-v5";
const ANSWER_KEY="sommerkino-answer-v5";
const HOST_STATE_KEY="sommerkino-host-state-v1";

let audioCtx=null;
function audioInit(){if(!isHost)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}catch{}}
function tone(freq,dur=.08,delay=0,type="square",gain=.035){if(!isHost||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,audioCtx.currentTime+delay);g.gain.linearRampToValueAtTime(gain,audioCtx.currentTime+delay+.01);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+delay+dur);o.connect(g).connect(audioCtx.destination);o.start(audioCtx.currentTime+delay);o.stop(audioCtx.currentTime+delay+dur+.02)}
function soundNewQuestion(){audioInit();tone(440,.08);tone(660,.1,.09);tone(880,.16,.2,"square",.045)}
function soundAnswers(){audioInit();tone(880,.07);tone(1175,.12,.08,"square",.045)}
function soundResult(){audioInit();tone(523,.12);tone(659,.12,.12);tone(784,.16,.24);tone(1047,.28,.4,"triangle",.05)}
function soundCountdown(n){if(n<=5&&n>0){audioInit();tone(n===1?880:520,.06)}}

function genGameId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

let questions=[],channel=null,me=null,timer=null,countdownRAF=null;
let state={phase:"lobby",q:0,players:{},answers:{},questionStartedAt:null,questionDuration:20,version:0,gameId:genGameId(),ceremonyStep:0};
// Ausgleich zwischen der Host-Systemuhr und der Uhr dieses Geräts (behebt einen leicht
// asynchronen Countdown, wenn beide Geräte nicht exakt dieselbe Uhrzeit haben).
let clockOffset=null;
// Verhindert, dass während der Antwortphase eingehende host_state-Updates (z.B. weil ein
// anderer Spieler geantwortet hat) den kompletten Bildschirm neu aufbauen und damit eine
// laufende Drag&Drop-Sortierung oder Texteingabe zerstören.
let lastRenderedKey=null;

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const now=()=>Date.now();
function status(x){$("#status").textContent=x}
function playerStorage(){try{return JSON.parse(localStorage.getItem(PLAYER_KEY)||"null")}catch{return null}}
function savePlayer(){localStorage.setItem(PLAYER_KEY,JSON.stringify(me))}
function forgetPlayer(){localStorage.removeItem(PLAYER_KEY);localStorage.removeItem(ANSWER_KEY)}
function clearAnswerState(){localStorage.removeItem(ANSWER_KEY)}
function saveAnswer(a){localStorage.setItem(ANSWER_KEY,JSON.stringify({q:state.q,a}))}
function savedAnswer(){try{let x=JSON.parse(localStorage.getItem(ANSWER_KEY)||"null");return x&&x.q===state.q?x.a:undefined}catch{return undefined}}
function saveHostState(){
  if(!isHost)return;
  try{
    localStorage.setItem(HOST_STATE_KEY,JSON.stringify({
      phase:state.phase,q:state.q,players:state.players,questionStartedAt:state.questionStartedAt,
      questionDuration:state.questionDuration,version:state.version,gameId:state.gameId,
      ceremonyStep:state.ceremonyStep||0,typingProgress:state.typingProgress||0
    }));
  }catch{}
}
function loadHostState(){
  if(!isHost)return false;
  try{
    const saved=JSON.parse(localStorage.getItem(HOST_STATE_KEY)||"null");
    if(!saved?.gameId||!saved?.phase)return false;
    state={
      phase:saved.phase,q:Number(saved.q)||0,players:saved.players||{},answers:{},
      questionStartedAt:saved.questionStartedAt||null,questionDuration:Number(saved.questionDuration)||20,
      version:Number(saved.version)||0,gameId:saved.gameId,ceremonyStep:Number(saved.ceremonyStep)||0,
      typingProgress:Number(saved.typingProgress)||0
    };
    return true;
  }catch{return false}
}
function clearHostState(){try{localStorage.removeItem(HOST_STATE_KEY)}catch{}}
function availableIcons(exceptId=null){
  const used=new Set(Object.values(state.players).filter(p=>p.id!==exceptId).map(p=>p.icon));
  return ICONS.filter(icon=>!used.has(icon));
}

async function boot(){
  try{
    questions=await fetch("questions.json",{cache:"no-store"}).then(r=>r.json());
    channel=sb.channel(ROOM,{config:{broadcast:{ack:true},presence:{key:isHost?"host":(playerStorage()?.id||crypto.randomUUID())}}});
    channel.on("broadcast",{event:"sommerkino"},({payload})=>onMessage(payload));
    channel.on("presence",{event:"sync"},()=>onPresence());
    channel.on("presence",{event:"join"},()=>onPresence());
    channel.on("presence",{event:"leave"},()=>onPresence());
    await subscribe();
    if(isHost)initHost();else renderJoinOrReconnect();
    initResync();
  }catch(e){showError(e)}
}
async function subscribe(){
  status("CONNECTING");
  return new Promise((resolve,reject)=>{
    let done=false;const finish=(fn)=>{if(done)return;done=true;fn()};
    channel.subscribe(s=>{if(s==="SUBSCRIBED")finish(resolve);if(s==="CHANNEL_ERROR"||s==="TIMED_OUT")finish(()=>reject(new Error(s)))});
    setTimeout(()=>finish(()=>reject(new Error("TIMEOUT"))),10000);
  }).then(()=>status("ONLINE")).catch(e=>{status("RETRY");setTimeout(()=>location.reload(),2500);throw e});
}
function onPresence(){}
async function broadcast(payload){await channel.send({type:"broadcast",event:"sommerkino",payload})}
function onMessage(m){if(isHost)hostMessage(m);else playerMessage(m)}

// V8: Wenn das Handy gesperrt/im Hintergrund war und die Realtime-Verbindung dadurch
// eingeschlafen ist, sorgt dies dafür, dass beim Zurückkommen automatisch neu synchronisiert
// wird - ohne dass der Spieler etwas tun muss. Als letzte Absicherung wird neu geladen, was
// dank der gespeicherten Spieler-Identität (localStorage) zuverlässig zum selben Punkt zurückführt.
function initResync(){
  let lastResyncAt=0;
  function resync(){
    const t=now();
    if(t-lastResyncAt<800)return;
    lastResyncAt=t;
    if(!channel)return;
    if(channel.state==="joined"){afterResync();return}
    status("RECONNECTING");
    let settled=false;
    const fallback=setTimeout(()=>{if(!settled)location.reload()},4000);
    try{
      channel.subscribe(s=>{
        if(s==="SUBSCRIBED"){settled=true;clearTimeout(fallback);status("ONLINE");afterResync()}
        else if(s==="CHANNEL_ERROR"||s==="TIMED_OUT"){settled=true;clearTimeout(fallback);location.reload()}
      });
    }catch{location.reload()}
  }
  function afterResync(){
    if(isHost){broadcast({type:"host_state",s:publicState()})}
    else if(me){channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});broadcast({type:"reconnect",p:me})}
  }
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")resync()});
  window.addEventListener("pageshow",e=>{if(e.persisted)resync()});
  window.addEventListener("focus",()=>resync());
  window.addEventListener("online",()=>resync());
}

function initHost(){
  channel.track({role:"host",name:"BEAMER"});
  const restored=loadHostState();
  renderHost();
  broadcast({type:"host_state",s:publicState()});
  if(restored){
    if(state.phase==="typing"){
      const q=questions[state.q];
      if(q)startQuestion(true);
    }else if(state.phase==="answers"){
      const elapsed=state.questionStartedAt?now()-state.questionStartedAt:0;
      if(elapsed>=state.questionDuration*1000)endQuestion();
      else runHostCountdown();
    }
  }
}
function publicState(){
  return {phase:state.phase,q:state.q,questionStartedAt:state.questionStartedAt,questionDuration:state.questionDuration,typingProgress:state.typingProgress||0,gameId:state.gameId,ceremonyStep:state.ceremonyStep||0,hostNow:now(),
    players:Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,{id:p.id,name:p.name,icon:p.icon,score:p.score,last:p.last,roundPoints:p.roundPoints,answerTime:p.answerTime}]))};
}
function hostMessage(m){
  if(m.type==="join"){
    const p=m.p;if(!p?.id||!p?.name)return;
    const old=state.players[p.id];
    const requestedIcon=p.icon||"🍿";
    const iconTaken=Object.values(state.players).some(x=>x.id!==p.id&&x.icon===requestedIcon);
    if(iconTaken){
      broadcast({type:"join_rejected",id:p.id,reason:"ICON_TAKEN"});
      return;
    }
    state.players[p.id]={id:p.id,name:String(p.name).slice(0,18),icon:requestedIcon,score:old?.score||0,last:old?.last,roundPoints:0,answerTime:old?.answerTime};
    saveHostState();
    broadcast({type:"host_state",s:publicState()});renderHost();
  }
  if(m.type==="answer"){
    if(state.phase!=="answers")return;
    if(!state.players[m.id]||state.answers[m.id])return;
    const elapsed=Math.max(0,Math.min(state.questionDuration*1000,Number(m.clientElapsedMs)||0));
    state.answers[m.id]={a:m.a,elapsed};
    state.players[m.id].last=m.a;state.players[m.id].answerTime=elapsed;
    broadcast({type:"answer_ok",id:m.id});
    if(Object.keys(state.players).length>0 && Object.keys(state.answers).length>=Object.keys(state.players).length)endQuestion();
    else{broadcast({type:"host_state",s:publicState()});renderHost()}
  }
  if(m.type==="reconnect"){
    const p=m.p;if(!p?.id)return;
    if(p.gameId!==state.gameId){broadcast({type:"force_rejoin",id:p.id});return}
    if(state.players[p.id])broadcast({type:"host_state",s:publicState()});
    else hostMessage({type:"join",p});
  }
  if(m.type==="leave"){delete state.players[m.id];delete state.answers[m.id];saveHostState();broadcast({type:"host_state",s:publicState()});renderHost()}
}
function startQuestion(resume=false){
  clearAnswerState();
  const text=String(questions[state.q].q||"");
  const total=Math.max(1000,text.length*65);
  const initialProgress=resume?Math.min(1,Math.max(0,Number(state.typingProgress)||0)):0;
  state.phase="typing";state.answers={};state.questionStartedAt=null;state.typingProgress=initialProgress;state.version++;
  saveHostState();
  broadcast({type:"host_state",s:publicState()});renderHost();soundNewQuestion();
  const started=now()-Math.round(initialProgress*total);
  let lastN=-1;
  const tick=()=>{
    if(state.phase!=="typing")return;
    const progress=Math.min(1,(now()-started)/total);
    state.typingProgress=progress;
    saveHostState();
    const n=Math.floor(text.length*progress);
    if(n!==lastN){lastN=n;broadcast({type:"typing",q:state.q,progress})}
    renderHost();
    if(progress>=1){state.typingProgress=1;renderHost();setTimeout(showAnswers,2000);return}
    requestAnimationFrame(tick);
  }; tick();
}
function showAnswers(){
  if(state.phase!=="typing")return;
  state.phase="answers";state.answers={};state.questionStartedAt=state.questionStartedAt||now();state.typingProgress=1;state.version++;
  saveHostState();
  broadcast({type:"host_state",s:publicState()});renderHost();soundAnswers();runHostCountdown();
}
function runHostCountdown(){
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  let lastSecond=null;
  const loop=()=>{
    if(state.phase!=="answers")return;
    const left=Math.max(0,state.questionDuration-Math.floor((now()-state.questionStartedAt)/1000));
    if(left!==lastSecond){
      lastSecond=left;soundCountdown(left);
      const el=$("#hostcount");
      if(el){el.textContent=left;el.classList.remove("count-pulse");void el.offsetWidth;el.classList.add("count-pulse")}
    }
    if(left<=0){endQuestion();return}
    countdownRAF=requestAnimationFrame(loop);
  };loop();
}
function endQuestion(){
  if(state.phase!=="answers")return;
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  const q=questions[state.q];
  Object.values(state.players).forEach(p=>p.roundPoints=0);
  if(q.type==="estimate"){
    // Schätzfragen: wer am nächsten dran ist, bekommt die meisten Punkte, danach in
    // Abstufungen (150 Punkte weniger pro Rang, Minimum 100), bei Gleichstand entscheidet
    // die schnellere Antwortzeit.
    const entries=Object.entries(state.answers)
      .filter(([id,x])=>typeof x.a==="number"&&!Number.isNaN(x.a))
      .map(([id,x])=>({id,diff:Math.abs(x.a-Number(q.answer)),elapsed:x.elapsed}));
    entries.sort((a,b)=>a.diff-b.diff||a.elapsed-b.elapsed);
    entries.forEach((x,i)=>{
      const points=Math.max(100,1000-i*150);
      state.players[x.id].roundPoints=points;
      state.players[x.id].score+=points;
    });
  }else{
    const correct=[];
    Object.entries(state.answers).forEach(([id,x])=>{if(isCorrect(q,x.a))correct.push({id,elapsed:x.elapsed})});
    correct.sort((a,b)=>a.elapsed-b.elapsed);
    correct.forEach((x,i)=>{
      const points=Math.max(100,1000-Math.round(x.elapsed/1000)*45);
      state.players[x.id].roundPoints=points;
      state.players[x.id].score+=points;
    });
  }
  state.phase="result";state.questionStartedAt=null;state.version++;
  saveHostState();
  broadcast({type:"host_state",s:publicState()});renderHost();soundResult();
}
function normalizeAnswer(value){
  return String(value??"")
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")
    .toLowerCase()
    .replace(/ß/g,"ss")
    .replace(/[^a-z0-9]/g,"");
}
function levenshtein(a,b){
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    for(let j=0;j<cur.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function fuzzyTextMatch(input,expected){
  const a=normalizeAnswer(input),b=normalizeAnswer(expected);
  if(!a||!b)return false;
  if(a===b)return true;
  const distance=levenshtein(a,b);
  // Kleine Tipp-/Leerzeichenfehler erlauben; bei längeren Antworten etwas mehr.
  const maxDistance=b.length<=5?1:b.length<=10?2:3;
  return distance<=maxDistance;
}
function textAnswers(q){
  const values=Array.isArray(q.answers)?q.answers:[q.answer];
  return values.filter(v=>typeof v==="string");
}
function isCorrect(q,a){
  if(q.type==="mc"||q.type==="tf")return a===q.answer;
  if(q.type==="estimate")return false;
  if(q.type==="emoji"||q.type==="who"){
    return textAnswers(q).some(expected=>fuzzyTextMatch(a,expected));
  }
  if(q.type==="sort")return JSON.stringify(a)===JSON.stringify(q.answer);
  return false;
}
function next(){
  if(state.q>=questions.length-1){state.phase="finished";state.ceremonyStep=0;saveHostState();broadcast({type:"host_state",s:publicState()});renderHost();return}
  state.q++;startQuestion();
}
function hostReset(){
  state={phase:"lobby",q:0,players:{},answers:{},questionStartedAt:null,questionDuration:20,version:0,gameId:genGameId(),ceremonyStep:0,typingProgress:0};
  saveHostState();
  broadcast({type:"reset_game"});
  broadcast({type:"host_state",s:publicState()});
  renderHost();
}
function ceremonyNext(){
  const players=ranking();
  const slotsCount=[players[2],players[1],players[0]].filter(Boolean).length;
  if((state.ceremonyStep||0)<slotsCount){
    state.ceremonyStep=(state.ceremonyStep||0)+1;
    saveHostState();
    broadcast({type:"host_state",s:publicState()});
    renderHost();soundResult();
  }
}
function solution(q){if(q.type==="mc")return esc(q.options[q.answer]);if(q.type==="tf")return q.answer?"WAHR":"FALSCH";if(q.type==="sort")return q.answer.map(esc).join(" → ");if(q.type==="emoji"||q.type==="who")return esc(String(q.answer));return esc(String(q.answer)+(q.unit?" "+q.unit:""))}
function ranking(){return Object.values(state.players).sort((a,b)=>b.score-a.score)}

// Shared answer-area markup used identically on Beamer (host, non-interactive) and Handy (player, interactive)
function answerAreaHtml(q,interactive){
  const dis=interactive?"":"disabled";
  if(q.type==="mc")return `<div class="answers">${q.options.map((o,i)=>`<button class="btn choice" data-a="${i}" ${dis}>${String.fromCharCode(65+i)}) ${esc(o)}</button>`).join("")}</div>`;
  if(q.type==="tf")return `<div class="answers"><button class="btn choice" data-a="true" ${dis}>WAHR</button><button class="btn choice" data-a="false" ${dis}>FALSCH</button></div>`;
  if(q.type==="estimate")return `<div class="answer-input-row"><input id="answer" type="number" step="0.1" placeholder="${esc(q.unit||"Wert")}" ${dis}>${interactive?'<button class="btn lime" id="send">ABSENDEN</button>':""}</div>`;
  if(q.type==="emoji")return `<div class="answer-input-row"><input id="answer" placeholder="FILMTITEL" ${dis}>${interactive?'<button class="btn lime" id="send">ABSENDEN</button>':""}</div>`;
  if(q.type==="who")return `<div class="hints">${q.hints.map((h,i)=>`<p class="small">Hinweis ${i+1}: ${esc(h)}</p>`).join("")}</div><div class="answer-input-row"><input id="answer" placeholder="WER BIN ICH?" ${dis}>${interactive?'<button class="btn lime" id="send">ABSENDEN</button>':""}</div>`;
  if(q.type==="sort")return `<div id="sortlist" class="sortlist">${interactive?"":sortListHtml(q.items,false)}</div>${interactive?'<button class="btn lime" id="send">REIHENFOLGE ABSENDEN</button>':""}`;
  return "";
}
function sortListHtml(items,interactive){
  return items.map((x,i)=>`<div class="sortitem" data-i="${i}">${interactive?'<span class="sort-handle">☰</span>':''}<span class="sort-num">${i+1}.</span><span class="sort-label">${esc(x)}</span></div>`).join("");
}
function placeholders(q){
  if(q.type==="mc")return `<div class="phase-placeholder">${[0,1,2,3].map(i=>`<div class="placeholder-answer">${String.fromCharCode(65+i)} · · ·</div>`).join("")}</div>`;
  if(q.type==="tf")return `<div class="phase-placeholder"><div class="placeholder-answer">WAHR · · ·</div><div class="placeholder-answer">FALSCH · · ·</div></div>`;
  return `<div class="notice">Die Eingabe wird gleich freigegeben.</div>`;
}
function renderHost(){
  const players=ranking(),q=questions[state.q];
  let body="";
  if(state.phase==="lobby"){
    body=`<div class="hero host-stage"><h1>🎞️ SOMMERKINO<br>HOST</h1><p>RAUM</p><div class="room">${CFG.ROOM}</div><p><span class="ready-chip">${players.length} SPIELER ONLINE</span></p><button class="btn lime" id="start">▶ QUIZ STARTEN</button><h2>TEILNEHMER</h2>${rows(players)}</div>`;
  }else if(state.phase==="typing"){
    const text=String(q.q||""),n=Math.floor(text.length*Math.min(1,Math.max(0,state.typingProgress||0)));
    body=`<div class="host-stage"><div class="small">FRAGE ${state.q+1} / ${questions.length}</div><div class="question question-reveal">${esc(text.slice(0,n))}<span class="typing-cursor"></span></div><div class="notice">FRAGE WIRD EINGEBLENDET …</div></div>`;
  }else if(state.phase==="answers"){
    const total=Object.keys(state.players).length,answered=Object.keys(state.answers).length;
    body=`<div class="host-stage"><div class="answers-top"><span class="small">FRAGE ${state.q+1} / ${questions.length}</span><span class="host-count" id="hostcount">${state.questionDuration}</span></div><div class="question">${esc(q.q)}</div>${answerAreaHtml(q,false)}<p><span class="ready-chip">${answered} / ${total} GEANTWORTET</span></p></div>`;
  }else if(state.phase==="result"){
    const scorers=players.filter(p=>p.roundPoints>0).sort((a,b)=>b.roundPoints-a.roundPoints);
    const podium=scorers.slice(0,3).map((p,i)=>`<div class="place ${i===0?"first":i===1?"second":"third"}"><div>${["🥇","🥈","🥉"][i]}</div><b>${p.icon} ${esc(p.name)}</b><br>+${p.roundPoints} P.</div>`).join("");
    body=`<div class="hero"><div class="small">AUSWERTUNG • FRAGE ${state.q+1}</div><div class="reveal">RICHTIGE ANTWORT<br>${solution(q)}</div>${q.fact?`<div class="fact">💡 ${esc(q.fact)}</div>`:""}<div class="podium">${podium||"<div class='place first'>Keine richtige Antwort</div>"}</div><h2>GESAMTSTAND</h2><div class="result-list">${rows(players,true)}</div><br><button class="btn lime" id="next">${state.q===questions.length-1?"ENDSTAND":"NÄCHSTE FRAGE"} ▶</button></div>`;
  }else{
    // V8: Siegerehrung - erst Dritter, dann Zweiter, dann Erster wird enthüllt
    const slots=[];
    if(players[2])slots.push({p:players[2],rank:3,cls:"third",medal:"🥉"});
    if(players[1])slots.push({p:players[1],rank:2,cls:"second",medal:"🥈"});
    if(players[0])slots.push({p:players[0],rank:1,cls:"first",medal:"🥇"});
    const step=Math.min(state.ceremonyStep||0,slots.length);
    const boxes=slots.map((s,i)=>`<div class="cplace ${s.cls} ${i<step?"revealed":""}">${i<step?`<span class="rank-label">${s.medal} PLATZ ${s.rank}</span><b>${s.p.icon} ${esc(s.p.name)}</b><br>${s.p.score} PUNKTE`:`<span class="rank-label">PLATZ ${s.rank}</span>???`}</div>`).join("");
    if(slots.length===0){
      body=`<div class="hero"><h1>🏆 FILM AB!</h1><p>Noch niemand da.</p><br><button class="btn lime" id="reset">NEUES SPIEL</button></div>`;
    }else if(step<slots.length){
      body=`<div class="hero host-stage"><h1>🏆 SIEGEREHRUNG</h1><div class="ceremony">${boxes}</div><button class="btn lime" id="ceremonyNext">${slots[step].medal} PLATZ ${slots[step].rank} ENTHÜLLEN ▶</button></div>`;
    }else{
      body=`<div class="hero"><h1>🎉 HERZLICHEN GLÜCKWUNSCH!</h1><div class="ceremony">${boxes}</div><h2>GESAMTSTAND</h2>${rows(players,true)}<br><button class="btn lime" id="reset">NEUES SPIEL</button></div>`;
    }
  }
  $("#app").innerHTML=`<section class="panel">${body}</section>`;
  if($("#start"))$("#start").onclick=()=>{state.q=0;startQuestion()};
  if($("#next"))$("#next").onclick=next;
  if($("#reset"))$("#reset").onclick=hostReset;
  if($("#ceremonyNext"))$("#ceremonyNext").onclick=ceremonyNext;
}
function rows(players,bars=false){
  return players.map((p,i)=>{ let html="<div class=\"row\"><span class=\"rank\">"+(i+1)+".</span><span>"+p.icon+" "+esc(p.name)+"</span><span class=\"score\">"+p.score+"</span></div>"; if(bars){ const w=Math.min(100,Math.max(3,p.score/Math.max(1,(players[0]?.score||1))*100)); html+="<div class=\"barline\"><i style=\"--w:"+w+"%\"></i></div>";} return html; }).join("")||"<p>Noch niemand da.</p>";
}
function renderJoinOrReconnect(){
  const saved=playerStorage();
  if(saved?.id&&saved?.name){me=saved;channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});broadcast({type:"reconnect",p:me});renderWaiting()}
  else renderJoin();
}
function renderJoin(message=""){
  let selected=availableIcons()[0]||ICONS[0];
  const used=new Set(Object.values(state.players).map(p=>p.icon));
  const iconButtons=ICONS.map((i,n)=>{
    const taken=used.has(i);
    return '<button class="btn icon-btn '+(!taken&&i===selected?"pink":"")+'" data-icon="'+i+'" '+(taken?"disabled":"")+' title="'+(taken?"Bereits vergeben":"Verfügbar")+'"><span class="icon">'+i+'</span></button>';
  }).join("");
  $("#app").innerHTML=`<section class="panel hero"><h1>📼 SOMMERKINO<br>QUIZ 2000</h1><p>RAUM</p><div class="room">${CFG.ROOM}</div><p>Wie heißt du?</p><input id="name" maxlength="18" placeholder="DEIN NAME">${message?`<div class="notice">${esc(message)}</div>`:""}<p>Dein Film-Maskottchen:</p><div class="grid">${iconButtons}</div><br><button class="btn lime" id="join" ${availableIcons().length?"":"disabled"}>▶ BEITRETEN</button></section>`;
  document.querySelectorAll("[data-icon]:not(:disabled)").forEach(b=>b.onclick=()=>{
    selected=b.dataset.icon;
    document.querySelectorAll("[data-icon]").forEach(x=>x.classList.remove("pink"));
    b.classList.add("pink");
  });
  $("#join").onclick=async()=>{
    const name=$("#name").value.trim();
    if(!name)return;
    me={id:crypto.randomUUID(),name,icon:selected,gameId:state.gameId};
    savePlayer();
    await channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});
    await broadcast({type:"join",p:me});
  };
  updateHeaderReset();
}
function resetPlayerIdentity(){
  if(me)broadcast({type:"leave",id:me.id});
  forgetPlayer();me=null;lastRenderedKey=null;renderJoin();
}
function confirmReset(){
  if(confirm("Wirklich neu anmelden? Dein aktueller Punktestand auf diesem Gerät geht dabei verloren."))resetPlayerIdentity();
}
// V8: der "Neu anmelden"-Link sitzt jetzt dezent oben in der Kopfleiste (statt als großer
// Button je Screen) und fragt vor dem Zurücksetzen nach Bestätigung.
function updateHeaderReset(){
  const btn=document.getElementById("headerReset");
  if(!btn)return;
  if(!isHost&&me){btn.hidden=false;btn.onclick=confirmReset}
  else btn.hidden=true;
}
function renderWaiting(){
  $("#app").innerHTML=`<section class="panel hero"><h1>✓ DU BIST DRIN!</h1><div class="room">${me.icon} ${esc(me.name)}</div><p>Warte auf den Beamer …</p><div class="notice">Deine Anmeldung bleibt auch nach einem Refresh erhalten.</div></section>`;
  updateHeaderReset();
}
function playerMessage(m){
  if(m.type==="join_rejected"){
    if(m.id===me?.id&&m.reason==="ICON_TAKEN"){
      forgetPlayer();
      me=null;
      renderJoin("Dieses Film-Maskottchen ist leider schon vergeben. Bitte wähle ein anderes.");
    }
    return;
  }
  if(m.type==="host_state"){
    const recvLocal=now();
    if(typeof m.s.hostNow==="number"){
      const sample=m.s.hostNow-recvLocal;
      clockOffset=clockOffset===null?sample:clockOffset+(sample-clockOffset)*0.3;
    }
    state=m.s;
    if(me&&state.players[me.id]&&me.gameId!==state.gameId){me.gameId=state.gameId;savePlayer()}
    const key=state.phase+":"+state.q+":"+state.gameId;
    if(state.phase==="answers"&&key===lastRenderedKey&&document.getElementById("gv")){
      // Bereits dieselbe Antwortphase angezeigt (z.B. weil nur ein anderer Spieler
      // geantwortet hat) - kein destruktives Neurendern, damit Drag&Drop/Eingaben erhalten bleiben.
      return;
    }
    lastRenderedKey=key;
    renderPlayer();
  }
  if(m.type==="typing"&&m.q===state.q){state.typingProgress=m.progress;renderPlayer()}
  if(m.type==="answer_ok"&&me&&m.id===me.id)showSaved();
  if(m.type==="reset_game"||(m.type==="force_rejoin"&&me&&m.id===me.id)){forgetPlayer();me=null;lastRenderedKey=null;renderJoin()}
}
function sendAnswer(a){
  const elapsed=Math.max(0,Math.min(state.questionDuration*1000,now()+(clockOffset||0)-state.questionStartedAt));
  saveAnswer(a);broadcast({type:"answer",id:me.id,a,clientElapsedMs:elapsed});showSaved();
}
function showSaved(){
  document.querySelectorAll("button,input").forEach(x=>x.disabled=true);
  if(!$("#saved-banner")){
    const host=document.getElementById("gv")||document.querySelector("#app .panel");
    if(host){
      host.insertAdjacentHTML("afterbegin",`<div class="saved-banner" id="saved-banner">✓ ANTWORT GESPEICHERT<br>SCHAU AUF DEN BEAMER</div>`);
      if(state.phase==="answers")fitViewport();
    }
  }
}
function startMobileClock(){
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  let lastSecond=null;
  const loop=()=>{
    if(state.phase!=="answers")return;
    const left=Math.max(0,state.questionDuration-Math.floor((now()+(clockOffset||0)-state.questionStartedAt)/1000));
    if(left!==lastSecond){
      lastSecond=left;
      const el=$("#mobilecount");
      if(el){el.textContent=left;el.classList.remove("count-pulse");void el.offsetWidth;el.classList.add("count-pulse")}
    }
    if(left<=0){disableInputs();return}
    countdownRAF=requestAnimationFrame(loop);
  };loop();
}
function disableInputs(){document.querySelectorAll("button,input").forEach(x=>{if(x.dataset.a||x.id==="send"||x.classList.contains("sortitem"))x.disabled=true})}

// Shrinks the whole game screen (question + answers + timer) as one unit until
// it fits the visible viewport height without scrolling - works for any content length/device.
function fitViewport(){
  const vp=document.getElementById("gv");
  if(!vp)return;
  vp.style.setProperty("--fit-scale",1);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const fits=s=>{vp.style.setProperty("--fit-scale",s);return vp.scrollHeight<=vp.clientHeight+1};
    if(fits(1))return;
    let lo=0.5,hi=1;
    for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid}
    fits(lo);
  }));
}
window.addEventListener("resize",()=>fitViewport());
window.addEventListener("orientationchange",()=>fitViewport());

// V8: echtes Drag & Drop (Pointer Events, funktioniert mit Maus und Touch) für die
// "Reihenfolge"-Frage. `order` wird per Referenz mutiert, sodass der Aufrufer (renderPlayer)
// beim Absenden immer den aktuellen Stand sieht.
function setupSortDrag(container,order){
  container.innerHTML=sortListHtml(order,true);
  let dragEl=null,grabOffsetY=0;
  const itemsArr=()=>Array.from(container.children);
  function updateNumbers(){itemsArr().forEach((el,i)=>{el.dataset.i=i;const num=el.querySelector(".sort-num");if(num)num.textContent=(i+1)+"."})}
  function syncOrderFromDom(){const vals=itemsArr().map(el=>el.querySelector(".sort-label").textContent);order.length=0;order.push(...vals)}
  function down(e){
    const handle=e.target.closest(".sort-handle");if(!handle)return;
    const item=handle.closest(".sortitem");if(!item)return;
    dragEl=item;
    const rect=item.getBoundingClientRect();
    grabOffsetY=e.clientY-rect.top;
    item.classList.add("dragging");
    try{item.setPointerCapture(e.pointerId)}catch{}
    e.preventDefault();
  }
  function move(e){
    if(!dragEl)return;
    e.preventDefault();
    dragEl.style.transform="";
    const rect=dragEl.getBoundingClientRect();
    const dy=(e.clientY-grabOffsetY)-rect.top;
    dragEl.style.transform=`translateY(${dy}px)`;
    const dragMid=rect.top+dy+rect.height/2;
    const items=itemsArr();
    const idx=items.indexOf(dragEl);
    for(const el of items){
      if(el===dragEl)continue;
      const r=el.getBoundingClientRect();
      const mid=r.top+r.height/2;
      const elIdx=items.indexOf(el);
      if(elIdx<idx&&dragMid<mid){container.insertBefore(dragEl,el);updateNumbers();break}
      if(elIdx>idx&&dragMid>mid){container.insertBefore(dragEl,el.nextSibling);updateNumbers();break}
    }
  }
  function up(){
    if(dragEl){dragEl.classList.remove("dragging");dragEl.style.transform=""}
    dragEl=null;
    syncOrderFromDom();updateNumbers();
    fitViewport();
  }
  container.addEventListener("pointerdown",down);
  container.addEventListener("pointermove",move);
  container.addEventListener("pointerup",up);
  container.addEventListener("pointercancel",up);
}

function renderPlayer(){
  updateHeaderReset();
  if(state.phase==="lobby"){renderWaiting();return}
  if(state.phase==="typing"){
    const q=questions[state.q],text=String(q.q||""),n=Math.floor(text.length*Math.min(1,Math.max(0,state.typingProgress||0)));
    $("#app").innerHTML=`<div class="game-viewport" id="gv"><div class="gv-qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="gv-question question-reveal">${esc(text.slice(0,n))}<span class="typing-cursor"></span></div><div class="notice">FRAGE WIRD EINGEBLENDET …</div></div>`;
    fitViewport();
    return;
  }
  if(state.phase==="finished"){
    const p=state.players[me.id];
    $("#app").innerHTML=`<section class="panel hero"><h1>🏆 FERTIG!</h1><p>${me.icon} ${esc(me.name)}</p><p>Dein Punktestand: <b>${p?p.score:"—"}</b></p><p>Die Siegerehrung läuft auf dem Beamer – schau hin! 🎬</p></section>`;
    return;
  }
  if(state.phase==="result"){
    const p=state.players[me.id],q=questions[state.q];
    $("#app").innerHTML=`<section class="panel hero"><h1>🎞️ AUSWERTUNG</h1><p>${me.icon} ${esc(me.name)}</p><div class="reveal">${p?.roundPoints?`+${p.roundPoints} PUNKTE`:"Diese Runde keine Punkte"}<br>Gesamt: ${p?p.score:0}</div><p class="small">Richtige Antwort: ${solution(q)}</p>${q.fact?`<div class="fact">💡 ${esc(q.fact)}</div>`:""}<p>Schau auf den Beamer für das Ranking.</p></section>`;
    return;
  }
  if(state.phase!=="answers")return;
  const q=questions[state.q],saved=savedAnswer();
  const controls=answerAreaHtml(q,true);
  $("#app").innerHTML=`<div class="game-viewport" id="gv"><div class="gv-top"><span>⏱️ ZEIT</span><span class="gv-count" id="mobilecount">${state.questionDuration}</span></div><div class="gv-qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="gv-question">${esc(q.q)}</div><div class="gv-controls">${controls}</div></div>`;
  if(saved!==undefined)showSaved();
  document.querySelectorAll("[data-a]").forEach(b=>{
    if(saved===(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a)))b.classList.add("answer-picked");
    b.onclick=()=>sendAnswer(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a));
  });
  if(q.type==="sort"){
    let order=[...q.items];
    setupSortDrag($("#sortlist"),order);
    $("#send").onclick=()=>sendAnswer(order);
  }else if($("#send"))$("#send").onclick=()=>sendAnswer(q.type==="estimate"?Number($("#answer").value):$("#answer").value.trim());
  fitViewport();
  startMobileClock();
}
function showError(e){$("#app").innerHTML=`<section class="panel hero"><h1>⚠ CONNECTION ERROR</h1><p>${esc(e.message||e)}</p><button class="btn lime" onclick="location.reload()">RETRY</button></section>`;status("ERROR")}
window.addEventListener("beforeunload",()=>{});
boot();
