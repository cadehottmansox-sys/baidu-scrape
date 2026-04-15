"""
SourceFinder searcher — everything goes through Baidu.
Supports quick mode, deep scan, page offset (load more), and smart query variation.
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

# Smart query variation pools — rotate through these on refresh
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

SUPPLIER_TERMS = [
    "factory","manufacturer","oem","odm","supplier","wholesale",
    "工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源",
]
FF_TERMS = [
    "freight","forwarder","logistics","shipping","customs","clearance",
    "货代","物流","运输","清关","报关","fob","cif","exw","dhl","fedex",
]
CONTACT_TERMS = [
    "wechat","weixin","vx","微信","whatsapp","contact","phone","tel","email","邮箱",
]

WECHAT_VALID   = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{5,19}$")
WECHAT_GARBAGE = re.compile(r"(1234|aaaa|test|demo|fake|xxxx|0000|abcd)", re.I)
QR_IMG_RE      = re.compile(r"(qr|weixin|wechat|二维码|扫码)", re.I)


def _wechat_quality(wid):
    if not WECHAT_VALID.match(wid): return 0
    if WECHAT_GARBAGE.search(wid): return 1
    if re.search(r"[a-zA-Z]", wid) and re.search(r"[0-9]", wid) and len(wid) >= 8: return 3
    return 2


def _extract_wechat_from_qr(text):
    for pat in [
        re.compile(r"weixin://dl/business/\?t=([a-zA-Z0-9_-]+)", re.I),
        re.compile(r"(?:wechat|weixin|微信)[:：\s]+([a-zA-Z0-9_-]{5,20})", re.I),
    ]:
        m = pat.search(text)
        if m: return m.group(1)
    s = text.strip()
    return s if WECHAT_VALID.match(s) else None


def _contacts(text):
    wc_re    = re.compile(r"(?:wechat|weixin|vx|微信|wx)[:：\s#]*([a-zA-Z0-9_-]{5,20})", re.I)
    email_re = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
    phone_re = re.compile(r"(?:\+?86[-\s]?)?(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})")
    raw_wc   = list(set(m.group(1) for m in wc_re.finditer(text)))
    return {
        "wechat_ids": sorted([{"id": w, "quality": _wechat_quality(w)} for w in raw_wc], key=lambda x: x["quality"], reverse=True),
        "emails":     sorted(set(email_re.findall(text))),
        "phones":     sorted(set(m.group(0) for m in phone_re.finditer(text))),
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
    terms = FF_TERMS if mode == "ff" else SUPPLIER_TERMS
    s     = sum(2 for t in terms if t in text)
    s    += sum(1 for t in CONTACT_TERMS if t in text)
    return s


def _href(raw):
    try: return unquote(raw) if raw else ""
    except: return raw or ""


def _build_query(query, brand, platform, mode, variation=0):
    """
    Build Baidu query. variation=0 is the base query.
    variation>0 picks different keyword combos from pools for refresh.
    """
    lookup = FF_KEYWORDS if mode == "ff" else PLATFORM_KEYWORDS
    cfg    = lookup.get(platform, list(lookup.values())[0])
    base   = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()

    if variation == 0:
        return f"{base} {cfg['inject']}".strip()

    # Smart variation: pick different terms from variation pools
    pools = FF_VARIATION_POOLS if mode == "ff" else SUPPLIER_VARIATION_POOLS
    rng   = random.Random(variation)  # seeded so same variation# = same query
    picks = [rng.choice(pool) for pool in pools]
    extra = " ".join(picks[:3 + (variation % 2)])  # vary how many terms too
    return f"{base} {extra}".strip()


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


async def _deep_scan_page(page, url, timeout):
    all_c = {"wechat_ids": [], "emails": [], "phones": []}
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(1.0)
        body  = await page.inner_text("body")
        all_c = _merge_contacts(all_c, _contacts(body))

        if QR_AVAILABLE:
            imgs = await page.locator("img").all()
            for img in imgs[:20]:
                try:
                    src = await img.get_attribute("src") or ""
                    alt = await img.get_attribute("alt") or ""
                    cls = await img.get_attribute("class") or ""
                    combined = f"{src} {alt} {cls}"
                    if not QR_IMG_RE.search(combined):
                        box = await img.bounding_box()
                        if not box: continue
                        ratio = box["width"] / box["height"] if box["height"] else 0
                        if not (0.7 < ratio < 1.3 and box["width"] > 60): continue
                    img_bytes = await img.screenshot()
                    decoded   = qr_decode(Image.open(io.BytesIO(img_bytes)))
                    for qr in decoded:
                        qr_text = qr.data.decode("utf-8", errors="ignore")
                        wc_id   = _extract_wechat_from_qr(qr_text)
                        if wc_id:
                            existing = {w["id"] for w in all_c["wechat_ids"]}
                            if wc_id not in existing:
                                all_c["wechat_ids"].append({"id": wc_id, "quality": 3, "source": "qr"})
                        all_c = _merge_contacts(all_c, _contacts(qr_text))
                except: continue
    except Exception as e:
        logger.warning("Deep scan failed for %s: %s", url, e)
    all_c["wechat_ids"].sort(key=lambda x: x["quality"], reverse=True)
    return all_c


async def search_platform(query, brand="", platform="baidu", mode="supplier", deep_scan=False, page_num=1, variation=0, seen_links=None):
    """
    Args:
        page_num:   Baidu page number (1 = first 10, 2 = next 10, etc.) for simple load more
        variation:  0 = original query, 1-N = smart keyword variation for refresh
        seen_links: set of already-shown links to deduplicate on refresh
    """
    lookup     = FF_KEYWORDS if mode == "ff" else PLATFORM_KEYWORDS
    cfg        = lookup.get(platform, list(lookup.values())[0])
    full_q     = _build_query(query, brand, platform, mode, variation)
    seen_links = set(seen_links or [])
    max_r      = int(os.getenv("MAX_RESULTS", "10"))
    headless   = os.getenv("HEADLESS", "true").lower() != "false"
    timeout    = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS", "30000"))
    delay      = float(os.getenv("ACTION_DELAY_SECONDS", "1.2"))
    ua         = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

    # Baidu page offset: pn=0 is page 1, pn=10 is page 2, etc.
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
                if not title: continue
                if href in seen_links: continue  # skip dupes on refresh

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
                        item.update({
                            "wechat_ids": merged["wechat_ids"],
                            "emails":     merged["emails"],
                            "phones":     merged["phones"],
                            "deep_scanned": True,
                            "wechat_quality": max((w["quality"] for w in merged["wechat_ids"]), default=0),
                            "has_verified_wechat": max((w["quality"] for w in merged["wechat_ids"]), default=0) >= 3,
                            "has_contact": bool(merged["wechat_ids"] or merged["emails"] or merged["phones"]),
                        })
                    except Exception as e:
                        logger.warning("Deep scan error: %s", e)
                await deep_page.close()
                results.sort(key=lambda r: r["factory_score"] * 2 + r["wechat_quality"], reverse=True)

        finally:
            await ctx.close()
            await browser.close()

    return results
