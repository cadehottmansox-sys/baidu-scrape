// Inject popup animations
const _popStyle = document.createElement('style');
_popStyle.textContent = `
  @keyframes popIn{from{opacity:0;transform:scale(.85) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .tab-locked{cursor:not-allowed!important;opacity:.6}
  .tab-locked:hover{background:rgba(255,68,102,.04)!important;color:#ff4466!important}
`;
document.head.appendChild(_popStyle);

// ── Session stats ─────────────────────────────────────────────────
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

// ── BACKGROUND ───────────────────────────────────────────────────
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

// ── Typing hero ───────────────────────────────────────────────────
(function(){
  const el=document.getElementById("heroTitle");
  if(!el) return;
  const text="SourceFinder";
  let i=0;
  el.innerHTML='<span class="cursor"></span>';
  const type=()=>{
    if(i<text.length){el.innerHTML=text.slice(0,++i)+'<span class="cursor"></span>';setTimeout(type,80+Math.random()*60)}
    else setTimeout(()=>el.querySelector(".cursor")?.remove(),1200);
  };
  setTimeout(type,300);
})();



"use strict";

// ── Typing hero ───────────────────────────────────────────────────
(function(){
  const el=document.getElementById("heroTitle");
  if(!el) return;
  const text="SourceFinder";
  let i=0;
  el.innerHTML='<span class="cursor"></span>';
  const type=()=>{
    if(i<text.length){el.innerHTML=text.slice(0,++i)+'<span class="cursor"></span>';setTimeout(type,80+Math.random()*60)}
    else setTimeout(()=>el.querySelector(".cursor")?.remove(),1200);
  };
  setTimeout(type,300);
})();

// ── Platform hints ────────────────────────────────────────────────
const SUPPLIER_INJECT={"baidu":"工厂 厂家 OEM ODM manufacturer","1688":"1688 厂家直销 批发","xianyu":"闲鱼 库存 尾货","xiaohongshu":"小红书 源头厂家","taobao":"淘宝 厂家店","made-in-china":"made-in-china.com OEM","globalsources":"globalsources.com supplier","wechat":"微信 一手货源"};
const FF_INJECT={"baidu":"货代 freight forwarder FOB","1688":"1688 货代","globalsources":"globalsources freight"};
const PASS_INJECT={"baidu":"passing NFC芯片 过货 莆田 1:1"};

// ── State ─────────────────────────────────────────────────────────
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

// ── Tabs ──────────────────────────────────────────────────────────
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

// ── Chips ─────────────────────────────────────────────────────────
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

// ── Query hints ───────────────────────────────────────────────────
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

// ── Status ────────────────────────────────────────────────────────
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

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg){
  const t=document.createElement("div");t.className="copy-toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2200);
}
function copyText(text,label=""){
  navigator.clipboard.writeText(text).catch(()=>{});
  toast(label?`Copied: ${label}`:"Copied!");
}

// ── WeChat chip ───────────────────────────────────────────────────
function wcChip(w){
  const isQR=w.source==="qr", isOCR=w.source==="ocr";
  const cls=isQR?"wc-qr":isOCR?"wc-ocr":w.quality>=3?"wc-verified":w.quality===2?"wc-okay":"wc-weak";
  const lbl=isQR?"QR":isOCR?"OCR":w.quality>=3?"✓":w.quality===2?"~":"?";

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
      if(s==="verified"){ vbtn.textContent=`✓ ${score}pts`; vbtn.className="verify-btn verified"; }
      else if(s==="likely"){ vbtn.textContent=`~ ${score}pts`; vbtn.className="verify-btn likely"; }
      else if(s==="weak"){ vbtn.textContent=`? weak`; vbtn.className="verify-btn weak"; }
      else { vbtn.textContent="✗ none"; vbtn.className="verify-btn notfound"; }
    } catch { vbtn.textContent="err"; vbtn.disabled=false; }
  });
  wrap.appendChild(vbtn);
  return wrap;
}

// ── Card builder ──────────────────────────────────────────────────
function buildCard(item,index){
  const score    = item.factory_score ?? 0;
  const wechats  = item.wechat_ids || [];
  const hasQR    = wechats.some(w=>w.source==="qr");
  const hasOCR   = wechats.some(w=>w.source==="ocr");
  const allWeak  = wechats.length>0 && !wechats.some(w=>w.quality>=3);
  const isSaved  = !!savedResults[item.link];
  const cardNote = notes[item.link]||"";
  const bestWQ   = wechats.length ? Math.max(...wechats.map(w=>w.quality||0)) : 0;

  // Confidence meter
  const confPct  = Math.min(100, Math.round((score/12)*100));
  const confCol  = score>=8?"var(--g)":score>=4?"var(--a)":"var(--r)";
  const confLbl  = score>=8?"HIGH":score>=4?"MED":"LOW";

  // Platform icon
  const platIcons = {Yupoo:"🖼️","All-in-One":"⚡",Baidu:"🔍","1688":"🏪",ImportYeti:"📦",Xianyu:"♻️",Weidian:"🛒",Xiaohongshu:"📕"};
  const platIcon  = platIcons[item.platform] || "🌐";

  // Source domain
  let domain = "";
  try{ domain = new URL(item.link||"https://x").hostname.replace("www.",""); }catch{}

  // Extraction method badges
  const extractBadges = [
    hasQR  ? `<span class="extract-badge qr-badge">QR</span>` : "",
    hasOCR ? `<span class="extract-badge ocr-badge">OCR</span>` : "",
    item.deep_scanned ? `<span class="extract-badge deep-badge2">DEEP</span>` : "",
    wechats.length>0 && !hasQR && !hasOCR ? `<span class="extract-badge text-badge">TEXT</span>` : "",
  ].filter(Boolean).join("");

  const card = document.createElement("article");
  card.className = "result-card" + (isSaved?" saved":"");
  card.style.animationDelay = `${index*.05}s`;
  card.dataset.score=score; card.dataset.link=item.link;
  card.dataset.hasContact=item.has_contact?"1":"0";
  card.dataset.hasWechat=(wechats.length>0)?"1":"0";
  card.dataset.verifiedWechat=item.has_verified_wechat?"1":"0";
  card.dataset.qrWechat=hasQR?"1":"0";
  card.dataset.ocrWechat=hasOCR?"1":"0";
  card.dataset.factoryLike=item.is_factory_like?"1":"0";

  card.innerHTML = `
    <div class="card-top">
      <div class="card-meta-row">
        <span class="card-platform-pill">${platIcon} ${item.platform||"Unknown"}</span>
        <span class="card-domain">${domain}</span>
        <div class="card-extract-badges">${extractBadges}</div>
        <div class="card-top-actions">
          <button class="icon-btn ${isSaved?"saved":""}" title="${isSaved?"Unsave":"Save"}" data-save="${item.link}">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="${isSaved?"currentColor":"none"}"><path d="M8 1l2 4.5 5 .5-3.5 3.5 1 5L8 12l-4.5 2.5 1-5L1 6l5-.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>

      <a class="card-title-link" href="${item.link||"#"}" target="_blank" rel="noopener noreferrer">
        ${(item.title||"Untitled").slice(0,80)}${(item.title||"").length>80?"…":""}
      </a>
    </div>

    <div class="card-body">
      <div class="card-left">
        <div class="card-snippet-text" id="snip-${index}">${(item.snippet||"No description available.").slice(0,180)}${(item.snippet||"").length>180?`… <button class="continue-btn" onclick="expandSnippet(this,'${(item.link||'').replace(/'/g,'')}')" data-full="${encodeURIComponent(item.snippet||'')}">see more →</button>`:"" }</div>
      </div>

      <div class="card-right">
        <div class="confidence-block">
          <div class="conf-label">FACTORY CONFIDENCE</div>
          <div class="conf-bar-wrap">
            <div class="conf-bar" style="width:${confPct}%;background:${confCol}"></div>
          </div>
          <div class="conf-val" style="color:${confCol}">${confLbl} · ${score}/12</div>
        </div>

        <div class="wechat-count-block">
          <div class="conf-label">WECHATS FOUND</div>
          <div class="wechat-count-val" style="color:${wechats.length?'var(--g)':'var(--text3)'}">${wechats.length}</div>
        </div>
      </div>
    </div>`;

  // WeChat chips section
  if(wechats.length || item.phones?.length || item.emails?.length){
    const contactSection = document.createElement("div");
    contactSection.className = "card-contact-section";
    contactSection.innerHTML = `<div class="card-contact-label">CONTACTS</div>`;
    const chips = document.createElement("div");
    chips.className = "card-contacts";
    wechats.slice(0,6).forEach(w=>chips.appendChild(wcChip(w)));
    (item.phones||[]).slice(0,2).forEach(p=>{
      const e=document.createElement("div");e.className="contact-chip contact-phone";
      e.innerHTML=`📞 ${p}`;e.title="Click to copy";
      e.addEventListener("click",()=>copyText(p,p));chips.appendChild(e);
    });
    (item.emails||[]).forEach(em=>{
      const e=document.createElement("div");e.className="contact-chip contact-email";
      e.innerHTML=`✉ ${em}`;e.title="Click to copy";
      e.addEventListener("click",()=>copyText(em,em));chips.appendChild(e);
    });
    contactSection.appendChild(chips);
    card.appendChild(contactSection);
  }

  // Action row
  const actions = document.createElement("div");
  actions.className = "card-action-row";

  // Translate button
  const transBtn = document.createElement("button");
  transBtn.className="card-action-btn translate-btn";
  transBtn.textContent="🌐 Translate";
  transBtn.addEventListener("click",()=>translateText(item.snippet||item.title||"",transBtn));
  actions.appendChild(transBtn);

  // CRM button
  const crmBtn = document.createElement("button");
  crmBtn.className="card-action-btn";
  crmBtn.textContent="+ CRM";
  crmBtn.style.cssText="color:var(--c2);border-color:rgba(124,58,237,.25);background:rgba(124,58,237,.06)";
  crmBtn.addEventListener("click",()=>addToCrm(item));
  actions.appendChild(crmBtn);

  // Copy all WeChats button
  if(wechats.length > 0){
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className="card-action-btn";
    copyAllBtn.textContent=`📋 Copy ${wechats.length} WeChat${wechats.length>1?'s':''}`;
    copyAllBtn.style.cssText="color:var(--g);border-color:rgba(0,255,136,.2);background:rgba(0,255,136,.05)";
    copyAllBtn.addEventListener("click",()=>{
      const ids = wechats.map(w=>w.id).join(", ");
      navigator.clipboard.writeText(ids).then(()=>showToast(`✓ Copied ${wechats.length} WeChat IDs`));
    });
    actions.appendChild(copyAllBtn);
  }

  // Middleman / Factory flag
  const flagBtn = document.createElement('button');
  let flagged = localStorage.getItem('flag_'+item.link);
  flagBtn.className = flagged==='middleman' ? 'middleman-flag' : flagged==='factory' ? 'middleman-flag factory-flag' : 'card-action-btn';
  flagBtn.textContent = flagged==='middleman' ? '⚠ Middleman' : flagged==='factory' ? '✓ Factory' : '🏭 Flag';
  flagBtn.title = "Flag as middleman or verified factory";
  flagBtn.addEventListener("click",()=>{
    const cur = localStorage.getItem('flag_'+item.link);
    const next = cur==='middleman' ? 'factory' : cur==='factory' ? null : 'middleman';
    if(next){ localStorage.setItem('flag_'+item.link, next); }
    else { localStorage.removeItem('flag_'+item.link); }
    flagBtn.className = next==='middleman' ? 'middleman-flag' : next==='factory' ? 'middleman-flag factory-flag' : 'card-action-btn';
    flagBtn.textContent = next==='middleman' ? '⚠ Middleman' : next==='factory' ? '✓ Factory' : '🏭 Flag';
    showToast(next ? `Flagged as ${next}` : 'Flag removed');
  });
  actions.appendChild(flagBtn);

  // Scan button
  if(!item.deep_scanned){
    const scanBtn=document.createElement("button");
    scanBtn.className="card-action-btn";
    scanBtn.textContent="🔍 Deep Scan";
    scanBtn.style.cssText="color:var(--a);border-color:rgba(255,170,0,.25);background:rgba(255,170,0,.06)";
    scanBtn.addEventListener("click",async()=>{
      scanBtn.disabled=true;scanBtn.textContent="Scanning...";
      try{
        const r=await fetch("/scan-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.link})});
        const data=await r.json();
        scanBtn.remove();
        const newWc=data.wechat_ids||[];
        const existingIds=new Set(wechats.map(w=>w.id));
        let added=0;
        newWc.filter(w=>!existingIds.has(w.id)).forEach(w=>{
          let chips=card.querySelector(".card-contacts");
          if(!chips){
            const cs=document.createElement("div");cs.className="card-contact-section";
            cs.innerHTML='<div class="card-contact-label">CONTACTS</div>';
            chips=document.createElement("div");chips.className="card-contacts";
            cs.appendChild(chips);card.appendChild(cs);
          }
          chips.appendChild(wcChip(w));wechats.push(w);added++;
        });
        showToast(added>0?`Found ${added} WeChat(s)!`:"No new WeChats found");
        // Update count
        const countEl=card.querySelector(".wechat-count-val");
        if(countEl) countEl.textContent=wechats.length;
        if(countEl) countEl.style.color=wechats.length?"var(--g)":"var(--text3)";
      }catch{scanBtn.disabled=false;scanBtn.textContent="🔍 Deep Scan";showToast("Scan failed")}
    });
    actions.appendChild(scanBtn);
  }

  card.appendChild(actions);

  // Note
  const noteEl=document.createElement("textarea");
  noteEl.className="card-note";noteEl.placeholder="Note...";
  noteEl.value=cardNote;
  noteEl.addEventListener("input",()=>{notes[item.link]=noteEl.value;saveNotes()});
  card.appendChild(noteEl);

  // Save logic — syncs to server
  card.querySelector("[data-save]")?.addEventListener("click", async ()=>{
    const link = item.link;
    const btn = card.querySelector("[data-save]");
    const isSaved = !!savedResults[link];
    if(isSaved){
      delete savedResults[link];
      card.classList.remove("saved");
      btn?.classList.remove("saved");
      btn?.querySelector("path")?.setAttribute("fill","none");
      saveSaved();
      showToast("Removed from saved");
      await fetch("/api/saved",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({link})}).catch(()=>{});
    } else {
      savedResults[link] = item;
      card.classList.add("saved");
      btn?.classList.add("saved");
      btn?.querySelector("path")?.setAttribute("fill","currentColor");
      saveSaved();
      showToast("⭐ Saved!");
      await fetch("/api/saved",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)}).catch(()=>{});
    }
    renderSavedTab();
  });

  return card;
}

// ── Filters ───────────────────────────────────────────────────────
function applyFilters(resultsId,filtersId){
  const bar=document.getElementById(filtersId),res=document.getElementById(resultsId);
  if(!bar||!res) return;
  const active=bar.querySelector(".filter-pill.active")?.dataset.filter||"all";
  const minScore=parseInt(document.getElementById("scoreFilter")?.value||"0",10);
  res.querySelectorAll(".result-card").forEach(card=>{
    let show=parseInt(card.dataset.score||"0",10)>=minScore;
    if(show&&active==="has_wechat")show=card.dataset.hasWechat==="1";
    if(show&&active==="has_contact")show=card.dataset.hasContact==="1";
    if(show&&active==="verified_wechat")show=card.dataset.verifiedWechat==="1";
    if(show&&active==="qr_wechat")show=card.dataset.qrWechat==="1";
    if(show&&active==="ocr_wechat")show=card.dataset.ocrWechat==="1";
    if(show&&active==="factory_like")show=card.dataset.factoryLike==="1";
    card.style.display=show?"":"none";
  });
}
function initFilters(fbid,rid){
  const bar=document.getElementById(fbid);if(!bar)return;
  bar.querySelectorAll(".filter-pill").forEach(pill=>pill.addEventListener("click",()=>{
    bar.querySelectorAll(".filter-pill").forEach(p=>p.classList.remove("active"));
    pill.classList.add("active");applyFilters(rid,fbid);
  }));
  const slider=document.getElementById("scoreFilter"),sv=document.getElementById("scoreVal");
  if(slider)slider.addEventListener("input",()=>{if(sv)sv.textContent=slider.value;applyFilters(rid,fbid)});
}
initFilters("supplierFilters","supplierResults");
initFilters("ffFilters","ffResults");
initFilters("passingFilters","passingResults");

// ── Toolbar ───────────────────────────────────────────────────────
document.getElementById("copyAllWc")?.addEventListener("click",()=>{
  const allWc=[...document.querySelectorAll("#supplierResults .wc-verified,.wc-okay,.wc-qr,.wc-ocr")].map(el=>el.textContent.replace(/^[✓~?QR OCR]+\s*/,"").split("\n")[0].trim()).filter(Boolean);
  if(!allWc.length){toast("No WeChat IDs found");return}
  copyText([...new Set(allWc)].join(", "),"all WeChats");
});

document.getElementById("exportCsv")?.addEventListener("click",()=>{
  const s=state.supplier;
  if(!s.results.length){toast("No results to export");return}
  const rows=[["Title","Link","Snippet","WeChat IDs","Emails","Phones","Score","Platform","Note"]];
  s.results.forEach(r=>{
    rows.push([
      `"${(r.title||"").replace(/"/g,'""')}"`,
      r.link||"",
      `"${(r.snippet||"").replace(/"/g,'""')}"`,
      `"${(r.wechat_ids||[]).map(w=>w.id).join(", ")}"`,
      `"${(r.emails||[]).join(", ")}"`,
      `"${(r.phones||[]).join(", ")}"`,
      r.factory_score||0,
      r.platform||"",
      `"${(notes[r.link]||"").replace(/"/g,'""')}"`,
    ]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");
  const a=document.createElement("a");
  a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
  a.download=`sourcefinder-${Date.now()}.csv`;
  a.click();
  toast("CSV downloaded!");
});

document.getElementById("showHistory")?.addEventListener("click",()=>{
  const list=document.getElementById("historyList");
  if(!list) return;
  if(!history.length){list.innerHTML='<p style="color:var(--text3);font-size:13px;padding:12px 0">No search history yet.</p>'}
  else list.innerHTML=history.map((h,i)=>`
    <div class="history-item" onclick="rerunHistory(${i})">
      <div>
        <div class="history-q">${h.brand?`<span style="color:var(--blue)">${h.brand}</span> · `:""} ${h.query}</div>
        <div class="history-meta">${h.platform} · ${h.mode} · ${new Date(h.ts).toLocaleString()}</div>
      </div>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`).join("");
  document.getElementById("historyModal").style.display="flex";
});

function closeHistory(){document.getElementById("historyModal").style.display="none"}

function rerunHistory(i){
  const h=history[i];
  closeHistory();
  if(h.mode==="supplier"){
    document.querySelector('[data-tab="supplier"]').click();
    setTimeout(()=>{
      if(bI) bI.value=h.brand||"";
      if(qI) qI.value=h.query;
      document.getElementById("supplierForm").dispatchEvent(new Event("submit"));
    },100);
  }
}

// ── Refresh bar ───────────────────────────────────────────────────
function buildRefreshBar(tabKey,total){
  const bar=document.createElement("div");bar.className="refresh-bar";bar.id=`${tabKey}RefreshBar`;
  const s=state[tabKey];
  const sb=document.createElement("button");sb.className="btn-refresh btn-refresh-simple";
  sb.innerHTML=`<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13 3v5h-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Load more (page ${s.pageNum+1})`;
  sb.addEventListener("click",()=>doRefresh(tabKey,"simple"));
  const smb=document.createElement("button");smb.className="btn-refresh btn-refresh-smart";
  smb.innerHTML=`<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5l3.5-.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Smart refresh`;
  smb.addEventListener("click",()=>doRefresh(tabKey,"smart"));
  const info=document.createElement("span");info.className="refresh-info";info.textContent=`${total} loaded`;
  bar.appendChild(sb);bar.appendChild(smb);bar.appendChild(info);
  return bar;
}

// ── Core fetch ────────────────────────────────────────────────────
async function fetchSearch(params){
  const r=await fetch("/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(params)});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"Search failed.");
  return data;
}

// ── Add to history ────────────────────────────────────────────────
function addHistory(params){
  history.unshift({query:params.query,brand:params.brand||"",platform:params.platform,mode:params.mode,ts:Date.now()});
  history=history.slice(0,20);
  saveHistory();
}

// ── Run search ────────────────────────────────────────────────────
async function runSearch({query,brand,platform,mode,deep_scan,wechat_only,btnId,dotId,statusId,resultsId,filtersId,hintId,platformLabel}){
  const tabKey=mode==="ff"?"ff":mode==="passing"?"passing":"supplier";
  const s=state[tabKey];
  s.pageNum=1;s.variation=0;s.seenLinks.clear();s.results=[];
  const btn=document.getElementById(btnId),res=document.getElementById(resultsId);
  const bar=document.getElementById(filtersId),toolbar=document.getElementById("supplierToolbar");
  btn.disabled=true;res.innerHTML="";
  if(bar) bar.style.display="none";
  if(toolbar) toolbar.style.display="none";
  document.getElementById(`${tabKey}RefreshBar`)?.remove();
  addHistory({query,brand,platform,mode});

  // Progress bar
  res.innerHTML=`<div id="searchProgress" style="padding:48px 20px;text-align:center">
    <div style="font-size:14px;color:var(--blue);font-weight:700;margin-bottom:20px;letter-spacing:-.2px" id="progressLabel">🔍 Connecting to Baidu AI...</div>
    <div style="background:rgba(255,255,255,.06);border:1px solid rgba(125,211,252,.1);border-radius:20px;height:8px;overflow:hidden;max-width:420px;margin:0 auto 14px">
      <div id="progressBar" style="height:100%;border-radius:20px;background:linear-gradient(90deg,#1a6fa4,#7dd3fc,#a78bfa);width:3%;transition:width .6s ease;box-shadow:0 0 12px rgba(125,211,252,.4)"></div>
    </div>
    <div style="font-size:11px;color:var(--text3);font-family:monospace" id="progressSub">initializing...</div>
  </div>`;

  const _steps = deep_scan ? [
    [8,  "🔍 Querying Baidu AI Search...",     "searching supplier databases"],
    [22, "📡 Got results — following links...", "visiting supplier pages"],
    [38, "🖥️ Scanning page 1...",               "extracting text + WeChat IDs"],
    [52, "🖥️ Scanning page 2...",               "running OCR on images"],
    [64, "🔎 Scanning page 3...",               "decoding QR codes"],
    [75, "🖥️ Scanning page 4...",               "deep scanning HTML source"],
    [85, "🧹 Filtering results...",             "removing official brand sites"],
    [93, "✨ Almost done...",                   "ranking by confidence score"],
  ] : [
    [8,  "🔍 Querying Baidu AI Search...",     "connecting to Baidu API"],
    [25, "📦 Processing results...",            "found supplier listings"],
    [50, "🔎 Extracting contacts...",           "scanning for WeChat IDs"],
    [72, "🧹 Filtering results...",             "removing official brand sites"],
    [90, "✨ Almost done...",                   "ranking by confidence score"],
  ];
  let _si=0;
  const progressInterval=setInterval(()=>{
    if(_si<_steps.length){
      const [pct,lbl,sub]=_steps[_si++];
      const pb=document.getElementById("progressBar");
      const pl=document.getElementById("progressLabel");
      const ps=document.getElementById("progressSub");
      if(pb)pb.style.width=pct+"%";
      if(pl)pl.textContent=lbl;
      if(ps)ps.textContent=sub;
    }
  }, deep_scan?11000:5500);

  setStatus(dotId,statusId,deep_scan?"Deep scanning...":"Searching...","active");
  try{
    const data=await fetchSearch({query,brand,platform,mode,deep_scan,wechat_only,page_num:1,variation:0,seen_links:[]});
    clearInterval(progressInterval);
    // Complete the bar
    const pb=document.getElementById("progressBar");
    const pl=document.getElementById("progressLabel");
    if(pb)pb.style.width="100%";
    if(pl)pl.textContent="✅ Done!";
    await new Promise(r=>setTimeout(r,400));
    res.innerHTML="";
    const results=data.results||[];
    updateStats(results);
    if(!results.length){res.innerHTML=`<div class="empty">No results. Try different keywords or platform.</div>`;setStatus(dotId,statusId,"No results.","idle");return}
    if(bar){bar.style.display="flex";bar.querySelectorAll(".filter-pill").forEach((p,i)=>p.classList.toggle("active",i===0))}
    if(toolbar&&tabKey==="supplier") toolbar.style.display="flex";
    const slider=document.getElementById("scoreFilter"),sv=document.getElementById("scoreVal");
    if(slider){slider.value=0;if(sv)sv.textContent="0"}
    results.forEach((item,i)=>{s.seenLinks.add(item.link);res.appendChild(buildCard(item,i))});
    s.results=results;
    const verified=results.filter(r=>r.has_verified_wechat).length;
    const qrF=results.reduce((a,r)=>a+(r.wechat_ids||[]).filter(w=>w.source==="qr").length,0);
    const ocrF=results.reduce((a,r)=>a+(r.wechat_ids||[]).filter(w=>w.source==="ocr").length,0);
    setStatus(dotId,statusId,`${results.length} results · ${verified} verified · ${qrF} QR · ${ocrF} OCR`,"active");
    if(results[0]?.baidu_query&&hintId) document.getElementById(hintId).innerHTML=`<b>Baidu query used:</b> ${results[0].baidu_query}`;
    res.appendChild(buildRefreshBar(tabKey,results.length));
    s.lastParams={query,brand,platform,mode,deep_scan,wechat_only,btnId,dotId,statusId,resultsId,filtersId,hintId,platformLabel};
  }catch(err){clearInterval(progressInterval);res.innerHTML="";setStatus(dotId,statusId,err.message||"Error.","error")}
  finally{btn.disabled=false}
}

// ── Refresh ───────────────────────────────────────────────────────
async function doRefresh(tabKey,type){
  const s=state[tabKey];
  if(s.loading||!s.lastParams) return;
  s.loading=true;
  const p=s.lastParams,res=document.getElementById(p.resultsId);
  document.getElementById(`${tabKey}RefreshBar`)?.remove();
  const loaderDiv=document.createElement("div");loaderDiv.className="loader";
  loaderDiv.innerHTML=`<div class="loader-dots"><span></span><span></span><span></span></div>${type==="smart"?"Smart refresh...":"Loading next page..."}`;
  res.appendChild(loaderDiv);
  const pageNum=type==="simple"?s.pageNum+1:1;
  const variation=type==="smart"?s.variation+1:s.variation;
  setStatus(p.dotId,p.statusId,type==="smart"?"Smart refresh...":"Loading more...","active");
  try{
    const data=await fetchSearch({query:p.query,brand:p.brand,platform:p.platform,mode:p.mode,deep_scan:p.deep_scan,wechat_only:p.wechat_only,page_num:pageNum,variation,seen_links:[...s.seenLinks]});
    loaderDiv.remove();
    const newR=data.results||[];
    if(!newR.length){
      const empty=document.createElement("div");empty.className="empty";empty.style.padding="20px";
      empty.textContent=type==="smart"?"No new results with these keywords.":"No more results on this page.";
      res.appendChild(empty);setStatus(p.dotId,p.statusId,"No new results.","idle");
    }else{
      const start=s.results.length;
      newR.forEach((item,i)=>{s.seenLinks.add(item.link);res.appendChild(buildCard(item,start+i))});
      s.results.push(...newR);
      if(type==="simple")s.pageNum=pageNum;else s.variation=variation;
      const verified=s.results.filter(r=>r.has_verified_wechat).length;
      setStatus(p.dotId,p.statusId,`${s.results.length} total · ${verified} verified`,"active");
    }
    res.appendChild(buildRefreshBar(tabKey,s.results.length));
  }catch(err){loaderDiv.remove();setStatus(p.dotId,p.statusId,err.message||"Refresh failed.","error");res.appendChild(buildRefreshBar(tabKey,s.results.length))}
  finally{s.loading=false}
}

// ── Forms ─────────────────────────────────────────────────────────
document.getElementById("supplierForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:qI.value.trim(),brand:bI.value.trim(),platform:sP.value,mode:"supplier",
    deep_scan:document.getElementById("supplierDeepScan").checked,
    wechat_only:document.getElementById("supplierWcOnly").checked,
    btnId:"supplierBtn",dotId:"supplierDot",statusId:"supplierStatus",
    resultsId:"supplierResults",filtersId:"supplierFilters",hintId:"supplierHint",
    platformLabel:document.querySelector("#supplierChips .chip.active")?.textContent||"Baidu"});
});

document.getElementById("ffForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:ffQ.value.trim(),brand:ffO?.value.trim()||"",platform:ffP.value,mode:"ff",
    deep_scan:document.getElementById("ffDeepScan").checked,wechat_only:false,
    btnId:"ffBtn",dotId:"ffDot",statusId:"ffStatus",
    resultsId:"ffResults",filtersId:"ffFilters",hintId:"ffHint",
    platformLabel:document.querySelector("#ffChips .chip.active")?.textContent||"Baidu"});
});

document.getElementById("passingForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:pQ.value.trim(),brand:pB?.value.trim()||"",platform:pP.value,mode:"passing",
    deep_scan:document.getElementById("passingDeepScan").checked,
    wechat_only:document.getElementById("passingWcOnly").checked,
    btnId:"passingBtn",dotId:"passingDot",statusId:"passingStatus",
    resultsId:"passingResults",filtersId:"passingFilters",hintId:"passingHint",
    platformLabel:"Baidu"});
});

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&document.activeElement.tagName!=="INPUT"&&document.activeElement.tagName!=="TEXTAREA"){
    e.preventDefault();qI?.focus();
  }
  if(e.key==="f"&&e.altKey){document.querySelector('[data-tab="finds"]')?.click()}
  if(e.key==="Escape"){
    closeHistory();closeFindModal();
    document.activeElement?.blur();
  }
});

// ── Finds board ───────────────────────────────────────────────────
async function loadFinds(){
  const grid=document.getElementById("findsGrid");if(!grid)return;
  try{
    const r=await fetch("/finds");
    const finds=await r.json();
    if(!finds.length){grid.innerHTML='<div class="empty">No finds yet — be the first to post one!</div>';return}
    grid.innerHTML="";
    finds.forEach((f,i)=>{
      const card=document.createElement("div");
      card.className="find-card";
      card.style.animationDelay=`${i*.04}s`;
      const initials=(f.author||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      const timeAgo=getTimeAgo(f.timestamp);
      const isLiked=likedFinds.includes(f.id);
      card.innerHTML=`
        <div class="find-meta">
          <div class="find-avatar">${initials}</div>
          <div><div class="find-author">${f.author||"Anonymous"}</div><div class="find-time">${timeAgo}</div></div>
        </div>
        <div class="find-title">${f.title}</div>
        ${f.product?`<span class="find-product">${f.product}</span>`:""}
        ${f.desc?`<div class="find-desc">${f.desc}</div>`:""}
        ${f.wechat?`<div class="find-wechat" onclick="copyText('${f.wechat}','${f.wechat}')">✓ ${f.wechat} <span style="font-size:10px;opacity:.6">· click to copy</span></div>`:""}
        ${f.price?`<div class="find-price">💰 ${f.price}</div>`:""}
        <div class="find-footer">
          <button class="like-btn ${isLiked?"liked":""}" data-id="${f.id}">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="${isLiked?"currentColor":"none"}"><path d="M8 13.5S2 9.5 2 5.5a3 3 0 015-2.2A3 3 0 0114 5.5c0 4-6 8-6 8z" stroke="currentColor" stroke-width="1.5"/></svg>
            ${f.likes||0}
          </button>
        </div>`;
      card.querySelector(".like-btn")?.addEventListener("click",async()=>{
        if(likedFinds.includes(f.id)) return;
        const r=await fetch(`/finds/${f.id}/like`,{method:"POST"});
        const data=await r.json();
        likedFinds.push(f.id);saveLiked();
        card.querySelector(".like-btn").textContent=`❤ ${data.likes}`;
        card.querySelector(".like-btn").classList.add("liked");
      });
      grid.appendChild(card);
    });
  }catch{grid.innerHTML='<div class="empty">Failed to load finds.</div>'}
}

function getTimeAgo(ts){
  const diff=Date.now()-ts*1000;
  if(diff<60000) return "just now";
  if(diff<3600000) return `${Math.floor(diff/60000)}m ago`;
  if(diff<86400000) return `${Math.floor(diff/3600000)}h ago`;
  return `${Math.floor(diff/86400000)}d ago`;
}

function openFindModal(){document.getElementById("findModal").style.display="flex"}
function closeFindModal(){document.getElementById("findModal").style.display="none"}

async function submitFind(){
  const msg=document.getElementById("findMsg");
  const title=document.getElementById("findTitle")?.value.trim();
  if(!title){msg.className="msg error";msg.textContent="Title required.";return}
  msg.className="msg";msg.textContent="Posting...";
  try{
    const r=await fetch("/finds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      title,
      product:document.getElementById("findProduct")?.value.trim(),
      wechat:document.getElementById("findWechat")?.value.trim(),
      price:document.getElementById("findPrice")?.value.trim(),
      desc:document.getElementById("findDesc")?.value.trim(),
    })});
    const data=await r.json();
    if(r.ok){msg.className="msg success";msg.textContent="Posted!";setTimeout(()=>{closeFindModal();loadFinds()},1000)}
    else{msg.className="msg error";msg.textContent=data.error||"Failed."}
  }catch{msg.className="msg error";msg.textContent="Network error."}
}

// ── Access page floating reviews (if on access page) ──────────────
// handled in access.html

// ── EXPAND SNIPPET ───────────────────────────────────────────────
async function expandSnippet(btn, url){
  const snipEl = btn.parentElement;
  const full = decodeURIComponent(btn.dataset.full||"");
  if(full){ snipEl.textContent = full; return; }
  // Try to fetch more from the page
  btn.textContent = "Loading...";
  try{
    const r = await fetch("/scan-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,snippet_only:true})});
    const d = await r.json();
    if(d.snippet) snipEl.textContent = d.snippet;
    else snipEl.textContent = full || "No additional content found.";
  } catch{ snipEl.textContent = full || "Could not load."; }
}

// ── ADD TO FINDS ──────────────────────────────────────────────────
function addToFinds(item){
  // Switch to finds tab and pre-fill modal
  switchTab("finds");
  setTimeout(()=>{
    openFindModal();
    // Pre-fill fields
    const titleEl = document.getElementById("findTitle");
    const productEl = document.getElementById("findProduct");
    const wechatEl = document.getElementById("findWechat");
    const descEl = document.getElementById("findDesc");
    if(titleEl) titleEl.value = (item.title||"").slice(0,60);
    if(productEl) productEl.value = item.platform||"";
    if(wechatEl) wechatEl.value = (item.wechat_ids||[])[0]?.id||"";
    if(descEl) descEl.value = (item.snippet||"").slice(0,200);
  }, 150);
}

// ── SAVED TAB ────────────────────────────────────────────────────
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

// ── CRM ──────────────────────────────────────────────────────────
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

const STATUS_LABELS = {new:'🆕 New',contacted:'📨 Contacted',replied:'💬 Replied',sampling:'📦 Sampling',ordered:'✅ Ordered',passed:'❌ Passed'};

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
      <div class="crm-row-wc" onclick="copyText(event,e.wechat||'');event.stopPropagation()" title="Click to copy">${e.wechat||'—'}</div>
      <div class="crm-row-product">${e.product||'—'}</div>
      <div class="crm-row-price">${e.price||'—'}</div>
      <div><span class="crm-status crm-status-${e.status}">${STATUS_LABELS[e.status]||e.status}</span></div>
      <div class="crm-row-date">${e.date}</div>
      <div class="crm-row-del" onclick="deleteCrmEntry('${e.id}',event)">✕</div>
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

// ── QR GENERATOR ─────────────────────────────────────────────────
function genQR(){
  const id = document.getElementById('qrInput').value.trim();
  if(!id){ showToast('Enter a WeChat ID first'); return; }
  const out = document.getElementById('qrOutput');
  // Use WeChat's own QR format
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('weixin://dl/chat?'+id)}`;
  out.innerHTML = `
    <img src="${url}" class="qr-img" alt="WeChat QR for ${id}"/>
    <br><div style="margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--text2)">QR for <span style="color:var(--g)">${id}</span> — right-click to save</div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:4px">Screenshot this to add on mobile</div>
  `;
}
document.getElementById('qrInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') genQR(); });

// ── AUTO-TRANSLATE ────────────────────────────────────────────────
async function translateText(text, btn){
  btn.textContent = '...';
  btn.disabled = true;
  try{
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const d = await r.json();
    const translated = d[0]?.map(s=>s[0]).join('') || text;
    const snippet = btn.closest('.result-card')?.querySelector('.card-snippet');
    if(snippet){ snippet.textContent = translated; snippet.style.color='#f0abfc'; }
    btn.textContent = '✓ EN';
    btn.style.color = 'var(--g)';
  } catch {
    btn.textContent = 'err';
    btn.disabled = false;
  }
}

// Hook translate button into card builder — patch buildCard
const _origBuildCard = window.buildCard;

// ── CRM BUTTON IN CARDS ───────────────────────────────────────────
// patch card actions to include CRM + translate
const _buildCardOrig = typeof buildCard !== 'undefined' ? buildCard : null;

// ── ADMIN TAB ─────────────────────────────────────────────────────
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
    if(!pending.length){ el.innerHTML='<div class="crm-empty">No pending requests 🎉</div>'; return; }
    el.innerHTML = pending.map(req=>`
      <div class="admin-req" id="req-${req.id}">
        <div class="admin-req-info">
          <div class="admin-req-name">${req.name}</div>
          <div class="admin-req-email">${req.email}</div>
          <div class="admin-req-meta">
            ${req.discord?`Discord: ${req.discord} · `:''} 
            ${req.wechat?`WeChat: ${req.wechat} · `:''}
            ${new Date(req.timestamp*1000).toLocaleDateString()}
          </div>
          ${req.reason?`<div class="admin-req-reason">"${req.reason}"</div>`:''}
        </div>
        <div class="admin-req-actions">
          <button class="btn-approve" onclick="adminApprove('${req.id}','${req.name}')">✓ Approve</button>
          <button class="btn-deny" onclick="adminDeny('${req.id}')">✕ Deny</button>
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
          <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.last_query||'—'}</div>
        </div>
      `).join('')}
    `;
  }catch(e){ el.innerHTML='<div class="crm-empty">Error loading analytics</div>'; }
}

// Load admin data when tab is clicked
const _origTabSwitch = window.switchTab;

// ── USER SESSION + ADMIN ──────────────────────────────────────────
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
        adminBtn.innerHTML = adminBtn.innerHTML.replace(/Admin/,'🔒 Admin');
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
    if(heroSub && d.name) heroSub.textContent = `Welcome back, ${d.name} · Chinese suppliers · Factory WeChats · Passing goods`;
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
      <div style="font-size:48px;margin-bottom:12px">🔒</div>
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

// ── SET PASSWORD FLOW ─────────────────────────────────────────────
// Called when login returns needs_password=true
function showSetPassword(email){
  const overlay = document.createElement('div');
  overlay.className = 'setpw-overlay';
  overlay.innerHTML = `
    <div class="setpw-card">
      <div class="setpw-title">🎉 You're Approved!</div>
      <div class="setpw-sub">Set your password to access SourceFinder.<br>You'll only need to do this once.</div>
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
    if(d.ok){ msg.className='msg ok'; msg.textContent='✓ Password set! Loading...'; setTimeout(()=>location.reload(), 800); }
    else{ msg.className='msg err'; msg.textContent=d.error||'Error.'; btn.disabled=false; btn.textContent='Set Password & Login'; }
  } catch{ msg.className='msg err'; msg.textContent='Network error.'; btn.disabled=false; btn.textContent='Set Password & Login'; }
}

// Patch login response to handle needs_password
const _origFetch = window.fetch;

// ── ADMIN PANEL ───────────────────────────────────────────────────
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
  if(!reqs.length){ el.innerHTML='<div class="admin-empty">No pending requests 🎉</div>'; return; }
  el.innerHTML = reqs.map(r=>`
    <div class="admin-req" id="req-${r.id}">
      <div>
        <div class="admin-req-name">${r.name}</div>
        <div class="admin-req-email">${r.email}</div>
      </div>
      <div>
        <div class="admin-req-contact">${r.discord||r.wechat||'—'}</div>
        <div class="admin-req-time">${r._time||''}</div>
      </div>
      <button class="admin-btn abtn-approve" onclick="adminApprove('${r.id}','${r.email}')">✓ Approve</button>
      <button class="admin-btn abtn-deny" onclick="adminDeny('${r.id}')">✕ Deny</button>
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
        ${u.is_admin ? '★ Unadmin' : '☆ Admin'}
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
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.last_query||'—'}</div>
      </div>
    `).join('')}
  `;
}

async function adminApprove(reqId, email){
  try{
    showToast('Approving...');
    const r = await fetch('/api/admin/approve', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({req_id:reqId})});
    const d = await r.json();
    if(d.status==='approved'||d.status==='already_approved'){
      showToast('✓ Approved! They can now log in.');
      loadAdmin();
    } else { showToast('Error: '+(d.error||d.status||'unknown')); }
  } catch(e){ showToast('Network error'); }
}

async function adminDeny(reqId){
  const r = await fetch('/api/admin/deny', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({req_id:reqId})});
  const d = await r.json();
  showToast(d.status==='denied' ? '✓ Request denied' : 'Error');
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
  showToast(makeAdmin ? `⚡ ${email} is now an admin` : `${email} admin removed`);
  loadAdmin();
}

// Load admin when tab clicked — use event delegation so it works after DOM ready
document.addEventListener('click', e=>{
  const btn = e.target.closest('.tab-btn');
  if(btn && btn.dataset.tab==='admin') setTimeout(loadAdmin, 100);
  if(btn && btn.dataset.tab==='crm') setTimeout(renderCrm, 100);
  if(btn && btn.dataset.tab==='saved') renderSavedTab();
});

// Handle needs_password on login — intercept the fetch in access.html
// The access.html already handles this but we also need it if session expires

// ── RESEARCH TAB ──────────────────────────────────────────────────

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
    const factoryTerm = zh + ' 工厂';
    const wholesaleTerm = zh + ' 批发商';
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
          <button class="btn-primary" style="height:36px;font-size:11px;padding:0 12px" onclick="autoSearchChinese('${zh}')">⚡ Search SourceFinder with this</button>
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
    const scoreLbl = score>=60?'✓ LOOKS LEGIT':score>=30?'~ UNCERTAIN':'⚠ SKETCHY';
    result.innerHTML = `
      <div class="validate-card">
        <div class="validate-score" style="color:${scoreCol}">${scoreLbl} · ${score}/100</div>
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
          <div class="card-contacts">${wc.map(w=>`<div class="contact-chip wc-verified" onclick="navigator.clipboard.writeText('${w.id}').then(()=>showToast('Copied!'))" title="Click to copy">✓ ${w.id}</div>`).join('')}</div>
        </div>`:''}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-primary" style="height:36px;font-size:11px;padding:0 12px" onclick="window.open('${url}','_blank')">Open Factory Page</button>
          ${wc.length>0?`<button class="tool-btn" onclick="navigator.clipboard.writeText('${wc.map(w=>w.id).join(', ')}').then(()=>showToast('Copied all WeChats!'))">Copy All WeChats</button>`:''}
        </div>
      </div>
    `;
  } catch(e){ result.innerHTML = '<p style="color:var(--r);font-family:var(--mono);font-size:11px">Validation failed — check the URL</p>'; }
}

// Trend Checker — searches Taobao + XHS for demand signals
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
      <button class="btn-primary" style="height:32px;font-size:11px;padding:0 12px;margin-left:8px" onclick="switchTab('supplier');document.getElementById('queryInput').value='${q}';document.getElementById('supplierForm').dispatchEvent(new Event('submit'))">⚡ Find Suppliers for "${q}"</button>`;
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
    const r = await fetch('/search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:q+' 批次 质量对比', brand:'', platform:'weidian', mode:'supplier', deep_scan:false, wechat_only:false, max_results:8})});
    const d = await r.json();
    const results = d.results||[];
    if(!results.length){ result.innerHTML = '<div class="empty">No batches found — try a more specific product name</div>'; return; }
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

// ── FREIGHT TAB ───────────────────────────────────────────────────

// Known rep-friendly forwarders directory
const FF_DIRECTORY = [
  {
    name: "Sugargoo",
    tags: ["USA","UK","EU","REP","AGENT"],
    desc: "Popular agent for rep buyers. Good QC photos, consolidation. Use for warehousing only — find your own FF for shipping.",
    wechat: "",
    price: "Agent fees apply — use own FF for int'l shipping",
    type: "agent",
  },
  {
    name: "Pandabuy",
    tags: ["USA","UK","EU","AGENT","REP"],
    desc: "Most popular rep agent. Free warehousing, good QC. Never use their shipping rates — always choose cheaper line haul.",
    wechat: "",
    price: "Free storage 90 days — compare their shipping rates",
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
    name: "Private Agents (私人货代)",
    tags: ["REP","PRIVATE","PUTIAN"],
    desc: "Private agents specialize in sensitive/rep goods. They use custom packaging, no-inspection channels, and private shipping lines. Found via WeChat referrals — use the search above with 私人货代 to find them.",
    wechat: "",
    price: "~$3-8/kg — negotiate directly via WeChat",
    type: "rep",
  },
  {
    name: "How to find Private Agents",
    tags: ["GUIDE","REP","PRIVATE"],
    desc: "1) Ask your supplier — they often have a trusted private agent. 2) Search 私人货代 + your route on Weibo/XHS. 3) Ask in rep Discord servers. 4) Check fashionreps wiki. Never use agents you can't verify via WeChat.",
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
    price: "Compare rates — line haul usually cheapest",
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
    if(mode==='rep') q.placeholder = '私人货代 private agent — e.g. Putian shoes to USA, rep bags China to UK…';
    else if(mode==='agent') q.placeholder = 'consolidation, QC photos, warehousing — e.g. Pandabuy alternatives…';
    else q.placeholder = 'standard freight — e.g. electronics China to USA…';
  }

  const btn2 = document.getElementById('ffBtn');
  if(btn2) btn2.innerHTML = mode==='rep'
    ? '🔒 Find Private Agents'
    : mode==='agent'
    ? '🏢 Find Agents'
    : '📦 Find Forwarders';

  // Pre-fill with private agent terms for rep mode
  if(mode==='rep' && q && !q.value){
    q.value = '私人货代 private agent rep goods';
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

// ═══════════════════════════════════════════════════════════════
// ██████╗  ██████╗ ███╗   ██╗██╗   ██╗███████╗    ████████╗ ██████╗  ██████╗ ██╗     ███████╗
// ██╔══██╗██╔═══██╗████╗  ██║██║   ██║██╔════╝    ╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██╔════╝
// ██████╔╝██║   ██║██╔██╗ ██║██║   ██║███████╗       ██║   ██║   ██║██║   ██║██║     ███████╗
// ██╔══██╗██║   ██║██║╚██╗██║██║   ██║╚════██║       ██║   ██║   ██║██║   ██║██║     ╚════██║
// ██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝███████║       ██║   ╚██████╔╝╚██████╔╝███████╗███████║
// ═══════════════════════════════════════════════════════════════

// ── SUPPLIER INTELLIGENCE ────────────────────────────────────────

// Middleman Detection Score
function detectMiddleman(item){
  let score = 0;
  const txt = ((item.title||'') + ' ' + (item.snippet||'')).toLowerCase();
  // Bad signs — middleman indicators
  if(txt.includes('代购')) score += 2;
  if(txt.includes('代理')) score += 1;
  if(txt.includes('分销')) score += 1;
  if(txt.includes('零售')) score += 2;
  if(txt.includes('专卖')) score += 1;
  if(txt.includes('批发商')) score += 1;
  if(/price|价格.*negotiable|面议/.test(txt)) score += 1;
  // Good signs — factory indicators
  if(txt.includes('工厂') || txt.includes('factory')) score -= 3;
  if(txt.includes('厂家')) score -= 3;
  if(txt.includes('oem') || txt.includes('odm')) score -= 3;
  if(txt.includes('源头')) score -= 2;
  if(txt.includes('直销')) score -= 2;
  if(txt.includes('moq') || txt.includes('最低起订')) score -= 2;
  if(txt.includes('生产') || txt.includes('manufacture')) score -= 2;
  if(item.is_factory_like) score -= 3;
  return Math.max(0, Math.min(10, score + 5));
}

// Auto-inject middleman score into cards
const _origBuildCard2 = buildCard;

// Price Estimator — estimates factory price vs retail
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

// ── PRICE MARGIN CALCULATOR (Research tab) ───────────────────────
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
      <div class="margin-item"><div class="margin-val">¥${r.estimatedFactory}</div><div class="margin-lbl">Est. Factory Price</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--g)">${r.margin}%</div><div class="margin-lbl">Est. Margin</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--a)">¥${r.moq10Cost}</div><div class="margin-lbl">MOQ 10 Cost</div></div>
      <div class="margin-item"><div class="margin-val" style="color:var(--c)">$${profit.toFixed(0)}</div><div class="margin-lbl">Profit at qty ${qty}</div></div>
    </div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:8px">⚠ Estimates only — actual factory prices vary. Use as negotiation baseline.</div>
  `;
}

// ── WECHAT BULK MANAGER ──────────────────────────────────────────
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
  if(!wcContacts.length){ list.innerHTML='<div class="admin-empty">No WeChats saved yet — they appear here when you copy from results</div>'; return; }
  list.innerHTML = wcContacts.map((c,i)=>`
    <div class="wc-manager-row">
      <div class="wc-manager-id" onclick="navigator.clipboard.writeText('${c.id}').then(()=>showToast('Copied ${c.id}!'))">${c.id}</div>
      <div class="wc-manager-src">${c.source||'—'}</div>
      <div class="wc-manager-prod">${c.product||'—'}</div>
      <select class="wc-status-select" onchange="wcContacts[${i}].status=this.value;saveWCContacts()" style="background:rgba(0,0,0,.4);border:1px solid var(--b);border-radius:5px;color:var(--text);font-family:var(--mono);font-size:9px;padding:2px 4px">
        <option value="new" ${c.status==='new'?'selected':''}>New</option>
        <option value="added" ${c.status==='added'?'selected':''}>Added</option>
        <option value="replied" ${c.status==='replied'?'selected':''}>Replied</option>
        <option value="dead" ${c.status==='dead'?'selected':''}>Dead</option>
      </select>
      <div class="crm-row-del" onclick="wcContacts.splice(${i},1);saveWCContacts();renderWCManager()">✕</div>
    </div>
  `).join('');
}

function exportWCList(){
  const text = wcContacts.map(c=>`${c.id} | ${c.product||''} | ${c.source||''}`).join('\n');
  navigator.clipboard.writeText(text).then(()=>showToast(`✓ Copied ${wcContacts.length} WeChats`));
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

// ── KEYWORD BUILDER ──────────────────────────────────────────────
const KEYWORD_TEMPLATES = {
  'Factory Direct': '{product} 工厂 厂家直销 源头 微信号 联系方式',
  'Rep/1:1': '{product} 复刻 1:1 高仿 莆田 微信 货源',
  'Wholesale': '{product} 批发 代理 一件代发 微信 联系',
  'Xianyu Overrun': '{product} 余单 尾货 工厂清仓 闲鱼 微信',
  'WeChat Only': '{product} 微信 加微信 微信号 wx联系',
  'Passing/NFC': '{product} 过验 NFC 1:1 通过验 防伪芯片 莆田',
  'Weidian Batch': '{product} 批次 weidian 质量对比 微信',
  'Zhihu Expert': '{product} 哪家工厂 质量好 推荐 知乎',
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
        <button class="btn-primary" style="height:32px;font-size:11px;padding:0 12px" onclick="switchTab('supplier');document.getElementById('queryInput').value='${kw.replace(/'/g,"\\'")}';document.getElementById('supplierForm').dispatchEvent(new Event('submit'))">⚡ Search This</button>
      </div>
    </div>
  `;
}

// ── SUPPLIER NOTES SYNC ──────────────────────────────────────────
// Auto-save notes to server
async function saveNoteToServer(link, note){
  try{
    await fetch('/api/notes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({link, note})});
  } catch{}
}

// ── LIVE SEARCH SUGGESTIONS ──────────────────────────────────────
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

// ── SEARCH HISTORY ANALYTICS ─────────────────────────────────────
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
      <div class="wc-manager-prod" style="color:var(--text3)">click to re-run →</div>
    </div>
  `).join('');
}

// ── INIT ALL TOOLS ────────────────────────────────────────────────
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

// ── SHIPPING CALCULATOR ───────────────────────────────────────────
const SHIP_RATES = {
  usa: [
    {name:'Line Haul',base:3.5,per:3.2,days:'12-20',risk:'low'},
    {name:'EMS',base:8,per:6.5,days:'7-14',risk:'med'},
    {name:'DHL/FedEx',base:15,per:12,days:'3-7',risk:'high'},
    {name:'Sea Freight',base:50,per:1.8,days:'30-45',risk:'low'},
  ],
  uk: [
    {name:'Line Haul',base:4,per:4,days:'10-18',risk:'low'},
    {name:'EMS',base:9,per:7,days:'8-15',risk:'med'},
    {name:'DHL/FedEx',base:18,per:14,days:'3-6',risk:'high'},
    {name:'Sea Freight',base:60,per:2,days:'25-40',risk:'low'},
  ],
  eu: [
    {name:'Line Haul',base:4.5,per:4.5,days:'10-20',risk:'low'},
    {name:'EMS',base:10,per:8,days:'8-16',risk:'med'},
    {name:'DHL/FedEx',base:20,per:15,days:'3-7',risk:'high'},
    {name:'Sea Freight',base:65,per:2.2,days:'28-42',risk:'low'},
  ],
  au: [
    {name:'Line Haul',base:5,per:5,days:'12-22',risk:'low'},
    {name:'EMS',base:10,per:8.5,days:'8-15',risk:'med'},
    {name:'DHL/FedEx',base:22,per:16,days:'4-8',risk:'high'},
    {name:'Sea Freight',base:70,per:2.5,days:'20-35',risk:'low'},
  ],
  ca: [
    {name:'Line Haul',base:4,per:4,days:'12-22',risk:'low'},
    {name:'EMS',base:9,per:7.5,days:'8-16',risk:'med'},
    {name:'DHL/FedEx',base:20,per:14,days:'4-8',risk:'high'},
    {name:'Sea Freight',base:60,per:2,days:'30-45',risk:'low'},
  ],
};

function calcShipping(){
  const weight = parseFloat(document.getElementById('shipWeight')?.value || 0);
  const dest = document.getElementById('shipDest')?.value || 'usa';
  const result = document.getElementById('shipResult');
  if(!weight || !result) return;
  const methods = SHIP_RATES[dest] || SHIP_RATES.usa;
  result.innerHTML = `
    <div class="ship-result-grid">
      ${methods.map(m=>{
        const cost = (m.base + m.per * weight).toFixed(2);
        return `
          <div class="ship-method">
            <div class="ship-method-name">${m.name}</div>
            <div class="ship-method-price">$${cost}</div>
            <div class="ship-method-time">${m.days} days</div>
            <div class="ship-method-risk risk-${m.risk}">${m.risk.toUpperCase()} RISK</div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:8px">
      ⚠ Estimates only — actual rates vary by forwarder. Low risk = less customs scrutiny for sensitive goods.
    </div>
  `;
}

// ── SEARCH SUGGESTIONS INIT ──────────────────────────────────────
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

// ── NOTES API ────────────────────────────────────────────────────
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

// ── QUICK SEARCH SHORTCUT ─────────────────────────────────────────
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

// ── PRIVATE AGENT DEEP SEARCH ─────────────────────────────────────
async function runPrivateAgentSearch(){
  const dest = document.getElementById('ffPrivateDest')?.value || '美国';
  const results = document.getElementById('ffPrivateResults');
  const hint = document.getElementById('ffPrivateHint');
  if(!results) return;

  // These are the actual coded terms private agents use on Chinese platforms
  const queries = [
    `私人货代 ${dest} 微信 包税 不查验`,
    `私人代理 敏感货 ${dest} 专线 微信联系`,
    `特货专线 ${dest} 莆田发货 微信 私包`,
    `仿牌货代 ${dest} 私人转运 包清关 联系`,
    `莆田 私人货代 ${dest} 低调包装 微信`,
    `敏感货 私人代理 ${dest} 专线 微信号`,
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
    results.innerHTML = '<div class="empty">No private agents found — they use very private channels. Try asking your supplier directly or checking rep Discord servers.</div>';
    return;
  }

  // Sort by WeChat presence first
  allResults.sort((a,b)=> (b.wechat_ids?.length||0) - (a.wechat_ids?.length||0));
  allResults.forEach((item,i)=> results.appendChild(buildCard(item,i)));

  if(hint){ hint.textContent = `Found ${allResults.length} results across ${queries.length} private agent queries`; }
  showToast(`Found ${allResults.length} potential private agents`);
}
