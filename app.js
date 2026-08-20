
const CFG=window.SOMMERKINO_CONFIG;
const {createClient}=supabase;
const sb=createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ROOM="sommerkino:"+CFG.ROOM;
const isHost=new URLSearchParams(location.search).get("host")===CFG.HOST_PASSWORD;
const ICONS=["🏓","🐍","🍿","🦫","🦈","🎬","📼","📺","🛼","🪩","🍉","🕶️"];
let audioCtx=null;
function audioInit(){if(!isHost)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}catch{}}
function tone(freq,dur=.08,delay=0,type="square",gain=.035){if(!isHost||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,audioCtx.currentTime+delay);g.gain.linearRampToValueAtTime(gain,audioCtx.currentTime+delay+.01);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+delay+dur);o.connect(g).connect(audioCtx.destination);o.start(audioCtx.currentTime+delay);o.stop(audioCtx.currentTime+delay+dur+.02)}
function soundNewQuestion(){audioInit();tone(440,.08);tone(660,.1,.09);tone(880,.16,.2,"square",.045)}
function soundAnswers(){audioInit();tone(880,.07);tone(1175,.12,.08,"square",.045)}
function soundResult(){audioInit();tone(523,.12);tone(659,.12,.12);tone(784,.16,.24);tone(1047,.28,.4,"triangle",.05)}
function soundCountdown(n){if(n<=5&&n>0){audioInit();tone(n===1?880:520,.06)}}

let questions=[],channel=null,me=null,timer=null,countdownRAF=null;
let state={phase:"lobby",q:0,players:{},answers:{},questionStartedAt:null,questionDuration:20,version:0};

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const now=()=>Date.now();
function status(x){$("#status").textContent=x}
function playerStorage(){try{return JSON.parse(localStorage.getItem("sommerkino-player-v4")||"null")}catch{return null}}
function savePlayer(){localStorage.setItem("sommerkino-player-v4",JSON.stringify(me))}
function clearAnswerState(){if(me){localStorage.removeItem("sommerkino-answer-v4")}}
function saveAnswer(a){localStorage.setItem("sommerkino-answer-v4",JSON.stringify({q:state.q,a}))}
function savedAnswer(){try{let x=JSON.parse(localStorage.getItem("sommerkino-answer-v4")||"null");return x&&x.q===state.q?x.a:undefined}catch{return undefined}}

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

function initHost(){channel.track({role:"host",name:"BEAMER"});renderHost();broadcast({type:"host_state",s:publicState()})}
function publicState(){
  return {phase:state.phase,q:state.q,questionStartedAt:state.questionStartedAt,questionDuration:state.questionDuration,typingProgress:state.typingProgress||0,
    players:Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,{id:p.id,name:p.name,icon:p.icon,score:p.score,last:p.last,roundPoints:p.roundPoints,answerTime:p.answerTime}]))};
}
function hostMessage(m){
  if(m.type==="join"){
    const p=m.p;if(!p?.id||!p?.name)return;
    const old=state.players[p.id];
    state.players[p.id]={id:p.id,name:String(p.name).slice(0,18),icon:p.icon||"🍿",score:old?.score||0,last:old?.last,roundPoints:0,answerTime:old?.answerTime};
    broadcast({type:"host_state",s:publicState()});renderHost();
  }
  if(m.type==="answer"){
    if(state.phase!=="question")return;
    if(!state.players[m.id]||state.answers[m.id])return;
    const elapsed=Math.max(0,Math.min(state.questionDuration*1000,Number(m.clientElapsedMs)||0));
    state.answers[m.id]={a:m.a,elapsed};
    state.players[m.id].last=m.a;state.players[m.id].answerTime=elapsed;
    if(Object.keys(state.players).length>0 && Object.keys(state.answers).length>=Object.keys(state.players).length)endQuestion();
    broadcast({type:"answer_ok",id:m.id});
    renderHost();
  }
  if(m.type==="reconnect"){
    if(state.players[m.p.id])broadcast({type:"host_state",s:publicState()});
    else hostMessage({type:"join",p:m.p});
  }
  if(m.type==="leave"){delete state.players[m.id];delete state.answers[m.id];broadcast({type:"host_state",s:publicState()});renderHost()}
}
function startQuestion(){
  clearAnswer();
  state.phase="typing";state.answers={};state.questionStartedAt=null;state.typingProgress=0;state.version++;
  broadcast({type:"host_state",s:publicState()});renderHost();soundNewQuestion();
  const text=String(questions[state.q].q||""), total=Math.max(700,text.length*38), started=now();
  const tick=()=>{
    if(state.phase!=="typing")return;
    const progress=Math.min(1,(now()-started)/total);
    state.typingProgress=progress;
    broadcast({type:"typing",q:state.q,progress});
    renderHost();
    if(progress>=1){showAnswers();return}
    requestAnimationFrame(tick);
  }; tick();
}
function showAnswers(){
  if(state.phase!=="typing")return;
  state.phase="answers";state.answers={};state.questionStartedAt=now();state.typingProgress=1;state.version++;
  broadcast({type:"host_state",s:publicState()});renderHost();soundAnswers();runCountdown();
}
function runHostCountdown(){
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  const loop=()=>{if(state.phase!=="question")return;const left=Math.max(0,state.questionDuration-Math.floor((now()-state.questionStartedAt)/1000));const el=$("#hostcount");if(el)el.textContent=left;if(left<=0){endQuestion();return}countdownRAF=requestAnimationFrame(loop)};loop();
}
function endQuestion(){
  if(state.phase!=="question")return;
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  const q=questions[state.q];
  const correct=[];
  Object.entries(state.answers).forEach(([id,x])=>{
    if(isCorrect(q,x.a))correct.push({id,elapsed:x.elapsed});
  });
  correct.sort((a,b)=>a.elapsed-b.elapsed);
  Object.values(state.players).forEach(p=>p.roundPoints=0);
  correct.forEach((x,i)=>{
    const points=Math.max(100,1000-Math.round(x.elapsed/1000)*45);
    state.players[x.id].roundPoints=points;
    state.players[x.id].score+=points;
  });
  state.phase="result";state.questionStartedAt=null;state.version++;
  broadcast({type:"host_state",s:publicState()});renderHost();soundResult();
}
function isCorrect(q,a){
  if(q.type==="mc"||q.type==="tf")return a===q.answer;
  if(q.type==="estimate")return false;
  if(q.type==="emoji"||q.type==="who")return String(a).trim().toLowerCase()===String(q.answer).trim().toLowerCase();
  if(q.type==="sort")return JSON.stringify(a)===JSON.stringify(q.answer);
  return false;
}
function next(){
  if(state.q>=questions.length-1){state.phase="finished";broadcast({type:"host_state",s:publicState()});renderHost();return}
  state.q++;startQuestion();
}
function hostReset(){state={phase:"lobby",q:0,players:{},answers:{},questionStartedAt:null,questionDuration:20,version:0};broadcast({type:"host_state",s:publicState()});renderHost()}
function solution(q){if(q.type==="mc")return esc(q.options[q.answer]);if(q.type==="tf")return q.answer?"WAHR":"FALSCH";if(q.type==="sort")return q.answer.map(esc).join(" → ");return esc(String(q.answer)+(q.unit?" "+q.unit:""))}
function ranking(){return Object.values(state.players).sort((a,b)=>b.score-a.score)}

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
  }else if(state.phase==="question"){
    body=`<div class="host-stage"><div class="small">FRAGE ${state.q+1} / ${questions.length}</div><div class="question">${esc(q.q)}</div>${placeholders(q)}</div>`;
  }else if(state.phase==="result"){
    const correct=players.filter(p=>p.roundPoints>0).sort((a,b)=>(a.answerTime??99999)-(b.answerTime??99999));
    const podium=correct.slice(0,3).map((p,i)=>`<div class="place ${i===0?"first":i===1?"second":"third"}"><div>${["🥇","🥈","🥉"][i]}</div><b>${p.icon} ${esc(p.name)}</b><br>+${p.roundPoints} P.</div>`).join("");
    body=`<div class="hero"><div class="small">AUSWERTUNG • FRAGE ${state.q+1}</div><div class="reveal">RICHTIGE ANTWORT<br>${solution(q)}</div><div class="podium">${podium||"<div class='place first'>Keine richtige Antwort</div>"}</div><h2>GESAMTSTAND</h2><div class="result-list">${rows(players,true)}</div><br><button class="btn lime" id="next">${state.q===questions.length-1?"ENDSTAND":"NÄCHSTE FRAGE"} ▶</button></div>`;
  }else{
    body=`<div class="hero"><h1>🏆 FILM AB!</h1>${rows(players,true)}<br><button class="btn lime" id="reset">NEUES SPIEL</button></div>`;
  }
  $("#app").innerHTML=`<section class="panel">${body}</section>`;
  if($("#start"))$("#start").onclick=()=>{state.q=0;startQuestion()};
  if($("#show"))$("#show").onclick=showAnswers;
  if($("#next"))$("#next").onclick=next;
  if($("#reset"))$("#reset").onclick=hostReset;
}
function rows(players,bars=false){
  return players.map((p,i)=>{ let html="<div class=\"row\"><span class=\"rank\">"+(i+1)+".</span><span>"+p.icon+" "+esc(p.name)+"</span><span class=\"score\">"+p.score+"</span></div>"; if(bars){ const w=Math.min(100,Math.max(3,p.score/Math.max(1,(players[0]?.score||1))*100)); html+="<div class=\"barline\"><i style=\"--w:"+w+"%\"></i></div>";} return html; }).join("")||"<p>Noch niemand da.</p>";
}
function renderJoinOrReconnect(){
  const saved=playerStorage();
  if(saved?.id&&saved?.name){me=saved;joined=true;channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});broadcast({type:"reconnect",p:me});renderWaiting()}
  else renderJoin();
}
function renderJoin(){
  let selected="🍿";
  const iconButtons=ICONS.map((i,n)=>'<button class="btn '+(n===2?"pink":"")+'" data-icon="'+i+'"><span class="icon">'+i+'</span>'+i+'</button>').join("");
  $("#app").innerHTML=`<section class="panel hero"><h1>📼 SOMMERKINO<br>QUIZ 2000</h1><p>RAUM</p><div class="room">${CFG.ROOM}</div><p>Wie heißt du?</p><input id="name" maxlength="18" placeholder="DEIN NAME"><p>Dein Film-Maskottchen:</p><div class="grid">${iconButtons}</div><br><button class="btn lime" id="join">▶ BEITRETEN</button></section>`;
  document.querySelectorAll("[data-icon]").forEach(b=>b.onclick=()=>{selected=b.dataset.icon;document.querySelectorAll("[data-icon]").forEach(x=>x.classList.remove("pink"));b.classList.add("pink")});
  $("#join").onclick=async()=>{const name=$("#name").value.trim();if(!name)return;me={id:crypto.randomUUID(),name,icon:selected};savePlayer();joined=true;await channel.track({role:"player",id:me.id,name:me.name,icon:me.icon});await broadcast({type:"join",p:me});renderWaiting()};
}
function renderWaiting(){
  $("#app").innerHTML=`<section class="panel hero"><h1>✓ DU BIST DRIN!</h1><div class="room">${me.icon} ${esc(me.name)}</div><p>Warte auf den Beamer …</p><div class="notice">Deine Anmeldung bleibt auch nach einem Refresh erhalten.</div></section>`;
}
function playerMessage(m){
  if(m.type==="host_state"){state=m.s;renderPlayer()}
  if(m.type==="typing"&&m.q===state.q){state.typingProgress=m.progress;renderPlayer()}
  if(m.type==="answer_ok"&&m.id===me.id)showSaved()
}
function sendAnswer(a){
  const elapsed=Math.max(0,Math.min(state.questionDuration*1000,now()-state.questionStartedAt));
  saveAnswer(a);broadcast({type:"answer",id:me.id,a,clientElapsedMs:elapsed});showSaved();
}
function showSaved(){
  document.querySelectorAll("button,input").forEach(x=>x.disabled=true);
  if(!$("#saved-banner"))$("#app .panel").insertAdjacentHTML("afterbegin",`<div class="saved-banner" id="saved-banner">✓ ANTWORT GESPEICHERT<br>SCHAU AUF DEN BEAMER</div>`);
}
function startMobileClock(){
  if(countdownRAF)cancelAnimationFrame(countdownRAF);
  const loop=()=>{
    if(state.phase!=="question")return;
    const left=Math.max(0,state.questionDuration-Math.floor((now()-state.questionStartedAt)/1000));
    const el=$("#mobilecount");if(el)el.textContent=left;
    if(left<=0){disableInputs();return}
    countdownRAF=requestAnimationFrame(loop);
  };loop();
}
function disableInputs(){document.querySelectorAll("button,input").forEach(x=>{if(x.dataset.a||x.id==="send"||x.classList.contains("sortitem"))x.disabled=true})}
function renderPlayer(){
  if(state.phase==="lobby"){renderWaiting();return}
  if(state.phase==="question"){const q=questions[state.q];$("#app").innerHTML=`<section class="panel"><div class="player-question"><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question">${esc(q.q)}</div></div>${placeholders(q)}<div class="notice">Warte auf den Beamer …</div></section>`;return}
  if(state.phase==="typing"){const q=questions[state.q],text=String(q.q||""),n=Math.floor(text.length*Math.min(1,Math.max(0,state.typingProgress||0)));$("#app").innerHTML=`<section class="panel"><div class="player-question"><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question question-reveal">${esc(text.slice(0,n))}<span class="typing-cursor"></span></div></div><div class="notice">FRAGE WIRD EINGEBLENDET …</div></section>`;return}
  if(state.phase==="finished"){const p=state.players[me.id];$("#app").innerHTML=`<section class="panel hero"><h1>🏆 FERTIG!</h1><p>${me.icon} ${esc(me.name)}</p><p>Dein Punktestand: <b>${p?p.score:"—"}</b></p><p>Danke fürs Mitspielen!</p></section>`;return}
  if(state.phase==="result"){const p=state.players[me.id];$("#app").innerHTML=`<section class="panel hero"><h1>🎞️ AUSWERTUNG</h1><p>${me.icon} ${esc(me.name)}</p><div class="reveal">${p?.roundPoints?`+${p.roundPoints} PUNKTE`:"Diese Runde keine Punkte"}<br>Gesamt: ${p?p.score:0}</div><p>Schau auf den Beamer für das Ranking.</p></section>`;return}
  if(state.phase!=="answers")return;
  const q=questions[state.q],saved=savedAnswer();
  let controls="";
  if(q.type==="mc")controls=`<div class="answers">${q.options.map((o,i)=>"<button class=\"btn choice "+(saved===i?"answer-picked":"")+"\" data-a=\""+i+"\">"+String.fromCharCode(65+i)+") "+esc(o)+"</button>").join("")}</div>`;
  if(q.type==="tf")controls=`<div class="answers"><button class="btn choice ${saved===true?"answer-picked":""}" data-a="true">WAHR</button><button class="btn choice ${saved===false?"answer-picked":""}" data-a="false">FALSCH</button></div>`;
  if(q.type==="estimate")controls=`<input id="answer" type="number" step="0.1" placeholder="${q.unit||"Wert"}"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="emoji")controls=`<input id="answer" placeholder="FILMTITEL"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="who")controls=`<div>${q.hints.map((h,i)=>"<p class=\"small\">Hinweis "+(i+1)+": "+esc(h)+"</p>").join("")}</div><input id="answer" placeholder="WER BIN ICH?"><button class="btn lime" id="send">ABSENDEN</button>`;
  if(q.type==="sort")controls=`<div id="sortlist"></div><button class="btn lime" id="send">REIHENFOLGE ABSENDEN</button>`;
  $("#app").innerHTML=`<section class="panel"><div class="mobile-top"><span>⏱️ ZEIT</span><span class="count" id="mobilecount">20</span></div><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question">${esc(q.q)}</div>${controls}</section>`;
  if(saved!==undefined)showSaved();
  document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>sendAnswer(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a)));
  if(q.type==="sort"){
    let order=[...q.items];
    const draw=()=>{$("#sortlist").innerHTML=order.map((x,i)=>`<button class="btn choice sortitem" data-i="${i}">${i+1}. ${esc(x)}</button>`).join("");document.querySelectorAll(".sortitem").forEach(b=>b.onclick=()=>{let i=+b.dataset.i;if(i<order.length-1){[order[i],order[i+1]]=[order[i+1],order[i]];draw()}})};
    draw();$("#send").onclick=()=>sendAnswer(order);
  }else if($("#send"))$("#send").onclick=()=>sendAnswer(q.type==="estimate"?Number($("#answer").value):$("#answer").value.trim());
  startMobileClock();
}
function showError(e){$("#app").innerHTML=`<section class="panel hero"><h1>⚠ CONNECTION ERROR</h1><p>${esc(e.message||e)}</p><button class="btn lime" onclick="location.reload()">RETRY</button></section>`;status("ERROR")}
window.addEventListener("beforeunload",()=>{});
boot();
