"""
SourceFinder searcher — everything goes through Baidu.
Platform chips inject the right Chinese keywords.
Supports deep scan (OCR + QR on every image), wechat_only filter,
page offset, and smart query variation for refresh.
No API keys. No logins.
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
    logger.warning("pyzbar/Pillow not available — QR decoding disabled")

try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.warning("pytesseract not available — OCR disabled")

PLATFORM_KEYWORDS = {
    "baidu":         {"label": "Baidu",         "inject": "工厂 厂家 制造商 供应商 OEM ODM manufacturer factory"},
    "1688":          {"label": "1688",           "inject": "1688 厂家直销 批发 一件代发 工厂"},
    "xianyu":        {"label": "Xianyu",         "inject": "闲鱼 库存 尾货 工厂清货 批发"},
    "xiaohongshu":   {"label": "Xiaohongshu",    "inject": "小红书 厂家 供应商 源头厂家"},
    "taobao":        {"label": "Taobao",         "inject": "淘宝 厂家店 工厂直营 批发"},
    "made-in-china": {"label": "Made-in-China",  "inject": "made-in-china.com manufacturer supplier OEM"},
    "globalsources": {"label": "Global Sources", "inject": "globalsources.com supplier manufacturer verified"},
    "wechat":        {"label": "WeChat",         "inject": "微信 厂家 货源 一手货源 供应商"},
}

FF_KEYWORDS = {
    "baidu":         {"label": "Baidu",         "inject": "货代公司 freight forwarder 中国出口 国际运输 清关 FOB CIF"},
    "1688":          {"label": "1688",           "inject": "1688 货代 freight agent 国际物流 报关"},
    "globalsources": {"label": "Global Sources", "inject": "globalsources freight forwarder logistics china shipping"},
}

PASSING_KEYWORDS = {
    "baidu": {"label": "Baidu", "inject": "莆田 passing NFC芯片 防伪芯片 过货 验货 高仿 1:1 复刻"},
}

SUPPLIER_TERMS = [
    "factory","manufacturer","oem","odm","supplier","wholesale",
    "工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源",
]
FF_TERMS = [
    "freight","forwarder","logistics","shipping","customs","clearance",
    "货代","物流","运输","清关","报关","fob","cif","exw","dhl","fedex",
]
PASSING_TERMS = [
    "passing","nfc","芯片","过货","验货","防伪","莆田","1:1","高仿","复刻",
]
CONTACT_TERMS = [
    "wechat","weixin","vx","微信","whatsapp","contact","phone","tel","email","邮箱","加v","加微",
]

WECHAT_VALID   = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{5,19}$")
WECHAT_GARBAGE = re.compile(r"(1234|aaaa|test|demo|fake|xxxx|0000|abcd)", re.I)
QR_IMG_RE      = re.compile(r"(qr|weixin|wechat|二维码|扫码)", re.I)

WECHAT_PATTERNS = [
    re.compile(r"(?:wechat|weixin|微信|wx|vx|加v|加微|v信)[\s:：#\-]*([a-zA-Z0-9_-]{5,20})", re.I),
    re.compile(r"加[Vv][\s:：]*([a-zA-Z0-9_-]{5,20})"),
    re.compile(r"微信号[\s:：]*([a-zA-Z0-9_-]{5,20})"),
]

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"(?:\+?86[-\s]?)?(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})")

SUPPLIER_VARIATION_POOLS = [
    ["工厂", "厂家", "制造商", "供应商", "生产厂家"],
    ["OEM", "ODM", "定制", "代工"],
    ["批发", "一件代发", "直销", "货源"],
    ["manufacturer", "factory", "supplier", "wholesale"],
    ["微信", "联系", "报价", "合作"],
]
FF_VARIATION_POOLS = [
    ["货代", "货运代理", "国际物流"],
    ["freight forwarder", "shipping agent", "logistics"],
    ["FOB", "CIF", "EXW", "DDP"],
    ["清关", "报关", "海关"],
    ["DHL", "FedEx", "sea freight", "air freight"],
]


def _wechat_quality(wid):
    if not WECHAT_VALID.match(wid): return 0
    if WECHAT_GARBAGE.search(wid): return 1
    if re.search(r"[a-zA-Z]", wid) and re.search(r"[0-9]", wid) and len(wid) >= 8: return 3
    return 2


def _extract_wechat_all(text):
    found = set()
    for pat in WECHAT_PATTERNS:
        for m in pat.finditer(text):
            wid = m.group(1).strip()
            if WECHAT_VALID.match(wid) and not WECHAT_GARBAGE.search(wid):
                found.add(wid)
    return list(found)


def _extract_wechat_from_qr(text):
    for pat in [
        re.compile(r"weixin://dl/business/\?t=([a-zA-Z0-9_-]+)", re.I),
        re.compile(r"(?:wechat|weixin|微信)[:：\s]+([a-zA-Z0-9_-]{5,20})", re.I),
    ]:
        m = pat.search(text)
        if m: return m.group(1)
    s = text.strip()
    return s if WECHAT_VALID.match(s) else None


def _wechat_confidence(w):
    base = {3: 0.85, 2: 0.60, 1: 0.25, 0: 0.0}.get(w.get("quality", 0), 0.0)
    bonus = {"qr": 0.15, "ocr": 0.10, "text": 0.0}.get(w.get("source", "text"), 0.0)
    return min(round(base + bonus, 2), 1.0)


def _contacts(text):
    raw_wc = _extract_wechat_all(text)
    wc_list = [{"id": w, "quality": _wechat_quality(w), "source": "text"} for w in raw_wc]
    wc_list.sort(key=lambda x: x["quality"], reverse=True)
    for w in wc_list:
        w["confidence"] = _wechat_confidence(w)
    return {
        "wechat_ids": wc_list,
        "emails":     sorted(set(EMAIL_RE.findall(text))),
        "phones":     sorted(set(m.group(0) for m in PHONE_RE.finditer(text))),
    }


def _merge_contacts(a, b):
    seen = {w["id"] for w in a["wechat_ids"]}
    merged = list(a["wechat_ids"])
    for w in b["wechat_ids"]:
        if w["id"] not in seen:
            merged.append(w); seen.add(w["id"])
    merged.sort(key=lambda x: x["quality"], reverse=True)
    return {
        "wechat_ids": merged,
        "emails":     sorted(set(a["emails"]) | set(b["emails"])),
        "phones":     sorted(set(a["phones"]) | set(b["phones"])),
    }


def _score(title, snippet, link, mode):
    text  = f"{title} {snippet} {link}".lower()
    terms = FF_TERMS if mode == "ff" else (PASSING_TERMS if mode == "passing" else SUPPLIER_TERMS)
    s     = sum(2 for t in terms if t in text)
    s    += sum(1 for t in CONTACT_TERMS if t in text)
    return s


def _href(raw):
    try: return unquote(raw) if raw else ""
    except: return raw or ""


def _build_query(query, brand, platform, mode, variation=0):
    if mode == "ff":
        lookup = FF_KEYWORDS
    elif mode == "passing":
        lookup = PASSING_KEYWORDS
    else:
        lookup = PLATFORM_KEYWORDS
    cfg  = lookup.get(platform, list(lookup.values())[0])
    base = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()
    if variation == 0:
        return f"{base} {cfg['inject']}".strip()
    pools = FF_VARIATION_POOLS if mode == "ff" else SUPPLIER_VARIATION_POOLS
    rng   = random.Random(variation)
    picks = [rng.choice(pool) for pool in pools][:3 + (variation % 2)]
    return f"{base} {' '.join(picks)}".strip()


def _find_chromium():
    cache = Path.home() / "Library" / "Caches" / "ms-playwright"
    for pat in ["chromium-*/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
                "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium"]:
        for p in sorted(cache.glob(pat), reverse=True):
            if p.exists(): return str(p)
    return None


async def _launch(pw, headless):
    try:
        return await pw.chromium.launch(headless=headless)
    except Exception as exc:
        if "Executable doesn't exist" not in str(exc): raise
        path = _find_chromium()
        if path: return await pw.chromium.launch(headless=headless, executable_path=path)
        raise


async def _scan_image(img_bytes):
    found = []
    if not (QR_AVAILABLE or OCR_AVAILABLE):
        return found
    try:
        pil_img = Image.open(io.BytesIO(img_bytes))
    except Exception:
        return found

    if QR_AVAILABLE:
        try:
            for qr in qr_decode(pil_img):
                qr_text = qr.data.decode("utf-8", errors="ignore")
                wc_id   = _extract_wechat_from_qr(qr_text)
                if wc_id and not any(f["id"] == wc_id for f in found):
                    found.append({"id": wc_id, "quality": 3, "source": "qr", "confidence": 1.0})
                for wid in _extract_wechat_all(qr_text):
                    if not any(f["id"] == wid for f in found):
                        q = _wechat_quality(wid)
                        found.append({"id": wid, "quality": q, "source": "qr", "confidence": _wechat_confidence({"quality": q, "source": "qr"})})
        except Exception as e:
            logger.debug("QR error: %s", e)

    if OCR_AVAILABLE:
        try:
            w, h = pil_img.size
            if w < 400:
                scale = 400 // w + 1
                pil_img = pil_img.resize((w * scale, h * scale), Image.LANCZOS)
            for psm in [6, 11, 3]:
                try:
                    ocr_text = pytesseract.image_to_string(pil_img, lang="chi_sim+eng", config=f"--psm {psm} --oem 3")
                    for wid in _extract_wechat_all(ocr_text):
                        if not any(f["id"] == wid for f in found):
                            q = _wechat_quality(wid)
                            found.append({"id": wid, "quality": q, "source": "ocr", "confidence": _wechat_confidence({"quality": q, "source": "ocr"})})
                    if ocr_text.strip(): break
                except Exception:
                    continue
        except Exception as e:
            logger.debug("OCR error: %s", e)

    return found


async def _deep_scan_page(page, url, timeout):
    all_c = {"wechat_ids": [], "emails": [], "phones": []}
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(1.0)

        body = await page.inner_text("body")
        all_c = _merge_contacts(all_c, _contacts(body))

        imgs = await page.locator("img").all()
        for img in imgs[:30]:
            try:
                img_bytes = await img.screenshot()
                if len(img_bytes) < 500: continue
                wc_list = await _scan_image(img_bytes)
                for wc in wc_list:
                    if not any(w["id"] == wc["id"] for w in all_c["wechat_ids"]):
                        all_c["wechat_ids"].append(wc)
                if OCR_AVAILABLE:
                    try:
                        pil_img  = Image.open(io.BytesIO(img_bytes))
                        ocr_text = pytesseract.image_to_string(pil_img, lang="chi_sim+eng", config="--psm 6")
                        c = _contacts(ocr_text)
                        all_c["emails"] = sorted(set(all_c["emails"]) | set(c["emails"]))
                        all_c["phones"] = sorted(set(all_c["phones"]) | set(c["phones"]))
                    except Exception:
                        pass
            except Exception:
                continue
    except Exception as e:
        logger.warning("Deep scan failed for %s: %s", url[:60], e)
    all_c["wechat_ids"].sort(key=lambda x: x["quality"], reverse=True)
    return all_c


async def search_platform(
    query,
    brand="",
    platform="baidu",
    mode="supplier",
    deep_scan=False,
    wechat_only=False,
    page_num=1,
    variation=0,
    seen_links=None,
):
    if mode == "ff":
        lookup = FF_KEYWORDS
    elif mode == "passing":
        lookup = PASSING_KEYWORDS
    else:
        lookup = PLATFORM_KEYWORDS

    cfg        = lookup.get(platform, list(lookup.values())[0])
    full_q     = _build_query(query, brand, platform, mode, variation)
    seen_links = set(seen_links or [])
    max_r      = int(os.getenv("MAX_RESULTS", "10"))
    headless   = os.getenv("HEADLESS", "true").lower() != "false"
    timeout    = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS", "30000"))
    delay      = float(os.getenv("ACTION_DELAY_SECONDS", "1.2"))
    ua         = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

    pn         = (page_num - 1) * 10
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

                sn      = block.locator(".c-abstract, .content-right_8Zs40, .c-span-last").first
                snippet = (await sn.inner_text()).strip() if await sn.count() > 0 else ""

                c       = _contacts(f"{title}\n{snippet}\n{href}")
                sc      = _score(title, snippet, href, mode)
                best_wq = max((w["quality"] for w in c["wechat_ids"]), default=0)

                results.append({
                    "title": title, "link": href or search_url, "snippet": snippet,
                    "wechat_ids": c["wechat_ids"], "emails": c["emails"], "phones": c["phones"],
                    "factory_score": sc, "wechat_quality": best_wq,
                    "has_contact": bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat": best_wq >= 3,
                    "is_factory_like": sc >= 3,
                    "platform": cfg["label"], "baidu_query": full_q, "mode": mode,
                    "deep_scanned": False, "page_num": page_num, "variation": variation,
                })

            results.sort(key=lambda r: r["factory_score"] * 2 + r["wechat_quality"], reverse=True)

            if deep_scan:
                deep_page = await ctx.new_page()
                for item in results:
                    try:
                        extra  = await _deep_scan_page(deep_page, item["link"], timeout)
                        merged = _merge_contacts(
                            {"wechat_ids": item["wechat_ids"], "emails": item["emails"], "phones": item["phones"]},
                            extra,
                        )
                        best_wq = max((w["quality"] for w in merged["wechat_ids"]), default=0)
                        item.update({
                            "wechat_ids":          merged["wechat_ids"],
                            "emails":              merged["emails"],
                            "phones":              merged["phones"],
                            "deep_scanned":        True,
                            "wechat_quality":      best_wq,
                            "has_verified_wechat": best_wq >= 3,
                            "has_contact":         bool(merged["wechat_ids"] or merged["emails"] or merged["phones"]),
                        })
                    except Exception as e:
                        logger.warning("Deep scan error: %s", e)
                await deep_page.close()
                results.sort(key=lambda r: r["factory_score"] * 2 + r["wechat_quality"], reverse=True)

            if wechat_only:
                results = [r for r in results if r["wechat_ids"]]

        finally:
            await ctx.close()
            await browser.close()

    return results
