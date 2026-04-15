"""
SourceFinder searcher — Baidu-powered, all modes, reliable deep scan.
"""

import asyncio
import io
import logging
import os
import random
import re
from pathlib import Path
from urllib.parse import quote_plus, unquote

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

PLATFORM_KEYWORDS = {
    "baidu":         {"label":"Baidu",        "inject":"工厂 厂家 制造商 供应商 OEM ODM manufacturer factory"},
    "1688":          {"label":"1688",          "inject":"1688 厂家直销 批发 一件代发 工厂"},
    "xianyu":        {"label":"Xianyu",        "inject":"闲鱼 库存 尾货 工厂清货 批发"},
    "xiaohongshu":   {"label":"Xiaohongshu",   "inject":"小红书 厂家 供应商 源头厂家"},
    "taobao":        {"label":"Taobao",        "inject":"淘宝 厂家店 工厂直营 批发"},
    "made-in-china": {"label":"Made-in-China", "inject":"made-in-china.com manufacturer supplier OEM"},
    "globalsources": {"label":"Global Sources","inject":"globalsources.com supplier manufacturer verified"},
    "wechat":        {"label":"WeChat",        "inject":"微信 厂家 货源 一手货源 供应商"},
}
FF_KEYWORDS = {
    "baidu":         {"label":"Baidu",        "inject":"货代公司 freight forwarder 国际运输 清关 FOB CIF"},
    "1688":          {"label":"1688",          "inject":"1688 货代 freight agent 国际物流 报关"},
    "globalsources": {"label":"Global Sources","inject":"globalsources freight forwarder logistics china"},
}
PASSING_KEYWORDS = {
    "baidu": {"label":"Baidu","inject":"莆田 passing NFC芯片 防伪芯片 过货 验货 高仿 1:1 复刻"},
}

SUPPLIER_TERMS = ["factory","manufacturer","oem","odm","supplier","wholesale","工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源"]
FF_TERMS       = ["freight","forwarder","logistics","shipping","customs","货代","物流","运输","清关","报关","fob","cif","dhl","fedex"]
PASSING_TERMS  = ["passing","nfc","芯片","过货","验货","防伪","莆田","1:1","高仿","复刻"]
CONTACT_TERMS  = ["wechat","weixin","vx","微信","whatsapp","phone","tel","email","邮箱","加v","加微"]

WECHAT_VALID   = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{5,19}$")
WECHAT_GARBAGE = re.compile(r"(1234|aaaa|test|demo|fake|xxxx|0000|abcd)", re.I)
WECHAT_PATTERNS = [
    re.compile(r"(?:wechat|weixin|微信|wx号|vx|加v|加微|v信|微信号|扫码加|联系微信)[\s:：#\-「」【】]*([a-zA-Z0-9_-]{5,20})", re.I),
    re.compile(r"加[Vv][\s:：「」【】]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"微信[：:号码id ID]*[\s]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"(?:wx|VX|WX)[\s:：]*([a-zA-Z0-9_-]{5,20})"),
]
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"(?:\+?86[-\s]?)?(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})")

SUPPLIER_POOLS=[["工厂","厂家","制造商"],["OEM","ODM","定制"],["批发","直销","货源"],["manufacturer","factory","supplier"],["微信","联系","报价"]]
FF_POOLS=[["货代","货运代理"],["freight forwarder","shipping agent"],["FOB","CIF","EXW"],["清关","报关"],["DHL","sea freight"]]


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
            wid=m.group(1).strip().rstrip("。，、")
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
    try: return unquote(raw) if raw else ""
    except: return raw or ""

def _build_query(query,brand,platform,mode,variation=0):
    lookup=FF_KEYWORDS if mode=="ff" else (PASSING_KEYWORDS if mode=="passing" else PLATFORM_KEYWORDS)
    cfg=lookup.get(platform,list(lookup.values())[0])
    base=f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()
    if variation==0: return f"{base} {cfg['inject']}".strip()
    pools=FF_POOLS if mode=="ff" else SUPPLIER_POOLS
    rng=random.Random(variation)
    picks=[rng.choice(pool) for pool in pools][:3+(variation%2)]
    return f"{base} {' '.join(picks)}".strip()

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


async def _deep_scan_page(page, url, nav_timeout=20000):
    """
    Visit a page and extract ALL WeChat IDs, emails, phones.
    Scrapes full page text + alt text + image src attributes + page source.
    Also runs QR decode on screenshots of likely QR images.
    """
    result={"wechat_ids":[],"emails":[],"phones":[]}

    try:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=nav_timeout)
        except Exception:
            # Try with networkidle if domcontentloaded fails
            try:
                await page.goto(url, wait_until="commit", timeout=nav_timeout)
            except Exception as e:
                logger.debug("Nav failed for %s: %s", url[:50], e)
                return result

        await asyncio.sleep(1.0)

        # 1. Full visible text
        try:
            body_text = await page.inner_text("body")
            result = _merge(result, _contacts(body_text))
        except Exception:
            pass

        # 2. Full HTML source — catches WeChats in hidden elements, attributes, JS vars
        try:
            html = await page.content()
            # Extract from HTML directly (catches data attributes, script vars, etc.)
            result = _merge(result, _contacts(html))
        except Exception:
            pass

        # 3. Alt text and title attributes of images
        try:
            img_data = await page.evaluate("""() => {
                return [...document.querySelectorAll('img')].map(i => ({
                    alt: i.alt || '',
                    title: i.title || '',
                    src: i.src || '',
                    cls: i.className || '',
                    w: i.naturalWidth || i.width || 0,
                    h: i.naturalHeight || i.height || 0,
                }));
            }""")
            for img in img_data:
                combined = f"{img['alt']} {img['title']} {img['src']}"
                result = _merge(result, _contacts(combined))
        except Exception:
            img_data = []

        # 4. QR code decode on square-ish images (likely QR codes)
        if QR_AVAILABLE and img_data:
            qr_candidates = [
                img for img in img_data
                if img['w'] > 60 and img['h'] > 60
                and img['w'] < 800 and img['h'] < 800
                and img['src']
                and not img['src'].endswith('.gif')
                and (
                    'qr' in img['src'].lower() or
                    'weixin' in img['src'].lower() or
                    'wechat' in img['src'].lower() or
                    '二维码' in (img['alt']+img['cls']).lower() or
                    '扫码' in (img['alt']+img['cls']).lower() or
                    # Square-ish images are often QR codes
                    (img['w'] > 0 and img['h'] > 0 and 0.7 < img['w']/img['h'] < 1.3)
                )
            ][:10]

            for img in qr_candidates:
                try:
                    el = page.locator(f"img[src='{img['src']}']").first
                    if await el.count() == 0:
                        continue
                    img_bytes = await asyncio.wait_for(el.screenshot(), timeout=5)
                    if len(img_bytes) < 500:
                        continue
                    pil = Image.open(io.BytesIO(img_bytes))
                    decoded = qr_decode(pil)
                    for qr in decoded:
                        qt = qr.data.decode("utf-8", errors="ignore")
                        logger.info("QR decoded: %s", qt[:60])
                        qr_contacts = _contacts(qt)
                        # Boost quality for QR-sourced contacts
                        for w in qr_contacts["wechat_ids"]:
                            w["source"] = "qr"
                            w["quality"] = max(w["quality"], 3)
                            w["confidence"] = 1.0
                        result = _merge(result, qr_contacts)
                except Exception as e:
                    logger.debug("QR scan error: %s", e)
                    continue

        # 5. OCR on images if available
        if OCR_AVAILABLE and img_data:
            ocr_candidates = [
                img for img in img_data
                if img['w'] > 100 and img['h'] > 80
                and img['src']
                and not img['src'].endswith('.gif')
            ][:8]

            for img in ocr_candidates:
                try:
                    el = page.locator(f"img[src='{img['src']}']").first
                    if await el.count() == 0:
                        continue
                    img_bytes = await asyncio.wait_for(el.screenshot(), timeout=5)
                    if len(img_bytes) < 500:
                        continue
                    pil = Image.open(io.BytesIO(img_bytes))
                    w, h = pil.size
                    if w < 200:
                        pil = pil.resize((w*2, h*2), Image.LANCZOS)
                    txt = pytesseract.image_to_string(pil, lang="chi_sim+eng", config="--psm 6 --oem 3")
                    if txt.strip():
                        ocr_contacts = _contacts(txt)
                        for w in ocr_contacts["wechat_ids"]:
                            w["source"] = "ocr"
                            w["confidence"] = _conf(w)
                        result = _merge(result, ocr_contacts)
                except Exception as e:
                    logger.debug("OCR error: %s", e)
                    continue

    except Exception as e:
        logger.warning("Deep scan failed for %s: %s", url[:60], e)

    result["wechat_ids"].sort(key=lambda x: x["quality"], reverse=True)
    return result


async def scan_single(url):
    """Scan a single URL — used by per-card scan button."""
    headless = os.getenv("HEADLESS","true").lower() != "false"
    timeout  = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","25000"))
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    async with async_playwright() as p:
        browser = await _launch(p, headless)
        ctx     = await browser.new_context(user_agent=ua)
        page    = await ctx.new_page()
        try:
            result = await _deep_scan_page(page, url, nav_timeout=timeout)
        finally:
            await ctx.close()
            await browser.close()
    return result


async def search_platform(
    query, brand="", platform="baidu", mode="supplier",
    deep_scan=False, wechat_only=False,
    page_num=1, variation=0, seen_links=None,
):
    lookup    = FF_KEYWORDS if mode=="ff" else (PASSING_KEYWORDS if mode=="passing" else PLATFORM_KEYWORDS)
    cfg       = lookup.get(platform, list(lookup.values())[0])
    full_q    = _build_query(query, brand, platform, mode, variation)
    seen_links= set(seen_links or [])
    max_r     = int(os.getenv("MAX_RESULTS","10"))
    headless  = os.getenv("HEADLESS","true").lower() != "false"
    timeout   = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","30000"))
    delay     = float(os.getenv("ACTION_DELAY_SECONDS","1.2"))
    ua        = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    pn         = (page_num-1)*10
    search_url = f"https://www.baidu.com/s?wd={quote_plus(full_q)}&pn={pn}"
    results    = []

    async with async_playwright() as p:
        browser = await _launch(p, headless)
        ctx     = await browser.new_context(user_agent=ua)
        page    = await ctx.new_page()

        try:
            await page.goto("https://www.baidu.com", wait_until="domcontentloaded", timeout=timeout)
            await asyncio.sleep(delay)
            await page.goto(search_url, wait_until="domcontentloaded", timeout=timeout)
            try: await page.wait_for_selector("#content_left", timeout=timeout)
            except: pass
            await asyncio.sleep(delay)

            blocks = page.locator("#content_left > div.result, #content_left > div.c-container")
            total  = await blocks.count()

            for i in range(total):
                if len(results) >= max_r: break
                block = blocks.nth(i)
                tn    = block.locator("h3 a").first
                if await tn.count() == 0: continue
                title = (await tn.inner_text()).strip()
                href  = _href((await tn.get_attribute("href") or "").strip())
                if not title or href in seen_links: continue
                sn      = block.locator(".c-abstract,.content-right_8Zs40,.c-span-last").first
                snippet = (await sn.inner_text()).strip() if await sn.count() > 0 else ""
                c       = _contacts(f"{title}\n{snippet}\n{href}")
                sc      = _score(title, snippet, href, mode)
                best_wq = max((w["quality"] for w in c["wechat_ids"]), default=0)
                results.append({
                    "title":title, "link":href or search_url, "snippet":snippet,
                    "wechat_ids":c["wechat_ids"], "emails":c["emails"], "phones":c["phones"],
                    "factory_score":sc, "wechat_quality":best_wq,
                    "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat":best_wq>=3, "is_factory_like":sc>=3,
                    "platform":cfg["label"], "baidu_query":full_q, "mode":mode,
                    "deep_scanned":False, "page_num":page_num, "variation":variation,
                })

            results.sort(key=lambda r: r["factory_score"]*2+r["wechat_quality"], reverse=True)

            # Deep scan — reuse the same page, visit each result URL
            if deep_scan:
                TOTAL_TIMEOUT = int(os.getenv("DEEP_SCAN_TOTAL_TIMEOUT", "120"))
                PER_PAGE_TIMEOUT = 22000
                start = asyncio.get_event_loop().time()

                for item in results:
                    elapsed = asyncio.get_event_loop().time() - start
                    if elapsed > TOTAL_TIMEOUT:
                        logger.info("Deep scan total timeout (%ds) reached", TOTAL_TIMEOUT)
                        break

                    try:
                        extra  = await _deep_scan_page(page, item["link"], nav_timeout=PER_PAGE_TIMEOUT)
                        merged = _merge(
                            {"wechat_ids":item["wechat_ids"],"emails":item["emails"],"phones":item["phones"]},
                            extra
                        )
                        best_wq = max((w["quality"] for w in merged["wechat_ids"]), default=0)
                        item.update({
                            "wechat_ids":merged["wechat_ids"],
                            "emails":merged["emails"],
                            "phones":merged["phones"],
                            "deep_scanned":True,
                            "wechat_quality":best_wq,
                            "has_verified_wechat":best_wq>=3,
                            "has_contact":bool(merged["wechat_ids"] or merged["emails"] or merged["phones"]),
                        })
                        logger.info("Deep scanned %s — found %d WeChats", item["link"][:50], len(merged["wechat_ids"]))
                    except Exception as e:
                        logger.warning("Deep scan error for %s: %s", item["link"][:50], e)

                results.sort(key=lambda r: r["factory_score"]*2+r["wechat_quality"], reverse=True)

            if wechat_only:
                results = [r for r in results if r["wechat_ids"]]

        finally:
            await ctx.close()
            await browser.close()

    return results
