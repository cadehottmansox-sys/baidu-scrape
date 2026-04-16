"""
SourceFinder — Baidu via ScraperAPI with proper HTML parsing.
ScraperAPI fetches Baidu with Chinese residential IPs.
We save raw HTML to debug and parse properly.
"""

import asyncio
import io
import json
import logging
import os
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, unquote

import requests
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

# ── WeChat patterns ───────────────────────────────────────────────
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

SUPPLIER_TERMS = ["factory","manufacturer","oem","odm","supplier","wholesale","工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源","复刻","高仿","1:1","余单","原单","rep","replica","莆田","代工"]
CONTACT_TERMS  = ["wechat","weixin","vx","微信","whatsapp","phone","tel","email","邮箱","加v","加微","联系方式","微信号"]
FF_TERMS       = ["freight","forwarder","logistics","shipping","customs","货代","物流","运输","清关","报关","fob","cif","dhl","fedex"]
PASSING_TERMS  = ["passing","nfc","芯片","过货","验货","防伪","莆田","1:1","高仿","复刻"]

REP_INJECT   = "复刻 高仿 1:1 莆田 代工 原单 余单 工厂货 rep replica fashionreps"
ALL_Q1_INJECT = f"工厂 厂家 微信 联系方式 yupoo 1688 小红书 微店 weidian 源头 ODM OEM 供应商 {REP_INJECT}"
ALL_Q2_INJECT = f"passing NFC 莆田 代工厂 一手货源 微信号 加v 联系 {REP_INJECT}"

BLOCKED_DOMAINS = {
    "nike.com","jordan.com","adidas.com","yeezy.com","newbalance.com",
    "puma.com","reebok.com","vans.com","converse.com","gucci.com",
    "louisvuitton.com","lv.com","chanel.com","prada.com","balenciaga.com",
    "supreme.com","amazon.com","amazon.cn","ebay.com","tmall.com","jd.com",
    "stockx.com","goat.com","kickscrew.com","flightclub.com",
    "wikipedia.org","baidu.com","google.com","youtube.com",
    "instagram.com","facebook.com","twitter.com","x.com","tiktok.com",
    "gov.cn","gov.com","edu.cn","edu.com",
}

def _is_blocked(url):
    if not url: return False
    try:
        from urllib.parse import urlparse
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

def _find_chromium():
    cache=Path.home()/"Library"/"Caches"/"ms-playwright"
    for pat in ["chromium-*/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
                "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium"]:
        for p in sorted(cache.glob(pat),reverse=True):
            if p.exists(): return str(p)
    return None

async def _launch(pw,headless):
    try: return await pw.chromium.launch(headless=headless)
    except Exception as exc:
        if "Executable doesn't exist" not in str(exc): raise
        path=_find_chromium()
        if path: return await pw.chromium.launch(headless=headless,executable_path=path)
        raise


# ── ScraperAPI ────────────────────────────────────────────────────
def _scraper_key():
    return os.getenv("SCRAPER_API_KEY","")

def _fetch_via_scraper(url, timeout=45):
    key=_scraper_key()
    if not key: return None
    try:
        resp=requests.get(
            "http://api.scraperapi.com",
            params={"api_key":key,"url":url,"country_code":"cn","render":"false"},
            timeout=timeout,
        )
        if resp.status_code==200:
            return resp.text
        logger.warning("ScraperAPI status %d", resp.status_code)
        return None
    except Exception as e:
        logger.warning("ScraperAPI error: %s", e)
        return None


def _parse_baidu_html(html, full_q, platform_label, mode, seen_links, max_r, page_num):
    """
    Parse Baidu search result HTML.
    Tries multiple selector strategies since Baidu changes their HTML structure.
    """
    import html as html_module
    results = []
    tag_re  = re.compile(r"<[^>]+>")

    # Log a sample so we can debug
    logger.info("Parsing Baidu HTML len=%d sample=%s", len(html), html[1000:1300].replace("\n"," ")[:200])

    # Strategy 1: find <h3> tags with links (standard Baidu result)
    h3_pattern = re.compile(
        r'<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        re.S|re.I
    )
    # Strategy 2: data-log or mu attributes on divs
    mu_pattern = re.compile(r'mu="([^"]+)"', re.I)
    # Strategy 3: tpl result divs
    result_pattern = re.compile(
        r'<div[^>]+class="[^"]*result[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
        r'(?:class="[^"]*c-abstract[^"]*"[^>]*>(.*?)</)',
        re.S|re.I
    )

    found_titles = []

    # Try h3 strategy first
    for m in h3_pattern.finditer(html):
        href  = html_module.unescape(m.group(1)).strip()
        title = html_module.unescape(tag_re.sub("", m.group(2))).strip()
        # Accept any link — not just baidu.com/link redirects
        if title and href and len(title) > 3 and not _is_blocked(href):
            found_titles.append((href, title, ""))

    # If that failed try result divs
    if not found_titles:
        for m in result_pattern.finditer(html):
            href    = html_module.unescape(m.group(1)).strip()
            title   = html_module.unescape(tag_re.sub("", m.group(2))).strip()
            snippet = html_module.unescape(tag_re.sub("", m.group(3))).strip() if m.group(3) else ""
            if title and href:
                found_titles.append((href, title, snippet))

    # Extract all abstracts/snippets separately
    snippet_pattern = re.compile(
        r'class="[^"]*(?:c-abstract|content-right)[^"]*"[^>]*>(.*?)</(?:span|div|p)>',
        re.S|re.I
    )
    snippets = [html_module.unescape(tag_re.sub("",s)).strip() for s in snippet_pattern.findall(html)]

    logger.info("Found %d titles from Baidu HTML", len(found_titles))

    for i,(href,title,snippet) in enumerate(found_titles):
        if len(results) >= max_r: break
        if not title or not href: continue
        if href in seen_links or _is_blocked(href): continue
        if not snippet and i < len(snippets):
            snippet = snippets[i]
        c       = _contacts(title + "\n" + snippet + "\n" + href)
        sc      = _score(title, snippet, href, mode)
        best_wq = max((w["quality"] for w in c["wechat_ids"]),default=0)
        results.append({
            "title":title,"link":href,"snippet":snippet,
            "wechat_ids":c["wechat_ids"],"emails":c["emails"],"phones":c["phones"],
            "factory_score":sc,"wechat_quality":best_wq,
            "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
            "has_verified_wechat":best_wq>=3,"is_factory_like":sc>=3,
            "platform":platform_label,"baidu_query":full_q,"mode":mode,
            "deep_scanned":False,"page_num":page_num,"variation":0,
        })

    return results


async def _baidu_search(page, full_q, max_r, timeout, delay, seen_links, platform_label, mode, page_num=1):
    """Search Baidu via ScraperAPI (REST) with Playwright fallback."""
    results = []
    pn      = (page_num-1)*10
    url     = f"https://www.baidu.com/s?wd={quote_plus(full_q)}&pn={pn}&rn=20"

    key = _scraper_key()
    if key:
        logger.info("ScraperAPI fetching: %s", full_q[:60])
        html = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _fetch_via_scraper(url)
        )
        if html and len(html) > 2000:
            results = _parse_baidu_html(html, full_q, platform_label, mode, set(seen_links), max_r, page_num)
            logger.info("ScraperAPI parsed %d results for: %s", len(results), full_q[:40])
            if results:
                return results
            # Save HTML sample to data dir for debugging
            try:
                debug_path = Path("/app/data/debug_baidu.html")
                debug_path.parent.mkdir(exist_ok=True)
                debug_path.write_text(html[:50000])
                logger.info("Saved debug HTML to %s", debug_path)
            except: pass
        else:
            logger.warning("ScraperAPI returned short/empty HTML: %d chars", len(html) if html else 0)

    # Playwright fallback
    logger.info("Playwright fallback for: %s", full_q[:60])
    pw_results = []
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        try: await page.wait_for_selector("#content_left", timeout=15000)
        except: pass
        await asyncio.sleep(1.0)

        content_left = await page.locator("#content_left").count()
        logger.info("Playwright: content_left present=%s", content_left > 0)

        # Try multiple selectors
        for selector in [
            "#content_left > div.result",
            "#content_left > div.c-container",
            "#content_left > div",
            ".result",
            "[class*='result']",
        ]:
            blocks = page.locator(selector)
            total  = await blocks.count()
            if total > 0:
                logger.info("Playwright: found %d blocks with selector: %s", total, selector)
                break

        logger.info("Playwright: found %d result blocks", total)

        for i in range(total):
            if len(pw_results) >= max_r: break
            block = blocks.nth(i)

            # Try multiple title selectors
            title = ""
            href  = ""
            for title_sel in ["h3 a", "h3.t a", ".c-title a", "a.c-title", "a"]:
                tn = block.locator(title_sel).first
                if await tn.count() > 0:
                    t = (await tn.inner_text()).strip()
                    h = (await tn.get_attribute("href") or "").strip()
                    if t and len(t) > 3:
                        title = t
                        href  = h
                        break

            if not title: continue
            if href in seen_links or _is_blocked(href): continue

            # Snippet
            snippet = ""
            for snip_sel in [".c-abstract", ".content-right_8Zs40", ".c-span-last", "p", ".c-color-text"]:
                sn = block.locator(snip_sel).first
                if await sn.count() > 0:
                    snippet = (await sn.inner_text()).strip()
                    if snippet: break

            # Also get all text from the block
            try:
                block_text = await block.inner_text()
            except:
                block_text = ""

            combined = " ".join(filter(None, [title, snippet, block_text, href]))
            c       = _contacts(combined)
            sc      = _score(title, snippet + block_text, href, mode)
            best_wq = max((w["quality"] for w in c["wechat_ids"]),default=0)
            pw_results.append({
                "title":title,"link":href or url,"snippet":snippet,
                "wechat_ids":c["wechat_ids"],"emails":c["emails"],"phones":c["phones"],
                "factory_score":sc,"wechat_quality":best_wq,
                "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                "has_verified_wechat":best_wq>=3,"is_factory_like":sc>=3,
                "platform":platform_label,"baidu_query":full_q,"mode":mode,
                "deep_scanned":False,"page_num":page_num,"variation":0,
            })

        logger.info("Playwright: parsed %d results", len(pw_results))
        results.extend(pw_results)

    except Exception as e:
        logger.warning("Playwright search error: %s", e)

    return results


async def _deep_scan_page(page, url, nav_timeout=22000):
    """Visit actual page and extract all contacts."""
    result={"wechat_ids":[],"emails":[],"phones":[]}
    try:
        # Resolve Baidu redirect
        actual_url = url
        if "baidu.com/link" in url:
            try:
                await page.goto(url, wait_until="commit", timeout=12000)
                await asyncio.sleep(0.5)
                actual_url = page.url
                if "baidu.com" in actual_url: actual_url = url
                logger.info("Redirect: %s", actual_url[:70])
            except: pass

        # Navigate to actual page
        if actual_url != page.url:
            try:
                await page.goto(actual_url, wait_until="domcontentloaded", timeout=nav_timeout)
            except:
                try: await page.goto(actual_url, wait_until="commit", timeout=nav_timeout)
                except Exception as e:
                    logger.debug("Nav failed: %s", e)
                    return result

        await asyncio.sleep(1.0)

        # Full text
        try:
            body = await page.inner_text("body")
            result = _merge(result, _contacts(body))
        except: pass

        # Full HTML
        try:
            html = await page.content()
            result = _merge(result, _contacts(html))
        except: pass

        # Images
        try:
            img_data = await page.evaluate("""() => [...document.querySelectorAll('img')].map(i=>({
                alt:i.alt||'',title:i.title||'',src:i.src||'',
                cls:i.className||'',w:i.naturalWidth||i.width||0,h:i.naturalHeight||i.height||0
            }))""")
            for img in img_data:
                result = _merge(result, _contacts(img['alt']+" "+img['title']+" "+img['src']))
        except: img_data=[]

        # QR decode
        if QR_AVAILABLE and img_data:
            for img in [i for i in img_data if i['w']>60 and i['h']>60 and i['w']<800
                        and i['src'] and not i['src'].endswith('.gif')
                        and (any(k in i['src'].lower() for k in ['qr','weixin','wechat','wx'])
                            or any(k in (i['alt']+i.get('cls','')).lower() for k in ['二维码','扫码'])
                            or (0.7<i['w']/max(i['h'],1)<1.3 and i['w']>80))][:10]:
                try:
                    el=page.locator(f"img[src='{img['src']}']").first
                    if await el.count()==0: continue
                    ib=await asyncio.wait_for(el.screenshot(),timeout=5)
                    if len(ib)<500: continue
                    pil=Image.open(io.BytesIO(ib))
                    for qr in qr_decode(pil):
                        qt=qr.data.decode("utf-8",errors="ignore")
                        qc=_contacts(qt)
                        for w in qc["wechat_ids"]:
                            w["source"]="qr";w["quality"]=max(w["quality"],3);w["confidence"]=1.0
                        result=_merge(result,qc)
                except: continue

        # OCR
        if OCR_AVAILABLE and img_data:
            for img in [i for i in img_data if i['w']>100 and i['h']>80 and i['src'] and not i['src'].endswith('.gif')][:6]:
                try:
                    el=page.locator(f"img[src='{img['src']}']").first
                    if await el.count()==0: continue
                    ib=await asyncio.wait_for(el.screenshot(),timeout=5)
                    if len(ib)<500: continue
                    pil=Image.open(io.BytesIO(ib))
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


async def scan_single(url):
    headless=os.getenv("HEADLESS","true").lower()!="false"
    ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(user_agent=ua)
        page=await ctx.new_page()
        try: result=await _deep_scan_page(page,url)
        finally: await ctx.close(); await browser.close()
    return result


async def search_platform(
    query, brand="", platform="all", mode="supplier",
    deep_scan=False, wechat_only=False,
    page_num=1, variation=0, seen_links=None,
):
    seen_links= set(seen_links or [])
    max_r     = int(os.getenv("MAX_RESULTS","10"))
    headless  = os.getenv("HEADLESS","true").lower()!="false"
    timeout   = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","30000"))
    delay     = float(os.getenv("ACTION_DELAY_SECONDS","1.0"))
    ua        = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    results   = []

    base = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()

    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(user_agent=ua)
        page=await ctx.new_page()

        try:
            if platform=="all":
                seen_all=set(seen_links)
                q1=f"{base} {ALL_Q1_INJECT}"
                q2=f"{base} {ALL_Q2_INJECT}"
                r1=await _baidu_search(page,q1,max_r,timeout,delay,seen_all,"All-in-One",mode)
                for r in r1: seen_all.add(r["link"])
                results.extend(r1)
                r2=await _baidu_search(page,q2,max_r,timeout,delay,seen_all,"All-in-One",mode)
                for r in r2: seen_all.add(r["link"])
                results.extend(r2)
            else:
                from searcher import PLATFORMS as PLAT
                if platform in PLAT:
                    # For direct platform chips, still search via Baidu with platform keyword
                    injects = {
                        "1688": f"1688 厂家直销 批发 微信 联系方式 {REP_INJECT}",
                        "taobao": f"淘宝 厂家店 工厂 微信 {REP_INJECT}",
                        "xianyu": f"闲鱼 库存 尾货 微信 {REP_INJECT}",
                        "weidian": f"微店 weidian 厂家 微信 {REP_INJECT}",
                    }
                    inject = injects.get(platform, ALL_Q1_INJECT)
                    full_q = f"{base} {inject}"
                    results = await _baidu_search(page,full_q,max_r,timeout,delay,seen_links,platform.title(),mode,page_num)
                else:
                    full_q=f"{base} {ALL_Q1_INJECT}"
                    results=await _baidu_search(page,full_q,max_r,timeout,delay,seen_links,"Baidu",mode,page_num)

            results.sort(key=lambda r:r["factory_score"]*2+r["wechat_quality"],reverse=True)

            # Deep scan — follow every link and scrape the actual page
            if deep_scan:
                TOTAL_TO=int(os.getenv("DEEP_SCAN_TOTAL_TIMEOUT","120"))
                start=asyncio.get_event_loop().time()
                for item in results:
                    if asyncio.get_event_loop().time()-start>TOTAL_TO: break
                    try:
                        extra=await _deep_scan_page(page,item["link"],nav_timeout=22000)
                        merged=_merge({"wechat_ids":item["wechat_ids"],"emails":item["emails"],"phones":item["phones"]},extra)
                        best_wq=max((w["quality"] for w in merged["wechat_ids"]),default=0)
                        item.update({"wechat_ids":merged["wechat_ids"],"emails":merged["emails"],"phones":merged["phones"],
                            "deep_scanned":True,"wechat_quality":best_wq,"has_verified_wechat":best_wq>=3,
                            "has_contact":bool(merged["wechat_ids"] or merged["emails"] or merged["phones"])})
                        logger.info("Deep scanned %s — %d WeChats", item["link"][:50], len(merged["wechat_ids"]))
                    except Exception as e:
                        logger.warning("Deep scan error: %s", e)

                results.sort(key=lambda r:r["factory_score"]*2+r["wechat_quality"],reverse=True)

            if wechat_only:
                results=[r for r in results if r["wechat_ids"]]

        finally:
            await ctx.close()
            await browser.close()

    return results


# Keep PLATFORMS dict for chip reference
PLATFORMS = {
    "1688": {"label":"1688"},
    "taobao": {"label":"Taobao"},
    "xianyu": {"label":"Xianyu"},
    "weidian": {"label":"Weidian"},
}
