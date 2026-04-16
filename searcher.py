"""
SourceFinder searcher — multi-platform, all-in-one mode.
Platforms: Baidu, Yupoo, 1688 (via Baidu), RedNote (via Baidu), Weidian,
           Bilibili, Pinduoduo, KakoBuy spreadsheets, ImportYeti, All-in-one.
"""

import asyncio
import io
import logging
import os
import random
import re
from pathlib import Path
from urllib.parse import quote_plus, unquote, urlparse

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    from pyzbar.pyzbar import decode as qr_decode
    QR_AVAILABLE = True
except ImportError:
    QR_AVAILABLE = False

try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

# ── Platform configs ──────────────────────────────────────────────
# Rep keywords added to all platforms — factories that make "reps" often make authentic too
REP_INJECT = "复刻 高仿 1:1 莆田 代工 原单 余单 工厂货 专柜 真标 rep replica fashionreps"

PLATFORM_KEYWORDS = {
    "baidu":         {"label":"Baidu",         "inject":f"工厂 厂家 制造商 供应商 OEM ODM manufacturer factory 微信 联系方式 {REP_INJECT}"},
    "1688":          {"label":"1688",           "inject":f"1688 厂家直销 批发 一件代发 工厂 微信 联系方式 {REP_INJECT}"},
    "xianyu":        {"label":"Xianyu",         "inject":f"闲鱼 库存 尾货 工厂清货 批发 微信 {REP_INJECT}"},
    "xiaohongshu":   {"label":"Xiaohongshu",    "inject":f"小红书 厂家 供应商 源头厂家 微信 联系 {REP_INJECT}"},
    "taobao":        {"label":"Taobao",         "inject":f"淘宝 厂家店 工厂直营 批发 微信 {REP_INJECT}"},
    "weidian":       {"label":"Weidian",        "inject":f"微店 weidian 店铺 厂家 微信 联系 {REP_INJECT}"},
    "pinduoduo":     {"label":"Pinduoduo",      "inject":f"拼多多 工厂店 厂家直营 源头工厂 微信 {REP_INJECT}"},
    "bilibili":      {"label":"Bilibili",       "inject":f"bilibili B站 工厂 厂家 开箱 微信 联系方式 {REP_INJECT}"},
    "yupoo":         {"label":"Yupoo",          "inject":f"yupoo 相册 工厂 厂家 微信 联系 {REP_INJECT}"},
    "made-in-china": {"label":"Made-in-China",  "inject":"made-in-china.com manufacturer supplier OEM"},
    "globalsources": {"label":"Global Sources", "inject":"globalsources.com supplier manufacturer verified"},
    "wechat":        {"label":"WeChat",         "inject":f"微信号 加微信 联系方式 供应商 厂家直销 {REP_INJECT}"},
    "reddit":        {"label":"Reddit",         "inject":"reddit fashionreps designerreps supplier wechat factory rep replica"},
    "importyeti":    {"label":"ImportYeti",     "inject":"importyeti.com factory supplier manufacturer china"},
}

FF_KEYWORDS = {
    "baidu":         {"label":"Baidu",         "inject":"货代公司 freight forwarder 国际运输 清关 FOB CIF 微信"},
    "1688":          {"label":"1688",           "inject":"1688 货代 freight agent 国际物流 报关"},
    "globalsources": {"label":"Global Sources", "inject":"globalsources freight forwarder logistics china"},
}

PASSING_KEYWORDS = {
    "baidu": {"label":"Baidu", "inject":"莆田 passing NFC芯片 防伪芯片 过货 验货 高仿 1:1 复刻 微信"},
}

# All-in-one: single smart Baidu query that hits all platforms at once
# Baidu indexes all these platforms so one query surfaces results from all of them
ALL_IN_ONE_INJECT = "工厂 厂家 微信 联系方式 yupoo 1688 小红书 微店 weidian 源头 ODM OEM 供应商 复刻 高仿 1:1 莆田 余单 原单"
ALL_IN_ONE_INJECT_2 = "passing NFC 莆田 代工厂 一手货源 微信号 加v 联系 fashionreps replica rep 复刻 工厂货"

SUPPLIER_TERMS = ["factory","manufacturer","oem","odm","supplier","wholesale","工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源","复刻","高仿","1:1","余单","原单","rep","replica","fashionreps","莆田","代工"]
FF_TERMS       = ["freight","forwarder","logistics","shipping","customs","货代","物流","运输","清关","报关","fob","cif","dhl","fedex"]
PASSING_TERMS  = ["passing","nfc","芯片","过货","验货","防伪","莆田","1:1","高仿","复刻"]
CONTACT_TERMS  = ["wechat","weixin","vx","微信","whatsapp","phone","tel","email","邮箱","加v","加微","联系方式"]

WECHAT_VALID   = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{5,19}$")
WECHAT_GARBAGE = re.compile(r"(1234|aaaa|test|demo|fake|xxxx|0000|abcd)", re.I)
WECHAT_PATTERNS = [
    re.compile(r"(?:wechat|weixin|微信|wx号|vx|加v|加微|v信|微信号|扫码加|联系微信|wx)[\s:：#\-「」【】]*([a-zA-Z0-9_-]{5,20})", re.I),
    re.compile(r"加[Vv][\s:：「」【】]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"微信[：:号码id ID]*[\s]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"(?:wx|VX|WX)[\s:：#]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"联系方式[\s:：]*([a-zA-Z0-9_-]{5,20})"),
]
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"(?:\+?86[-\s]?)?(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})")

SUPPLIER_POOLS=[["工厂","厂家","制造商"],["OEM","ODM","定制"],["批发","直销","货源"],["manufacturer","factory","supplier"],["微信","联系","报价"]]
FF_POOLS=[["货代","货运代理"],["freight forwarder","shipping agent"],["FOB","CIF","EXW"],["清关","报关"],["DHL","sea freight"]]

# Blocked domains
BLOCKED_DOMAINS = {
    "nike.com","jordan.com","adidas.com","yeezy.com","newbalance.com",
    "puma.com","reebok.com","underarmour.com","vans.com","converse.com",
    "gucci.com","louisvuitton.com","lv.com","chanel.com","prada.com",
    "balenciaga.com","supreme.com","off-white.com","bape.com",
    "amazon.com","amazon.cn","ebay.com","tmall.com","jd.com",
    "stockx.com","goat.com","kickscrew.com","flightclub.com",
    "wikipedia.org","baidu.com","google.com","youtube.com",
    "instagram.com","facebook.com","twitter.com","x.com","tiktok.com",
    "gov.cn","gov.com","edu.cn","edu.com",
}

def _is_blocked(url):
    if not url: return False
    try:
        host = urlparse(url).netloc.lower().lstrip("www.")
        return any(host == d or host.endswith("."+d) for d in BLOCKED_DOMAINS)
    except: return False

def _wq(wid):
    if not WECHAT_VALID.match(wid): return 0
    if WECHAT_GARBAGE.search(wid): return 1
    if re.search(r"[a-zA-Z]",wid) and re.search(r"[0-9]",wid) and len(wid)>=8: return 3
    return 2

def _conf(w):
    base={3:0.85,2:0.60,1:0.25,0:0.0}.get(w.get("quality",0),0.0)
    bonus={"qr":0.15,"ocr":0.10,"text":0.0}.get(w.get("source","text"),0.0)
    return min(round(base+bonus,2),1.0)

def _extract_wc(text):
    found=set()
    for pat in WECHAT_PATTERNS:
        for m in pat.finditer(text):
            wid=m.group(1).strip().rstrip("。，、）)】")
            if len(wid)>=5 and WECHAT_VALID.match(wid) and not WECHAT_GARBAGE.search(wid):
                found.add(wid)
    return list(found)

def _contacts(text):
    raw=[{"id":w,"quality":_wq(w),"source":"text"} for w in _extract_wc(text)]
    raw.sort(key=lambda x:x["quality"],reverse=True)
    for w in raw: w["confidence"]=_conf(w)
    return {
        "wechat_ids":raw,
        "emails":sorted(set(EMAIL_RE.findall(text))),
        "phones":sorted(set(m.group(0) for m in PHONE_RE.finditer(text))),
    }

def _merge(a,b):
    seen={w["id"] for w in a["wechat_ids"]}
    merged=list(a["wechat_ids"])
    for w in b["wechat_ids"]:
        if w["id"] not in seen: merged.append(w); seen.add(w["id"])
    merged.sort(key=lambda x:x["quality"],reverse=True)
    return {
        "wechat_ids":merged,
        "emails":sorted(set(a["emails"])|set(b["emails"])),
        "phones":sorted(set(a["phones"])|set(b["phones"])),
    }

def _score(title,snippet,link,mode):
    text=f"{title} {snippet} {link}".lower()
    terms=FF_TERMS if mode=="ff" else (PASSING_TERMS if mode=="passing" else SUPPLIER_TERMS)
    s=sum(2 for t in terms if t in text)
    s+=sum(1 for t in CONTACT_TERMS if t in text)
    return s

def _href(raw):
    """Keep Baidu redirect URLs as-is — Playwright will follow them."""
    try: return raw.strip() if raw else ""
    except: return raw or ""

async def _resolve_baidu_redirect(page, url, timeout=10000):
    """Follow a Baidu redirect link to get the actual destination URL."""
    if not url or "baidu.com/link" not in url:
        return url
    try:
        resp = await page.goto(url, wait_until="commit", timeout=timeout)
        # After redirect, get the actual URL we landed on
        final_url = page.url
        if final_url and "baidu.com" not in final_url:
            return final_url
        return url
    except:
        return url

def _build_query(query, brand, platform, mode, variation=0, inject_override=None):
    if inject_override:
        base = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()
        return f"{base} {inject_override}".strip()
    lookup = FF_KEYWORDS if mode=="ff" else (PASSING_KEYWORDS if mode=="passing" else PLATFORM_KEYWORDS)
    cfg    = lookup.get(platform, list(lookup.values())[0])
    base   = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()
    if variation==0: return f"{base} {cfg['inject']}".strip()
    pools  = FF_POOLS if mode=="ff" else SUPPLIER_POOLS
    rng    = random.Random(variation)
    picks  = [rng.choice(pool) for pool in pools][:3+(variation%2)]
    return f"{base} {' '.join(picks)}".strip()

def _find_chromium():
    cache=Path.home()/"Library"/"Caches"/"ms-playwright"
    for pat in ["chromium-*/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
                "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium"]:
        for p in sorted(cache.glob(pat),reverse=True):
            if p.exists(): return str(p)
    return None

async def _launch(pw, headless):
    try: return await pw.chromium.launch(headless=headless)
    except Exception as exc:
        if "Executable doesn't exist" not in str(exc): raise
        path=_find_chromium()
        if path: return await pw.chromium.launch(headless=headless,executable_path=path)
        raise

async def _deep_scan_page(page, url, nav_timeout=22000):
    result={"wechat_ids":[],"emails":[],"phones":[]}
    try:
        # Step 1: resolve Baidu redirect to get actual URL
        actual_url = url
        if "baidu.com/link" in url:
            try:
                await page.goto(url, wait_until="commit", timeout=10000)
                await asyncio.sleep(0.5)
                actual_url = page.url
                logger.info("Resolved redirect: %s -> %s", url[:40], actual_url[:60])
            except Exception as e:
                logger.debug("Redirect resolve failed: %s", e)
                actual_url = url

        # Step 2: if we're not on the actual page yet, navigate to it
        if actual_url != page.url or "baidu.com" in page.url:
            try:
                await page.goto(actual_url, wait_until="domcontentloaded", timeout=nav_timeout)
            except:
                try: await page.goto(actual_url, wait_until="commit", timeout=nav_timeout)
                except Exception as e:
                    logger.debug("Nav failed %s: %s", actual_url[:50], e)
                    return result

        await asyncio.sleep(1.0)
        logger.info("Deep scanning actual page: %s", page.url[:80])

        # Full text
        try:
            body = await page.inner_text("body")
            result = _merge(result, _contacts(body))
        except: pass

        # Full HTML (catches hidden elements, JS vars, data attrs)
        try:
            html = await page.content()
            result = _merge(result, _contacts(html))
        except: pass

        # Image alt/title text
        try:
            img_data = await page.evaluate("""() => [...document.querySelectorAll('img')].map(i=>({
                alt:i.alt||'',title:i.title||'',src:i.src||'',
                cls:i.className||'',w:i.naturalWidth||i.width||0,h:i.naturalHeight||i.height||0
            }))""")
            for img in img_data:
                combined = f"{img['alt']} {img['title']} {img['src']}"
                result = _merge(result, _contacts(combined))
        except: img_data=[]

        # QR decode on square images
        if QR_AVAILABLE and img_data:
            qr_candidates = [i for i in img_data if
                i['w']>60 and i['h']>60 and i['w']<800 and i['src']
                and not i['src'].endswith('.gif')
                and (
                    any(k in i['src'].lower() for k in ['qr','weixin','wechat','wx'])
                    or any(k in (i['alt']+i['cls']).lower() for k in ['二维码','扫码','qr'])
                    or (i['w']>0 and i['h']>0 and 0.7<i['w']/i['h']<1.3 and i['w']>80)
                )
            ][:12]

            for img in qr_candidates:
                try:
                    el=page.locator(f"img[src='{img['src']}']").first
                    if await el.count()==0: continue
                    img_bytes=await asyncio.wait_for(el.screenshot(),timeout=5)
                    if len(img_bytes)<500: continue
                    pil=Image.open(io.BytesIO(img_bytes))
                    for qr in qr_decode(pil):
                        qt=qr.data.decode("utf-8",errors="ignore")
                        qr_c=_contacts(qt)
                        for w in qr_c["wechat_ids"]:
                            w["source"]="qr"; w["quality"]=max(w["quality"],3); w["confidence"]=1.0
                        result=_merge(result,qr_c)
                except: continue

        # OCR on images
        if OCR_AVAILABLE and img_data:
            ocr_cands=[i for i in img_data if i['w']>100 and i['h']>80 and i['src'] and not i['src'].endswith('.gif')][:6]
            for img in ocr_cands:
                try:
                    el=page.locator(f"img[src='{img['src']}']").first
                    if await el.count()==0: continue
                    img_bytes=await asyncio.wait_for(el.screenshot(),timeout=5)
                    if len(img_bytes)<500: continue
                    pil=Image.open(io.BytesIO(img_bytes))
                    w,h=pil.size
                    if w<200: pil=pil.resize((w*2,h*2),Image.LANCZOS)
                    txt=pytesseract.image_to_string(pil,lang="chi_sim+eng",config="--psm 6 --oem 3")
                    if txt.strip():
                        oc=_contacts(txt)
                        for w2 in oc["wechat_ids"]: w2["source"]="ocr"
                        result=_merge(result,oc)
                except: continue

    except Exception as e:
        logger.warning("Deep scan failed %s: %s", url[:50], e)

    result["wechat_ids"].sort(key=lambda x:x["quality"],reverse=True)
    return result


async def _scrape_yupoo(page, query, brand, timeout=25000):
    """Scrape Yupoo directly — albums almost always have WeChat in description."""
    results=[]
    search_q = f"{brand} {query}".strip() if brand else query
    url = f"https://www.yupoo.com/search/?q={quote_plus(search_q)}&tab=album"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(1.5)

        # Get album links
        links = await page.evaluate("""() => {
            return [...document.querySelectorAll('a[href*="/photos/"]')]
                .map(a=>a.href).filter(h=>h.includes('yupoo.com')).slice(0,8);
        }""")

        for link in links:
            try:
                await page.goto(link, wait_until="domcontentloaded", timeout=timeout)
                await asyncio.sleep(0.8)
                # Get page text + album description
                text = await page.inner_text("body")
                html = await page.content()
                combined = text + html
                c = _contacts(combined)
                if not c["wechat_ids"] and not c["emails"] and not c["phones"]:
                    continue
                title_el = page.locator("h1, .album-title, .username").first
                title = (await title_el.inner_text()).strip() if await title_el.count()>0 else link
                results.append({
                    "title": title, "link": link, "snippet": text[:200],
                    "wechat_ids": c["wechat_ids"], "emails": c["emails"], "phones": c["phones"],
                    "factory_score": _score(title, text[:200], link, "supplier"),
                    "wechat_quality": max((w["quality"] for w in c["wechat_ids"]),default=0),
                    "has_contact": bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat": any(w["quality"]>=3 for w in c["wechat_ids"]),
                    "is_factory_like": True,
                    "platform": "Yupoo", "baidu_query": url, "mode": "supplier",
                    "deep_scanned": True, "page_num": 1, "variation": 0,
                })
            except: continue
    except Exception as e:
        logger.warning("Yupoo scrape error: %s", e)
    return results


async def _scrape_importyeti(page, brand, timeout=25000):
    """Scrape ImportYeti for verified factory names, then search them on Baidu."""
    factories=[]
    url = f"https://www.importyeti.com/company/{quote_plus(brand.lower().replace(' ','-'))}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)
        text = await page.inner_text("body")
        # Extract Chinese company names
        cn_pattern = re.compile(r'[\u4e00-\u9fff]{2,}(?:有限公司|工厂|制造|鞋业|服装|科技|实业|贸易)', re.U)
        en_pattern = re.compile(r'[A-Z][A-Z\s]{5,50}(?:CO\.|LTD|LIMITED|FACTORY|MFG|MANUFACTURING)', re.I)
        factories = list(set(cn_pattern.findall(text) + en_pattern.findall(text)))[:10]
        logger.info("ImportYeti found %d factories for %s", len(factories), brand)
    except Exception as e:
        logger.warning("ImportYeti error: %s", e)
    return factories


async def scan_single(url):
    """Scan a single URL — per-card scan button."""
    headless=os.getenv("HEADLESS","true").lower()!="false"
    timeout=int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","25000"))
    ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(user_agent=ua)
        page=await ctx.new_page()
        try: result=await _deep_scan_page(page,url,nav_timeout=timeout)
        finally: await ctx.close(); await browser.close()
    return result


async def _baidu_search(page, full_q, max_r, timeout, delay, seen_links, platform_label, mode, page_num=1):
    """Run a single Baidu search and return results."""
    results=[]
    pn=(page_num-1)*10
    url=f"https://www.baidu.com/s?wd={quote_plus(full_q)}&pn={pn}"
    try:
        # Go directly to search URL — more reliable than going home first each time
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        try: await page.wait_for_selector("#content_left", timeout=min(timeout, 15000))
        except: pass
        await asyncio.sleep(max(0.6, delay * 0.5))  # shorter delay in all-in-one

        blocks=page.locator("#content_left > div.result, #content_left > div.c-container")
        total=await blocks.count()

        for i in range(total):
            if len(results)>=max_r: break
            block=blocks.nth(i)
            tn=block.locator("h3 a").first
            if await tn.count()==0: continue
            title=(await tn.inner_text()).strip()
            href=_href((await tn.get_attribute("href") or "").strip())
            if not title or href in seen_links or _is_blocked(href): continue
            sn=block.locator(".c-abstract,.content-right_8Zs40,.c-span-last").first
            snippet=(await sn.inner_text()).strip() if await sn.count()>0 else ""
            # Also scrape any contact info visible in the Baidu snippet
            c=_contacts(f"{title}\n{snippet}\n{href}")
            sc=_score(title,snippet,href,mode)
            best_wq=max((w["quality"] for w in c["wechat_ids"]),default=0)
            results.append({
                "title":title,"link":href or url,"snippet":snippet,
                "wechat_ids":c["wechat_ids"],"emails":c["emails"],"phones":c["phones"],
                "factory_score":sc,"wechat_quality":best_wq,
                "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                "has_verified_wechat":best_wq>=3,"is_factory_like":sc>=3,
                "platform":platform_label,"baidu_query":full_q,"mode":mode,
                "deep_scanned":False,"page_num":page_num,"variation":0,
            })
    except Exception as e:
        logger.warning("Baidu search error: %s", e)
    return results


async def search_platform(
    query, brand="", platform="baidu", mode="supplier",
    deep_scan=False, wechat_only=False,
    page_num=1, variation=0, seen_links=None,
):
    lookup    = FF_KEYWORDS if mode=="ff" else (PASSING_KEYWORDS if mode=="passing" else PLATFORM_KEYWORDS)
    seen_links= set(seen_links or [])
    max_r     = int(os.getenv("MAX_RESULTS","10"))
    headless  = os.getenv("HEADLESS","true").lower()!="false"
    timeout   = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","30000"))
    delay     = float(os.getenv("ACTION_DELAY_SECONDS","1.0"))
    ua        = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    results   = []

    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(user_agent=ua)
        page=await ctx.new_page()

        try:
            await page.goto("https://www.baidu.com", wait_until="domcontentloaded", timeout=timeout)
            await asyncio.sleep(delay)

            # ── All-in-one mode ──────────────────────────────────
            # Single browser session, two smart queries that cover all platforms
            if platform == "all":
                seen_all = set(seen_links)
                base = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()

                # Query 1: factory/supplier focused across all platforms
                q1 = f"{base} {ALL_IN_ONE_INJECT}"
                r1 = await _baidu_search(page, q1, max_r, timeout, delay, seen_all, "All-in-One", mode)
                for r in r1: seen_all.add(r["link"])
                results.extend(r1)

                # Query 2: contact/WeChat focused — surfaces pages that explicitly post WeChats
                q2 = f"{base} {ALL_IN_ONE_INJECT_2}"
                r2 = await _baidu_search(page, q2, max_r // 2, timeout, delay, seen_all, "All-in-One", mode)
                for r in r2: seen_all.add(r["link"])
                results.extend(r2)

                logger.info("All-in-one: %d total results", len(results))

                # Also try Yupoo directly
                try:
                    yupoo_r = await _scrape_yupoo(page, query, brand, timeout)
                    results.extend(yupoo_r)
                except Exception as e:
                    logger.warning("Yupoo error: %s", e)

                # ImportYeti → factory names → Baidu search
                if brand:
                    try:
                        factories = await _scrape_importyeti(page, brand, timeout)
                        for factory_name in factories[:3]:
                            fq = f"{factory_name} 微信 联系方式 工厂"
                            fr = await _baidu_search(page, fq, 3, timeout, delay, seen_all, "ImportYeti", mode)
                            for r in fr:
                                r["snippet"] = f"[ImportYeti factory: {factory_name}] " + r["snippet"]
                                seen_all.add(r["link"])
                            results.extend(fr)
                    except Exception as e:
                        logger.warning("ImportYeti pipeline error: %s", e)

            # ── Yupoo direct mode ────────────────────────────────
            elif platform == "yupoo":
                results = await _scrape_yupoo(page, query, brand, timeout)

            # ── ImportYeti mode ──────────────────────────────────
            elif platform == "importyeti":
                if brand:
                    factories = await _scrape_importyeti(page, brand, timeout)
                    for factory_name in factories[:5]:
                        fq = f"{factory_name} 微信 联系方式 工厂"
                        fr = await _baidu_search(page, fq, 3, timeout, delay, seen_links, "ImportYeti", mode)
                        for r in fr:
                            r["snippet"] = f"[Factory: {factory_name}] " + r["snippet"]
                        results.extend(fr)
                else:
                    # Fall back to Baidu with importyeti inject
                    full_q = _build_query(query, brand, "importyeti", mode, variation)
                    results = await _baidu_search(page, full_q, max_r, timeout, delay, seen_links, "ImportYeti", mode, page_num)

            # ── Standard Baidu-powered modes ─────────────────────
            else:
                cfg    = lookup.get(platform, list(lookup.values())[0])
                full_q = _build_query(query, brand, platform, mode, variation)
                results= await _baidu_search(page, full_q, max_r, timeout, delay, seen_links, cfg["label"], mode, page_num)

            # ── Sort ─────────────────────────────────────────────
            results.sort(key=lambda r: r["factory_score"]*2+r["wechat_quality"], reverse=True)
            if platform != "all":
                results = results[:max_r]

            # ── Deep scan ────────────────────────────────────────
            if deep_scan:
                TOTAL_TO  = int(os.getenv("DEEP_SCAN_TOTAL_TIMEOUT","120"))
                PER_PAGE  = 22000
                start     = asyncio.get_event_loop().time()
                for item in results:
                    if asyncio.get_event_loop().time()-start > TOTAL_TO:
                        logger.info("Deep scan total timeout reached")
                        break
                    try:
                        extra  = await _deep_scan_page(page, item["link"], nav_timeout=PER_PAGE)
                        merged = _merge({"wechat_ids":item["wechat_ids"],"emails":item["emails"],"phones":item["phones"]}, extra)
                        best_wq= max((w["quality"] for w in merged["wechat_ids"]),default=0)
                        item.update({
                            "wechat_ids":merged["wechat_ids"],"emails":merged["emails"],"phones":merged["phones"],
                            "deep_scanned":True,"wechat_quality":best_wq,
                            "has_verified_wechat":best_wq>=3,
                            "has_contact":bool(merged["wechat_ids"] or merged["emails"] or merged["phones"]),
                        })
                        logger.info("Deep scanned %s — %d WeChats", item["link"][:50], len(merged["wechat_ids"]))
                    except Exception as e:
                        logger.warning("Deep scan error: %s", e)

                results.sort(key=lambda r: r["factory_score"]*2+r["wechat_quality"], reverse=True)

            if wechat_only:
                results=[r for r in results if r["wechat_ids"]]

        finally:
            await ctx.close()
            await browser.close()

    return results
