
const ROOM="SOMMERKINO-2026";
const ICONS=["🏓","🐍","🍿","🦫","🦈","🎬","📼","📺","🛼","🪩","🍉","🕶️"];
let questions=[], state={screen:"join",q:0,phase:"waiting",players:{},answers:{},winner:null,started:false};
let peer, conns=new Map(), me={id:null,name:"",icon:"🍿"}, host=false, timer=null;

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function boot(){questions=await fetch("questions.json").then(r=>r.json()); renderJoin();}
function setStatus(x){$("#status").textContent=x}
function renderJoin(){
 $("#app").innerHTML=`<section class="panel hero"><h1>SUMMERKINO<br>VIDEO-STORE QUIZ</h1><p>Raum</p><div class="room">${ROOM}</div><p>Wähle deinen Namen & dein 2000er-Maskottchen.</p>
 <input id="name" maxlength="18" placeholder="DEIN NAME" autofocus><div class="grid" id="icons">${ICONS.map((i,n)=>`<button class="btn ${n===2?'pink':''}" data-icon="${i}"><span class="icon">${i}</span>${i}</button>`).join("")}</div>
 <br><button class="btn lime" id="join">▶ PLAY</button><p class="small">Beamer: Host-Modus. Handy: Player-Modus.</p></section>`;
 let selected="🍿";document.querySelectorAll("[data-icon]").forEach(b=>b.onclick=()=>{selected=b.dataset.icon;document.querySelectorAll("[data-icon]").forEach(x=>x.classList.remove("pink"));b.classList.add("pink")});
 $("#join").onclick=()=>{let name=$("#name").value.trim();if(!name)return;me={id:crypto.randomUUID(),name,icon:selected}; connectPlayer();};
 const hostBtn=document.createElement("button");hostBtn.className="btn";hostBtn.textContent="BEAMER / HOST";hostBtn.onclick=startHost;$("#app .panel").append(hostBtn);
}
function startHost(){host=true;me={id:"HOST",name:"BEAMER",icon:"📽️"};connectPeer("host-"+ROOM,()=>renderHost());}
function connectPlayer(){connectPeer("player-"+me.id,()=>{const c=peer.connect("host-"+ROOM,{reliable:true});c.on("open",()=>{conns.set("host",c);send(c,{t:"join",p:me});renderWaiting()});c.on("data",handle)}); }
function connectPeer(id,onopen){peer=new Peer(id);peer.on("open",()=>{setStatus("ONLINE");onopen()});peer.on("error",e=>{setStatus("RETRY");setTimeout(()=>connectPeer(id,onopen),1500)});peer.on("connection",c=>{conns.set(c.peer,c);c.on("data",handle);c.on("close",()=>conns.delete(c.peer))})}
function send(c,d){try{c.send(d)}catch{}}
function broadcast(d){conns.forEach(c=>send(c,d))}
function handle(m){
 if(m.t==="join"&&host){state.players[m.p.id]={...m.p,score:0};renderHost();broadcast({t:"state",s:publicState()});}
 if(m.t==="answer"&&host){if(state.phase!=="question")return;state.answers[m.id]=m.a;state.players[m.id].last=m.a;renderHost();if(Object.keys(state.answers).length>=Object.keys(state.players).length)showResult();}
 if(m.t==="state"&&!host){state=m.s;renderPlayer();}
 if(m.t==="refresh"){location.reload();}
}
function publicState(){return {...state,answers:{},players:Object.fromEntries(Object.entries(state.players).map(([k,p])=>[k,{id:p.id,name:p.name,icon:p.icon,score:p.score}]))}}
function renderWaiting(){ $("#app").innerHTML=`<section class="panel hero"><h1>DU BIST DRIN!</h1><div class="room">${esc(me.icon)} ${esc(me.name)}</div><p>Warte auf den Beamer …</p><p class="small">Raum: ${ROOM}</p></section>`}
function renderHost(){
 let rows=Object.values(state.players).sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="cardrow"><span class="rank">${i+1}.</span><span>${p.icon} ${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");
 $("#app").innerHTML=`<section class="panel"><div class="small">HOST • RAUM ${ROOM} • ${Object.keys(state.players).length} PLAYERS</div><h1>🎞️ SOMMERKINO QUIZ</h1>
 <p>Frage ${state.q+1} / ${questions.length}</p>${state.phase==="waiting"?`<button class="btn lime" id="start">▶ QUIZ STARTEN</button>`:""}
 <div id="hostq">${state.phase!=="waiting"?hostQuestion():"<p>Spieler melden sich hier an:</p>"+rows}</div>
 <h2>LEADERBOARD</h2>${rows||"<p>Noch niemand da.</p>"}</section>`;
 if($("#start"))$("#start").onclick=nextQuestion;
}
function hostQuestion(){let q=questions[state.q];return `<div class="question">${esc(q.q)}</div><p>${state.phase==="question"?"Antworten werden gesammelt …":"ERGEBNIS"}</p>${state.phase==="question"&&q.time?`<div class="timer" id="hosttimer">${q.time}</div>`:""}${state.phase==="result"?resultBlock(q):""}<br>${state.phase==="result"?`<button class="btn lime" id="next">NÄCHSTE ▶</button>`:""}` }
function resultBlock(q){return `<div class="fact"><b>RICHTIGE LÖSUNG</b><br>${q.type==="mc"?esc(q.options[q.answer]):esc(String(q.answer)+" "+(q.unit||""))}</div>`}
function nextQuestion(){if(state.q>=questions.length){finish();return}state.phase="question";state.answers={};broadcast({t:"state",s:publicState()});renderHost();if(questions[state.q].time){let t=questions[state.q].time;timer=setInterval(()=>{t--;let el=$("#hosttimer");if(el)el.textContent=t;if(t<=0){clearInterval(timer);showResult()}},1000)}}
function showResult(){if(state.phase!=="question")return;state.phase="result";if(timer)clearInterval(timer);let q=questions[state.q];Object.entries(state.answers).forEach(([id,a])=>{let p=state.players[id];if(!p)return;p.score+=scoreFor(q,a)});broadcast({t:"state",s:publicState()});renderHost()}
function scoreFor(q,a){if(q.type==="mc"||q.type==="tf")return a===q.answer?100:0;if(q.type==="estimate"){return Math.max(0,100-Math.round(Math.abs(Number(a)-q.answer)/q.answer*100));}if(q.type==="emoji"||q.type==="who")return String(a).toLowerCase()===String(q.answer).toLowerCase()?100:0;if(q.type==="sort")return JSON.stringify(a)===JSON.stringify(q.answer)?100:0;return 0}
function finish(){state.phase="finished";broadcast({t:"state",s:publicState()});let rows=Object.values(state.players).sort((a,b)=>b.score-a.score);$("#app").innerHTML=`<section class="panel hero"><h1>🏆 FILM AB!</h1>${rows.map((p,i)=>`<div class="cardrow"><span class="rank">${i+1}.</span><span>${p.icon} ${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("")}<button class="btn lime" id="again">NOCHMAL</button></section>`;$("#again").onclick=()=>location.reload()}
function renderPlayer(){let q=questions[state.q];if(state.phase==="finished"){ $("#app").innerHTML=`<section class="panel hero"><h1>🏆 FERTIG!</h1><p>Dein Punktestand: <b>${me.id in state.players?state.players[me.id].score:"—"}</b></p><p>Warte auf die nächste Runde.</p></section>`;return}
 if(state.phase==="waiting"){renderWaiting();return}
 let controls=""; if(q.type==="mc")controls=`<div class="answers">${q.options.map((o,i)=>`<button class="btn choice" data-a="${i}">${String.fromCharCode(65+i)}) ${esc(o)}</button>`).join("")}</div>`;
 if(q.type==="tf")controls=`<div class="answers"><button class="btn choice" data-a="true">WAHR</button><button class="btn choice" data-a="false">FALSCH</button></div>`;
 if(q.type==="estimate")controls=`<input id="estimate" type="number" step="0.1" placeholder="${q.unit||"Wert"}"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="emoji")controls=`<input id="text" placeholder="FILMTITEL"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="who")controls=`<div class="small">${q.hints.map((h,i)=>`<p>Hinweis ${i+1}: ${esc(h)}</p>`).join("")}</div><input id="text" placeholder="WER BIN ICH?"><button class="btn lime" id="send">ABSENDEN</button>`;
 if(q.type==="sort")controls=`<div id="sortlist">${q.items.map((x,i)=>`<button class="btn choice" data-i="${i}">${i+1}. ${esc(x)}</button>`).join("")}</div><button class="btn lime" id="send">REIHENFOLGE ABSENDEN</button>`;
 $("#app").innerHTML=`<section class="panel"><div class="qnum">FRAGE ${state.q+1}/${questions.length}</div><div class="question">${esc(q.q)}</div>${q.time?`<p class="timer">${q.time}</p>`:""}${controls}</section>`;
 document.querySelectorAll(".choice[data-a]").forEach(b=>b.onclick=()=>submit(b.dataset.a==="true"?true:b.dataset.a==="false"?false:Number(b.dataset.a)));
 if(q.type==="sort"){let order=[...q.items];document.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{let i=+b.dataset.i;[order[i],order[i+1]]=[order[i+1],order[i]];b.parentElement.innerHTML=order.map((x,j)=>`<button class="btn choice" data-i="${j}">${j+1}. ${esc(x)}</button>`).join("");document.querySelectorAll("[data-i]").forEach(bb=>bb.onclick=()=>{let k=+bb.dataset.i;[order[k],order[k+1]]=[order[k+1],order[k]];renderPlayer()})});$("#send").onclick=()=>submit(order)}
 if($("#send")&&q.type!=="sort")$("#send").onclick=()=>submit(q.type==="estimate"?Number($("#estimate").value):$("#text").value.trim());
}
function submit(a){send(conns.get("host"),{t:"answer",id:me.id,a});document.querySelectorAll("button,input").forEach(x=>x.disabled=true);$("#app .panel").insertAdjacentHTML("beforeend",`<p class="fact">✓ Antwort gespeichert. Blick zum Beamer!</p>`)}
boot();
