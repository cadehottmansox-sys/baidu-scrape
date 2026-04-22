"""
SourceFinder — Baidu via ScraperAPI with proper HTML parsing.
ScraperAPI fetches Baidu with Chinese residential IPs.
We save raw HTML to debug and parse properly.
"""

import asyncio

def _do_scrapingdog(query, max_results=10):
    import os, requests as _req
    api_key = os.getenv("SCRAPINGDOG_API_KEY", "")
    if not api_key: return None
    try:
        r = _req.get("https://api.scrapingdog.com/baidu/search/",
            params={"api_key": api_key, "query": query, "results": min(max_results*2,20), "country":"cn"},
            timeout=15)
        if r.status_code != 200: return None
        data = r.json()
        organic = data.get("Baidu_data") or data.get("organic_data") or data.get("organic_results") or []
        out = []
        for item in organic[:max_results]:
            t = item.get("title",""); l = item.get("link","") or item.get("url",""); s = item.get("snippet","") or item.get("description","")
            if t: out.append({"title":t,"url":l,"snippet":s})
        return out if out else None
    except Exception as e:
        return None

import io
import json
import logging
import os
import re
import time
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

# ── WeChat patterns ───────────────────────────────────────────────
# WeChat validation — letter OR digit start, 5-20 chars (pure number IDs valid)
WECHAT_VALID   = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_]{4,19}$")
WECHAT_GARBAGE = re.compile(
    r"(1234567|test|demo|fake|xxxx|0000|abcd|admin|null|none|"
    r"com|net|org|www|http|html|shop|store|tmall|taobao|jd|alibaba|"
    r"photo|image|video|thumb|click|search|token|order|price|color|size)", re.I)
WECHAT_PATTERNS = [
    re.compile(r"(?:wechat\s*id|微信号?|weixin|wx\s*id)[\s:：#\-「」【】]{0,4}([a-zA-Z0-9][a-zA-Z0-9_]{4,19})", re.I),
    re.compile(r"加[Vv微][\s:：「」【】]{0,3}([a-zA-Z0-9][a-zA-Z0-9_]{4,19})"),
    re.compile(r"(?:vx|wx)[号:：\s]{1,4}([a-zA-Z0-9][a-zA-Z0-9_]{4,19})(?!\.)"),
    re.compile(r"(?:加微信|微信联系|微信咨询|扫码加)[\s:：]{0,3}([a-zA-Z0-9][a-zA-Z0-9_]{4,19})"),
    re.compile(r"[【(（]\s*(?:wechat\s*id|微信|wx)?\s*([a-zA-Z0-9][a-zA-Z0-9_]{4,19})\s*[】)）]", re.I),
    re.compile(r"(?:recommended|推荐|contact)[\s:：]+(?:wechat|微信)?[\s:：]*([a-zA-Z0-9][a-zA-Z0-9_]{4,19})", re.I),
    re.compile(r"微信[\s:：]+([a-zA-Z0-9][a-zA-Z0-9_]{4,19})"),
    re.compile(r"(?:微信号|wx号|vx号)[：:\s]{0,3}([a-z]{2,4}\d{3,6})", re.I),
]
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"(?:\+?86[-\s]?)?(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})")

SUPPLIER_TERMS = ["factory","manufacturer","oem","odm","supplier","wholesale","工厂","厂家","制造商","供应商","批发","定制","一件代发","源头","直销","货源","复刻","高仿","1:1","余单","原单","rep","replica","莆田","代工"]
CONTACT_TERMS  = ["wechat","weixin","vx","微信","whatsapp","phone","tel","email","邮箱","加v","加微","联系方式","微信号"]
FF_TERMS       = ["freight","forwarder","logistics","shipping","customs","货代","物流","运输","清关","报关","fob","cif","dhl","fedex"]

# Rep / private agent freight keywords
FF_REP_INJECT  = (
    "私人货代 私人代理 private agent 货代 微信 转运 "
    "敏感货 仿牌 特货 莆田 私包 隐藏包装 包税 包清关 "
    "不查验 专线 特货专线 美国专线 欧洲专线 "
    "莆田发货 私人转运 低调包装 联系方式"
)
FF_SAFE_INJECT = "货代 物流 微信 转运 清关 国际快递 包税 联系方式 跨境"

# Additional search queries specifically for private agents
FF_PRIVATE_AGENT_QUERIES = [
    "莆田 私人货代 微信 美国 包税 不查验",
    "私人代理 敏感货 国际转运 微信联系 仿牌",
    "特货专线 微信 莆田发货 私包 低调",
    "private agent 货代 微信 fashionreps 转运",
    "仿牌货代 私人转运 包清关 微信号",
    "敏感货专线 私人货代 微信 报价",
]
PASSING_TERMS  = ["passing","nfc","芯片","过货","验货","防伪","莆田","1:1","高仿","复刻"]

# How passing suppliers actually advertise on Chinese platforms
PASSING_INJECT = (
    "过验 passing NFC芯片 防伪芯片 1:1 同厂 纯原 同材质 "
    "莆田 高仿 复刻 工厂 微信号 联系方式 "
    "过机场 通过验 专柜验 真标 过检"
)
PASSING_NFC_INJECT = (
    "NFC芯片 NFC防伪 扫码验真 NFC过验 NFC chip "
    "防伪芯片 工厂 微信 联系方式 莆田 过验"
)

REP_INJECT = "复刻 高仿 1:1 莆田 代工 原单 余单 工厂货 rep replica fashionreps"
FACTORY_INJECT = "厂家直销 源头工厂 一手货源 微信号 联系方式 批发 代理 工厂"
ALL_Q2_INJECT_BASE = "yupoo 1688 微店 weidian 厂家直销 微信 源头工厂"
REP_KEYWORDS = {
    "jordan","nike","aj","yeezy","dunk","air force","travis","off white","sacai",
    "new balance","nb","asics","samba","adidas","puma","reebok","vans","converse",
    "supreme","bape","palace","kith","fear of god","fog","essentials",
    "stone island","cp company","gallery dept","rhude","amiri","chrome hearts",
    "louis vuitton","lv","gucci","prada","dior","balenciaga","burberry","versace",
    "moncler","canada goose","rep","replica","1:1","passing","nfc","putian","莆田",
    "sneaker","shoe","kicks","hoodie","tee","jacket","coat","down","puffer",
}
# Auto-translate common English product terms to Chinese for better Baidu results
EN_ZH_MAP = {
    "soccer cleats":"足球鞋","soccer shoes":"足球鞋","football boots":"足球鞋",
    "slides":"拖鞋","sandals":"凉鞋","loafers":"乐福鞋","mules":"穆勒鞋",
    "belt":"皮带","belts":"皮带","wallet":"钱包","bag":"包包","bags":"包包",
    "hoodie":"卫衣","sweatshirt":"卫衣","tee":"T恤","t-shirt":"T恤","shirt":"衬衫",
    "pants":"裤子","jeans":"牛仔裤","shorts":"短裤","jacket":"外套","coat":"大衣",
    "puffer":"羽绒服","down jacket":"羽绒服","vest":"背心",
    "socks":"袜子","hat":"帽子","cap":"帽子","beanie":"毛线帽",
    "sunglasses":"墨镜","glasses":"眼镜","watch":"手表","bracelet":"手链",
    "necklace":"项链","ring":"戒指","earrings":"耳环","jewelry":"饰品",
    "keychain":"钥匙扣","card holder":"卡夹","phone case":"手机壳",
    "backpack":"双肩包","tote":"托特包","clutch":"手拿包","crossbody":"斜挎包",
    "sneakers":"运动鞋","shoes":"鞋子","boots":"靴子","sandals":"凉鞋",
    "hoodie":"卫衣","t-shirt":"T恤","jacket":"夹克","coat":"大衣",
    "pants":"裤子","leggings":"打底裤","shorts":"短裤","dress":"连衣裙",
    "bag":"包包","backpack":"背包","wallet":"钱包","belt":"皮带",
    "watch":"手表","sunglasses":"太阳镜","hat":"帽子","cap":"帽子",
    "yoga pants":"瑜伽裤","yoga leggings":"瑜伽裤","sports bra":"运动内衣",
    "tracksuit":"运动套装","sweatpants":"运动裤","polo":"polo衫",
    "down jacket":"羽绒服","puffer":"羽绒服","windbreaker":"风衣",
    "tech fleece":"科技抓绒","air max":"气垫","air force":"空军一号",
}

def _translate_to_zh(query):
    """Auto-translate common English product terms to Chinese."""
    q = query
    for en, zh in EN_ZH_MAP.items():
        import re
        q = re.sub(re.escape(en), zh, q, flags=re.IGNORECASE)
    return q

def build_inject(base_query):
    """Build smart query injection based on what user is searching for."""
    q = base_query.lower()
    is_rep = any(kw in q for kw in REP_KEYWORDS)

    if is_rep:
        # Rep/sneaker/luxury — inject rep keywords + factory contact
        q1 = f"{FACTORY_INJECT} {REP_INJECT} 微信号"
        q2 = f"yupoo 1688 weidian 厂家直销 微信 {REP_INJECT} 莆田"
    else:
        # Generic product — factory direct, wholesale, no rep terms
        # Based on video: search Chinese name + factory + WeChat contact
        q1 = f"{FACTORY_INJECT} 微信号 联系方式 QQ 厂家直营"
        q2 = f"1688 weidian 厂家直销 批发商 微信 联系方式 源头厂家"
    return q1, q2

def build_zhihu_inject(base_query):
    """Zhihu-specific: expert discussions about which factory is best."""
    return f"哪家工厂 {base_query} 质量好 推荐 厂家 评测"

def build_xianyu_inject(base_query):
    """Xianyu-specific: factory overruns and clearance stock."""
    return f"{base_query} 工厂尾货 库存 清仓 余单 原单 微信"

def build_weidian_inject(base_query):
    """Weidian-specific: find batches, compare quality tiers."""
    return f"{base_query} 批次 weidian 微店 工厂 微信 联系"

def build_xiaohongshu_inject(base_query):
    """XHS-specific: trend intel and buyer reviews."""
    return f"{base_query} 推荐 测评 哪里买 工厂 质量 微信"
ALL_Q1_INJECT = FACTORY_INJECT
ALL_Q2_INJECT = ALL_Q2_INJECT_BASE


BLOCKED_DOMAINS = {
    # Official brand sites
    "nike.com","nike.com.cn","jordan.com","adidas.com","yeezy.com",
    "newbalance.com","puma.com","reebok.com","vans.com","converse.com",
    "gucci.com","louisvuitton.com","lv.com","chanel.com","prada.com",
    "balenciaga.com","supreme.com","off-white.com","bape.com",
    "underarmour.com","asics.com","salomon.com","dior.com","fendi.com",
    "apple.com","apple.com.cn","samsung.com","sony.com","huawei.com",
    # 1688 - wholesale only, no WeChat, filter from all non-1688 searches
    "1688.com","m.1688.com","s.1688.com","detail.1688.com","offer.1688.com",
    # Western retail
    "amazon.com","amazon.cn","ebay.com","target.com","walmart.com",
    "bestbuy.com","costco.com","etsy.com","shopify.com",
    "stockx.com","goat.com","kickscrew.com","flightclub.com","soccer.com","footlocker.com","foot-locker.com","zalando.com","asos.com","farfetch.com","ssense.com","nordstrom.com","macys.com","zappos.com","sportsdirect.com","decathlon.com",
    "klarna.com","paypal.com","aliexpress.com",
    # Chinese retail (official)
    "tmall.com","jd.com","pinduoduo.com",
    "taobao.com",
    # Social/search/news
    "wikipedia.org","baidu.com","google.com","youtube.com",
    "instagram.com","facebook.com","twitter.com","x.com","tiktok.com",
    "douyin.com","alibaba.com","amazon.com","amazon.co.uk","amazon.de","chinagoods.com","hktdc.com","global.1688.com","chinese.alibaba.com","stockx.com","goat.com","grailed.com","depop.com","farfetch.com","ssense.com","mrporter.com","net-a-porter.com",
    "163.com","sohu.com","sina.com.cn","qq.com","ifeng.com",
    # Maps/directories
    "mapbar.com","amap.com","dianping.com","yelp.com","maps.google.com",
    # Gov/edu
    "gov.cn","gov.com","edu.cn","edu.com",
}

# Domains that are likely real supplier pages - get score boost
SUPPLIER_DOMAINS = {
    "1688.com","taobao.com","weidian.com","yupoo.com",
    "pinduoduo.com","xianyu.taobao.com","2.taobao.com",
    "53shop.com","ptxcj.com","goodseller.cn",
}

def _is_supplier_domain(url):
    if not url: return False
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().lstrip("www.")
        return any(host == d or host.endswith("."+d) for d in SUPPLIER_DOMAINS)
    except: return False

def _is_blocked(url):
    if not url: return False
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().lstrip("www.")
        return any(host == d or host.endswith("."+d) for d in BLOCKED_DOMAINS)
    except: return False

def _wq(wid):
    if not WECHAT_VALID.match(wid): return 0
    if WECHAT_GARBAGE.search(wid): return 0
    if len(wid) < 5 or len(wid) > 20: return 0
    has_alpha = bool(re.search(r"[a-zA-Z]", wid))
    has_digit = bool(re.search(r"[0-9]", wid))
    # Pure numbers 6-10 digits — valid WeChat (like 8370035)
    if not has_alpha and has_digit and 6 <= len(wid) <= 10: return 3
    # Mix of letters and numbers — high quality
    if has_alpha and has_digit and len(wid) >= 6: return 3
    if has_alpha and len(wid) >= 8: return 2
    return 1

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

def _score(title, snippet, link, mode, brand="", product=""):
    text = f"{title} {snippet} {link}".lower()
    t_lower = title.lower()
    s_lower = snippet.lower()

    # ── 1. BRAND LOCK ────────────────────────────────────────────────────────
    # If a brand was specified, the result MUST mention it somewhere
    # Chinese brand aliases map
    BRAND_ALIASES = {
        "nike": ["nike","耐克","莆田鞋","aj","jordan","airmax","air max","air force"],
        "adidas": ["adidas","阿迪达斯","阿迪","yeezy","boost"],
        "lv": ["lv","louis vuitton","路易威登","lv包","lv带","lv皮带"],
        "louis vuitton": ["lv","louis vuitton","路易威登"],
        "gucci": ["gucci","古驰"],
        "chanel": ["chanel","香奈儿"],
        "supreme": ["supreme","潮牌"],
        "jordan": ["jordan","乔丹","aj","air jordan","耐克"],
        "balenciaga": ["balenciaga","巴黎世家"],
        "off white": ["off white","off-white","ow"],
        "stone island": ["stone island","石头岛"],
        "chrome hearts": ["chrome hearts","克罗心"],
        "moncler": ["moncler","盟可睐"],
        "dior": ["dior","迪奥"],
        "prada": ["prada","普拉达"],
        "versace": ["versace","范思哲"],
        "burberry": ["burberry","博柏利"],
        "fendi": ["fendi","芬迪"],
        "alo": ["alo","alo yoga"],
        "lululemon": ["lululemon","露露乐蒙"],
    }
    if brand:
        b = brand.strip().lower()
        aliases = BRAND_ALIASES.get(b, [b])
        brand_found = any(a in text for a in aliases)
        if not brand_found:
            return -99  # Hard reject — wrong brand entirely

    # ── 2. PRODUCT RELEVANCE ─────────────────────────────────────────────────
    # Split product into keywords and check at least half appear
    prod_score = 0
    if product:
        prod_words = [w.lower() for w in product.split() if len(w) > 2]
        if prod_words:
            hits = sum(1 for w in prod_words if w in text)
            prod_score = (hits / len(prod_words)) * 6  # up to 6 points

    # ── 3. MODE TERMS ────────────────────────────────────────────────────────
    terms = FF_TERMS if mode == "ff" else (PASSING_TERMS if mode == "passing" else SUPPLIER_TERMS)
    s = sum(2 for t in terms if t in text)

    # ── 4. CONTACT BONUS ─────────────────────────────────────────────────────
    contact_bonus = sum(1 for t in CONTACT_TERMS if t in text)
    # Extra big bonus if WeChat is in title specifically
    if any(t in t_lower for t in ["微信", "wechat", "wx:", "wx："]):
        contact_bonus += 5
    # Bonus if WeChat ID pattern found (letters+numbers 6-20 chars after wx/微信)
    import re
    if re.search(r'(?:微信|wx)[：:]s*[a-zA-Z0-9_-]{5,20}', text):
        contact_bonus += 8

    # ── 5. FACTORY/DIRECT BONUS ──────────────────────────────────────────────
    factory_bonus = 0
    for kw in ["厂家直销","源头工厂","一手货源","工厂直销","厂家","工厂","原厂","直销"]:
        if kw in text:
            factory_bonus += 2
            break

    # ── 5b. 1688 PENALTY (wholesale, never has WeChat)
    if "1688.com" in text:
        return -99  # Hard reject 1688 results in non-1688 searches

    # ── 6. RETAILER PENALTY ──────────────────────────────────────────────────
    # Big Chinese retail platforms = not what we want
    RETAIL_SIGNALS = ["京东","淘宝","天猫","tmall","jd.com","taobao","amazon",
                      "官网","official","官方","旗舰店","正品","brand new","全新正品"]
    retail_penalty = sum(3 for r in RETAIL_SIGNALS if r in text)

    # ── 7. DUPE/GENERIC PENALTY ──────────────────────────────────────────────
    # Articles/listicles that just mention the brand aren't suppliers
    GENERIC_SIGNALS = ["如何","怎么","什么是","介绍","推荐","排行","top10","best","review",
                       "评测","攻略","教程","指南","百科","百度百科","wikipedia"]
    generic_penalty = sum(2 for g in GENERIC_SIGNALS if g in text)

    total = s + contact_bonus + factory_bonus + prod_score - retail_penalty - generic_penalty
    return int(total)

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


# ScraperAPI removed — using Baidu AI Search API + Playwright

def _baidu_ai_search(query, count=20):
    """
    Call Baidu AI Search API directly.
    Returns list of {title, url, snippet} dicts.
    API key from console.bce.baidu.com/ai-search/qianfan/ais/console/apiKey
    """
    import requests
    key = os.getenv("BAIDU_API_KEY", "")
    if not key:
        return None
    try:
        resp = requests.post(
            "https://qianfan.baidubce.com/v2/ai_search",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            json={
                "messages": [{"role": "user", "content": query}],
                "resource_type_filter": [{"type": "web", "top_k": count}],
            },
            timeout=30,
        )
        logger.info("Baidu AI Search status: %d", resp.status_code)
        data = resp.json()
        logger.info("Baidu AI Search full response: %s", str(data)[:500])
        if resp.status_code != 200:
            logger.warning("Baidu AI Search error: %s", resp.text[:200])
            return None
        # Extract references/results
        results = []
        # Try different response structures
        refs = (data.get("search_results") or 
                data.get("references") or 
                data.get("results") or
                data.get("web_search_results") or [])
        if not refs and "result" in data:
            refs = data["result"].get("search_results") or data["result"].get("references") or []
        logger.info("Baidu AI Search: got %d references", len(refs))
        for r in refs:
            title   = r.get("title") or r.get("name") or ""
            url     = r.get("url") or r.get("link") or r.get("id") or ""
            snippet = r.get("content") or r.get("snippet") or r.get("summary") or ""
            if title or url:
                results.append({"title": title, "url": url, "snippet": snippet})
        return results if results else None
    except Exception as e:
        logger.warning("Baidu AI Search exception: %s", e)
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
    """Search Baidu — uses official AI Search API if key set, else Playwright."""
    results = []
    pn  = (page_num - 1) * 10
    url = f"https://www.baidu.com/s?wd={quote_plus(full_q)}&pn={pn}&rn=20"

    # Try Baidu AI Search API first (no IP blocks, clean JSON)
    if os.getenv("BAIDU_API_KEY"):
        logger.info("Using Baidu AI Search API for: %s", full_q[:60])
        api_results = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _baidu_ai_search(full_q, count=max_r)
        )
        if api_results:
            for r in api_results:
                href    = r["url"]
                title   = r["title"]
                snippet = r["snippet"]
                if not title or href in seen_links or _is_blocked(href): continue
                c       = _contacts(" ".join([title, snippet, href]))
                sc      = _score(title, snippet, href, mode)
                best_wq = max((w["quality"] for w in c["wechat_ids"]), default=0)
                results.append({
                    "title": title, "link": href or url, "snippet": snippet,
                    "wechat_ids": c["wechat_ids"], "emails": c["emails"], "phones": c["phones"],
                    "factory_score": sc, "wechat_quality": best_wq,
                    "has_contact": bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat": best_wq >= 3, "is_factory_like": sc >= 3,
                    "platform": platform_label, "baidu_query": full_q, "mode": mode,
                    "deep_scanned": False, "page_num": page_num, "variation": 0,
                })
                seen_links.add(href)
            logger.info("Baidu AI API: %d results", len(results))
            if results:
                return results
        logger.warning("Baidu AI API returned nothing, trying ScrapingDog...")
        # Middle tier: ScrapingDog structured API
        sd_refs = await asyncio.get_event_loop().run_in_executor(None, _do_scrapingdog, full_q, max_r)
        if sd_refs:
            logger.info("ScrapingDog: processing %d refs into results", len(sd_refs))
            for ref in sd_refs[:max_r]:
                if len(results) >= max_r: break
                title   = ref.get("title","")
                href    = ref.get("url","")
                snippet = ref.get("snippet","")
                combined = " ".join(filter(None,[title,snippet,href]))
                c  = _contacts(combined)
                sc = _score(title,snippet,href,mode)
                best_wq = max((w["quality"] for w in c["wechat_ids"]),default=0)
                results.append({
                    "title":title,"link":href or url,"snippet":snippet,
                    "wechat_ids":c["wechat_ids"],"emails":c["emails"],"phones":c["phones"],
                    "factory_score":sc,"wechat_quality":best_wq,
                    "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat":best_wq>=3,"is_factory_like":sc>=3,
                    "platform":platform_label,"baidu_query":full_q,"mode":mode,
                    "deep_scanned":False,"page_num":page_num,"variation":0,
                })
            if results:
                logger.info("ScrapingDog: returning %d results", len(results))
                return results
        logger.warning("ScrapingDog returned nothing, falling back to Playwright")

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        # Wait for results or timeout
        try:
            await page.wait_for_selector(
                "#content_left, .result, [class*='result']",
                timeout=15000
            )
        except:
            pass
        await asyncio.sleep(1.5)

        # Check what we got
        content_left = await page.locator("#content_left").count()
        logger.info("Baidu: content_left=%s url=%s", content_left > 0, page.url[:60])

        # Try multiple block selectors
        blocks = None
        total  = 0
        for selector in [
            "#content_left > div.result",
            "#content_left > div.c-container",
            "#content_left > div",
            ".result[class*='c-container']",
            "[tpl]",
        ]:
            b = page.locator(selector)
            t = await b.count()
            if t > 0:
                blocks = b
                total  = t
                logger.info("Baidu: %d blocks with '%s'", t, selector)
                break

        if not blocks or total == 0:
            logger.warning("Baidu: no result blocks found")
            return results

        for i in range(total):
            if len(results) >= max_r: break
            block = blocks.nth(i)

            # Try multiple title selectors - Baidu changes structure frequently
            title = ""
            href  = ""
            for title_sel in [
                "h3 a", ".c-title a", "h3", "a.c-title",
                "[class*='title'] a", "[class*='Title'] a",
                "a[href*='baidu']", "a[href^='http']",
                "a", "h3 span",
            ]:
                tn = block.locator(title_sel).first
                if await tn.count() > 0:
                    try:
                        t = (await tn.inner_text()).strip()
                        h = (await tn.get_attribute("href") or "").strip()
                        if t and len(t) > 3:
                            title = t
                            href  = h
                            break
                    except: continue

            # Last resort: use full block text as title
            if not title:
                try:
                    block_text_raw = (await block.inner_text()).strip()
                    if block_text_raw and len(block_text_raw) > 5:
                        title = block_text_raw[:80]
                except: pass

            # Get href from any link if we still don't have one
            if not href:
                try:
                    any_a = block.locator("a").first
                    if await any_a.count() > 0:
                        href = (await any_a.get_attribute("href") or "").strip()
                except: pass

            if not title: continue
            if href in seen_links or _is_blocked(href): continue

            # Snippet
            snippet = ""
            for snip_sel in [".c-abstract", ".c-color-text", "p", ".content-right_8Zs40"]:
                sn = block.locator(snip_sel).first
                if await sn.count() > 0:
                    try:
                        snippet = (await sn.inner_text()).strip()
                        if snippet: break
                    except: continue

            # Full block text for WeChat scanning
            try:
                block_text = await block.inner_text()
            except:
                block_text = ""

            combined = " ".join(filter(None, [title, snippet, block_text, href]))
            c        = _contacts(combined)
            sc       = _score(title, snippet + block_text, href, mode)
            best_wq  = max((w["quality"] for w in c["wechat_ids"]), default=0)

            results.append({
                "title": title, "link": href or url, "snippet": snippet,
                "wechat_ids": c["wechat_ids"], "emails": c["emails"], "phones": c["phones"],
                "factory_score": sc, "wechat_quality": best_wq,
                "has_contact": bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                "has_verified_wechat": best_wq >= 3, "is_factory_like": sc >= 3,
                "platform": platform_label, "baidu_query": full_q, "mode": mode,
                "deep_scanned": False, "page_num": page_num, "variation": 0,
            })

        logger.info("Baidu: parsed %d results", len(results))

    except Exception as e:
        logger.warning("Baidu search error: %s", e)

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



def _cross_validate_wechats(wechat_ids, existing_results):
    """
    Boost confidence of WeChat IDs that appear on multiple sources.
    Also checks if ID appears in Baidu search results for that specific ID.
    """
    # Count how many results each WeChat appears in
    id_counts = {}
    for result in existing_results:
        for w in result.get("wechat_ids", []):
            wid = w["id"]
            id_counts[wid] = id_counts.get(wid, 0) + 1

    # Boost confidence for IDs appearing multiple times
    validated = []
    for w in wechat_ids:
        wid = w["id"]
        count = id_counts.get(wid, 1)
        boosted = dict(w)
        if count >= 3:
            boosted["confidence"] = min(boosted.get("confidence", 0.5) + 0.3, 1.0)
            boosted["validated"] = True
            boosted["appearances"] = count
        elif count >= 2:
            boosted["confidence"] = min(boosted.get("confidence", 0.5) + 0.15, 1.0)
            boosted["appearances"] = count
        validated.append(boosted)

    validated.sort(key=lambda x: (x.get("appearances", 1), x.get("confidence", 0)), reverse=True)
    return validated


async def verify_wechat_via_baidu(wechat_id, page, timeout=15000):
    """
    Verify a WeChat ID by:
    1. Searching Baidu AI for the exact ID
    2. Checking how many independent sources mention it
    3. Checking if it appears on known supplier sites
    Returns: {"status": "verified"|"likely"|"weak"|"not_found", "score": 0-100, "sources": [...]}
    """
    import requests as req
    key = os.getenv("BAIDU_API_KEY", "")
    sources = []
    score = 0

    # Check 1: Format quality (already validated before this point)
    if re.search(r"[a-zA-Z]", wechat_id) and re.search(r"[0-9]", wechat_id) and len(wechat_id) >= 6:
        score += 20  # good format

    # Check 2: Search Baidu AI for this specific WeChat ID
    if key:
        try:
            # Search 1: exact WeChat ID
            resp = req.post(
                "https://qianfan.baidubce.com/v2/ai_search",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                json={"messages": [{"role": "user", "content": f"微信号 {wechat_id} 厂家 供应商"}],
                      "resource_type_filter": [{"type": "web", "top_k": 10}]},
                timeout=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                refs = data.get("references", [])
                for r in refs:
                    combined = (r.get("content","") + r.get("title","") + r.get("url","")).lower()
                    if wechat_id.lower() in combined:
                        url = r.get("url","")
                        title = r.get("title","")
                        sources.append({"url": url, "title": title})
                        # Bonus for supplier domains
                        if any(d in url for d in ["1688","taobao","weidian","yupoo","ptx","nkt","莆田"]):
                            score += 25
                        else:
                            score += 15

            logger.info("WeChat verify %s: %d sources, score=%d", wechat_id, len(sources), score)
        except Exception as e:
            logger.warning("WeChat verify error: %s", e)

    # Check 3: Known Putian seller format (ptx351, nkt858 etc)
    if re.match(r"^[a-z]{2,4}\d{3,6}$", wechat_id, re.I):
        score += 15  # classic Putian seller format

    # Score → status
    if score >= 60 or len(sources) >= 3:
        status = "verified"
    elif score >= 35 or len(sources) >= 1:
        status = "likely"
    elif score >= 20:
        status = "weak"
    else:
        status = "not_found"

    return {"status": status, "score": min(score, 100), "sources": sources[:3]}

async def scan_single(url):
    headless=os.getenv("HEADLESS","true").lower()!="false"
    ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(
            user_agent=ua,
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            viewport={"width":1366,"height":768},
            extra_http_headers={
                "Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8",
                "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            }
        )
        page=await ctx.new_page()
        # Set cookies to look like returning user
        await ctx.add_cookies([{
            "name":"BAIDUID","value":"ABCDEF1234567890ABCDEF1234567890:FG=1",
            "domain":".baidu.com","path":"/"
        }])
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

    base_raw = f"{brand.strip()} {query.strip()}".strip() if brand.strip() else query.strip()
    base = _translate_to_zh(base_raw)
    if base != base_raw:
        logger.info("Auto-translated: %s -> %s", base_raw[:60], base[:60])

    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(
            user_agent=ua,
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            viewport={"width":1366,"height":768},
            extra_http_headers={
                "Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8",
                "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            }
        )
        page=await ctx.new_page()
        # Set cookies to look like returning user
        await ctx.add_cookies([{
            "name":"BAIDUID","value":"ABCDEF1234567890ABCDEF1234567890:FG=1",
            "domain":".baidu.com","path":"/"
        }])

        try:
            if platform=="all":
                seen_all=set(seen_links)
                if mode == "passing":
                    q1 = f"{base} {PASSING_INJECT}"
                    q2 = f"{base} {PASSING_NFC_INJECT}"
                else:
                    _inj1, _inj2 = build_inject(base)
                    q1 = f"{base} {_inj1}"
                    q2 = f"{base} {_inj2}"
                # Add Zhihu expert intel query
                q3 = f"site:zhihu.com {base} 工厂 推荐 哪家好"
                # Add Weidian batch query
                q4 = f"weidian {base} {build_weidian_inject(base)}"
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
                        "1688": f"1688 厂家直销 批发 微信 回购率 联系方式",
                        "taobao": f"淘宝 厂家店 工厂 微信 销量",
                        "xianyu": f"闲鱼 {build_xianyu_inject(base)}",
                        "weidian": f"微店 {build_weidian_inject(base)}",
                        "xiaohongshu": f"小红书 {build_xiaohongshu_inject(base)}",
                        "zhihu": f"知乎 {build_zhihu_inject(base)}",
                        "weibo": f"微博 工厂 {base} 微信 联系方式 厂家",
                        "douyin": f"抖音 {base} 厂家 微信 联系方式 工厂直播 货源",
                        "pinduoduo": f"拼多多 {base} 工厂直营 微信 厂家 批发 一件代发",
                        "dewu": f"得物 {base} 莆田 1:1 复刻 高仿 微信 厂家 同款",
                        "poizon": f"得物 {base} 莆田 1:1 复刻 高仿 微信 厂家 同款",
                        "taobao": f"淘宝 {base} 工厂直营 微信 店主 货源 厂家",
                        "xhs": f"小红书 {base} 厂家 微信 代购 货源",
                    }
                    _pi1, _ = build_inject(base)
                    inject = injects.get(platform, _pi1)
                    full_q = f"{base} {inject}"
                    results = await _baidu_search(page,full_q,max_r,timeout,delay,seen_links,platform.title(),mode,page_num)
                else:
                    if mode == "ff":
                        q_lower = query.lower()
                        is_rep_ff = any(kw in q_lower for kw in [
                            "rep","putian","sensitive","private","莆田","仿","counterfeit",
                            "shoes","bag","sneaker","luxury","fake","1:1"
                        ])
                        ff_inject = FF_REP_INJECT if is_rep_ff else FF_SAFE_INJECT
                        full_q = f"{base} {ff_inject}"
                    elif mode == "passing":
                        # Use NFC inject if NFC in query, else general passing inject
                        if "nfc" in query.lower():
                            full_q = f"{base} {PASSING_NFC_INJECT}"
                        else:
                            full_q = f"{base} {PASSING_INJECT}"
                    else:
                        _bi1, _ = build_inject(base)
                        full_q = f"{base} {_bi1}"
                    results=await _baidu_search(page,full_q,max_r,timeout,delay,seen_links,"Baidu",mode,page_num)

            results.sort(key=lambda r:r["factory_score"]*2+r["wechat_quality"],reverse=True)

            # Deep scan — follow every link and scrape the actual page
            if deep_scan:
                TOTAL_TO=int(os.getenv("DEEP_SCAN_TOTAL_TIMEOUT","60"))
                MAX_PAGES=5  # only scan top 5 results
                start=asyncio.get_event_loop().time()
                for item in results[:MAX_PAGES]:
                    if asyncio.get_event_loop().time()-start>TOTAL_TO: break
                    try:
                        extra=await _deep_scan_page(page,item["link"],nav_timeout=12000)
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


# ── ImportYeti scraper ────────────────────────────────────────────
async def _scrape_importyeti(brand, page, timeout=20000):
    """
    Scrape ImportYeti for real verified factory names.
    Returns list of factory dicts with name, address, shipments.
    """
    factories = []
    try:
        # Search by brand name
        url = f"https://www.importyeti.com/company/{brand.lower().replace(' ','-')}"
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)

        # Get supplier names from the page
        text = await page.inner_text("body")

        # Also try the product search
        url2 = f"https://www.importyeti.com/search?q={quote_plus(brand)}"
        await page.goto(url2, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)
        text2 = await page.inner_text("body")

        combined = text + "\n" + text2

        # Extract Chinese company names
        cn_pattern = re.compile(r'[\u4e00-\u9fff]{2,}(?:有限公司|工厂|制造|鞋业|服装|科技|实业|贸易|集团|皮具|箱包)', re.U)
        en_pattern = re.compile(r'[A-Z][A-Z\s]{5,50}(?:CO\.|LTD|LIMITED|FACTORY|MFG|MANUFACTURING|INTL|INTERNATIONAL)', re.I)

        cn_names = list(set(cn_pattern.findall(combined)))[:8]
        en_names = list(set(en_pattern.findall(combined)))[:8]

        for name in cn_names + en_names:
            name = name.strip()
            if len(name) > 3:
                factories.append({"name": name, "source": "importyeti"})

        logger.info("ImportYeti found %d factories for %s", len(factories), brand)
    except Exception as e:
        logger.warning("ImportYeti scrape error: %s", e)
    return factories


# ── Yupoo direct scraper ─────────────────────────────────────────
async def _scrape_yupoo(query, brand, page, timeout=25000, max_results=6):
    """
    Scrape Yupoo albums directly — sellers post WeChat in descriptions.
    """
    results = []
    try:
        q = f"{brand} {query}".strip() if brand else query
        url = f"https://www.yupoo.com/search/?q={quote_plus(q)}&tab=album"
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)

        # Get album links
        links = await page.evaluate("""() => {
            return [...document.querySelectorAll('a[href*="/photos/"]')]
                .map(a => a.href)
                .filter(h => h.includes('yupoo.com'))
                .slice(0, 8);
        }""")

        logger.info("Yupoo found %d album links", len(links))

        for link in links[:max_results]:
            try:
                await page.goto(link, wait_until="domcontentloaded", timeout=timeout)
                await asyncio.sleep(1.0)
                text = await page.inner_text("body")
                html = await page.content()
                combined = text + html
                c = _contacts(combined)
                if not c["wechat_ids"] and not c["emails"] and not c["phones"]:
                    continue
                title_el = page.locator("h1, .album-title, .username, title").first
                title = (await title_el.inner_text()).strip() if await title_el.count() > 0 else link
                sc = _score(title, text[:300], link, "supplier")
                best_wq = max((w["quality"] for w in c["wechat_ids"]), default=0)
                results.append({
                    "title": title, "link": link, "snippet": text[:200],
                    "wechat_ids": c["wechat_ids"], "emails": c["emails"], "phones": c["phones"],
                    "factory_score": sc + 3, "wechat_quality": best_wq,
                    "has_contact": bool(c["wechat_ids"] or c["emails"] or c["phones"]),
                    "has_verified_wechat": best_wq >= 3, "is_factory_like": True,
                    "platform": "Yupoo", "baidu_query": q, "mode": "supplier",
                    "deep_scanned": True, "page_num": 1, "variation": 0,
                })
                logger.info("Yupoo album %s: %d WeChats", link[:50], len(c["wechat_ids"]))
            except Exception as e:
                logger.debug("Yupoo album error: %s", e)
                continue

    except Exception as e:
        logger.warning("Yupoo scrape error: %s", e)
    return results
