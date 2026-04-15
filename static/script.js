"use strict";

// ── Typing hero title ─────────────────────────────────────────────
(function(){
  const el = document.getElementById("heroTitle");
  const text = "SourceFinder";
  let i = 0;
  el.innerHTML = '<span class="cursor"></span>';
  const type = () => {
    if (i < text.length) {
      el.innerHTML = text.slice(0, ++i) + '<span class="cursor"></span>';
      setTimeout(type, 80 + Math.random() * 60);
    } else {
      setTimeout(() => { el.querySelector(".cursor")?.remove(); }, 1200);
    }
  };
  setTimeout(type, 400);
})();

// ── Interactive particle canvas ───────────────────────────────────
(function(){
  const canvas = document.getElementById("bg-canvas");
  const ctx    = canvas.getContext("2d");
  let W, H, dots = [], mouse = { x: -999, y: -999 }, mouseSpeed = 0, lastX = -999, lastY = -999;

  const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
  const mk = () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 2 + 0.3,
    vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
    baseVx: 0, baseVy: 0,
    hue: Math.random() > .7 ? 200 + Math.random() * 60 : 195,
    a: Math.random() * .45 + .07,
  });

  const init = () => {
    resize();
    dots = Array.from({ length: 150 }, mk);
    dots.forEach(d => { d.baseVx = d.vx; d.baseVy = d.vy; });
  };

  const frame = () => {
    ctx.clearRect(0, 0, W, H);

    // Mouse speed for extra scatter
    const dx = mouse.x - lastX, dy = mouse.y - lastY;
    mouseSpeed = Math.min(Math.sqrt(dx * dx + dy * dy), 30);
    lastX = mouse.x; lastY = mouse.y;

    for (const d of dots) {
      const mdx = d.x - mouse.x, mdy = d.y - mouse.y;
      const dist = Math.sqrt(mdx * mdx + mdy * mdy);
      const repel = 130 + mouseSpeed * 2;
      if (dist < repel) {
        const force = ((repel - dist) / repel) * (0.5 + mouseSpeed * 0.02);
        d.vx += (mdx / dist) * force * 0.8;
        d.vy += (mdy / dist) * force * 0.8;
      }
      d.vx += (d.baseVx - d.vx) * 0.035;
      d.vy += (d.baseVy - d.vy) * 0.035;
      const speed = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
      if (speed > 4) { d.vx = d.vx / speed * 4; d.vy = d.vy / speed * 4; }

      d.x += d.vx; d.y += d.vy;
      if (d.x < -4) d.x = W + 4; else if (d.x > W + 4) d.x = -4;
      if (d.y < -4) d.y = H + 4; else if (d.y > H + 4) d.y = -4;

      const proximity = Math.max(0, 1 - dist / 200);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + proximity * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${d.hue}, 80%, 80%, ${Math.min(d.a + proximity * 0.5, 0.92)})`;
      ctx.fill();
    }

    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i], b = dots[j];
        const ddx = a.x - b.x, ddy = a.y - b.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 110) {
          const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
          const mdist = Math.sqrt((midX-mouse.x)**2 + (midY-mouse.y)**2);
          const boost = Math.max(0, 1 - mdist / 180) * .18;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(100,190,255,${(0.055 + boost) * (1 - dist / 110)})`;
          ctx.lineWidth = 0.5 + boost * 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  };

  window.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener("mouseleave", () => { mouse.x = -999; mouse.y = -999; });
  window.addEventListener("resize", resize);
  init(); frame();
})();

// ── Platform keyword hints ────────────────────────────────────────
const SUPPLIER_INJECT = {
  "baidu":"工厂 厂家 OEM ODM manufacturer","1688":"1688 厂家直销 批发",
  "xianyu":"闲鱼 库存 尾货","xiaohongshu":"小红书 源头厂家","taobao":"淘宝 厂家店",
  "made-in-china":"made-in-china.com OEM","globalsources":"globalsources.com supplier","wechat":"微信 一手货源",
};
const FF_INJECT    = { "baidu":"货代 freight forwarder FOB","1688":"1688 货代","globalsources":"globalsources freight" };
const PASS_INJECT  = { "baidu":"passing NFC芯片 过货 莆田 1:1" };

// ── State ─────────────────────────────────────────────────────────
const state = {
  supplier: { pageNum:1, variation:0, seenLinks:new Set(), results:[], loading:false, lastParams:null },
  ff:       { pageNum:1, variation:0, seenLinks:new Set(), results:[], loading:false, lastParams:null },
  passing:  { pageNum:1, variation:0, seenLinks:new Set(), results:[], loading:false, lastParams:null },
};

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
}));

// ── Chips ─────────────────────────────────────────────────────────
function initChips(cid, hid) {
  const c = document.getElementById(cid), h = document.getElementById(hid);
  c.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    c.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    chip.classList.add("active"); h.value = chip.dataset.platform;
  }));
}
initChips("supplierChips","supplierPlatform");
initChips("ffChips","ffPlatform");
initChips("passingChips","passingPlatform");

// ── Query hints ───────────────────────────────────────────────────
function updateHint(brand, query, platformEl, hintEl, injectMap) {
  const q=query.value.trim(), b=brand?brand.value.trim():"", inj=injectMap[platformEl.value]||"";
  hintEl.innerHTML = q ? `<b>Baidu query:</b> ${[b,q,inj].filter(Boolean).join(" ")}` : "";
}
const bI=document.getElementById("brandInput"), qI=document.getElementById("queryInput"), sP=document.getElementById("supplierPlatform"), sH=document.getElementById("supplierHint");
const ffQ=document.getElementById("ffQuery"), ffO=document.getElementById("ffOrigin"), ffP=document.getElementById("ffPlatform"), ffH=document.getElementById("ffHint");
const pB=document.getElementById("passingBrand"), pQ=document.getElementById("passingQuery"), pP=document.getElementById("passingPlatform"), pH=document.getElementById("passingHint");
[bI,qI].forEach(el=>el.addEventListener("input",()=>updateHint(bI,qI,sP,sH,SUPPLIER_INJECT)));
document.getElementById("supplierChips").addEventListener("click",()=>setTimeout(()=>updateHint(bI,qI,sP,sH,SUPPLIER_INJECT),10));
[ffQ,ffO].forEach(el=>el&&el.addEventListener("input",()=>updateHint(ffO,ffQ,ffP,ffH,FF_INJECT)));
document.getElementById("ffChips").addEventListener("click",()=>setTimeout(()=>updateHint(ffO,ffQ,ffP,ffH,FF_INJECT),10));
[pB,pQ].forEach(el=>el&&el.addEventListener("input",()=>updateHint(pB,pQ,pP,pH,PASS_INJECT)));

// ── Status ────────────────────────────────────────────────────────
function setStatus(dotId, txtId, msg, s="idle") {
  const d=document.getElementById(dotId), t=document.getElementById(txtId);
  t.textContent=msg; t.className="status-txt"+(s==="error"?" error":"");
  d.className="status-dot"+(s==="active"?" active":s==="error"?" error":"");
}
function showLoader(el, msg) {
  el.innerHTML=`<div class="loader"><div class="loader-dots"><span></span><span></span><span></span></div>${msg||"Searching..."}</div>`;
}

// ── Copy toast ────────────────────────────────────────────────────
function copyToast(text) {
  navigator.clipboard.writeText(text).catch(()=>{});
  const t=document.createElement("div"); t.className="copy-toast"; t.textContent=`Copied: ${text}`;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2000);
}

// ── WeChat chip ───────────────────────────────────────────────────
function wcChip(w) {
  const isQR=w.source==="qr", isOCR=w.source==="ocr";
  const cls=isQR?"wc-qr":isOCR?"wc-ocr":w.quality>=3?"wc-verified":w.quality===2?"wc-okay":"wc-weak";
  const lbl=isQR?"QR":isOCR?"OCR":w.quality>=3?"✓":w.quality===2?"~":"?";
  const conf=w.confidence||0;
  const d=document.createElement("div");
  d.className=`contact-chip ${cls}`;
  d.title=`${isQR?"Found via QR":isOCR?"Found via OCR (image text)":w.quality>=3?"Looks legit":w.quality===2?"Possibly valid":"Unverified"} · Confidence ${Math.round(conf*100)}%`;
  d.innerHTML=`${lbl} ${w.id}<div class="confidence-bar" style="width:${Math.round(conf*100)}%"></div>`;
  d.addEventListener("click", ()=>copyToast(w.id));
  return d;
}

// ── Card builder ──────────────────────────────────────────────────
function buildCard(item, index) {
  const score=item.factory_score??0;
  const wechats=item.wechat_ids||[];
  const hasQR=wechats.some(w=>w.source==="qr");
  const hasOCR=wechats.some(w=>w.source==="ocr");
  const allWeak=wechats.length>0&&!wechats.some(w=>w.quality>=3);
  const card=document.createElement("article");
  card.className="result-card"+(allWeak&&!item.emails?.length&&!item.phones?.length?" unverified":"");
  card.style.animationDelay=`${index*.04}s`;
  card.dataset.score=score;
  card.dataset.hasContact=item.has_contact?"1":"0";
  card.dataset.hasWechat=(wechats.length>0)?"1":"0";
  card.dataset.verifiedWechat=item.has_verified_wechat?"1":"0";
  card.dataset.qrWechat=hasQR?"1":"0";
  card.dataset.ocrWechat=hasOCR?"1":"0";
  card.dataset.factoryLike=item.is_factory_like?"1":"0";
  const sc=score>=8?"tag-high":score>=4?"tag-mid":"tag-low";
  const varTag=item.variation>0?`<span class="tag" style="color:#a78bfa;background:rgba(167,139,250,.07);border:1px solid rgba(167,139,250,.14)">var${item.variation}</span>`:"";
  card.innerHTML=`
    <div class="card-header">
      <h3 class="card-title"><a href="${item.link||"#"}" target="_blank" rel="noopener noreferrer">${item.title||"Untitled"}</a></h3>
      <div class="card-tags">
        ${item.deep_scanned?'<span class="deep-badge">deep</span>':""}
        ${varTag}
        <span class="tag tag-platform">${item.platform||""}</span>
        <span class="tag ${sc}">score ${score}</span>
      </div>
    </div>
    <p class="card-link">${item.link||""}</p>
    <p class="card-snippet">${item.snippet||"No description available."}</p>`;
  const contacts=document.createElement("div"); contacts.className="card-contacts";
  wechats.forEach(w=>contacts.appendChild(wcChip(w)));
  (item.phones||[]).forEach(p=>{const e=document.createElement("div");e.className="contact-chip contact-phone";e.textContent=p;e.title="Click to copy";e.addEventListener("click",()=>copyToast(p));contacts.appendChild(e)});
  (item.emails||[]).forEach(e=>{const el=document.createElement("div");el.className="contact-chip contact-email";el.textContent=e;el.title="Click to copy";el.addEventListener("click",()=>copyToast(e));contacts.appendChild(el)});
  if(contacts.children.length) card.appendChild(contacts);
  if(allWeak&&!item.deep_scanned){
    const n=document.createElement("p");n.className="unverified-note";
    n.textContent="WeChat found but unverified. Enable Deep Scan to OCR + QR scan images.";
    card.appendChild(n);
  }
  return card;
}

// ── Filters ───────────────────────────────────────────────────────
function applyFilters(resultsId, filtersId) {
  const bar=document.getElementById(filtersId), res=document.getElementById(resultsId);
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
function initFilters(fbid, rid) {
  const bar=document.getElementById(fbid);
  bar.querySelectorAll(".filter-pill").forEach(pill=>pill.addEventListener("click",()=>{
    bar.querySelectorAll(".filter-pill").forEach(p=>p.classList.remove("active"));
    pill.classList.add("active"); applyFilters(rid,fbid);
  }));
  const slider=document.getElementById("scoreFilter"), sv=document.getElementById("scoreVal");
  if(slider) slider.addEventListener("input",()=>{ if(sv) sv.textContent=slider.value; applyFilters(rid,fbid); });
}
initFilters("supplierFilters","supplierResults");
initFilters("ffFilters","ffResults");
initFilters("passingFilters","passingResults");

// ── Refresh bar ───────────────────────────────────────────────────
function buildRefreshBar(tabKey, total) {
  const bar=document.createElement("div"); bar.className="refresh-bar"; bar.id=`${tabKey}RefreshBar`;
  const s=state[tabKey];
  const sb=document.createElement("button"); sb.className="btn-refresh btn-refresh-simple";
  sb.innerHTML=`<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13 3v5h-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Load more (page ${s.pageNum+1})`;
  sb.addEventListener("click",()=>doRefresh(tabKey,"simple"));
  const smb=document.createElement("button"); smb.className="btn-refresh btn-refresh-smart";
  smb.innerHTML=`<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5l3.5-.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Smart refresh (new keywords)`;
  smb.addEventListener("click",()=>doRefresh(tabKey,"smart"));
  const info=document.createElement("span"); info.className="refresh-info"; info.textContent=`${total} results loaded`;
  bar.appendChild(sb); bar.appendChild(smb); bar.appendChild(info);
  return bar;
}

// ── Core fetch ────────────────────────────────────────────────────
async function fetchSearch(params) {
  const r=await fetch("/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(params)});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"Search failed.");
  return data;
}

// ── Run search ────────────────────────────────────────────────────
async function runSearch({query,brand,platform,mode,deep_scan,wechat_only,btnId,dotId,statusId,resultsId,filtersId,hintId,platformLabel}) {
  const tabKey=mode==="ff"?"ff":mode==="passing"?"passing":"supplier";
  const s=state[tabKey];
  s.pageNum=1; s.variation=0; s.seenLinks.clear(); s.results=[];
  const btn=document.getElementById(btnId), res=document.getElementById(resultsId), bar=document.getElementById(filtersId);
  btn.disabled=true; res.innerHTML=""; bar.style.display="none";
  document.getElementById(`${tabKey}RefreshBar`)?.remove();
  showLoader(res, deep_scan?`Deep scanning — OCR + QR on every image (~1-2 min)`:`Searching ${platformLabel} via Baidu...`);
  setStatus(dotId, statusId, deep_scan?"Deep scanning...":"Searching...", "active");
  try {
    const data=await fetchSearch({query,brand,platform,mode,deep_scan,wechat_only,page_num:1,variation:0,seen_links:[]});
    res.innerHTML="";
    const results=data.results||[];
    if(!results.length){res.innerHTML=`<div class="empty">No results. Try different keywords or platform.</div>`;setStatus(dotId,statusId,"No results.","idle");return}
    bar.style.display="flex";
    bar.querySelectorAll(".filter-pill").forEach((p,i)=>p.classList.toggle("active",i===0));
    const slider=document.getElementById("scoreFilter"),sv=document.getElementById("scoreVal");
    if(slider){slider.value=0;if(sv)sv.textContent="0"}
    results.forEach((item,i)=>{s.seenLinks.add(item.link);res.appendChild(buildCard(item,i))});
    s.results=results;
    const verified=results.filter(r=>r.has_verified_wechat).length;
    const qrFound=results.reduce((a,r)=>a+(r.wechat_ids||[]).filter(w=>w.source==="qr").length,0);
    const ocrFound=results.reduce((a,r)=>a+(r.wechat_ids||[]).filter(w=>w.source==="ocr").length,0);
    setStatus(dotId,statusId,`${results.length} results · ${verified} verified · ${qrFound} QR · ${ocrFound} OCR`,"active");
    if(results[0]?.baidu_query)document.getElementById(hintId).innerHTML=`<b>Baidu query used:</b> ${results[0].baidu_query}`;
    res.appendChild(buildRefreshBar(tabKey,results.length));
    s.lastParams={query,brand,platform,mode,deep_scan,wechat_only,btnId,dotId,statusId,resultsId,filtersId,hintId,platformLabel};
  } catch(err){res.innerHTML="";setStatus(dotId,statusId,err.message||"Error.","error")}
  finally{btn.disabled=false}
}

// ── Refresh ───────────────────────────────────────────────────────
async function doRefresh(tabKey, type) {
  const s=state[tabKey];
  if(s.loading||!s.lastParams) return;
  s.loading=true;
  const p=s.lastParams, res=document.getElementById(p.resultsId);
  document.getElementById(`${tabKey}RefreshBar`)?.remove();
  const loaderDiv=document.createElement("div");loaderDiv.className="loader";
  loaderDiv.innerHTML=`<div class="loader-dots"><span></span><span></span><span></span></div>${type==="smart"?"Smart refresh — new keywords...":"Loading next page..."}`;
  res.appendChild(loaderDiv);
  const pageNum=type==="simple"?s.pageNum+1:1;
  const variation=type==="smart"?s.variation+1:s.variation;
  setStatus(p.dotId,p.statusId,type==="smart"?"Smart refresh...":"Loading more...","active");
  try {
    const data=await fetchSearch({query:p.query,brand:p.brand,platform:p.platform,mode:p.mode,deep_scan:p.deep_scan,wechat_only:p.wechat_only,page_num:pageNum,variation,seen_links:[...s.seenLinks]});
    loaderDiv.remove();
    const newResults=data.results||[];
    if(!newResults.length){
      const empty=document.createElement("div");empty.className="empty";empty.style.padding="20px";
      empty.textContent=type==="smart"?"No new results with these keywords.":"No more results on this page.";
      res.appendChild(empty);setStatus(p.dotId,p.statusId,"No new results.","idle");
    } else {
      const start=s.results.length;
      newResults.forEach((item,i)=>{s.seenLinks.add(item.link);res.appendChild(buildCard(item,start+i))});
      s.results.push(...newResults);
      if(type==="simple") s.pageNum=pageNum; else s.variation=variation;
      const verified=s.results.filter(r=>r.has_verified_wechat).length;
      setStatus(p.dotId,p.statusId,`${s.results.length} total · ${verified} verified`,"active");
    }
    res.appendChild(buildRefreshBar(tabKey,s.results.length));
  } catch(err){loaderDiv.remove();setStatus(p.dotId,p.statusId,err.message||"Refresh failed.","error");res.appendChild(buildRefreshBar(tabKey,s.results.length))}
  finally{s.loading=false}
}

// ── Forms ─────────────────────────────────────────────────────────
document.getElementById("supplierForm").addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:qI.value.trim(),brand:bI.value.trim(),platform:sP.value,mode:"supplier",
    deep_scan:document.getElementById("supplierDeepScan").checked,
    wechat_only:document.getElementById("supplierWcOnly").checked,
    btnId:"supplierBtn",dotId:"supplierDot",statusId:"supplierStatus",
    resultsId:"supplierResults",filtersId:"supplierFilters",hintId:"supplierHint",
    platformLabel:document.querySelector("#supplierChips .chip.active")?.textContent||"Baidu"});
});

document.getElementById("ffForm").addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:ffQ.value.trim(),brand:ffO.value.trim(),platform:ffP.value,mode:"ff",
    deep_scan:document.getElementById("ffDeepScan").checked,wechat_only:false,
    btnId:"ffBtn",dotId:"ffDot",statusId:"ffStatus",
    resultsId:"ffResults",filtersId:"ffFilters",hintId:"ffHint",
    platformLabel:document.querySelector("#ffChips .chip.active")?.textContent||"Baidu"});
});

document.getElementById("passingForm").addEventListener("submit",e=>{
  e.preventDefault();
  runSearch({query:pQ.value.trim(),brand:pB.value.trim(),platform:pP.value,mode:"passing",
    deep_scan:document.getElementById("passingDeepScan").checked,
    wechat_only:document.getElementById("passingWcOnly").checked,
    btnId:"passingBtn",dotId:"passingDot",statusId:"passingStatus",
    resultsId:"passingResults",filtersId:"passingFilters",hintId:"passingHint",
    platformLabel:"Baidu"});
});
