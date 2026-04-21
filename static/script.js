
    if(heroSub&&d.name){heroSub.innerHTML=`Welcome back, ${d.name} &middot; Chinese suppliers &middot; Factory WeChats &middot; Passing goods <span onclick="logout()" style="cursor:pointer;color:#f87171;font-size:11px;border:1px solid rgba(248,113,113,.3);padding:2px 8px;border-radius:4px;margin-left:6px">Log out</span>`;_injectUI();}
async function loadGlobalStats(){
  try{
    const r=await fetch('/api/global-stats');
    if(!r.ok)return;
    const d=await r.json();
    const sEl=document.getElementById('stat-searches');
    const wEl=document.getElementById('stat-wechats');
    if(sEl)sEl.textContent=(d.total_searches||0).toLocaleString();
    if(wEl)wEl.textContent=(d.total_wechats||0).toLocaleString();
  }catch(e){}
}
async function bumpGlobalStats(wechatCount){
  try{
    await fetch('/api/global-stats/bump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({searches:1,wechats:wechatCount||0})});
    loadGlobalStats();
  }catch(e){}
}
// Inject popup animations

// ===== LOGOUT =====
function logout(){fetch('/logout',{method:'POST'}).then(()=>location.href='/');}

// ===== TOAST =====
function showToast(msg,type,dur){
  type=type||'info';dur=dur||3000;
  let t=document.getElementById('sf-toast');
  if(!t){t=document.createElement('div');t.id='sf-toast';
    t.style.cssText='position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;transition:all .3s;pointer-events:none;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
    document.body.appendChild(t);}
  const c={info:'#1e293b',success:'#064e3b',error:'#450a0a',warning:'#451a03'};
  const b={info:'rgba(255,255,255,.1)',success:'#22c55e',error:'#ef4444',warning:'#f59e0b'};
  t.style.background=c[type]||c.info;t.style.border='1px solid '+(b[type]||b.info);
  t.style.color='#e2e8f0';t.style.opacity='1';t.textContent=msg;
  clearTimeout(t._t);t._t=setTimeout(()=>t.style.opacity='0',dur);
}

// ===== COPY =====
function copyToClipboard(text,label){
  navigator.clipboard.writeText(text).then(()=>showToast('â Copied '+(label||text),'success',2000))
  .catch(()=>{const e=document.createElement('textarea');e.value=text;document.body.appendChild(e);e.select();document.execCommand('copy');document.body.removeChild(e);showToast('â Copied','success',2000);});
}

// ===== SEARCH HISTORY =====
const SF_HK='sf_search_history';
function getHistory(){try{return JSON.parse(localStorage.getItem(SF_HK)||'[]');}catch(e){return[];}}
function addToHistory(q,b,p){const h=getHistory().filter(x=>!(x.q===q&&x.b===b));h.unshift({q,b,p,ts:Date.now()});localStorage.setItem(SF_HK,JSON.stringify(h.slice(0,25)));}
function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}

// ===== DAILY COUNTER =====
function getTodayCount(){return parseInt(localStorage.getItem('sf_daily_'+new Date().toDateString())||'0');}
function bumpCount(){const k='sf_daily_'+new Date().toDateString();const n=getTodayCount()+1;localStorage.setItem(k,n);const e=document.getElementById('sf-today');if(e)e.textContent=n;return n;}

// ===== INJECT HEADER BUTTONS =====
function injectHeaderBtns(){
  document.getElementById('sf-hdr')?.remove();
  const d=document.createElement('div');d.id='sf-hdr';
  d.style.cssText='position:fixed;top:10px;right:14px;z-index:10000;display:flex;gap:8px;align-items:center';
  d.innerHTML=`
    <span style="font-size:10px;color:#475569"><span style="color:#22c55e">â</span> <span id="sf-today">${getTodayCount()}</span> today</span>
    <button onclick="toggleHistory()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#94a3b8;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer">ð History</button>
    <button onclick="logout()" style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171;padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600">Log out</button>
  `;
  document.body.appendChild(d);

  // History panel
  document.getElementById('sf-hist-panel')?.remove();
  const p=document.createElement('div');p.id='sf-hist-panel';
  p.style.cssText='position:fixed;top:44px;right:14px;z-index:9999;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px;width:310px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.6);max-height:400px;overflow-y:auto';
  p.innerHTML='<div style="font-size:11px;color:#475569;padding:4px 8px 8px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between"><span>Recent Searches</span><span onclick="localStorage.removeItem(SF_HK);renderHistory()" style="cursor:pointer;color:#ef4444">Clear all</span></div><div id="sf-hist-list"></div><div style="font-size:10px;color:#334155;padding:6px 8px 2px">Ctrl+K = focus search &nbsp;Â·&nbsp; Ctrl+L = logout</div>';
  document.body.appendChild(p);
  
  // Close on outside click
  document.addEventListener('click',e=>{
    const panel=document.getElementById('sf-hist-panel');
    const btn=document.getElementById('sf-hdr');
    if(panel&&!panel.contains(e.target)&&btn&&!btn.contains(e.target))panel.style.display='none';
  });
}

function toggleHistory(){
  const p=document.getElementById('sf-hist-panel');
  if(!p)return;
  const open=p.style.display!=='none';
  p.style.display=open?'none':'block';
  if(!open)renderHistory();
}

function renderHistory(){
  const el=document.getElementById('sf-hist-list');if(!el)return;
  const h=getHistory();
  if(!h.length){el.innerHTML='<div style="color:#475569;font-size:12px;padding:10px 8px">No searches yet</div>';return;}
  el.innerHTML=h.map((x,i)=>`<div onclick="rerunSearch(${i})" style="cursor:pointer;padding:7px 10px;border-radius:6px;font-size:12px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''"><span>ð ${x.b?x.b+' Â· ':''}${x.q} <span style="opacity:.4;font-size:10px">[${x.p||'baidu'}]</span></span><span style="opacity:.4;font-size:10px;white-space:nowrap">${timeAgo(x.ts)}</span></div>`).join('');
}

function rerunSearch(i){
  const x=getHistory()[i];if(!x)return;
  const qEl=document.querySelector('input[placeholder*="Tech Fleece"],input[placeholder*="Jordan"],input[placeholder*="keyword"]');
  const bEl=document.querySelector('input[placeholder*="Nike"],input[placeholder*="Brand"],input[placeholder*="Jordan"]');
  if(qEl){qEl.value=x.q;qEl.dispatchEvent(new Event('input'));}
  if(bEl&&x.b){bEl.value=x.b;bEl.dispatchEvent(new Event('input'));}
  document.getElementById('sf-hist-panel').style.display='none';
  showToast('Loaded: '+x.q,'info');
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();const q=document.querySelector('input[placeholder*="Tech Fleece"],input[placeholder*="Jordan"]');if(q){q.focus();q.select();}}
  if((e.ctrlKey||e.metaKey)&&e.key==='l'){e.preventDefault();if(confirm('Log out?'))logout();}
  if((e.ctrlKey||e.metaKey)&&e.key==='h'){e.preventDefault();toggleHistory();}
});

// ===== WECHAT HIGHLIGHTER =====
function highlightWeChats(root){
  if(!root)return;
  root.querySelectorAll('.snippet,.result-snippet,.description,p,.c-abstract').forEach(el=>{
    if(el.dataset.wch)return;el.dataset.wch='1';
    el.innerHTML=el.innerHTML.replace(/(å¾®ä¿¡[ï¼:]s*|wx[ï¼:]s*)([a-zA-Z0-9_-]{4,20})/gi,
      (_,pre,id)=>`${pre}<span onclick="copyToClipboard('${id}','WeChat ${id}')" style="background:rgba(34,197,94,.15);color:#22c55e;padding:1px 5px;border-radius:4px;cursor:pointer;font-weight:700" title="Click to copy">${id} ð</span>`);
  });
}
const _wchObs=new MutationObserver(()=>highlightWeChats(document.body));
_wchObs.observe(document.body,{childList:true,subtree:true});

const _popStyle = document.createElement('style');
_popStyle.textContent = `
  @keyframes popIn{from{opacity:0;transform:scale(.85) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .tab-locked{cursor:not-allowed!important;opacity:.6}
  .tab-locked:hover{background:rgba(255,68,102,.04)!important;color:#ff4466!important}
`;
document.head.appendChild(_popStyle);

// Ã¢ÂÂÃ¢ÂÂ Session stats Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const sessionStats = {suppliers:0, wechats:0, deep:0, searches:0};
function updateStats(results){
  sessionStats.searches++;
  sessionStats.suppliers += results.length;
  results.forEach(r=>{
    sessionStats.wechats += (r.wechat_ids||[]).length;
    if(r.deep_scanned) sessionStats.deep++;
  });
  const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
  const s = document.getElementById('statSuppliers');
  const w = document.getElementById('statWechats');
  const d = document.getElementById('statDeep');
  const sr = document.getElementById('statSearches');
  if(s) s.textContent = fmt(sessionStats.suppliers);
  if(w) w.textContent = fmt(sessionStats.wechats);
  if(d) d.textContent = fmt(sessionStats.deep);
  if(sr) sr.textContent = fmt(sessionStats.searches);
}

// Ã¢ÂÂÃ¢ÂÂ BACKGROUND Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
(function(){
  const cv = document.getElementById('bg');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  let W, H;
  const mouse = {x:-9999, y:-9999};

  function resize(){ W=cv.width=innerWidth; H=cv.height=innerHeight; }
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; });

  const N = 65;
  const dots = [];
  function initDots(){
    dots.length = 0;
    for(let i=0;i<N;i++) dots.push({
      x: Math.random()*W, y: Math.random()*H,
      vx:(Math.random()-.5)*0.3, vy:(Math.random()-.5)*0.3,
      r: Math.random()*1.8+0.6,
      pulse: Math.random()*Math.PI*2,
    });
  }

  const ripples = [];

  function draw(){
    ctx.clearRect(0,0,W,H);

    // Subtle ambient blobs
    [[0.12,0.1,'0,200,255',0.06],[0.88,0.9,'100,50,220',0.07],[0.5,0.5,'0,200,180',0.03]]
    .forEach(([bx,by,c,a])=>{
      const g=ctx.createRadialGradient(bx*W,by*H,0,bx*W,by*H,Math.max(W,H)*0.42);
      g.addColorStop(0,`rgba(${c},${a})`); g.addColorStop(1,`rgba(${c},0)`);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    });

    dots.forEach((d,i)=>{
      d.pulse+=0.018;
      d.x+=d.vx; d.y+=d.vy;
      if(d.x<0)d.x=W; if(d.x>W)d.x=0;
      if(d.y<0)d.y=H; if(d.y>H)d.y=0;

      // Gentle mouse repel
      const mdx=mouse.x-d.x, mdy=mouse.y-d.y, md=Math.hypot(mdx,mdy);
      if(md<100){ d.vx-=mdx/md*0.008; d.vy-=mdy/md*0.008; }
      d.vx*=0.997; d.vy*=0.997;

      // Connect nearby dots
      for(let j=i+1;j<dots.length;j++){
        const b=dots[j], dist=Math.hypot(d.x-b.x,d.y-b.y);
        if(dist<110){
          ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(b.x,b.y);
          ctx.strokeStyle=`rgba(100,210,255,${(1-dist/110)*0.12})`;
          ctx.lineWidth=0.5; ctx.stroke();
        }
      }

      // Dot glow near mouse
      const glow = Math.max(0,1-md/150);
      const pr = d.r*(1+Math.sin(d.pulse)*0.25+glow);
      if(glow>0.05){
        const gr=ctx.createRadialGradient(d.x,d.y,0,d.x,d.y,pr*5);
        gr.addColorStop(0,`rgba(0,220,255,${glow*0.12})`);
        gr.addColorStop(1,`rgba(0,220,255,0)`);
        ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(d.x,d.y,pr*5,0,Math.PI*2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(d.x,d.y,pr,0,Math.PI*2);
      ctx.fillStyle=`rgba(140,220,255,${0.35+glow*0.5})`; ctx.fill();
    });



    requestAnimationFrame(draw);
  }

  resize(); initDots(); draw();
})();

"use strict";

// Ã¢ÂÂÃ¢ÂÂ Typing hero Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
(function(){
  const el=document.getElementById("heroTitle");
  if(!el) return;
  const text="Cade's SourceFinder";
  let i=0;
  el.innerHTML='<span class="cursor"></span>';
  const type=()=>{
    if(i<text.length){el.innerHTML=text.slice(0,++i)+'<span class="cursor"></span>';setTimeout(type,80+Math.random()*60)}
    else setTimeout(()=>el.querySelector(".cursor")?.remove(),1200);
  };
  setTimeout(type,300);
})();



"use strict";

// Ã¢ÂÂÃ¢ÂÂ Typing hero Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
(function(){
  const el=document.getElementById("heroTitle");
  if(!el) return;
  const text="Cade's SourceFinder";
  let i=0;
  el.innerHTML='<span class="cursor"></span>';
  const type=()=>{
    if(i<text.length){el.innerHTML=text.slice(0,++i)+'<span class="cursor"></span>';setTimeout(type,80+Math.random()*60)}
    else setTimeout(()=>el.querySelector(".cursor")?.remove(),1200);
  };
  setTimeout(type,300);
})();

// Ã¢ÂÂÃ¢ÂÂ Platform hints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const SUPPLIER_INJECT={"baidu":"Ã¥Â·Â¥Ã¥ÂÂ Ã¥ÂÂÃ¥Â®Â¶ OEM ODM manufacturer","1688":"1688 Ã¥ÂÂÃ¥Â®Â¶Ã§ÂÂ´Ã©ÂÂ Ã¦ÂÂ¹Ã¥ÂÂ","xianyu":"Ã©ÂÂ²Ã©Â±Â¼ Ã¥ÂºÂÃ¥Â­Â Ã¥Â°Â¾Ã¨Â´Â§","xiaohongshu":"Ã¥Â°ÂÃ§ÂºÂ¢Ã¤Â¹Â¦ Ã¦ÂºÂÃ¥Â¤Â´Ã¥ÂÂÃ¥Â®Â¶","taobao":"Ã¦Â·ÂÃ¥Â®Â Ã¥ÂÂÃ¥Â®Â¶Ã¥ÂºÂ","made-in-china":"made-in-china.com OEM","globalsources":"globalsources.com supplier","wechat":"Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¤Â¸ÂÃ¦ÂÂÃ¨Â´Â§Ã¦ÂºÂ"};
const FF_INJECT={"baidu":"Ã¨Â´Â§Ã¤Â»Â£ freight forwarder FOB","1688":"1688 Ã¨Â´Â§Ã¤Â»Â£","globalsources":"globalsources freight"};
const PASS_INJECT={"baidu":"passing NFCÃ¨ÂÂ¯Ã§ÂÂ Ã¨Â¿ÂÃ¨Â´Â§ Ã¨ÂÂÃ§ÂÂ° 1:1"};

// Ã¢ÂÂÃ¢ÂÂ State Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const state={
  supplier:{pageNum:1,variation:0,seenLinks:new Set(),results:[],loading:false,lastParams:null},
  ff:{pageNum:1,variation:0,seenLinks:new Set(),results:[],loading:false,lastParams:null},
  passing:{pageNum:1,variation:0,seenLinks:new Set(),results:[],loading:false,lastParams:null},
};
let savedResults=JSON.parse(localStorage.getItem("sf_saved")||"{}");
let notes=JSON.parse(localStorage.getItem("sf_notes")||"{}");
let history=JSON.parse(localStorage.getItem("sf_history")||"[]");
let likedFinds=JSON.parse(localStorage.getItem("sf_liked")||"[]");

function saveSaved(){localStorage.setItem("sf_saved",JSON.stringify(savedResults))}
function saveNotes(){localStorage.setItem("sf_notes",JSON.stringify(notes))}
function saveHistory(){localStorage.setItem("sf_history",JSON.stringify(history))}
function saveLiked(){localStorage.setItem("sf_liked",JSON.stringify(likedFinds))}

// Ã¢ÂÂÃ¢ÂÂ Tabs Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function switchTab(name){
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  const btn = document.querySelector(`[data-tab="${name}"]`);
  if(btn) btn.classList.add("active");
  const panel = document.getElementById(`tab-${name}`);
  if(panel) panel.classList.add("active");
  if(name==="finds") loadFinds();
  if(name==="saved") renderSavedTab();
  if(name==="crm") renderCrm();
  if(name==="admin") loadAdmin();
}

document.querySelectorAll(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>{
  switchTab(btn.dataset.tab);
}));

// Ã¢ÂÂÃ¢ÂÂ Chips Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function initChips(cid,hid){
  const c=document.getElementById(cid),h=document.getElementById(hid);
  if(!c||!h) return;
  c.querySelectorAll(".chip").forEach(chip=>chip.addEventListener("click",()=>{
    c.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
    chip.classList.add("active");h.value=chip.dataset.platform;
  }));
}
initChips("supplierChips","supplierPlatform");
initChips("ffChips","ffPlatform");
initChips("passingChips","passingPlatform");

// Ã¢ÂÂÃ¢ÂÂ Query hints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function updateHint(brand,query,platformEl,hintEl,injectMap){
  if(!hintEl) return;
  const q=query?.value.trim(),b=brand?.value.trim()||"";
  const plat=platformEl?.value||"baidu";
  const inj=injectMap[plat]||"";
  if(!q){hintEl.innerHTML="";return}
  if(plat==="all"){
    const searchTerm = b && q && q.toLowerCase().includes(b.toLowerCase()) ? q : [b,q].filter(Boolean).join(" ");
    hintEl.innerHTML=`<b>All-in-One:</b> Smart search across Yupoo, 1688, RedNote, Weidian + more for "<em>${searchTerm}</em>"`;
    return;
  }
  hintEl.innerHTML=`<b>Baidu query:</b> ${[b,q,inj].filter(Boolean).join(" ")}`;
}
const bI=document.getElementById("brandInput"),qI=document.getElementById("queryInput"),sP=document.getElementById("supplierPlatform"),sH=document.getElementById("supplierHint");
const ffQ=document.getElementById("ffQuery"),ffO=document.getElementById("ffOrigin"),ffP=document.getElementById("ffPlatform"),ffH=document.getElementById("ffHint");
const pB=document.getElementById("passingBrand"),pQ=document.getElementById("passingQuery"),pP=document.getElementById("passingPlatform"),pH=document.getElementById("passingHint");
[bI,qI].forEach(el=>el?.addEventListener("input",()=>updateHint(bI,qI,sP,sH,SUPPLIER_INJECT)));
document.getElementById("supplierChips")?.addEventListener("click",()=>setTimeout(()=>updateHint(bI,qI,sP,sH,SUPPLIER_INJECT),10));
[ffQ,ffO].forEach(el=>el?.addEventListener("input",()=>updateHint(ffO,ffQ,ffP,ffH,FF_INJECT)));
[pB,pQ].forEach(el=>el?.addEventListener("input",()=>updateHint(pB,pQ,pP,pH,PASS_INJECT)));

// Ã¢ÂÂÃ¢ÂÂ Status Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function setStatus(dotId,txtId,msg,s="idle"){
  const d=document.getElementById(dotId),t=document.getElementById(txtId);
  if(!d||!t) return;
  t.textContent=msg;t.className="status-txt"+(s==="error"?" error":"");
  d.className="status-dot"+(s==="active"?" active":s==="error"?" error":"");
}
function showLoader(el,msg){
  if(!el) return;
  el.innerHTML=`<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>${msg||"Searching..."}</div>`;
}

// Ã¢ÂÂÃ¢ÂÂ Toast Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function toast(msg){
  const t=document.createElement("div");t.className="copy-toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2200);
}
function copyText(text,label=""){
  navigator.clipboard.writeText(text).catch(()=>{});
  toast(label?`Copied: ${label}`:"Copied!");
}

// Ã¢ÂÂÃ¢ÂÂ WeChat chip Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function wcChip(w){
  const isQR=w.source==="qr", isOCR=w.source==="ocr";
  const cls=isQR?"wc-qr":isOCR?"wc-ocr":w.quality>=3?"wc-verified":w.quality===2?"wc-okay":"wc-weak";
  const lbl=isQR?"QR":isOCR?"OCR":w.quality>=3?"Ã¢ÂÂ":w.quality===2?"~":"?";

  const wrap = document.createElement("div");
  wrap.className = "wc-chip-wrap";

  const d = document.createElement("div");
  d.className = `contact-chip ${cls}`;
  d.title = "Click to copy";
  d.textContent = `${lbl} ${w.id}`;
  d.addEventListener("click", ()=>copyText(w.id, w.id));
  wrap.appendChild(d);

  // Verify button - clean pill style
  const vbtn = document.createElement("button");
  vbtn.className = "verify-btn";
  vbtn.textContent = "VERIFY";
  vbtn.addEventListener("click", async(e)=>{
    e.stopPropagation();
    vbtn.textContent="..."; vbtn.disabled=true;
    try{
      const r = await fetch("/verify-wechat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wechat:w.id})});
      const data = await r.json();
      const s = data.status, score = data.score||0;
      if(s==="verified"){ vbtn.textContent=`Ã¢ÂÂ ${score}pts`; vbtn.className="verify-btn verified"; }
      else if(s==="likely"){ vbtn.textContent=`~ ${score}pts`; vbtn.className="verify-btn likely"; }
      else if(s==="weak"){ vbtn.textContent=`? weak`; vbtn.className="verify-btn weak"; }
      else { vbtn.textContent="Ã¢ÂÂ none"; vbtn.className="verify-btn notfound"; }
    } catch { vbtn.textContent="err"; vbtn.disabled=false; }
  });
  wrap.appendChild(vbtn);
  return wrap;
}

// Ã¢ÂÂÃ¢ÂÂ Card builder Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function buildCard(item, index){
  const score   = item.factory_score ?? 0;
  const wechats = item.wechat_ids || [];
  const hasQR   = wechats.some(w=>w.source==="qr");
  const hasOCR  = wechats.some(w=>w.source==="ocr");
  const isSaved = !!savedResults[item.link];
  const cardNote= notes[item.link]||"";
  const confPct = Math.min(100, Math.round((score/12)*100));
  const confCol = score>=8?"var(--g)":score>=4?"var(--a)":"var(--r)";
  const platIcons= {Yupoo:"Ã°ÂÂÂ¼","All-in-One":"Ã¢ÂÂ¡",Baidu:"Ã°ÂÂÂ","1688":"Ã°ÂÂÂ­",ImportYeti:"Ã°ÂÂÂ¦",Xianyu:"Ã°ÂÂÂ·",Weidian:"Ã°ÂÂÂ¦",Xiaohongshu:"Ã°ÂÂÂ",Weibo:"Ã°ÂÂÂ¢",Zhihu:"Ã°ÂÂÂ¬"};
  const platIcon = platIcons[item.platform]||"Ã°ÂÂÂ";
  let domain=""; try{domain=new URL(item.link||"https://x").hostname.replace("www.","");}catch{}

  const card = document.createElement("article");
  card.className = "result-card"+(isSaved?" saved":"");
  card.style.animationDelay=`${index*.04}s`;
  card.dataset.score=score; card.dataset.link=item.link||"";
  card.dataset.hasWechat=(wechats.length>0)?"1":"0";
  card.dataset.hasContact=item.has_contact?"1":"0";
  card.dataset.factoryLike=item.is_factory_like?"1":"0";

  // Ã¢ÂÂÃ¢ÂÂ TOP BAR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const top = document.createElement("div");
  top.className = "card-top";
  top.innerHTML = `
    <div class="card-meta-row">
      <span class="card-plat">${platIcon} ${item.platform||"Unknown"}</span>
      <span class="card-dom">${domain}</span>
      ${hasQR?'<span class="xbadge xbadge-qr">QR</span>':""}
      ${hasOCR?'<span class="xbadge xbadge-ocr">OCR</span>':""}
      ${item.deep_scanned?'<span class="xbadge xbadge-deep">DEEP</span>':""}
      <button class="card-star ${isSaved?"saved":""}" data-save="${item.link}" title="Save">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="${isSaved?"currentColor":"none"}"><path d="M8 1l2 4.5 5 .5-3.5 3.5 1 5L8 12l-4.5 2.5 1-5L1 6l5-.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <a class="card-title" href="${item.link||"#"}" target="_blank">${(item.title||"Untitled").slice(0,90)}${(item.title||"").length>90?"Ã¢ÂÂ¦":""}</a>
  `;
  card.appendChild(top);

  // Ã¢ÂÂÃ¢ÂÂ BODY Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const body = document.createElement("div");
  body.className = "card-body";

  // Snippet
  const snippetFull = item.snippet||"No description.";
  const snippetShort = snippetFull.slice(0,200);
  const hasMore = snippetFull.length>200;
  const left = document.createElement("div");
  left.className = "card-left";
  left.innerHTML = `<p class="card-snip">${snippetShort}${hasMore?`<button class="more-btn" onclick="this.parentElement.innerHTML=decodeURIComponent('${encodeURIComponent(snippetFull)}')">more Ã¢ÂÂ</button>`:""}</p>`;
  body.appendChild(left);

  // Right stats
  const right = document.createElement("div");
  right.className = "card-right";
  right.innerHTML = `
    <div class="card-stat-block">
      <div class="card-stat-label">CONFIDENCE</div>
      <div class="card-stat-bar"><div style="width:${confPct}%;height:100%;background:${confCol};border-radius:3px;transition:width .5s"></div></div>
      <div class="card-stat-val" style="color:${confCol}">${score>=8?"HIGH":score>=4?"MED":"LOW"} ${score}/12</div>
    </div>
    <div class="card-stat-block">
      <div class="card-stat-label">WECHATS</div>
      <div class="card-stat-num" style="color:${wechats.length?"var(--g)":"var(--text3)"}">${wechats.length}</div>
    </div>
  `;
  body.appendChild(right);
  card.appendChild(body);

  // Ã¢ÂÂÃ¢ÂÂ CONTACTS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const allContacts = [...wechats.slice(0,6), ...(item.phones||[]).slice(0,2)];
  if(allContacts.length){
    const cs = document.createElement("div");
    cs.className = "card-contacts-wrap";
    const chips = document.createElement("div");
    chips.className = "card-contacts";
    wechats.slice(0,6).forEach(w=>chips.appendChild(wcChip(w)));
    (item.phones||[]).slice(0,2).forEach(p=>{
      const el=document.createElement("div");
      el.className="contact-chip contact-phone";
      el.textContent=`Ã°ÂÂÂ ${p}`; el.title="Copy";
      el.onclick=()=>copyText(p,p);
      chips.appendChild(el);
    });
    cs.appendChild(chips);
    card.appendChild(cs);
  }

  // Ã¢ÂÂÃ¢ÂÂ ACTIONS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const acts = document.createElement("div");
  acts.className = "card-acts";

  // Translate Ã¢ÂÂ calls backend
  const trBtn = document.createElement("button");
  trBtn.className = "act-btn act-translate";
  trBtn.textContent = "Ã°ÂÂÂ EN";
  trBtn.title = "Translate to English";
  trBtn.onclick = async()=>{
    trBtn.textContent="..."; trBtn.disabled=true;
    try{
      const text = [item.title||"", item.snippet||""].filter(Boolean).join(" || ");
      const r = await fetch("/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,target:"en"})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      const d = await r.json();
      if(d.translated){
        const parts = d.translated.split(" || ");
        const titleEl = card.querySelector(".card-title");
        const snipEl  = card.querySelector(".card-snip");
        if(titleEl && parts[0]) titleEl.textContent = parts[0].slice(0,90);
        if(snipEl  && parts[1]) snipEl.textContent  = parts[1];
        trBtn.textContent="Ã¢ÂÂ EN"; trBtn.style.color="var(--g)";
      } else { throw new Error("no translation"); }
    } catch(e){ trBtn.textContent="Ã°ÂÂÂ EN"; trBtn.disabled=false; showToast("Translation failed Ã¢ÂÂ check connection"); }
  };
  acts.appendChild(trBtn);

  // Copy WeChats
  if(wechats.length>0){
    const cpBtn = document.createElement("button");
    cpBtn.className="act-btn act-copy";
    cpBtn.textContent=`Ã°ÂÂÂ ${wechats.length} wx`;
    cpBtn.title="Copy all WeChat IDs";
    cpBtn.onclick=()=>{
      const ids=wechats.map(w=>w.id).join(", ");
      navigator.clipboard.writeText(ids).then(()=>showToast(`Ã¢ÂÂ Copied ${wechats.length} WeChats`));
    };
    acts.appendChild(cpBtn);
  }

  // + CRM
  const crmBtn = document.createElement("button");
  crmBtn.className="act-btn act-crm";
  crmBtn.textContent="+ CRM";
  crmBtn.onclick=()=>addToCrm(item);
  acts.appendChild(crmBtn);

  // Post Find
  const findBtn = document.createElement("button");
  findBtn.className="act-btn act-find";
  findBtn.textContent="Ã¢ÂÂ Find";
  findBtn.onclick=()=>addToFinds(item);
  acts.appendChild(findBtn);

  // Flag
  const flagBtn = document.createElement("button");
  const flagged = localStorage.getItem("flag_"+item.link);
  flagBtn.className="act-btn act-flag"+(flagged==="factory"?" act-flag-good":flagged==="middleman"?" act-flag-bad":"");
  flagBtn.textContent=flagged==="factory"?"Ã¢ÂÂ Factory":flagged==="middleman"?"Ã¢ÂÂ  Middleman":"Ã°ÂÂÂ­ Flag";
  flagBtn.title="Flag as factory or middleman";
  flagBtn.onclick=()=>{
    const cur=localStorage.getItem("flag_"+item.link);
    const next=cur==="middleman"?"factory":cur==="factory"?null:"middleman";
    if(next) localStorage.setItem("flag_"+item.link,next);
    else localStorage.removeItem("flag_"+item.link);
    flagBtn.className="act-btn act-flag"+(next==="factory"?" act-flag-good":next==="middleman"?" act-flag-bad":"");
    flagBtn.textContent=next==="factory"?"Ã¢ÂÂ Factory":next==="middleman"?"Ã¢ÂÂ  Middleman":"Ã°ÂÂÂ­ Flag";
    showToast(next?`Flagged: ${next}`:"Flag cleared");
  };
  acts.appendChild(flagBtn);

  // Deep Scan
  if(!item.deep_scanned){
    const scanBtn=document.createElement("button");
    scanBtn.className="act-btn act-scan";
    scanBtn.textContent="Ã°ÂÂÂ Scan";
    scanBtn.title="Deep scan page for more WeChats";
    scanBtn.onclick=async()=>{
      scanBtn.disabled=true; scanBtn.textContent="ScanningÃ¢ÂÂ¦";
      try{
        const r=await fetch("/scan-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.link})});
        const data=await r.json();
        const newWc=data.wechat_ids||[];
        const existing=new Set(wechats.map(w=>w.id));
        let added=0;
        newWc.filter(w=>!existing.has(w.id)).forEach(w=>{
          let chips=card.querySelector(".card-contacts");
          if(!chips){
            const cs=document.createElement("div");cs.className="card-contacts-wrap";
            chips=document.createElement("div");chips.className="card-contacts";
            cs.appendChild(chips);acts.before(cs);
          }
          chips.appendChild(wcChip(w));wechats.push(w);added++;
        });
        const numEl=card.querySelector(".card-stat-num");
        if(numEl){numEl.textContent=wechats.length;numEl.style.color=wechats.length?"var(--g)":"var(--text3)";}
        showToast(added?`+${added} WeChat${added>1?"s":""}!`:"No new WeChats");
        scanBtn.remove();
      }catch{scanBtn.disabled=false;scanBtn.textContent="Ã°ÂÂÂ Scan";}
    };
    acts.appendChild(scanBtn);
  }

  // Validate (1688/weidian)
  if(item.link&&(item.link.includes("1688")||item.link.includes("weidian")||item.link.includes("taobao"))){
    const valBtn=document.createElement("button");
    valBtn.className="act-btn act-val";
    valBtn.textContent="Ã°ÂÂÂ­ Validate";
    valBtn.onclick=()=>{
      switchTab("research");
      const ui=document.getElementById("validateUrl");
      if(ui){ui.value=item.link;setTimeout(validateFactory,200);}
    };
    acts.appendChild(valBtn);
  }

  card.appendChild(acts);

  // Ã¢ÂÂÃ¢ÂÂ NOTE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const noteEl=document.createElement("textarea");
  noteEl.className="card-note";
  noteEl.placeholder="Add noteÃ¢ÂÂ¦";
  noteEl.value=cardNote;
  noteEl.oninput=()=>{
    notes[item.link]=noteEl.value;
    saveNotes();
    clearTimeout(noteEl._t);
    noteEl._t=setTimeout(()=>saveNoteServer(item.link,noteEl.value),1500);
  };
  card.appendChild(noteEl);

  // Save star logic
  card.querySelector("[data-save]")?.addEventListener("click",()=>{
    const link=item.link;
    const nowSaved=!savedResults[link];
    if(nowSaved) savedResults[link]=item; else delete savedResults[link];
    saveSaved();
    if(nowSaved) fetch("/api/saved",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)}).catch(()=>{});
    else fetch("/api/saved",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({link})}).catch(()=>{});
    card.classList.toggle("saved",nowSaved);
    const starBtn=card.querySelector(".card-star");
    if(starBtn){starBtn.classList.toggle("saved",nowSaved);starBtn.querySelector("path")?.setAttribute("fill",nowSaved?"currentColor":"none");}
    showToast(nowSaved?"Ã¢Â­Â Saved!":"Removed");
    renderSavedTab();
  });

  return card;
}


// Ã¢ÂÂÃ¢ÂÂ SAVED TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function loadSavedFromServer(){
  try{
    const r = await fetch('/api/saved');
    if(!r.ok) return;
    const d = await r.json();
    (d.saved||[]).forEach(item=>{
      if(item.link) savedResults[item.link] = item;
    });
    saveSaved();
    renderSavedTab();
  } catch(e){}
}

function renderSavedTab(){
  const grid = document.getElementById('savedGrid');
  const empty = document.getElementById('savedEmpty');
  if(!grid) return;
  const items = Object.values(savedResults);
  if(!items.length){
    grid.innerHTML='';
    if(empty) empty.style.display='block';
    return;
  }
  if(empty) empty.style.display='none';
  grid.innerHTML='';
  items.forEach((item,i)=>{ grid.appendChild(buildCard(item,i)); });
}

function clearAllSaved(){
  if(!Object.keys(savedResults).length) return;
  Object.keys(savedResults).forEach(link=>{
    fetch('/api/saved',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({link})}).catch(()=>{});
  });
  savedResults = {};
  saveSaved();
  renderSavedTab();
  showToast('Cleared all saved results');
}

// Ã¢ÂÂÃ¢ÂÂ CRM Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
let crmData = JSON.parse(localStorage.getItem('sf_crm') || '[]');

function saveCrm(){ localStorage.setItem('sf_crm', JSON.stringify(crmData)); renderCrm(); }

function openCrmModal(entry=null){
  document.getElementById('crmName').value = entry?.name||'';
  document.getElementById('crmWechat').value = entry?.wechat||'';
  document.getElementById('crmProduct').value = entry?.product||'';
  document.getElementById('crmPrice').value = entry?.price||'';
  document.getElementById('crmStatus').value = entry?.status||'new';
  document.getElementById('crmNotes').value = entry?.notes||'';
  document.getElementById('crmMsg').textContent = '';
  document.getElementById('crmModal')._editId = entry?.id||null;
  document.getElementById('crmModal').style.display = 'flex';
}
function closeCrmModal(){ document.getElementById('crmModal').style.display = 'none'; }

function saveCrmEntry(){
  const name = document.getElementById('crmName').value.trim();
  if(!name){ document.getElementById('crmMsg').className='msg err'; document.getElementById('crmMsg').textContent='Name required.'; return; }
  const editId = document.getElementById('crmModal')._editId;
  const entry = {
    id: editId || Date.now().toString(),
    name,
    wechat: document.getElementById('crmWechat').value.trim(),
    product: document.getElementById('crmProduct').value.trim(),
    price: document.getElementById('crmPrice').value.trim(),
    status: document.getElementById('crmStatus').value,
    notes: document.getElementById('crmNotes').value.trim(),
    date: new Date().toLocaleDateString(),
    ts: Date.now(),
  };
  if(editId){ const i=crmData.findIndex(e=>e.id===editId); if(i>=0) crmData[i]=entry; }
  else crmData.unshift(entry);
  saveCrm();
  closeCrmModal();
}

function deleteCrmEntry(id, e){
  e.stopPropagation();
  if(!confirm('Delete this supplier?')) return;
  crmData = crmData.filter(e=>e.id!==id);
  saveCrm();
}

const STATUS_LABELS = {new:'Ã°ÂÂÂ New',contacted:'Ã°ÂÂÂ¨ Contacted',replied:'Ã°ÂÂÂ¬ Replied',sampling:'Ã°ÂÂÂ¦ Sampling',ordered:'Ã¢ÂÂ Ordered',passed:'Ã¢ÂÂ Passed'};

function renderCrm(){
  const rows = document.getElementById('crmRows');
  const empty = document.getElementById('crmEmpty');
  const stats = document.getElementById('crmStats');
  if(!rows) return;

  // Stats
  const counts = {new:0,contacted:0,replied:0,sampling:0,ordered:0,passed:0};
  crmData.forEach(e=>{ if(counts[e.status]!==undefined) counts[e.status]++; });
  if(stats) stats.innerHTML = [
    {l:'Total',v:crmData.length,i:1},{l:'Replied',v:counts.replied+counts.sampling,i:2},
    {l:'Ordered',v:counts.ordered,i:3},{l:'Passed',v:counts.passed,i:4},{l:'WeChats',v:crmData.filter(e=>e.wechat).length,i:5}
  ].map(s=>`<div class="crm-stat"><div class="crm-stat-val">${s.v}</div><div class="crm-stat-label">${s.l}</div></div>`).join('');

  if(!crmData.length){ rows.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  rows.innerHTML = crmData.map(e=>`
    <div class="crm-row" onclick="openCrmModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">
      <div class="crm-row-name">${e.name}</div>
      <div class="crm-row-wc" onclick="copyText(event,e.wechat||'');event.stopPropagation()" title="Click to copy">${e.wechat||'Ã¢ÂÂ'}</div>
      <div class="crm-row-product">${e.product||'Ã¢ÂÂ'}</div>
      <div class="crm-row-price">${e.price||'Ã¢ÂÂ'}</div>
      <div><span class="crm-status crm-status-${e.status}">${STATUS_LABELS[e.status]||e.status}</span></div>
      <div class="crm-row-date">${e.date}</div>
      <div class="crm-row-del" onclick="deleteCrmEntry('${e.id}',event)">Ã¢ÂÂ</div>
    </div>
  `).join('');
}

// Add to CRM from result card
function addToCrm(item){
  const existing = crmData.find(e=>e.wechat && item.wechat_ids?.some(w=>w.id===e.wechat));
  if(existing){ showToast('Already in CRM: '+existing.name); return; }
  openCrmModal({name:item.title?.slice(0,40)||'Unknown', wechat:item.wechat_ids?.[0]?.id||'', product:'', price:'', status:'new', notes:item.snippet?.slice(0,100)||''});
}

renderCrm();

// Ã¢ÂÂÃ¢ÂÂ QR GENERATOR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function genQR(){
  const id = document.getElementById('qrInput').value.trim();
  if(!id){ showToast('Enter a WeChat ID first'); return; }
  const out = document.getElementById('qrOutput');
  // Use WeChat's own QR format
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('weixin://dl/chat?'+id)}`;
  out.innerHTML = `
    <img src="${url}" class="qr-img" alt="WeChat QR for ${id}"/>
    <br><div style="margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--text2)">QR for <span style="color:var(--g)">${id}</span> Ã¢ÂÂ right-click to save</div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:4px">Screenshot this to add on mobile</div>
  `;
}
document.getElementById('qrInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') genQR(); });

// Ã¢ÂÂÃ¢ÂÂ AUTO-TRANSLATE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function translateText(text, btn){
  btn.textContent = '...';
  btn.disabled = true;
  try{
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const d = await r.json();
    const translated = d[0]?.map(s=>s[0]).join('') || text;
    const snippet = btn.closest('.result-card')?.querySelector('.card-snippet');
    if(snippet){ snippet.textContent = translated; snippet.style.color='#f0abfc'; }
    btn.textContent = 'Ã¢ÂÂ EN';
    btn.style.color = 'var(--g)';
  } catch {
    btn.textContent = 'err';
    btn.disabled = false;
  }
}

// Hook translate button into card builder Ã¢ÂÂ patch buildCard
const _origBuildCard = window.buildCard;

// Ã¢ÂÂÃ¢ÂÂ CRM BUTTON IN CARDS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// patch card actions to include CRM + translate
const _buildCardOrig = typeof buildCard !== 'undefined' ? buildCard : null;

// Ã¢ÂÂÃ¢ÂÂ ADMIN TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function initAdminTab(){
  try{
    const r = await fetch('/me');
    const me = await r.json();
    if(me.is_admin){
      const tab = document.getElementById('adminTab');
      if(tab) tab.style.display = '';
    }
  }catch{}
}
initAdminTab();

async function loadAdminData(){
  await Promise.all([loadAdminRequests(), loadAdminUsers(), loadAdminAnalytics()]);
}

async function loadAdminRequests(){
  const el = document.getElementById('adminRequests');
  if(!el) return;
  try{
    const r = await fetch('/admin/api/data');
    const d = await r.json();
    const pending = (d.requests||[]).filter(r=>r.status==='pending');
    if(!pending.length){ el.innerHTML='<div class="crm-empty">No pending requests Ã°ÂÂÂ</div>'; return; }
    el.innerHTML = pending.map(req=>`
      <div class="admin-req" id="req-${req.id}">
        <div class="admin-req-info">
          <div class="admin-req-name">${req.name}</div>
          <div class="admin-req-email">${req.email}</div>
          <div class="admin-req-meta">
            ${req.discord?`Discord: ${req.discord} ÃÂ· `:''} 
            ${req.wechat?`WeChat: ${req.wechat} ÃÂ· `:''}
            ${new Date(req.timestamp*1000).toLocaleDateString()}
          </div>
          ${req.reason?`<div class="admin-req-reason">"${req.reason}"</div>`:''}
        </div>
        <div class="admin-req-actions">
          <button class="btn-approve" onclick="adminApprove('${req.id}','${req.name}')">Ã¢ÂÂ Approve</button>
          <button class="btn-deny" onclick="adminDeny('${req.id}')">Ã¢ÂÂ Deny</button>
        </div>
      </div>
    `).join('');
  }catch(e){ el.innerHTML='<div class="crm-empty">Error loading requests</div>'; }
}



async function adminDeny(id){
  if(!confirm('Deny this request?')) return;
  await fetch(`/admin/api/deny/${id}`);
  document.getElementById(`req-${id}`)?.remove();
  showToast('Request denied');
}

async function loadAdminUsers(){
  const el = document.getElementById('adminUsers');
  if(!el) return;
  try{
    const r = await fetch('/admin/api/data');
    const d = await r.json();
    const users = (d.approved||[]);
    if(!users.length){ el.innerHTML='<div class="crm-empty">No users yet</div>'; return; }
    el.innerHTML = `
      <div class="admin-user-head">
        <span>Name / Email</span><span>Status</span><span>Role</span><span>Searches</span><span>Last Active</span><span>Actions</span>
      </div>
      ${users.map(u=>`
        <div class="admin-user-row" style="${u.revoked?'opacity:.4':''}">
          <div>
            <div style="font-weight:700;color:var(--text)">${u.name}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text2)">${u.email}</div>
          </div>
          <div>
            ${u.revoked?'<span style="color:var(--r);font-size:11px">Revoked</span>':
              u.needs_password||!u.password?'<span style="color:var(--a);font-size:11px;font-family:var(--mono)">Awaiting PW</span>':
              '<span style="color:var(--g);font-size:11px">Active</span>'}
          </div>
          <div><span class="${u.is_admin?'badge-admin':'badge-user'}">${u.is_admin?'ADMIN':'USER'}</span></div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--c)">${u.search_count||0}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text3)">${u.last_search||'never'}</div>
          <div class="admin-actions">
            ${!u.is_admin?`<button class="btn-sm btn-sm-cyan" onclick="makeAdmin('${u.email}')">Make Admin</button>`:''}
            ${u.is_admin?`<button class="btn-sm btn-sm-red" onclick="removeAdmin('${u.email}')">Remove Admin</button>`:''}
            ${!u.revoked?`<button class="btn-sm btn-sm-red" onclick="revokeUser('${u.email}')">Revoke</button>`:''}
          </div>
        </div>
      `).join('')}
    `;
  }catch(e){ el.innerHTML='<div class="crm-empty">Error loading users</div>'; }
}

async function makeAdmin(email){
  await fetch('/admin/api/set-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,is_admin:true})});
  showToast(`${email} is now admin`);
  loadAdminUsers();
}
async function removeAdmin(email){
  await fetch('/admin/api/set-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,is_admin:false})});
  showToast(`Admin removed from ${email}`);
  loadAdminUsers();
}
async function revokeUser(email){
  if(!confirm(`Revoke access for ${email}?`)) return;
  await fetch('/admin/api/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  showToast(`Access revoked for ${email}`);
  loadAdminUsers();
}

async function loadAdminAnalytics(){
  const el = document.getElementById('adminAnalytics');
  if(!el) return;
  try{
    const r = await fetch('/admin/api/analytics');
    const d = await r.json();
    if(!d.length){ el.innerHTML='<div class="crm-empty">No data yet</div>'; return; }
    el.innerHTML = `
      <div class="analytics-head"><span>Name</span><span>Email</span><span>Searches</span><span>Last Search</span><span>Last Query</span></div>
      ${d.map(u=>`
        <div class="analytics-row" style="${u.revoked?'opacity:.3':''}">
          <div style="font-weight:700">${u.name} ${u.is_admin?'<span class="badge-admin">ADMIN</span>':''}</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text2)">${u.email}</div>
          <div style="font-family:var(--mono);font-size:13px;color:var(--c);font-weight:700">${u.searches}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text3)">${u.last_search||'never'}</div>
          <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.last_query||'Ã¢ÂÂ'}</div>
        </div>
      `).join('')}
    `;
  }catch(e){ el.innerHTML='<div class="crm-empty">Error loading analytics</div>'; }
}

// Load admin data when tab is clicked
const _origTabSwitch = window.switchTab;

// Ã¢ÂÂÃ¢ÂÂ USER SESSION + ADMIN Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
let currentUser = null;

async function initUser(){
  try{
    const r = await fetch('/api/me');
    if(!r.ok){ window.location.href='/'; return; }
    const d = await r.json();
    if(!d.valid){ window.location.href='/'; return; }
    currentUser = d;

    // Show/lock admin tab
    const adminBtn = document.getElementById('adminTabBtn');
    if(adminBtn){
      adminBtn.style.display = '';
      if(!d.is_admin){
        // Lock it for non-admins
        adminBtn.classList.add('tab-locked');
        adminBtn.innerHTML = adminBtn.innerHTML.replace(/Admin/,'Ã°ÂÂÂ Admin');
        adminBtn.addEventListener('click', e=>{
          e.stopPropagation();
          e.preventDefault();
          shakeScreen();
          showNoAccessPopup();
        }, true);
      }
    }

    // Show user name
    const heroSub = document.querySelector('.hero-sub');
    if(heroSub && d.name) heroSub.innerHTML = `Welcome back, ${d.name} &middot; Chinese suppliers &middot; Factory WeChats &middot; Passing goods`;
    injectHeaderBtns();
    loadGlobalStats();
  } catch(e){ console.log('Could not load user info') }
}
initUser();
loadSavedFromServer();

function shakeScreen(){
  document.body.style.transition = 'transform .08s ease';
  let i = 0;
  const shakes = [6,-6,5,-5,4,-4,2,-2,0];
  const shake = () => {
    if(i >= shakes.length){ document.body.style.transform=''; return; }
    document.body.style.transform = `translateX(${shakes[i++]}px)`;
    setTimeout(shake, 50);
  };
  shake();
}

function showNoAccessPopup(){
  // Remove existing
  document.getElementById('noAccessPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'noAccessPopup';
  popup.style.cssText = `
    position:fixed;inset:0;z-index:500;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.75);backdrop-filter:blur(12px);
    animation:fadeIn .15s ease;
  `;
  popup.innerHTML = `
    <div style="
      background:rgba(10,14,22,.99);
      border:1px solid rgba(255,68,102,.3);
      border-radius:16px;padding:36px 40px;
      text-align:center;max-width:340px;width:90%;
      position:relative;
      animation:popIn .2s cubic-bezier(.34,1.56,.64,1);
    ">
      <div style="font-size:48px;margin-bottom:12px">Ã°ÂÂÂ</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:700;color:#ff4466;margin-bottom:8px;letter-spacing:-.3px">Admin Only</div>
      <div style="font-size:13px;color:#8892a4;line-height:1.6;margin-bottom:20px">
        You don't have permission to access the admin panel.<br>
        Contact the owner if you think this is a mistake.
      </div>
      <button onclick="document.getElementById('noAccessPopup').remove()" style="
        background:#ff4466;color:#fff;border:none;border-radius:8px;
        padding:10px 28px;font-size:13px;font-weight:700;
        font-family:'Inter',sans-serif;cursor:pointer;
        transition:all .15s;letter-spacing:.3px;
      " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Got it</button>
    </div>
  `;
  popup.addEventListener('click', e=>{ if(e.target===popup) popup.remove(); });
  document.body.appendChild(popup);
  // Auto-dismiss after 4s
  setTimeout(()=>popup?.remove(), 4000);
}

// Ã¢ÂÂÃ¢ÂÂ SET PASSWORD FLOW Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Called when login returns needs_password=true
function showSetPassword(email){
  const overlay = document.createElement('div');
  overlay.className = 'setpw-overlay';
  overlay.innerHTML = `
    <div class="setpw-card">
      <div class="setpw-title">Ã°ÂÂÂ You're Approved!</div>
      <div class="setpw-sub">Set your password to access Cade's SourceFinder.<br>You'll only need to do this once.</div>
      <label>Email</label>
      <input type="email" id="spEmail" value="${email}" readonly style="opacity:.5;cursor:not-allowed"/>
      <label>Choose Password</label>
      <input type="password" id="spPw1" placeholder="At least 6 characters" autofocus/>
      <label>Confirm Password</label>
      <input type="password" id="spPw2" placeholder="Confirm password"/>
      <div class="setpw-req">Password must be at least 6 characters.</div>
      <button class="btn-primary" id="spBtn" onclick="doSetPassword('${email}')" style="width:100%">Set Password & Login</button>
      <p class="msg" id="spMsg"></p>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('spPw1').focus();
  document.addEventListener('keydown', function spEnter(e){
    if(e.key==='Enter'){ doSetPassword(email); document.removeEventListener('keydown', spEnter); }
  });
}

async function doSetPassword(email){
  const pw1 = document.getElementById('spPw1')?.value || '';
  const pw2 = document.getElementById('spPw2')?.value || '';
  const msg = document.getElementById('spMsg');
  const btn = document.getElementById('spBtn');
  if(pw1.length < 6){ msg.className='msg err'; msg.textContent='Password must be at least 6 characters.'; return; }
  if(pw1 !== pw2){ msg.className='msg err'; msg.textContent="Passwords don't match."; return; }
  btn.disabled=true; btn.textContent='Setting password...';
  try{
    const r = await fetch('/set-password', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, password:pw1})});
    const d = await r.json();
    if(d.ok){ msg.className='msg ok'; msg.textContent='Ã¢ÂÂ Password set! Loading...'; setTimeout(()=>location.reload(), 800); }
    else{ msg.className='msg err'; msg.textContent=d.error||'Error.'; btn.disabled=false; btn.textContent='Set Password & Login'; }
  } catch{ msg.className='msg err'; msg.textContent='Network error.'; btn.disabled=false; btn.textContent='Set Password & Login'; }
}

// Patch login response to handle needs_password
const _origFetch = window.fetch;

// Ã¢ÂÂÃ¢ÂÂ ADMIN PANEL Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function loadAdmin(){
  try{
    const r = await fetch('/api/admin/data');
    if(!r.ok){ alert('Not authorized'); return; }
    const d = await r.json();
    renderAdminStats(d);
    renderPending(d.pending||[]);
    renderApproved(d.approved||[]);
    renderAnalytics(d.approved||[]);
  } catch(e){ console.error('Admin load error:', e); }
}

function renderAdminStats(d){
  const el = document.getElementById('adminStats');
  if(!el) return;
  const pending  = (d.pending||[]).length;
  const approved = (d.approved||[]).length;
  const active   = (d.approved||[]).filter(u=>!u.revoked && !u.needs_password).length;
  const admins   = (d.approved||[]).filter(u=>u.is_admin).length;
  const searches = (d.approved||[]).reduce((s,u)=>s+(u.search_count||0),0);
  el.innerHTML = [
    {l:'Pending',v:pending,i:1},{l:'Approved',v:approved,i:2},
    {l:'Active',v:active,i:3},{l:'Admins',v:admins,i:4},{l:'Searches',v:searches,i:5}
  ].map(s=>`<div class="crm-stat"><div class="crm-stat-val">${s.v}</div><div class="crm-stat-label">${s.l}</div></div>`).join('');
}

function renderPending(reqs){
  const el = document.getElementById('pendingList');
  const ct = document.getElementById('pendingCount');
  if(!el) return;
  if(ct) ct.textContent = reqs.length;
  if(!reqs.length){ el.innerHTML='<div class="admin-empty">No pending requests Ã°ÂÂÂ</div>'; return; }
  el.innerHTML = reqs.map(r=>`
    <div class="admin-req" id="req-${r.id}">
      <div>
        <div class="admin-req-name">${r.name}</div>
        <div class="admin-req-email">${r.email}</div>
      </div>
      <div>
        <div class="admin-req-contact">${r.discord||r.wechat||'Ã¢ÂÂ'}</div>
        <div class="admin-req-time">${r._time||''}</div>
      </div>
      <button class="admin-btn abtn-approve" onclick="adminApprove('${r.id}','${r.email}')">Ã¢ÂÂ Approve</button>
      <button class="admin-btn abtn-deny" onclick="adminDeny('${r.id}')">Ã¢ÂÂ Deny</button>
      <div></div>
      ${r.reason||r.why ? `<div class="admin-req-why">"${(r.reason||r.why||'').slice(0,120)}"</div>` : ''}
    </div>
  `).join('');
}

function renderApproved(users){
  const el = document.getElementById('approvedList');
  const ct = document.getElementById('approvedCount');
  if(!el) return;
  if(ct) ct.textContent = users.length;
  if(!users.length){ el.innerHTML='<div class="admin-empty">No approved users yet</div>'; return; }
  el.innerHTML = users.map(u=>`
    <div class="admin-user">
      <div>
        <div class="admin-user-name">${u.name}</div>
        <div class="admin-user-email">${u.email}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${u.is_admin ? '<span class="admin-badge badge-admin">ADMIN</span>' : ''}
        ${u.needs_password ? '<span class="admin-badge badge-setup">NEEDS PW</span>' : ''}
        ${u.revoked ? '<span class="admin-badge badge-revoked">REVOKED</span>' : (!u.needs_password ? '<span class="admin-badge badge-active">ACTIVE</span>' : '')}
      </div>
      <div class="admin-user-searches">${u.search_count||0}<div style="font-size:8px;color:var(--text3);font-family:var(--mono);letter-spacing:.5px">SEARCHES</div></div>
      <div class="admin-user-last">${u._last_login||'never'}</div>
      <button class="admin-btn abtn-admin" onclick="adminToggleAdmin('${u.email}',${!u.is_admin})" title="${u.is_admin?'Remove admin':'Grant admin'}">
        ${u.is_admin ? 'Ã¢ÂÂ Unadmin' : 'Ã¢ÂÂ Admin'}
      </button>
      ${u.revoked
        ? `<button class="admin-btn abtn-approve" onclick="adminRevoke('${u.email}',false)">Restore</button>`
        : `<button class="admin-btn abtn-revoke" onclick="adminRevoke('${u.email}',true)">Revoke</button>`
      }
    </div>
  `).join('');
}

function renderAnalytics(users){
  const el = document.getElementById('analyticsTable');
  if(!el) return;
  const active = users.filter(u=>!u.revoked).sort((a,b)=>(b.search_count||0)-(a.search_count||0));
  if(!active.length){ el.innerHTML='<div class="admin-empty">No search data yet</div>'; return; }
  el.innerHTML = `
    <div class="crm-table-head" style="grid-template-columns:2fr 1fr 1fr 2fr">
      <span>User</span><span>Searches</span><span>Last Active</span><span>Last Query</span>
    </div>
    ${active.map(u=>`
      <div class="crm-row" style="grid-template-columns:2fr 1fr 1fr 2fr">
        <div><div class="crm-row-name">${u.name}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${u.email}</div></div>
        <div class="admin-user-searches">${u.search_count||0}</div>
        <div class="admin-user-last">${u.last_search||'never'}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.last_query||'Ã¢ÂÂ'}</div>
      </div>
    `).join('')}
  `;
}

function showToast(msg, type){
  // Fallback toast if global showToast not available
  if(window._globalShowToast) return window._globalShowToast(msg, type);
  let t = document.getElementById('sf-toast');
  if(!t){ t = document.createElement('div'); t.id='sf-toast';
    t.style.cssText='position:fixed;bottom:24px;right:24px;background:#1e293b;color:#e2e8f0;padding:12px 20px;border-radius:8px;font-size:13px;z-index:9999;transition:opacity .3s;border:1px solid rgba(255,255,255,.1)';
    document.body.appendChild(t); }
  t.textContent = msg;
  t.style.opacity='1';
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.style.opacity='0', 2500);
}

async function adminApprove(reqId, email){
  try{
    showToast('Approving...');
    const r = await fetch('/api/admin/approve', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({req_id:reqId})});
    const d = await r.json();
    if(d.status==='approved'||d.status==='already_approved'){
      showToast('Ã¢ÂÂ Approved! They can now log in.');
      loadAdmin();
    } else { showToast('Error: '+(d.error||d.status||'unknown')); }
  } catch(e){ showToast('Network error'); }
}

async function adminDeny(reqId){
  const r = await fetch('/api/admin/deny', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({req_id:reqId})});
  const d = await r.json();
  showToast(d.status==='denied' ? 'Ã¢ÂÂ Request denied' : 'Error');
  loadAdmin();
}

async function adminRevoke(email, revoke){
  const r = await fetch('/api/admin/revoke', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email})});
  showToast(revoke ? `Access revoked for ${email}` : `Access restored for ${email}`);
  loadAdmin();
}

async function adminToggleAdmin(email, makeAdmin){
  const r = await fetch('/api/admin/set-admin', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, is_admin:makeAdmin})});
  const d = await r.json();
  showToast(makeAdmin ? `Ã¢ÂÂ¡ ${email} is now an admin` : `${email} admin removed`);
  loadAdmin();
}

// Load admin when tab clicked Ã¢ÂÂ use event delegation so it works after DOM ready
document.addEventListener('click', e=>{
  const btn = e.target.closest('.tab-btn');
  if(btn && btn.dataset.tab==='admin') setTimeout(loadAdmin, 100);
  if(btn && btn.dataset.tab==='crm') setTimeout(renderCrm, 100);
  if(btn && btn.dataset.tab==='saved') renderSavedTab();
});

// Handle needs_password on login Ã¢ÂÂ intercept the fetch in access.html
// The access.html already handles this but we also need it if session expires

// Ã¢ÂÂÃ¢ÂÂ RESEARCH TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Chinese Query Translator
async function translateQuery(){
  const input = document.getElementById('translateQueryInput');
  const result = document.getElementById('translateQueryResult');
  const q = input?.value.trim();
  if(!q){ showToast('Enter a product name first'); return; }
  result.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Translating...</div>';
  try{
    const r = await fetch('/translate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:q, target:'zh', source:'en'})});
    const d = await r.json();
    const zh = d.translated || q;
    const factoryTerm = zh + ' Ã¥Â·Â¥Ã¥ÂÂ';
    const wholesaleTerm = zh + ' Ã¦ÂÂ¹Ã¥ÂÂÃ¥ÂÂ';
    result.innerHTML = `
      <div class="translate-result">
        <div class="tr-row">
          <span class="tr-label">Chinese</span>
          <span class="tr-val">${zh}</span>
          <button class="tool-btn" onclick="navigator.clipboard.writeText('${zh}').then(()=>showToast('Copied!'))">Copy</button>
        </div>
        <div class="tr-row">
          <span class="tr-label">Factory Search</span>
          <span class="tr-val">${factoryTerm}</span>
          <button class="tool-btn" onclick="navigator.clipboard.writeText('${factoryTerm}').then(()=>showToast('Copied!'))">Copy</button>
        </div>
        <div class="tr-row">
          <span class="tr-label">Wholesale Search</span>
          <span class="tr-val">${wholesaleTerm}</span>
          <button class="tool-btn" onclick="navigator.clipboard.writeText('${wholesaleTerm}').then(()=>showToast('Copied!'))">Copy</button>
        </div>
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-primary" style="height:36px;font-size:11px;padding:0 12px" onclick="autoSearchChinese('${zh}')">Ã¢ÂÂ¡ Search Cade's SourceFinder with this</button>
          <button class="quick-btn" onclick="quickOpenWith('1688','${factoryTerm}')">Open on 1688</button>
          <button class="quick-btn" onclick="quickOpenWith('taobao','${zh}')">Open on Taobao</button>
        </div>
      </div>
    `;
  } catch(e){ result.innerHTML = '<p style="color:var(--r);font-family:var(--mono);font-size:11px">Translation failed</p>'; }
}

// Auto-search with Chinese query on supplier tab
function autoSearchChinese(zhQuery){
  switchTab('supplier');
  const qInput = document.getElementById('queryInput');
  if(qInput){ qInput.value = zhQuery; }
  document.getElementById('supplierForm')?.dispatchEvent(new Event('submit'));
}

// Factory Validator
async function validateFactory(){
  const url = document.getElementById('validateUrl')?.value.trim();
  const result = document.getElementById('validateResult');
  if(!url){ showToast('Enter a factory URL first'); return; }
  if(!result) return;
  result.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Scanning factory page...</div>';
  try{
    const r = await fetch('/scan-page', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url})});
    const d = await r.json();
    const wc = d.wechat_ids||[];
    const score = Math.min(100, (wc.length * 15) + (d.has_contact ? 20 : 0) + (d.factory_score||0)*3);
    const scoreCol = score>=60?'var(--g)':score>=30?'var(--a)':'var(--r)';
    const scoreLbl = score>=60?'Ã¢ÂÂ LOOKS LEGIT':score>=30?'~ UNCERTAIN':'Ã¢ÂÂ  SKETCHY';
    result.innerHTML = `
      <div class="validate-card">
        <div class="validate-score" style="color:${scoreCol}">${scoreLbl} ÃÂ· ${score}/100</div>
        <div class="validate-bar-wrap"><div class="validate-bar" style="width:${score}%;background:${scoreCol}"></div></div>
        <div class="validate-grid">
          <div class="validate-item">
            <div class="validate-item-val" style="color:${wc.length>0?'var(--g)':'var(--r)'}">${wc.length}</div>
            <div class="validate-item-lbl">WeChats Found</div>
          </div>
          <div class="validate-item">
            <div class="validate-item-val" style="color:${d.has_contact?'var(--g)':'var(--text3)'}">${d.has_contact?'YES':'NO'}</div>
            <div class="validate-item-lbl">Has Contact</div>
          </div>
          <div class="validate-item">
            <div class="validate-item-val" style="color:var(--c)">${d.factory_score||0}/12</div>
            <div class="validate-item-lbl">Factory Score</div>
          </div>
          <div class="validate-item">
            <div class="validate-item-val" style="color:${d.is_factory_like?'var(--g)':'var(--r)'}">${d.is_factory_like?'YES':'NO'}</div>
            <div class="validate-item-lbl">Factory-Like</div>
          </div>
        </div>
        ${wc.length>0?`
        <div class="validate-wechats">
          <div class="card-contact-label">WECHATS FOUND</div>
          <div class="card-contacts">${wc.map(w=>`<div class="contact-chip wc-verified" onclick="navigator.clipboard.writeText('${w.id}').then(()=>showToast('Copied!'))" title="Click to copy">Ã¢ÂÂ ${w.id}</div>`).join('')}</div>
        </div>`:''}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-primary" style="height:36px;font-size:11px;padding:0 12px" onclick="window.open('${url}','_blank')">Open Factory Page</button>
          ${wc.length>0?`<button class="tool-btn" onclick="navigator.clipboard.writeText('${wc.map(w=>w.id).join(', ')}').then(()=>showToast('Copied all WeChats!'))">Copy All WeChats</button>`:''}
        </div>
      </div>
    `;
  } catch(e){ result.innerHTML = '<p style="color:var(--r);font-family:var(--mono);font-size:11px">Validation failed Ã¢ÂÂ check the URL</p>'; }
}

// Trend Checker Ã¢ÂÂ searches Taobao + XHS for demand signals
async function checkTrend(){
  const input = document.getElementById('trendInput');
  const result = document.getElementById('trendResult');
  const q = input?.value.trim();
  if(!q){ showToast('Enter a product name'); return; }
  result.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Checking trends...</div>';
  try{
    const r = await fetch('/search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:q, brand:'', platform:'xiaohongshu', mode:'trend', deep_scan:false, wechat_only:false, max_results:6})});
    const d = await r.json();
    const results = d.results||[];
    if(!results.length){ result.innerHTML = '<div class="empty">No trend data found</div>'; return; }
    result.innerHTML = '';
    results.forEach((item,i)=>{ result.appendChild(buildCard(item,i)); });
    // Add quick action to source this product
    const actionDiv = document.createElement('div');
    actionDiv.style.cssText='margin-top:12px;padding:12px;background:var(--card);border:1px solid var(--b);border-radius:var(--rad)';
    actionDiv.innerHTML=`<span style="font-family:var(--mono);font-size:10px;color:var(--text2)">Looks promising? </span>
      <button class="btn-primary" style="height:32px;font-size:11px;padding:0 12px;margin-left:8px" onclick="switchTab('supplier');document.getElementById('queryInput').value='${q}';document.getElementById('supplierForm').dispatchEvent(new Event('submit'))">Ã¢ÂÂ¡ Find Suppliers for "${q}"</button>`;
    result.appendChild(actionDiv);
  } catch(e){ result.innerHTML = '<div class="empty">Trend check failed</div>'; }
}

// Batch Comparator
async function compareBatches(){
  const input = document.getElementById('batchInput');
  const result = document.getElementById('batchResult');
  const q = input?.value.trim();
  if(!q){ showToast('Enter a product name'); return; }
  result.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Comparing batches on Weidian...</div>';
  try{
    const r = await fetch('/search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:q+' Ã¦ÂÂ¹Ã¦Â¬Â¡ Ã¨Â´Â¨Ã©ÂÂÃ¥Â¯Â¹Ã¦Â¯Â', brand:'', platform:'weidian', mode:'supplier', deep_scan:false, wechat_only:false, max_results:8})});
    const d = await r.json();
    const results = d.results||[];
    if(!results.length){ result.innerHTML = '<div class="empty">No batches found Ã¢ÂÂ try a more specific product name</div>'; return; }
    result.innerHTML='';
    results.forEach((item,i)=>{ result.appendChild(buildCard(item,i)); });
  } catch(e){ result.innerHTML = '<div class="empty">Batch comparison failed</div>'; }
}

// Quick Open platform with query
const PLATFORM_URLS = {
  '1688': q=>`https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(q)}`,
  'taobao': q=>`https://s.taobao.com/search?q=${encodeURIComponent(q)}`,
  'weidian': q=>`https://weidian.com/search.html?keyword=${encodeURIComponent(q)}`,
  'xianyu': q=>`https://www.goofish.com/search?keyword=${encodeURIComponent(q)}`,
  'xiaohongshu': q=>`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q)}`,
  'weibo': q=>`https://s.weibo.com/weibo?q=${encodeURIComponent(q)}`,
  'zhihu': q=>`https://www.zhihu.com/search?q=${encodeURIComponent(q)}&type=content`,
  'jadeship': q=>`https://www.jadeship.com/search?q=${encodeURIComponent(q)}`,
};

function quickOpen(platform){
  const q = document.getElementById('quickInput')?.value.trim() || '';
  const urlFn = PLATFORM_URLS[platform];
  if(urlFn) window.open(urlFn(q), '_blank');
}

function quickOpenWith(platform, query){
  const urlFn = PLATFORM_URLS[platform];
  if(urlFn) window.open(urlFn(query), '_blank');
}

// Ã¢ÂÂÃ¢ÂÂ FREIGHT TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Known rep-friendly forwarders directory
const FF_DIRECTORY = [
  {
    name: "Sugargoo",
    tags: ["USA","UK","EU","REP","AGENT"],
    desc: "Popular agent for rep buyers. Good QC photos, consolidation. Use for warehousing only Ã¢ÂÂ find your own FF for shipping.",
    wechat: "",
    price: "Agent fees apply Ã¢ÂÂ use own FF for int'l shipping",
    type: "agent",
  },
  {
    name: "Pandabuy",
    tags: ["USA","UK","EU","AGENT","REP"],
    desc: "Most popular rep agent. Free warehousing, good QC. Never use their shipping rates Ã¢ÂÂ always choose cheaper line haul.",
    wechat: "",
    price: "Free storage 90 days Ã¢ÂÂ compare their shipping rates",
    type: "agent",
  },
  {
    name: "Cssbuy",
    tags: ["USA","EU","REP","AGENT"],
    desc: "Budget-friendly agent. Good for lower value items. Basic QC included.",
    wechat: "",
    price: "Lower fees than Pandabuy",
    type: "agent",
  },
  {
    name: "Private Agents (Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£)",
    tags: ["REP","PRIVATE","PUTIAN"],
    desc: "Private agents specialize in sensitive/rep goods. They use custom packaging, no-inspection channels, and private shipping lines. Found via WeChat referrals Ã¢ÂÂ use the search above with Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ to find them.",
    wechat: "",
    price: "~$3-8/kg Ã¢ÂÂ negotiate directly via WeChat",
    type: "rep",
  },
  {
    name: "How to find Private Agents",
    tags: ["GUIDE","REP","PRIVATE"],
    desc: "1) Ask your supplier Ã¢ÂÂ they often have a trusted private agent. 2) Search Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ + your route on Weibo/XHS. 3) Ask in rep Discord servers. 4) Check fashionreps wiki. Never use agents you can't verify via WeChat.",
    wechat: "",
    price: "Always negotiate before sending goods",
    type: "rep",
  },
  {
    name: "Yoybuy",
    tags: ["USA","AU","CA","AGENT"],
    desc: "Good for Australia and Canada routes. Consolidation available.",
    wechat: "",
    price: "Competitive rates for AU/CA",
    type: "agent",
  },
  {
    name: "Allchinabuy",
    tags: ["USA","UK","EU","REP","AGENT"],
    desc: "Rep-friendly agent. Good communication. Multiple shipping lines available.",
    wechat: "",
    price: "Compare rates Ã¢ÂÂ line haul usually cheapest",
    type: "agent",
  },
];

const TAG_CLASS = {
  "USA":"fft-route","UK":"fft-route","EU":"fft-route","AU":"fft-route","CA":"fft-route",
  "REP":"fft-rep","SENSITIVE":"fft-rep","PUTIAN":"fft-rep",
  "AGENT":"fft-agent","GOOD":"fft-good","FREE":"fft-good"
};

function renderFFDirectory(mode){
  const grid = document.getElementById('ffDirGrid');
  if(!grid) return;
  const filtered = mode === 'agent'
    ? FF_DIRECTORY.filter(f=>f.type==='agent')
    : mode === 'rep'
    ? FF_DIRECTORY
    : FF_DIRECTORY.filter(f=>f.type!=='rep');

  grid.innerHTML = filtered.map(f=>`
    <div class="ff-dir-card">
      <div class="ff-dir-name">${f.name}</div>
      <div class="ff-dir-tags">${f.tags.map(t=>`<span class="ff-dir-tag ${TAG_CLASS[t]||'fft-route'}">${t}</span>`).join('')}</div>
      <div class="ff-dir-desc">${f.desc}</div>
      ${f.wechat ? `<div class="ff-dir-wc" onclick="navigator.clipboard.writeText('${f.wechat}').then(()=>showToast('WeChat copied!'))">wx: ${f.wechat}</div>` : ''}
      <div class="ff-dir-price">${f.price}</div>
    </div>
  `).join('');
}

let currentFFMode = 'rep';

function setFFMode(mode, btn){
  currentFFMode = mode;
  document.querySelectorAll('.ff-mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ffMode').value = mode;

  const repBanner = document.getElementById('ffRepBanner');
  const agentBanner = document.getElementById('ffAgentBanner');
  if(repBanner) repBanner.style.display = mode==='rep' ? '' : 'none';
  if(agentBanner) agentBanner.style.display = mode==='agent' ? '' : 'none';

  const q = document.getElementById('ffQuery');
  if(q){
    if(mode==='rep') q.placeholder = 'Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ private agent Ã¢ÂÂ e.g. Putian shoes to USA, rep bags China to UKÃ¢ÂÂ¦';
    else if(mode==='agent') q.placeholder = 'consolidation, QC photos, warehousing Ã¢ÂÂ e.g. Pandabuy alternativesÃ¢ÂÂ¦';
    else q.placeholder = 'standard freight Ã¢ÂÂ e.g. electronics China to USAÃ¢ÂÂ¦';
  }

  const btn2 = document.getElementById('ffBtn');
  if(btn2) btn2.innerHTML = mode==='rep'
    ? 'Ã°ÂÂÂ Find Private Agents'
    : mode==='agent'
    ? 'Ã°ÂÂÂ¢ Find Agents'
    : 'Ã°ÂÂÂ¦ Find Forwarders';

  // Pre-fill with private agent terms for rep mode
  if(mode==='rep' && q && !q.value){
    q.value = 'Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ private agent rep goods';
  }

  renderFFDirectory(mode);
}

function setFFRoute(origin, dest){
  const q = document.getElementById('ffQuery');
  const o = document.getElementById('ffOrigin');
  if(q) q.value = `${origin} to ${dest} freight forwarder`;
  if(o) o.value = origin;
}

// Init freight tab
document.addEventListener('DOMContentLoaded', ()=>{
  renderFFDirectory('rep');
});

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ  Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ    Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ  Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ     Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ  Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ    Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ     Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ       Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ     Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ       Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ     Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ       Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Ã¢ÂÂÃ¢ÂÂ SUPPLIER INTELLIGENCE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Middleman Detection Score
function detectMiddleman(item){
  let score = 0;
  const txt = ((item.title||'') + ' ' + (item.snippet||'')).toLowerCase();
  // Bad signs Ã¢ÂÂ middleman indicators
  if(txt.includes('Ã¤Â»Â£Ã¨Â´Â­')) score += 2;
  if(txt.includes('Ã¤Â»Â£Ã§ÂÂ')) score += 1;
  if(txt.includes('Ã¥ÂÂÃ©ÂÂ')) score += 1;
  if(txt.includes('Ã©ÂÂ¶Ã¥ÂÂ®')) score += 2;
  if(txt.includes('Ã¤Â¸ÂÃ¥ÂÂ')) score += 1;
  if(txt.includes('Ã¦ÂÂ¹Ã¥ÂÂÃ¥ÂÂ')) score += 1;
  if(/price|Ã¤Â»Â·Ã¦Â Â¼.*negotiable|Ã©ÂÂ¢Ã¨Â®Â®/.test(txt)) score += 1;
  // Good signs Ã¢ÂÂ factory indicators
  if(txt.includes('Ã¥Â·Â¥Ã¥ÂÂ') || txt.includes('factory')) score -= 3;
  if(txt.includes('Ã¥ÂÂÃ¥Â®Â¶')) score -= 3;
  if(txt.includes('oem') || txt.includes('odm')) score -= 3;
  if(txt.includes('Ã¦ÂºÂÃ¥Â¤Â´')) score -= 2;
  if(txt.includes('Ã§ÂÂ´Ã©ÂÂ')) score -= 2;
  if(txt.includes('moq') || txt.includes('Ã¦ÂÂÃ¤Â½ÂÃ¨ÂµÂ·Ã¨Â®Â¢')) score -= 2;
  if(txt.includes('Ã§ÂÂÃ¤ÂºÂ§') || txt.includes('manufacture')) score -= 2;
  if(item.is_factory_like) score -= 3;
  return Math.max(0, Math.min(10, score + 5));
}

// Auto-inject middleman score into cards
const _origBuildCard2 = buildCard;

// Price Estimator Ã¢ÂÂ estimates factory price vs retail
function estimateMargin(retailPrice, currency='USD'){
  const rates = {USD:7.2, EUR:7.8, GBP:9.1, AUD:4.7, CAD:5.3};
  const rate = rates[currency] || 7.2;
  const cny = retailPrice * rate;
  const factory = cny * 0.08; // typical ~8% of retail
  const moq10 = factory * 10;
  return {
    retailCNY: Math.round(cny),
    estimatedFactory: Math.round(factory),
    moq10Cost: Math.round(moq10),
    margin: Math.round(((retailPrice - factory/rate) / retailPrice) * 100),
  };
}

// Ã¢ÂÂÃ¢ÂÂ PRICE MARGIN CALCULATOR (Research tab) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function calcMargin(){
  const retail = parseFloat(document.getElementById('marginRetail')?.value || 0);
  const currency = document.getElementById('marginCurrency')?.value || 'USD';
  const qty = parseInt(document.getElementById('marginQty')?.value || 10);
  const result = document.getElementById('marginResult');
  if(!retail || !result) return;
  const r = estimateMargin(retail, currency);
  const totalCost = r.estimatedFactory * qty;
  const totalRevenue = retail * qty;
  const profit = totalRevenue - totalCost/7.2;
  result.innerHTML = `
    <div class="margin-grid">
      <div class="margin-item"><div class="margin-val">ÃÂ¥${r.estimatedFactory}</div><div class="margin-lbl">Est. Factory Price</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--g)">${r.margin}%</div><div class="margin-lbl">Est. Margin</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--a)">ÃÂ¥${r.moq10Cost}</div><div class="margin-lbl">MOQ 10 Cost</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--c)">$${profit.toFixed(0)}</div><div class="margin-lbl">Profit at qty ${qty}</div></div>
    </div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:8px">Ã¢ÂÂ  Estimates only Ã¢ÂÂ actual factory prices vary. Use as negotiation baseline.</div>
  `;
}

// Ã¢ÂÂÃ¢ÂÂ WECHAT BULK MANAGER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
let wcContacts = JSON.parse(localStorage.getItem('sf_wc_contacts') || '[]');

function saveWCContacts(){ localStorage.setItem('sf_wc_contacts', JSON.stringify(wcContacts)); }

function addWCContact(id, source, product){
  if(wcContacts.find(c=>c.id===id)) return false;
  wcContacts.unshift({id, source, product, added:Date.now(), status:'new', notes:''});
  saveWCContacts();
  renderWCManager();
  return true;
}

function renderWCManager(){
  const list = document.getElementById('wcManagerList');
  const count = document.getElementById('wcManagerCount');
  if(!list) return;
  if(count) count.textContent = wcContacts.length;
  if(!wcContacts.length){ list.innerHTML='<div class="admin-empty">No WeChats saved yet Ã¢ÂÂ they appear here when you copy from results</div>'; return; }
  list.innerHTML = wcContacts.map((c,i)=>`
    <div class="wc-manager-row">
      <div class="wc-manager-id" onclick="navigator.clipboard.writeText('${c.id}').then(()=>showToast('Copied ${c.id}!'))">${c.id}</div>
      <div class="wc-manager-src">${c.source||'Ã¢ÂÂ'}</div>
      <div class="wc-manager-prod">${c.product||'Ã¢ÂÂ'}</div>
      <select class="wc-status-select" onchange="wcContacts[${i}].status=this.value;saveWCContacts()" style="background:rgba(0,0,0,.4);border:1px solid var(--b);border-radius:5px;color:var(--text);font-family:var(--mono);font-size:9px;padding:2px 4px">
        <option value="new" ${c.status==='new'?'selected':''}>New</option>
        <option value="added" ${c.status==='added'?'selected':''}>Added</option>
        <option value="replied" ${c.status==='replied'?'selected':''}>Replied</option>
        <option value="dead" ${c.status==='dead'?'selected':''}>Dead</option>
      </select>
      <div class="crm-row-del" onclick="wcContacts.splice(${i},1);saveWCContacts();renderWCManager()">Ã¢ÂÂ</div>
    </div>
  `).join('');
}

function exportWCList(){
  const text = wcContacts.map(c=>`${c.id} | ${c.product||''} | ${c.source||''}`).join('\n');
  navigator.clipboard.writeText(text).then(()=>showToast(`Ã¢ÂÂ Copied ${wcContacts.length} WeChats`));
}

// Auto-save WeChats when user copies one
const _origCopyText = copyText;
function copyText(text, label){
  _origCopyText(text, label);
  // If it looks like a WeChat ID, save it
  if(text && /^[a-zA-Z0-9][a-zA-Z0-9_]{4,19}$/.test(text) && !/^\d+$/.test(text.slice(0,3))){
    addWCContact(text, 'copied', '');
  }
}

// Ã¢ÂÂÃ¢ÂÂ KEYWORD BUILDER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const KEYWORD_TEMPLATES = {
  'Factory Direct': '{product} Ã¥Â·Â¥Ã¥ÂÂ Ã¥ÂÂÃ¥Â®Â¶Ã§ÂÂ´Ã©ÂÂ Ã¦ÂºÂÃ¥Â¤Â´ Ã¥Â¾Â®Ã¤Â¿Â¡Ã¥ÂÂ· Ã¨ÂÂÃ§Â³Â»Ã¦ÂÂ¹Ã¥Â¼Â',
  'Rep/1:1': '{product} Ã¥Â¤ÂÃ¥ÂÂ» 1:1 Ã©Â«ÂÃ¤Â»Â¿ Ã¨ÂÂÃ§ÂÂ° Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¨Â´Â§Ã¦ÂºÂ',
  'Wholesale': '{product} Ã¦ÂÂ¹Ã¥ÂÂ Ã¤Â»Â£Ã§ÂÂ Ã¤Â¸ÂÃ¤Â»Â¶Ã¤Â»Â£Ã¥ÂÂ Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¨ÂÂÃ§Â³Â»',
  'Xianyu Overrun': '{product} Ã¤Â½ÂÃ¥ÂÂ Ã¥Â°Â¾Ã¨Â´Â§ Ã¥Â·Â¥Ã¥ÂÂÃ¦Â¸ÂÃ¤Â»Â Ã©ÂÂ²Ã©Â±Â¼ Ã¥Â¾Â®Ã¤Â¿Â¡',
  'WeChat Only': '{product} Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¥ÂÂ Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¥Â¾Â®Ã¤Â¿Â¡Ã¥ÂÂ· wxÃ¨ÂÂÃ§Â³Â»',
  'Passing/NFC': '{product} Ã¨Â¿ÂÃ©ÂªÂ NFC 1:1 Ã©ÂÂÃ¨Â¿ÂÃ©ÂªÂ Ã©ÂÂ²Ã¤Â¼ÂªÃ¨ÂÂ¯Ã§ÂÂ Ã¨ÂÂÃ§ÂÂ°',
  'Weidian Batch': '{product} Ã¦ÂÂ¹Ã¦Â¬Â¡ weidian Ã¨Â´Â¨Ã©ÂÂÃ¥Â¯Â¹Ã¦Â¯Â Ã¥Â¾Â®Ã¤Â¿Â¡',
  'Zhihu Expert': '{product} Ã¥ÂÂªÃ¥Â®Â¶Ã¥Â·Â¥Ã¥ÂÂ Ã¨Â´Â¨Ã©ÂÂÃ¥Â¥Â½ Ã¦ÂÂ¨Ã¨ÂÂ Ã§ÂÂ¥Ã¤Â¹Â',
};

function buildKeyword(template){
  const product = document.getElementById('kwProduct')?.value.trim() || '';
  const result = document.getElementById('kwResult');
  if(!result) return;
  const kw = KEYWORD_TEMPLATES[template]?.replace('{product}', product) || '';
  result.innerHTML = `
    <div class="translate-result">
      <div class="tr-row">
        <span class="tr-label">${template}</span>
        <span class="tr-val" style="font-size:12px">${kw}</span>
        <button class="tool-btn" onclick="navigator.clipboard.writeText('${kw.replace(/'/g,"\\'")}').then(()=>showToast('Copied!'))">Copy</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn-primary" style="height:32px;font-size:11px;padding:0 12px" onclick="switchTab('supplier');document.getElementById('queryInput').value='${kw.replace(/'/g,"\\'")}';document.getElementById('supplierForm').dispatchEvent(new Event('submit'))">Ã¢ÂÂ¡ Search This</button>
      </div>
    </div>
  `;
}

// Ã¢ÂÂÃ¢ÂÂ SUPPLIER NOTES SYNC Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Auto-save notes to server
async function saveNoteToServer(link, note){
  try{
    await fetch('/api/notes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({link, note})});
  } catch{}
}

// Ã¢ÂÂÃ¢ÂÂ LIVE SEARCH SUGGESTIONS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const SEARCH_SUGGESTIONS = [
  'Jordan 4 Putian factory', 'Alo yoga leggings supplier', 'Supreme hoodie rep',
  'LV belt factory WeChat', 'Nike tech fleece manufacturer', 'Yeezy 350 batch',
  'Canada Goose jacket factory', 'Stone Island rep supplier', 'Dunk Low 1:1',
  'Gucci bag factory Putian', 'Moncler jacket rep', 'Off White sneaker factory',
  'Lululemon leggings wholesale', 'Balenciaga Triple S rep', 'Chrome Hearts rep',
];

function initSearchSuggestions(){
  const input = document.getElementById('queryInput');
  if(!input) return;
  const wrap = document.createElement('div');
  wrap.className = 'suggestion-wrap';
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:8px';
  const shown = SEARCH_SUGGESTIONS.sort(()=>Math.random()-.5).slice(0,5);
  shown.forEach(s=>{
    const btn = document.createElement('button');
    btn.className = 'suggestion-pill';
    btn.textContent = s;
    btn.addEventListener('click',()=>{
      input.value = s;
      input.focus();
    });
    wrap.appendChild(btn);
  });
  input.parentElement?.appendChild(wrap);
}

// Ã¢ÂÂÃ¢ÂÂ SEARCH HISTORY ANALYTICS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function getSearchStats(){
  const h = JSON.parse(localStorage.getItem('sf_history')||'[]');
  const terms = {};
  h.forEach(s=>{ const k=(s.brand+' '+s.query).trim(); terms[k]=(terms[k]||0)+1; });
  return Object.entries(terms).sort((a,b)=>b[1]-a[1]).slice(0,10);
}

function renderSearchStats(){
  const el = document.getElementById('searchStatsContent');
  if(!el) return;
  const stats = getSearchStats();
  if(!stats.length){ el.innerHTML='<div class="admin-empty">No search history yet</div>'; return; }
  el.innerHTML = stats.map(([term,count])=>`
    <div class="wc-manager-row" style="cursor:pointer" onclick="switchTab('supplier');document.getElementById('queryInput').value='${term}';document.getElementById('supplierForm').dispatchEvent(new Event('submit'))">
      <div class="wc-manager-id">${term}</div>
      <div class="wc-manager-src" style="color:var(--c)">${count}x</div>
      <div class="wc-manager-prod" style="color:var(--text3)">click to re-run Ã¢ÂÂ</div>
    </div>
  `).join('');
}

// Ã¢ÂÂÃ¢ÂÂ INIT ALL TOOLS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
document.addEventListener('DOMContentLoaded', ()=>{
  initSearchSuggestions();
  renderWCManager();
  renderFFDirectory('rep');

  // Tab handlers for new tools
  document.addEventListener('click', e=>{
    const btn = e.target.closest('.tab-btn');
    if(!btn) return;
    const tab = btn.dataset.tab;
    if(tab==='tools') { renderWCManager(); renderSearchStats(); }
  });
});

// Ã¢ÂÂÃ¢ÂÂ SHIPPING CALCULATOR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Express-focused rates Ã¢ÂÂ what rep buyers actually use
// All prices in USD per kg (approx from private agents)
const SHIP_RATES = {
  usa: [
    {name:'FedEx IP Express',   base:18, per:14,  days:'3-5',   risk:'high', rec:false, note:'Fastest Ã¢ÂÂ high customs scrutiny'},
    {name:'DHL Express',        base:16, per:13,  days:'3-5',   risk:'high', rec:false, note:'Fast Ã¢ÂÂ declared value matters'},
    {name:'UPS Express',        base:17, per:13,  days:'3-6',   risk:'high', rec:false, note:'Similar to DHL'},
    {name:'SF Express Intl',  base:12, per:9,   days:'5-8',   risk:'med',  rec:true,  note:'Chinese express Ã¢ÂÂ lower scrutiny than DHL/FedEx'},
    {name:'EMS (China Post)',   base:7,  per:5.5, days:'7-14',  risk:'med',  rec:true,  note:'Good balance Ã¢ÂÂ widely used for reps'},
    {name:'Private Line Haul',  base:4,  per:3.5, days:'10-18', risk:'low',  rec:false, note:'Cheapest Ã¢ÂÂ slowest Ã¢ÂÂ find via private agent'},
  ],
  uk: [
    {name:'FedEx IP Express',   base:20, per:16,  days:'3-5',   risk:'high', rec:false, note:'Fast but UK customs aggressive'},
    {name:'DHL Express',        base:18, per:15,  days:'3-5',   risk:'high', rec:false, note:'Common but high scrutiny post-Brexit'},
    {name:'SF Express Intl',  base:14, per:10,  days:'5-8',   risk:'med',  rec:true,  note:'Better odds than DHL for sensitive goods'},
    {name:'EMS',                base:8,  per:6,   days:'8-15',  risk:'med',  rec:true,  note:'Popular for rep shipments to UK'},
    {name:'Private Line Haul',  base:5,  per:4,   days:'10-18', risk:'low',  rec:false, note:'Ask your private agent'},
  ],
  eu: [
    {name:'FedEx IP Express',   base:22, per:17,  days:'3-5',   risk:'high', rec:false, note:'EU customs varies by country'},
    {name:'DHL Express',        base:20, per:16,  days:'3-6',   risk:'high', rec:false, note:'Germany/NL most thorough'},
    {name:'SF Express Intl',  base:15, per:11,  days:'5-8',   risk:'med',  rec:true,  note:'Good for Eastern EU'},
    {name:'EMS',                base:9,  per:7,   days:'8-16',  risk:'med',  rec:true,  note:'Decent option for most EU'},
    {name:'Private Line Haul',  base:5,  per:4.5, days:'12-20', risk:'low',  rec:false, note:'Ask private agent for EU routes'},
  ],
  au: [
    {name:'FedEx IP Express',   base:25, per:18,  days:'4-6',   risk:'high', rec:false, note:'AU border force strict'},
    {name:'DHL Express',        base:22, per:17,  days:'4-6',   risk:'high', rec:false, note:'High scrutiny'},
    {name:'SF Express Intl',  base:16, per:12,  days:'6-9',   risk:'med',  rec:true,  note:'Better option for AU'},
    {name:'EMS',                base:10, per:8,   days:'8-15',  risk:'med',  rec:false, note:'Moderate risk'},
    {name:'Private Line Haul',  base:6,  per:5,   days:'12-22', risk:'low',  rec:false, note:'Slowest but safest'},
  ],
  ca: [
    {name:'FedEx IP Express',   base:19, per:15,  days:'3-5',   risk:'high', rec:false, note:'CA customs unpredictable'},
    {name:'DHL Express',        base:17, per:14,  days:'3-6',   risk:'high', rec:false, note:'Common but watched'},
    {name:'SF Express Intl',  base:13, per:10,  days:'5-8',   risk:'med',  rec:true,  note:'Solid option for Canada'},
    {name:'EMS',                base:8,  per:6.5, days:'8-16',  risk:'med',  rec:true,  note:'Works well for CA'},
    {name:'Private Line Haul',  base:4,  per:3.5, days:'12-22', risk:'low',  rec:false, note:'Cheapest'},
  ],
};

function calcShipping(){
  const weight = parseFloat(document.getElementById('shipWeight')?.value || 0);
  const dest = document.getElementById('shipDest')?.value || 'usa';
  const result = document.getElementById('shipResult');
  if(!weight || !result) return;
  const methods = SHIP_RATES[dest] || SHIP_RATES.usa;
  result.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
      ${methods.map(m=>{
        const cost = (m.base + m.per * weight).toFixed(2);
        return `
          <div class="ship-row ${m.rec?'ship-row-rec':''}">
            <div class="ship-row-name">
              ${m.rec?'<span class="ship-rec-badge">Ã¢ÂÂ REC</span>':''}
              ${m.name}
            </div>
            <div class="ship-row-price">$${cost}</div>
            <div class="ship-row-time">${m.days} days</div>
            <div class="ship-row-risk risk-${m.risk}">${m.risk}</div>
            <div class="ship-row-note">${m.note}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:10px;padding:8px;background:rgba(0,0,0,.2);border-radius:6px;line-height:1.6">
      Ã¢ÂÂ REC = recommended for rep shipments ÃÂ· Prices are per kg estimates from private agents ÃÂ· Always confirm rates via WeChat before sending
    </div>
  `;
}

// Ã¢ÂÂÃ¢ÂÂ SEARCH SUGGESTIONS INIT Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Inject suggestion pills under search bar on load
setTimeout(()=>{
  const input = document.getElementById('queryInput');
  if(!input || document.querySelector('.suggestion-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className='suggestion-wrap';
  wrap.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-top:8px';
  const shown = SEARCH_SUGGESTIONS.sort(()=>Math.random()-.5).slice(0,6);
  shown.forEach(s=>{
    const btn=document.createElement('button');
    btn.className='suggestion-pill';
    btn.textContent=s;
    btn.addEventListener('click',()=>{ input.value=s; input.focus(); });
    wrap.appendChild(btn);
  });
  input.closest('.field')?.appendChild(wrap);
}, 500);

// Ã¢ÂÂÃ¢ÂÂ NOTES API Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function saveNoteServer(link, note){
  try{ await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link,note})}); }catch{}
}

// Auto-save card notes to server
document.addEventListener('input', e=>{
  if(e.target.classList.contains('card-note')){
    const card = e.target.closest('.result-card');
    const link = card?.dataset?.link;
    if(link){
      notes[link] = e.target.value;
      saveNotes();
      clearTimeout(e.target._saveTimer);
      e.target._saveTimer = setTimeout(()=>saveNoteServer(link, e.target.value), 1500);
    }
  }
});

// Ã¢ÂÂÃ¢ÂÂ QUICK SEARCH SHORTCUT Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
document.addEventListener('keydown', e=>{
  if(e.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){
    e.preventDefault();
    switchTab('supplier');
    document.getElementById('queryInput')?.focus();
  }
  if(e.key==='Escape'){
    document.getElementById('queryInput')?.blur();
    document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none');
  }
  // Alt+F = Finds, Alt+R = Research, Alt+T = Tools
  if(e.altKey && e.key==='f') switchTab('finds');
  if(e.altKey && e.key==='r') switchTab('research');
  if(e.altKey && e.key==='t') switchTab('tools');
  if(e.altKey && e.key==='c') switchTab('crm');
});

// Ã¢ÂÂÃ¢ÂÂ PRIVATE AGENT DEEP SEARCH Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function runPrivateAgentSearch(){
  const dest = document.getElementById('ffPrivateDest')?.value || 'Ã§Â¾ÂÃ¥ÂÂ½';
  const results = document.getElementById('ffPrivateResults');
  const hint = document.getElementById('ffPrivateHint');
  if(!results) return;

  // These are the actual coded terms private agents use on Chinese platforms
  const queries = [
    `Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ ${dest} Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¥ÂÂÃ§Â¨Â Ã¤Â¸ÂÃ¦ÂÂ¥Ã©ÂªÂ`,
    `Ã§Â§ÂÃ¤ÂºÂºÃ¤Â»Â£Ã§ÂÂ Ã¦ÂÂÃ¦ÂÂÃ¨Â´Â§ ${dest} Ã¤Â¸ÂÃ§ÂºÂ¿ Ã¥Â¾Â®Ã¤Â¿Â¡Ã¨ÂÂÃ§Â³Â»`,
    `Ã§ÂÂ¹Ã¨Â´Â§Ã¤Â¸ÂÃ§ÂºÂ¿ ${dest} Ã¨ÂÂÃ§ÂÂ°Ã¥ÂÂÃ¨Â´Â§ Ã¥Â¾Â®Ã¤Â¿Â¡ Ã§Â§ÂÃ¥ÂÂ`,
    `Ã¤Â»Â¿Ã§ÂÂÃ¨Â´Â§Ã¤Â»Â£ ${dest} Ã§Â§ÂÃ¤ÂºÂºÃ¨Â½Â¬Ã¨Â¿Â Ã¥ÂÂÃ¦Â¸ÂÃ¥ÂÂ³ Ã¨ÂÂÃ§Â³Â»`,
    `Ã¨ÂÂÃ§ÂÂ° Ã§Â§ÂÃ¤ÂºÂºÃ¨Â´Â§Ã¤Â»Â£ ${dest} Ã¤Â½ÂÃ¨Â°ÂÃ¥ÂÂÃ¨Â£Â Ã¥Â¾Â®Ã¤Â¿Â¡`,
    `Ã¦ÂÂÃ¦ÂÂÃ¨Â´Â§ Ã§Â§ÂÃ¤ÂºÂºÃ¤Â»Â£Ã§ÂÂ ${dest} Ã¤Â¸ÂÃ§ÂºÂ¿ Ã¥Â¾Â®Ã¤Â¿Â¡Ã¥ÂÂ·`,
  ];

  results.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Running ' + queries.length + ' private agent queries...</div>';
  if(hint){ hint.style.display='block'; hint.textContent='Searching: ' + queries.join(' | ').slice(0,120) + '...'; }

  const seen = new Set();
  const allResults = [];

  for(let i=0; i<queries.length; i++){
    try{
      const r = await fetch('/search', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          query: queries[i],
          brand: '',
          platform: 'baidu',
          mode: 'ff',
          deep_scan: false,
          wechat_only: false,
          max_results: 5
        })
      });
      const d = await r.json();
      (d.results||[]).forEach(item=>{
        if(!seen.has(item.link)){
          seen.add(item.link);
          allResults.push(item);
        }
      });
      // Update count as we go
      results.innerHTML = `<div style="padding:12px;font-family:var(--mono);font-size:11px;color:var(--text2)">Found ${allResults.length} results so far (query ${i+1}/${queries.length})...</div>`;
    } catch(e){ console.log('Query failed:', queries[i]); }
  }

  // Render all results
  results.innerHTML = '';
  if(!allResults.length){
    results.innerHTML = '<div class="empty">No private agents found Ã¢ÂÂ they use very private channels. Try asking your supplier directly or checking rep Discord servers.</div>';
    return;
  }

  // Sort by WeChat presence first
  allResults.sort((a,b)=> (b.wechat_ids?.length||0) - (a.wechat_ids?.length||0));
  allResults.forEach((item,i)=> results.appendChild(buildCard(item,i)));

  if(hint){ hint.textContent = `Found ${allResults.length} results across ${queries.length} private agent queries`; }
  showToast(`Found ${allResults.length} potential private agents`);
}

// Ã¢ÂÂÃ¢ÂÂ FORM HANDLERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Generic search runner
async function runSearch({query, brand='', platform='all', mode='supplier', deepScan=false, wcOnly=false,
  btnId, dotId, statusId, resultsId, hintId, hintText}){
  const btn = document.getElementById(btnId);
  const dot = document.getElementById(dotId);
  const status = document.getElementById(statusId);
  const results = document.getElementById(resultsId);
  const hint = document.getElementById(hintId);
  if(!query){ showToast('Enter a search query'); return; }
  if(btn){ btn.disabled=true; btn._orig=btn.innerHTML||btn.textContent; btn.textContent='SearchingÃ¢ÂÂ¦'; }
  if(dot) dot.className='status-dot active';
  if(status) status.textContent='SearchingÃ¢ÂÂ¦';
  if(results) results.innerHTML='<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>SearchingÃ¢ÂÂ¦</div>';
  if(hint && hintText){ hint.style.display='block'; hint.textContent=hintText; }

  // 3 minute timeout
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 180000);

  try{
    const r = await fetch('/search',{method:'POST',headers:{'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({query,brand,platform,mode,deep_scan:deepScan,wechat_only:wcOnly})});
    clearTimeout(timer);
    const d = await r.json();
    if(!r.ok || d.error){
      if(dot) dot.className='status-dot error';
      if(status) status.textContent='Error';
      if(results) results.innerHTML=`<div class="empty">Error: ${d.error||'Search failed'}</div>`;
      if(btn){ btn.disabled=false; if(btn._orig) btn.innerHTML=btn._orig; }
      return;
    }
    const res = d.results||[];
    if(dot) dot.className='status-dot';
    if(status) status.textContent=`${res.length} found`;
    if(results){
      results.innerHTML='';
      if(!res.length) results.innerHTML='<div class="empty">No results Ã¢ÂÂ try different keywords or disable Deep Scan</div>';
      else res.forEach((item,i)=>results.appendChild(buildCard(item,i)));
    }
    updateStats(res);
    history.unshift({query,brand,platform,mode,ts:Date.now()});
    if(history.length>50) history.length=50;
    saveHistory();
  } catch(e){
    clearTimeout(timer);
    if(dot) dot.className='status-dot error';
    if(status) status.textContent=e.name==='AbortError'?'Timed out':'Error';
    if(results) results.innerHTML=`<div class="empty">${e.name==='AbortError'?'Search timed out Ã¢ÂÂ try disabling Deep Scan':'Search failed Ã¢ÂÂ please try again'}</div>`;
  } finally {
    if(btn){ btn.disabled=false; if(btn._orig) btn.innerHTML=btn._orig; }
  }
}

// Supplier form
document.getElementById('supplierForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  const brand = document.getElementById('brandInput')?.value.trim()||'';
  const query = document.getElementById('queryInput')?.value.trim()||'';
  const platform = document.getElementById('supplierPlatform')?.value||'all';
  const deepScan = document.getElementById('supplierDeepScan')?.checked||false;
  const wcOnly = document.getElementById('supplierWcOnly')?.checked||false;
  runSearch({query,brand,platform,mode:'supplier',deepScan,wcOnly,
    btnId:'supplierBtn',dotId:'supplierDot',statusId:'supplierStatus',
    resultsId:'supplierResults',hintId:'supplierHint',
    hintText:`Searching for: ${brand} ${query}`.trim()});
});

// Freight form
document.getElementById('ffForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  const query = document.getElementById('ffQuery')?.value.trim()||'';
  const origin = document.getElementById('ffOrigin')?.value.trim()||'';
  const deepScan = document.getElementById('ffDeepScan')?.checked||false;
  const ffMode = document.getElementById('ffMode')?.value||'rep';
  const fullQuery = origin ? `${origin} ${query}` : query;
  runSearch({query:fullQuery,brand:'',platform:'baidu',mode:'ff',deepScan,wcOnly:false,
    btnId:'ffBtn',dotId:'ffDot',statusId:'ffStatus',
    resultsId:'ffResults',hintId:'ffHint',
    hintText:`${ffMode==='rep'?'Private agent search':'Standard freight search'}: ${fullQuery}`});
});

// Passing form handled by passingForm listener below

// Ã¢ÂÂÃ¢ÂÂ PASSING / NFC TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

let passingMode = 'supplier';

const PASSING_INJECT = {
  supplier: 'Ã¨Â¿ÂÃ©ÂªÂ NFCÃ¨ÂÂ¯Ã§ÂÂ Ã©ÂÂ²Ã¤Â¼Âª Ã¥ÂÂÃ¥ÂÂ Ã§ÂºÂ¯Ã¥ÂÂ Ã¥ÂÂÃ¦ÂÂÃ¨Â´Â¨ 1:1 Ã¨ÂÂÃ§ÂÂ° Ã¥Â·Â¥Ã¥ÂÂ Ã¥Â¾Â®Ã¤Â¿Â¡Ã¥ÂÂ· Ã¨ÂÂÃ§Â³Â»Ã¦ÂÂ¹Ã¥Â¼Â',
  batch:    'Ã¦ÂÂ¹Ã¦Â¬Â¡ Ã¥ÂÂªÃ¤Â¸ÂªÃ¦ÂÂ¹Ã¦Â¬Â¡ Ã¨Â´Â¨Ã©ÂÂÃ¥Â¯Â¹Ã¦Â¯Â Ã¨Â¿ÂÃ©ÂªÂ Ã©ÂÂÃ¨Â¿ÂÃ©ÂªÂ Ã¦ÂÂ¨Ã¨ÂÂÃ¦ÂÂ¹Ã¦Â¬Â¡ weidian Ã¥Â°ÂÃ§ÂºÂ¢Ã¤Â¹Â¦',
  nfc:      'NFCÃ¨ÂÂ¯Ã§ÂÂ NFCÃ©ÂÂ²Ã¤Â¼Âª Ã¦ÂÂ«Ã§Â ÂÃ©ÂªÂÃ§ÂÂ NFCÃ¨Â¿ÂÃ©ÂªÂ NFC chip Ã¥Â¾Â®Ã¤Â¿Â¡ Ã¨ÂÂÃ§Â³Â»Ã¦ÂÂ¹Ã¥Â¼Â Ã¥Â·Â¥Ã¥ÂÂ',
};

const PASSING_VERDICT_WORDS = [
  'Ã¨Â¿ÂÃ©ÂªÂ','Ã©ÂÂÃ¨Â¿ÂÃ©ÂªÂ','pass','passing','nfc','Ã§ÂºÂ¯Ã¥ÂÂ','Ã¥ÂÂÃ¥ÂÂ','Ã¥ÂÂÃ¦ÂÂÃ¨Â´Â¨',
  '1:1','Ã¥ÂÂÃ¥ÂÂ','Ã¦ÂÂ¨Ã¨ÂÂ','Ã¥Â¥Â½Ã¨Â¯Â','Ã¥ÂÂ¼Ã¥Â¾ÂÃ¤Â¹Â°','Ã¥Â®ÂÃ§Â¾Â','Ã¦Â­Â£Ã¥ÂÂÃ§ÂºÂ§'
];

function setPassingMode(mode, btn){
  passingMode = mode;
  document.querySelectorAll('#tab-passing .ff-mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('passingMode').value = mode;

  const batchSection = document.getElementById('passingBatchSection');
  if(batchSection) batchSection.style.display = mode==='batch' ? '' : 'none';

  const q = document.getElementById('passingQuery');
  const b = document.getElementById('passingBtn');
  if(mode==='supplier'){
    if(q) q.placeholder='Jordan 4 bred, Yeezy 350 zebraÃ¢ÂÂ¦';
    if(b) b.textContent='Ã°ÂÂÂ­ Find Passing Supplier';
  } else if(mode==='batch'){
    if(q) q.placeholder='Jordan 4 bred Ã¢ÂÂ which batch passes best?';
    if(b) b.textContent='Ã°ÂÂÂ¦ Find Batch Intel';
  } else if(mode==='nfc'){
    if(q) q.placeholder='Jordan 4, Air Max Ã¢ÂÂ NFC chip version';
    if(b) b.textContent='Ã°ÂÂÂ± Find NFC Factory';
  }
}

// Highlight passing verdict words in snippet
function highlightPassingVerdicts(text){
  let result = text;
  PASSING_VERDICT_WORDS.forEach(word=>{
    const re = new RegExp(`(${word})`, 'gi');
    result = result.replace(re, '<mark class="verdict-mark">$1</mark>');
  });
  return result;
}

// Override buildCard for passing results to highlight verdicts
function buildPassingCard(item, index){
  const card = buildCard(item, index);
  // Highlight verdict words in snippet
  const snip = card.querySelector('.card-snip');
  if(snip) snip.innerHTML = highlightPassingVerdicts(snip.textContent||'');
  return card;
}

// Run batch intel search across Weidian + XHS
async function runBatchIntel(brand, query){
  const results = document.getElementById('batchIntelResults');
  if(!results) return;
  results.innerHTML = '<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Searching Weidian + Xiaohongshu for batch reviewsÃ¢ÂÂ¦</div>';

  const queries = [
    {q:`${brand} ${query} Ã¦ÂÂ¹Ã¦Â¬Â¡ Ã¨Â¿ÂÃ©ÂªÂ Ã¦ÂÂ¨Ã¨ÂÂ`.trim(), platform:'weidian', label:'Weidian Batches'},
    {q:`${brand} ${query} Ã¥ÂÂªÃ¤Â¸ÂªÃ¦ÂÂ¹Ã¦Â¬Â¡Ã¥Â¥Â½ Ã¦ÂµÂÃ¨Â¯Â Ã¥Â°ÂÃ§ÂºÂ¢Ã¤Â¹Â¦`.trim(), platform:'xiaohongshu', label:'XHS Reviews'},
    {q:`${brand} ${query} Ã¨Â¿ÂÃ©ÂªÂ Ã¥ÂÂÃ¥ÂÂ Ã§ÂºÂ¯Ã¥ÂÂ`.trim(), platform:'zhihu', label:'Zhihu Expert'},
  ];

  const seen = new Set();
  const all = [];
  for(const {q, platform, label} of queries){
    try{
      const r = await fetch('/search',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:q, brand:'', platform, mode:'passing', deep_scan:false, wechat_only:false})});
      const d = await r.json();
      (d.results||[]).forEach(item=>{
        if(!seen.has(item.link)){ seen.add(item.link); all.push({...item, _label:label}); }
      });
    } catch{}
  }

  results.innerHTML = '';
  if(!all.length){ results.innerHTML='<div class="empty">No batch intel found Ã¢ÂÂ try searching the product name in English and Chinese</div>'; return; }
  all.forEach((item,i)=>results.appendChild(buildPassingCard(item,i)));
}

// Patch passing form handler to use mode-specific logic
document.getElementById('passingForm')?.addEventListener('submit', async e=>{
  e.preventDefault();
  const brand = document.getElementById('passingBrand')?.value.trim()||'';
  const query = document.getElementById('passingQuery')?.value.trim()||'';
  const deepScan = document.getElementById('passingDeepScan')?.checked||false;
  const wcOnly = document.getElementById('passingWcOnly')?.checked||false;
  const mode = document.getElementById('passingMode')?.value||'supplier';

  if(mode==='batch'){
    // Run batch intel search
    const batchSection = document.getElementById('passingBatchSection');
    if(batchSection) batchSection.style.display='';
    runBatchIntel(brand, query);
    return;
  }

  const inject = PASSING_INJECT[mode]||PASSING_INJECT.supplier;
  const fullQuery = `${brand} ${query} ${inject}`.trim();

  const results = document.getElementById('passingResults');
  const dot = document.getElementById('passingDot');
  const status = document.getElementById('passingStatus');
  const hint = document.getElementById('passingHint');
  const btn = document.getElementById('passingBtn');

  if(btn){ btn.disabled=true; btn._orig=btn.innerHTML; btn.innerHTML='SearchingÃ¢ÂÂ¦'; }
  if(dot) dot.className='status-dot active';
  if(status) status.textContent='SearchingÃ¢ÂÂ¦';
  if(results) results.innerHTML='<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Searching for passing goodsÃ¢ÂÂ¦</div>';
  if(hint){ hint.style.display='block'; hint.textContent=`Passing search: ${brand} ${query}`.trim(); }

  try{
    const r = await fetch('/search',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:fullQuery, brand:'', platform:'baidu', mode:'passing', deep_scan:deepScan, wechat_only:wcOnly})});
    const d = await r.json();
    const res = d.results||[];
    if(dot) dot.className='status-dot';
    if(status) status.textContent=`${res.length} found`;
    if(results){
      results.innerHTML='';
      if(!res.length) results.innerHTML='<div class="empty">No results Ã¢ÂÂ try enabling Deep Scan or different keywords</div>';
      else res.forEach((item,i)=>results.appendChild(buildPassingCard(item,i)));
    }
    updateStats(res);
  } catch(e){
    if(dot) dot.className='status-dot error';
    if(status) status.textContent='Error';
    if(results) results.innerHTML='<div class="empty">Search failed Ã¢ÂÂ please try again</div>';
  } finally {
    if(btn){ btn.disabled=false; btn.innerHTML=btn._orig||'Search'; }
  }
});

// Ã¢ÂÂÃ¢ÂÂ FINDS TAB Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function openFindModal(){
  document.getElementById('findTitle').value='';
  document.getElementById('findProduct').value='';
  document.getElementById('findWechat').value='';
  document.getElementById('findPrice').value='';
  document.getElementById('findDesc').value='';
  document.getElementById('findMsg').textContent='';
  document.getElementById('findModal').style.display='flex';
}
function closeFindModal(){ document.getElementById('findModal').style.display='none'; }

async function submitFind(){
  const title   = document.getElementById('findTitle')?.value.trim();
  const product = document.getElementById('findProduct')?.value.trim();
  const wechat  = document.getElementById('findWechat')?.value.trim();
  const price   = document.getElementById('findPrice')?.value.trim();
  const desc    = document.getElementById('findDesc')?.value.trim();
  const msg     = document.getElementById('findMsg');
  if(!title){ msg.className='msg error'; msg.textContent='Title required'; return; }
  msg.className='msg'; msg.textContent='PostingÃ¢ÂÂ¦';
  try{
    const r = await fetch('/finds',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,product,wechat,price,desc})});
    const d = await r.json();
    if(d.id !== undefined || d.title){ msg.className='msg success'; msg.textContent='Ã¢ÂÂ Posted!'; setTimeout(()=>{closeFindModal();loadFinds();},800); }
    else if(d.error){ msg.className='msg error'; msg.textContent=d.error; }
    else { msg.className='msg success'; msg.textContent='Ã¢ÂÂ Posted!'; setTimeout(()=>{closeFindModal();loadFinds();},800); }
  } catch{ msg.className='msg error'; msg.textContent='Network error'; }
}

async function loadFinds(){
  const grid = document.getElementById('findsGrid');
  if(!grid) return;
  grid.innerHTML='<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>Loading findsÃ¢ÂÂ¦</div>';
  try{
    const r = await fetch('/finds');
    const d = await r.json();
    const finds = Array.isArray(d) ? d : (d.finds||[]);
    if(!finds.length){ grid.innerHTML='<div class="empty">No finds yet Ã¢ÂÂ be the first to post!</div>'; return; }
    grid.innerHTML='';
    finds.forEach(f=>grid.appendChild(buildFindCard(f)));
  } catch{ grid.innerHTML='<div class="empty">Could not load finds</div>'; }
}

function buildFindCard(f){
  const card = document.createElement('div');
  card.className='find-card';
  const initials = (f.author||'?').slice(0,2).toUpperCase();
  const liked = likedFinds[f.id];
  card.innerHTML=`
    <div class="find-meta">
      <div class="find-avatar">${initials}</div>
      <span class="find-author">${f.author||'Anonymous'}</span>
      <span class="find-time">${timeAgo((f.timestamp||f.ts||0)*1000||Date.now())}</span>
    </div>
    <div class="find-title">${f.title||''}</div>
    ${f.product?`<div class="find-product">${f.product}</div>`:''}
    ${f.desc?`<div class="find-desc">${f.desc}</div>`:''}
    ${f.wechat?`<div class="find-wechat" onclick="navigator.clipboard.writeText('${f.wechat}').then(()=>showToast('WeChat copied!'))">Ã°ÂÂÂ¬ ${f.wechat}</div>`:''}
    ${f.price?`<div class="find-price">Ã°ÂÂÂ° ${f.price}</div>`:''}
    <div class="find-footer">
      <button class="like-btn ${liked?'liked':''}" onclick="likeFindCard('${f.id}',this)">
        ${liked?'Ã¢ÂÂ¤':'Ã°ÂÂ¤Â'} ${(f.likes||0)+(liked?1:0)}
      </button>
    </div>
  `;
  return card;
}

async function likeFindCard(id, btn){
  likedFinds[id] = !likedFinds[id];
  saveLiked();
  const liked = likedFinds[id];
  const countStr = btn.textContent.match(/\d+/)?.[0]||'0';
  const count = parseInt(countStr) + (liked?1:-1);
  btn.className='like-btn '+(liked?'liked':'');
  btn.textContent=`${liked?'Ã¢ÂÂ¤':'Ã°ÂÂ¤Â'} ${count}`;
  await fetch(`/finds/${id}/like`,{method:'POST',headers:{'Content-Type':'application/json'}}).catch(()=>{});
}

function timeAgo(ts){
  const diff = Date.now()-ts;
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), d=Math.floor(diff/86400000);
  if(m<1) return 'just now';
  if(m<60) return `${m}m ago`;
  if(h<24) return `${h}h ago`;
  return `${d}d ago`;
}

function addToFinds(item){
  switchTab('finds');
  setTimeout(()=>{
    openFindModal();
    const t=document.getElementById('findTitle');
    const w=document.getElementById('findWechat');
    const d=document.getElementById('findDesc');
    const p=document.getElementById('findProduct');
    if(t) t.value=(item.title||'').slice(0,60);
    if(w) w.value=(item.wechat_ids||[])[0]?.id||'';
    if(d) d.value=(item.snippet||'').slice(0,200);
    if(p) p.value=item.platform||'';
  },150);
}

;function _injectUI(){document.getElementById("sf-hdr")?.remove();document.getElementById("sf-hist")?.remove();var h=document.createElement("div");h.id="sf-hdr";h.style.cssText="position:fixed;top:10px;right:14px;z-index:10000;display:flex;gap:8px;align-items:center";h.innerHTML='<span style="font-size:10px;color:#475569"><span style="color:#22c55e">●</span> <span id="sf-today">'+parseInt(localStorage.getItem("sf_d_"+new Date().toDateString())||0)+'</span> searches today</span><button onclick="toggleHist()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#94a3b8;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer">🕐 History</button>';document.body.appendChild(h);var hp=document.createElement("div");hp.id="sf-hist";hp.style.cssText="position:fixed;top:44px;right:14px;z-index:9999;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px;width:300px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.6);max-height:360px;overflow-y:auto";hp.innerHTML="<div style='font-size:11px;color:#475569;padding:4px 8px 8px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between'><span>Recent Searches</span><span onclick='localStorage.removeItem(&quot;sf_sh&quot;);_rh()' style='cursor:pointer;color:#ef4444;font-size:10px'>Clear</span></div><div id='sf-hl'><div style='color:#475569;font-size:12px;padding:10px 8px'>No searches yet</div></div><div style='font-size:10px;color:#334155;padding:6px 8px 2px'>Ctrl+K focus · Ctrl+L logout · Ctrl+H history</div>";document.body.appendChild(hp);document.addEventListener("click",function(e){var p=document.getElementById("sf-hist");if(p&&p.style.display!="none"&&!p.contains(e.target)&&!document.getElementById("sf-hdr").contains(e.target))p.style.display="none";},true);}
function toggleHist(){var h=document.getElementById("sf-hist");if(!h)return;h.style.display=h.style.display=="none"?"block":"none";if(h.style.display!="none")_rh();}
function _rh(){var el=document.getElementById("sf-hl");if(!el)return;var h=[];try{h=JSON.parse(localStorage.getItem("sf_sh")||"[]");}catch(e){}if(!h.length){el.innerHTML='<div style="color:#475569;font-size:12px;padding:10px 8px">No searches yet</div>';return;}el.innerHTML=h.map(function(x,i){var a=Math.floor((Date.now()-x.ts)/60000);return '<div onclick="_lh('+i+')" style="cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12px;color:#94a3b8;display:flex;justify-content:space-between" onmouseover="this.style.background=\'rgba(255,255,255,.05)\'" onmouseout="this.style.background=\'\'"><span>🔍 '+(x.b?x.b+" · ":"")+x.q+"</span><span style='opacity:.4;font-size:10px'>"+(a<1?"now":a<60?a+"m":Math.floor(a/60)+"h")+"</span></div>";}).join("");}
function _lh(i){var h=[];try{h=JSON.parse(localStorage.getItem("sf_sh")||"[]");}catch(e){}var x=h[i];if(!x)return;var q=document.querySelector('input[placeholder*="Tech Fleece"],input[placeholder*="Jordan"]');var b=document.querySelector('input[placeholder*="Nike"]');if(q){q.value=x.q;q.dispatchEvent(new Event("input"));}if(b&&x.b){b.value=x.b;b.dispatchEvent(new Event("input"));}document.getElementById("sf-hist").style.display="none";showToast&&showToast("Loaded: "+x.q,"info");}
function _ah(q,b,p){var h=[];try{h=JSON.parse(localStorage.getItem("sf_sh")||"[]");}catch(e){}h=h.filter(function(x){return!(x.q==q&&x.b==b);});h.unshift({q:q,b:b,p:p,ts:Date.now()});localStorage.setItem("sf_sh",JSON.stringify(h.slice(0,25)));}
function _bt(){var k="sf_d_"+new Date().toDateString();var n=parseInt(localStorage.getItem(k)||0)+1;localStorage.setItem(k,n);var e=document.getElementById("sf-today");if(e)e.textContent=n;}
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key=="k"){e.preventDefault();var q=document.querySelector('input[placeholder*="Tech Fleece"]');if(q){q.focus();q.select();}}if((e.ctrlKey||e.metaKey)&&e.key=="l"){e.preventDefault();if(confirm("Log out?"))logout();}if((e.ctrlKey||e.metaKey)&&e.key=="h"){e.preventDefault();toggleHist();}});