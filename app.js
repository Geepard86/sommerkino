
const ROOM="SOMMERKINO-2026";
const HOST_KEY="2026";
const HOST_PEER="sommerkino-host-"+ROOM.toLowerCase().replace(/[^a-z0-9]/g,"-");
const ICONS=["🏓","🐍","🍿","🦫","🦈","🎬","📼","📺","🛼","🪩","🍉","🕶️"];
let questions=[],peer=null,host=false,hostConn=null,connections=new Map(),timer=null;
let state={phase:"lobby",q:0,players:{},answers:{},version:0};
let me={id:null,name:"",icon:"🍿"};

const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
host=params.get("host")===HOST_KEY;

function status(t){$("#status").textContent=t}
function send(c,m){try{if(c&&c.open)c.send(m)}catch(e){}}
function broadcast(m){connections.forEach(c=>send(c,m))}
function publicState(){return {phase:state.phase,q:state.q,players:Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,{id:p.id,name:p.name,icon:p.icon,score:p.score}]))}}
function persist(){localStorage.setItem("sommerkino-host-state",JSON.stringify(state))}
function loadPersist(){try{let x=JSON.parse(localStorage.getItem("sommerkino-host-state"));if(x&&x.players)state=x}catch{}}

async function boot(){
 questions=await fetch("questions.json").then(r=>r.json());
 host ? initHost() : renderJoin();
}

function initHost(){
 loadPersist();
 renderHost();
 connectHost();
}
function connectHost(){
 peer=new Peer(HOST_PEER);
 peer.on("open",()=>{status("HOST ONLINE");renderHost()});
 peer.on("connection",c=>{
   connections.set(c.peer,c);
   c.on("open",()=>{send(c,{t:"hello",room:ROOM,s:publicState()});});
   c.on("data",m=>hostHandle(m,c));
   c.on("close",()=>{connections.delete(c.peer);renderHost()});
 });
 peer.on("error",e=>{status("HOST ERROR");setTimeout(connectHost,2500)});
}
function hostHandle(m,c){
 if(m.t==="join"){
   let p=m.p;
   if(!p||!p.id||!p.name)return;
   state.players[p.id]={id:p.id,name:String(p.name).slice(0,18),icon:p.icon||"🍿",score:state.players[p.id]?.score||0};
   persist(); send(c,{t:"state",s:publicState()}); broadcast({t:"state",s:publicState()}); renderHost();
 }
 if(m.t==="answer"){
   if(state.phase!=="question")return;
   if(!state.players[m.id]||state.answers[m.id]!==undefined)return;
   state.answers[m.id]=m.a;
   state.players[m.id].last=m.a;
   if(Object.keys(state.answers).length>=Object.keys(state.players).length)showResult();
   persist();renderHost();
 }
 if(m.t==="ping")send(c,{t:"pong"});
}
function startQuestion(){
 state.phase="question";state.answers={};state.version++;
 persist();broadcast({t:"state",s:publicState()});renderHost();
 const q=questions[state.q];
 if(q.time){let t=q.time;timer=setInterval(()=>{t--;let el=$("#hosttimer");if(el)el.textContent=t;if(t<=0){clearInterval(timer);showResult()}},1000)}
}
function showResult(){
 if(state.phase!=="question")return;
 if(timer)clearInterval(timer);
 const q=questions[state.q];
 Object.entries(state.answers).forEach(([id,a])=>{if(state.players[id])state.players[id].score+=(scoreFor(q,a))});
 state.phase="result";state.version++;persist();
 broadcast({t:"state",s:publicState()});renderHost();
}
function scoreFor(q,a){
 if(q.type==="mc"||q.type==="tf")return a===q.answer?100:0;
 if(q.type==="estimate")return Math.max(0,100-Math.round(Math.abs(Number(a)-q.answer)/q.answer*100));
 if(q.type==="emoji"||q.type==="who")return String(a).trim().toLowerCase()===String(q.answer).trim().toLowerCase()?100:0;
 if(q.type==="sort")return JSON.stringify(a)===JSON.stringify(q.answer)?100:0;
 return 0;
}
function next(){
 if(state.phase==="result"){
   if(state.q>=questions.length-1){state.phase="finished";persist();broadcast({t:"state",s:publicState()});renderHost();return}
   state.q++;
 }
 startQuestion();
}
function resetGame(){localStorage.removeItem("sommerkino-host-state");location.reload()}

function renderHost(){
 let players=Object.values(state.players).sort((a,b)=>b.score-a.score);
 let rows=players.map((p,i)=>`<div class="row"><span class="rank">${i+1}.</span><span>${p.icon} ${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");
 let q=questions[state.q];
 let body="";
 if(state.phase==="lobby") body=`<div class="hero"><h1>🎞️ SOMMERKINO<br>HOST</h1><p>Raum</p><div class="room">${ROOM}</div><p>Spieler öffnen die normale URL und melden sich an.</p><div class="notice">Host-Link: <b>?host=${HOST_KEY}</b></div><button class="btn lime" id="start">▶ QUIZ STARTEN</button></div>`;
 else if(state.phase==="finished") body=`<div class="hero"><h1>🏆 FILM AB!</h1><p>Endstand</p>${rows}<br><button class="btn lime" id="reset">NEUES SPIEL</button></div>`;
 else body=`<div class="small">FRAGE ${state.q+1} / ${questions.length}</div><div class="progress"><i style="width:${((state.q+1)/questions.length)*100}%"></i></div>
 <div class="question">${esc(q.q)}</div>
 ${state.phase==="question"?`<div class="timer" id="hosttimer">${q.time||"∞"}</div><div class="notice">${Object.keys(state.answers).length} / ${players.length} Antworten eingegangen</div>`:`<div class="fact"><b>RICHTIGE LÖSUNG</b><br>${solution(q)}</div>`}
 <h2>LEADERBOARD</h2>${rows||"<p>Noch niemand im Raum.</p>"}
 ${state.phase==="result"?`<button class="btn lime" id="next">${state.q===questions.length-1?"ERGEBNIS":"NÄCHSTE FRAGE"} ▶</button>`:""}`;
 $("#app").innerHTML=`<section class="panel">${body}</section>`;
 if($("#start"))$("#start").onclick=startQuestion;
 if($("#next"))$("#next").onclick=next;
 if($("#reset"))$("#reset").onclick=resetGame;
}
function solution(q){
 if(q.type==="mc")return esc(q.options[q.answer]);
 if(q.type==="tf")return q.answer?"WAHR":"FALSCH";
 if(q.type==="sort")return q.answer.map(esc).join(" → ");
 return esc(String(q.answer)+(q.unit?" "+q.unit:""));
}

function renderJoin(){
 $("#app").innerHTML=`<section class="panel hero"><h1>📼 SOMMERKINO<br>QUIZ 2000</h1>
 <p>Raum</p><div class="room">${ROOM}</div><p>Wie heißt du?</p>
 <input id="name" maxlength="18" placeholder="DEIN NAME" autocomplete="nickname">
 <p>Dein Film-Maskottchen:</p><div class="grid" id="icons">${ICONS.map((i,n)=>`<button class="btn ${n===2?"pink":""}" data-icon="${i}"><span class="icon">${i}</span>${i}</button>`).join("")}</div>
 <br><button class="btn lime" id="join">▶ BEITRETEN</button><p class="small muted">Der Host startet das Quiz auf dem Beamer.</p></section>`;
 let selected="🍿";
 document.querySelectorAll("[data-icon]").forEach(b=>b.onclick=()=>{selected=b.dataset.icon;document.querySelectorAll("[data-icon]").forEach(x=>x.classList.remove("pink"));b.classList.add("pink")});
 $("#join").onclick=()=>{let name=$("#name").value.trim();if(!name)return;me={id:crypto.randomUUID(),name,icon:selected};connectPlayer()};
 $("#name").onkeydown=e=>{if(e.key==="Enter")$("#join").click()};
}
function connectPlayer(){
 status("CONNECTING");
 peer=new Peer("sommerkino-player-"+crypto.randomUUID());
 peer.on("open",()=>{
   hostConn=peer.connect(HOST_PEER,{reliable:true});
   hostConn.on("open",()=>{status("ONLINE");send(hostConn,{t:"join",p:me});renderWaiting()});
   hostConn.on("data",playerHandle);
   hostConn.on("close",()=>{status("RECONNECTING");setTimeout(connectPlayer,1800)});
 });
 peer.on("error",()=>{status("HOST NOT FOUND");setTimeout(connectPlayer,2500)});
}
function playerHandle(m){
 if(m.t==="state"){state=m.s;renderPlayer()}
 if(m.t==="hello"){state=m.s;renderPlayer()}
 if(m.t==="refresh")location.reload();
}
function renderWaiting(){
 $("#app").innerHTML=`<section class="panel hero"><h1>✓ DU BIST DRIN!</h1><div class="room">${me.icon} ${esc(me.name)}</div><p>Warte auf den Beamer …</p><div class="notice">Raum: ${ROOM}</div></section>`;
}
function submit(a){
 send(hostConn,{t:"answer",id:me.id,a});
 document.querySelectorAll("button,input").forEach(x=>x.disabled=true);
 $("#app .panel").insertAdjacentHTML("beforeend",`<p class="fact">✓ Antwort gespeichert.<br>Schau auf die Leinwand!</p>`);
}
function renderPlayer(){
 if(state.phase==="lobby"){renderWaiting();return}
 if(state.phase==="finished"){
   let mep=state.players[me.id];$("#app").innerHTML=`<section class="panel hero"><h1>🏆 FERTIG!</h1><p>${me.icon} ${esc(me.name)}</p><p>Dein Punktestand: <b>${mep?mep.score:"—"}</b></p><p>Danke fürs Mitspielen!</p></section>`;return;
 }
 const q=questions[state.q];
 let controls="";
 if(q.type==="mc")controls=`<div class="answers">${q.options.map((o,i)=>`<button class="btn choice" data-a="${i}">${String.fromCharCode(65+i)}) ${esc(o)}</button>`).join("")}</div>`;
 if(q.type==="tf")controls=`<div class="answers"><button class="btn choice" data-a="true">WAHR</button><button class="btn choice" data-a="false">FALSCH</button></div>`;
 if(q.type==="estimate")controls=`<input id="answer" type="number" step="0.1" placeholder="${q.unit||"Wert"}"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="emoji")controls=`<input id="answer" placeholder="FILMTITEL"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="who")controls=`<div>${q.hints.map((h,i)=>`<p class="small">Hinweis ${i+1}: ${esc(h)}</p>`).join("")}</div><input id="answer" placeholder="WER BIN ICH?"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="sort")controls=`<div id="sortlist">${q.items.map((x,i)=>`<button class="btn choice sortitem" data-i="${i}">${i+1}. ${esc(x)}</button>`).join("")}</div><button class="btn lime" id="send">REIHENFOLGE ABSENDEN</button>`;
 $("#app").innerHTML=`<section class="panel"><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question">${esc(q.q)}</div>${q.time?`<div class="timer">${q.time}</div>`:""}${controls}</section>`;
 document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>submit(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a)));
 if(q.type==="sort"){
   let order=[...q.items];
   function draw(){ $("#sortlist").innerHTML=order.map((x,i)=>`<button class="btn choice sortitem" data-i="${i}">${i+1}. ${esc(x)}</button>`).join("");document.querySelectorAll(".sortitem").forEach(b=>b.onclick=()=>{let i=+b.dataset.i;if(i<order.length-1){[order[i],order[i+1]]=[order[i+1],order[i]];draw()}})}
   draw();$("#send").onclick=()=>submit(order);
 } else if($("#send"))$("#send").onclick=()=>submit(q.type==="estimate"?Number($("#answer").value):$("#answer").value.trim());
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
boot();
