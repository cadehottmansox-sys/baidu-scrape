"""
SourceFinder — Baidu via ScraperAPI with proper HTML parsing.
ScraperAPI fetches Baidu with Chinese residential IPs.
We save raw HTML to debug and parse properly.
"""

import asyncio

def _do_scrapingdog(query, max_results=10):
    import os as _os, requests as _req
    api_key = _os.getenv("SCRAPINGDOG_API_KEY","69e6b959ba3950604d5080d7")
    try:
        # Try structured Baidu search endpoint first
        r = _req.get("https://api.scrapingdog.com/baidu",
            params={"api_key":api_key,"query":query,"results":min(max_results*2,20),"country":"cn"},
            timeout=20)
        if r.status_code == 200:
            try:
                data = r.json()
                organic = (data.get("organic_results") or data.get("Baidu_data") or
                           data.get("organic_data") or data.get("results") or [])
                if organic:
                    out = []
                    for item in organic[:max_results]:
                        t = item.get("title","")
                        l = item.get("link","") or item.get("url","")
                        sn = item.get("snippet","") or item.get("description","")
                        if t: out.append({"title":t,"url":l,"snippet":sn})
                    if out: return out
            except Exception: pass
        # Fallback: scrape Baidu HTML directly via ScrapingDog proxy
        baidu_url = f"https://www.baidu.com/s?wd={query}&rn=20&ie=utf-8"
        r2 = _req.get("https://api.scrapingdog.com/scrape",
            params={"api_key":api_key,"url":baidu_url,"dynamic":"false"},
            timeout=25)
        if r2.status_code == 200:
            html = r2.text
            import re as _re
            titles = _re.findall(r'<h3[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, _re.S)
            snippets = _re.findall(r'class="[^"]*content-right[^"]*"[^>]*>(.*?)</div>', html, _re.S)
            tag_re = _re.compile(r'<[^>]+>')
            out = []
            for i,(href,title) in enumerate(titles[:max_results]):
                t = tag_re.sub('',title).strip()
                sn = tag_re.sub('',snippets[i]).strip() if i < len(snippets) else ""
                if t and href.startswith('http'): out.append({"title":t,"url":href,"snippet":sn})
            if out: return out
    except Exception as _e:
        pass
    return None

def _translate_to_zh(query):
    q = query
    for en, zh in EN_ZH_MAP.items():
        import re
        q = re.sub(re.escape(en), zh, q, flags=re.IGNORECASE)
    return q

# ========================= ADDED: INTENT DETECTION =========================
def detect_product_intent(query):
    q=query.lower()
    cat="general";inj="工厂 微信 一手货源 厂家直销 -淘宝 -天猫";p_inj="过验 纯原 同厂 微信"
    if any(w in q for w in ["needoh","cube","squishy","stress ball","slow rise","fidget","pop it","slime"]):
        cat="toy";inj="玩具厂 硅胶制品 慢回弹 减压球 工厂 微信 一手货源";p_inj="过验 纯原 硅胶 捏捏乐 微信"
    elif any(w in q for w in ["lego","building blocks","bricks","compatible lego"]):
        cat="lego";inj="积木厂 小颗粒 兼容乐高 工厂 批发 微信";p_inj="过验 纯原 积木 兼容 微信"
    elif any(w in q for w in ["tech fleece","fleece","hoodie","sweatshirt","crewneck","tracksuit","jogger","windbreaker","puffer"]):
        cat="clothing";inj="服装厂 卫衣 纯原 过验 工厂直营 微信 一手货源 -淘宝 -天猫";p_inj="过验 纯原 同材质 服装厂 卫衣 微信"
    elif any(w in q for w in ["t-shirt","tee ","shirt","polo","shorts","pants","jeans","jacket","coat","sweater"]):
        cat="clothing";inj="服装厂 纯原 过验 工厂 微信 一手货源 -淘宝 -天猫";p_inj="过验 纯原 同厂 服装厂 微信"
    elif any(w in q for w in ["jordan","yeezy","dunk","air force","samba","trainer","runner","sneaker","shoe","boot"]):
        cat="shoe";inj="鞋厂 莆田 运动鞋 纯原 微信 一手货源 -淘宝 -天猫";p_inj="过验 纯原 莆田 同鞋厂 微信 1:1"
    elif any(w in q for w in ["bag","handbag","wallet","purse","backpack","tote","clutch","crossbody","duffel"]):
        cat="bag";inj="包包工厂 皮具厂 原单 真皮 微信 一手货源 -淘宝 -天猫";p_inj="过验 纯原 原单 皮具厂 微信"
    elif any(w in q for w in ["watch","rolex","omega","patek","cartier","hublot","richard mille","audemars"]):
        cat="watch";inj="手表厂 钟表 纯原 同机芯 微信 一手货源 -淘宝";p_inj="过验 纯原 同机芯 手表厂 微信"
    elif any(w in q for w in ["freight","forwarder","shipping","cargo","logistics","3pl"]):
        cat="freight";inj="货代 美国专线 双清包税 敏感货专线 DDP 微信";p_inj="货代 美国专线 双清包税 敏感货 微信"
    elif any(w in q for w in ["airpods","earbuds","headphones","phone case","charger","cable","speaker"]):
        cat="electronics";inj="数码配件厂 工厂直营 批发 微信 一手货源 -淘宝 -天猫";p_inj="过验 纯原 数码 工厂 微信"
    return cat,inj,p_inj
def _translate_to_zh(query):
    q = query
    for en, zh in EN_ZH_MAP.items():
        import re
        q = re.sub(re.escape(en), zh, q, flags=re.IGNORECASE)
    return q

def build_inject(base_query):
    q = base_query.lower()

    # Rep/luxury brands first
    is_rep = any(kw in q for kw in REP_KEYWORDS)
    if is_rep:
        q1 = f"{FACTORY_INJECT} {REP_INJECT} 微信号"
        q2 = f"yupoo 1688 weidian 厂家直销 微信 {REP_INJECT} 莆田"
        return q1, q2

    # Category-specific routing
    if any(k in q for k in ["tech fleece","fleece","hoodie","sweatshirt","crewneck","jacket","coat","shirt","tee","jogger","tracksuit","shorts","pants"]):
        q1 = f"{FACTORY_INJECT} 服装厂 卫衣 纯原 过验 微信 一手货源 -淘宝 -天猫"
        q2 = f"1688 服装批发 卫衣厂家 工厂直营 微信 联系方式"
        return q1, q2

    if any(k in q for k in ["shoe","sneaker","dunk","jordan","yeezy","air force","samba","trainer","runner","boot"]):
        q1 = f"{FACTORY_INJECT} 鞋厂 莆田 运动鞋 纯原 过验 微信 一手货源"
        q2 = f"yupoo weidian 莆田鞋厂 厂家直销 微信 联系方式"
        return q1, q2

    if any(k in q for k in ["bag","handbag","wallet","purse","backpack","tote","clutch","crossbody"]):
        q1 = f"{FACTORY_INJECT} 包包工厂 皮具厂 原单 微信 一手货源 -淘宝"
        q2 = f"1688 包包批发 皮具工厂 厂家直营 微信 联系方式"
        return q1, q2

    if any(k in q for k in ["watch","rolex","omega","patek","cartier","hublot","richard mille","timepiece"]):
        q1 = f"{FACTORY_INJECT} 手表厂 钟表 纯原 同机芯 微信 一手货源"
        q2 = f"1688 手表批发 钟表厂家 工厂直营 微信 联系方式"
        return q1, q2

    if any(k in q for k in ["needoh","squishy","fidget","stress","cube","slime","pop it","toy","lego","brick"]):
        q1 = f"{FACTORY_INJECT} 玩具厂 硅胶制品 工厂 微信 一手货源 -淘宝"
        q2 = f"1688 玩具批发 硅胶玩具厂 工厂直销 微信 联系方式"
        return q1, q2

    if any(k in q for k in ["freight","forwarder","shipping","cargo","logistics","dhl","fedex","3pl"]):
        q1 = "货代 美国专线 双清包税 敏感货专线 微信 DDP 一票到底"
        q2 = "私人货代 美线 欧线 包税清关 微信 联系方式 报价"
        return q1, q2

    # Generic fallback
    q1 = f"{FACTORY_INJECT} 微信号 联系方式 厂家直营 一手货源 -淘宝 -天猫"
    q2 = f"1688 weidian 厂家直销 批发商 微信 联系方式 源头厂家"
    return q1, q2

def build_zhihu_inject(base_query):
    return f"哪家工厂 {base_query} 质量好 推荐 厂家 评测"

def build_xianyu_inject(base_query):
    return f"{base_query} 工厂尾货 库存 清仓 余单 原单 微信"

def build_weidian_inject(base_query):
    return f"{base_query} 批次 weidian 微店 工厂 微信 联系"

def build_xiaohongshu_inject(base_query):
    return f"{base_query} 推荐 测评 哪里买 工厂 质量 微信"

ALL_Q1_INJECT = FACTORY_INJECT
ALL_Q2_INJECT = ALL_Q2_INJECT_BASE

BLOCKED_DOMAINS = {
    "nike.com","nike.com.cn","jordan.com","adidas.com","yeezy.com",
    "newbalance.com","puma.com","reebok.com","vans.com","converse.com",
    "gucci.com","louisvuitton.com","lv.com","chanel.com","prada.com",
    "balenciaga.com","supreme.com","off-white.com","bape.com",
    "underarmour.com","asics.com","salomon.com","dior.com","fendi.com",
    "apple.com","apple.com.cn","samsung.com","sony.com","huawei.com",
    "1688.com","m.1688.com","s.1688.com","detail.1688.com","offer.1688.com",
    "amazon.com","amazon.cn","ebay.com","target.com","walmart.com",
    "bestbuy.com","costco.com","etsy.com","shopify.com",
    "stockx.com","goat.com","kickscrew.com","flightclub.com","soccer.com","footlocker.com","foot-locker.com","zalando.com","asos.com","farfetch.com","ssense.com","nordstrom.com","macys.com","zappos.com","sportsdirect.com","decathlon.com",
    "klarna.com","paypal.com","aliexpress.com",
    "tmall.com","jd.com","pinduoduo.com",
    "taobao.com",
    "wikipedia.org","baidu.com","google.com","youtube.com",
    "instagram.com","facebook.com","twitter.com","x.com","tiktok.com",
    "alibaba.com","amazon.co.uk","amazon.de","chinagoods.com","hktdc.com","global.1688.com","chinese.alibaba.com","grailed.com","depop.com",
    "163.com","sohu.com","sina.com.cn","qq.com","ifeng.com",
    "mapbar.com","amap.com","dianping.com","yelp.com","maps.google.com",
    "gov.cn","gov.com","edu.cn","edu.com",
}

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
    if not has_alpha and has_digit and 6 <= len(wid) <= 10: return 3
    if has_alpha and has_digit and len(wid) >= 6: return 3
    if has_alpha and len(wid) >= 8: return 2
    return 1

def _conf(w):
    base={3:0.85,2:0.60,1:0.25,0:0.0}.get(w.get("quality",0),0.0)
    bonus={"qr":0.15,"ocr":0.10,"text":0.0}.get(w.get("source","text"),0.0)
    return min(round(base+bonus,2),1.0)

def _extract_douyin(text, link=""):
    if not text and not link:
        return "N/A"
    combined = (text or "") + " " + (link or "")
    import re as _re
    url_m = _re.search(r'douyin\.com/user/([A-Za-z0-9_\-\.]{4,30})', combined)
    if url_m:
        return url_m.group(1)
    vid_m = _re.search(r'douyin\.com/(?:video/)?([0-9]{15,20})', combined)
    if vid_m:
        return 'video:' + vid_m.group(1)
    txt_m = _re.search(r'(?:抖音号?|抖音ID|douyin)[\s：:号]+([A-Za-z0-9_\-\.]{4,30})', combined, _re.IGNORECASE)
    if txt_m:
        return txt_m.group(1).strip()
    if 'douyin.com' in (link or ''):
        return link.split('douyin.com/')[-1].split('?')[0][:30] or "N/A"
    return "N/A"

def _extract_xhs(text, link=""):
    combined = (text or "") + " " + (link or "")
    import re as _re
    url_m = _re.search(r'xiaohongshu\.com/user/profile/([a-f0-9]{24})', combined)
    if url_m:
        return url_m.group(1)
    txt_m = _re.search(r'(?:小红书号?|RED)[\s：:]+([A-Za-z0-9_]{4,30})', combined, _re.IGNORECASE)
    if txt_m:
        return txt_m.group(1)
    return "N/A"

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

    # Brand lock (hard reject if brand given but not found)
    if brand:
        brand_lower = brand.lower()
        brand_aliases = {
            "nike": ["nike", "耐克"],
            "jordan": ["jordan", "乔丹", "aj"],
            "hellstar": ["hellstar", "地狱之星"],
            "chrome hearts": ["chrome hearts", "克罗心"],
            "lv": ["lv", "louis vuitton", "路易威登"],
            "gucci": ["gucci", "古驰"],
        }
        aliases = brand_aliases.get(brand_lower, [brand_lower])
        if not any(alias in text for alias in aliases):
            return -99

    # Blog / article penalty
    BLOG_DOMAINS = ["jianshu.com", "weibo.com", "smzdm.com", "zhihu.com",
                    "post.smzdm.com", "blogger.com", "wordpress.com"]
    if any(domain in link for domain in BLOG_DOMAINS):
        return -50

    # Location bonus (Putian/Fujian)
    location_bonus = 0
    if any(place in text for place in ["莆田", "putian", "福建", "fujian", "晋江", "泉州"]):
        location_bonus = 15

    # Rep platform bonus
    rep_platform_bonus = 0
    if any(p in link for p in ["yupoo", "weidian", "douyin", "xianyu"]):
        rep_platform_bonus = 20

    # Original scoring logic (simplified but kept)
    terms = FF_TERMS if mode == "ff" else (PASSING_TERMS if mode == "passing" else SUPPLIER_TERMS)
    s = sum(2 for t in terms if t in text)

    contact_bonus = sum(1 for t in CONTACT_TERMS if t in text)
    if any(t in t_lower for t in ["微信", "wechat", "wx:", "wx："]):
        contact_bonus += 5

    if mode == "passing":
        tier_hits = 0
        for kw in ["过验","nfc","nfc芯片","芯片","真标","同厂","纯原","原单","外贸原单","出口转内销","公司级","pk版","og版","ljr","h12","莆田","工厂直发","一手货源"]:
            if kw in text:
                tier_hits += 1
        s += min(tier_hits * 2, 12)

    if re.search(r'(?:微信|wx)[：:]s*[a-zA-Z0-9_-]{5,20}', text):
        contact_bonus += 8

    factory_bonus = 0
    for kw in ["厂家直销","源头工厂","一手货源","工厂直销","厂家","工厂","原厂","直销"]:
        if kw in text:
            factory_bonus += 2
            break

    if "1688.com" in text:
        return -99

    RETAIL_SIGNALS = ["京东","淘宝","天猫","tmall","jd.com","taobao","amazon",
                      "官网","official","官方","旗舰店","正品","brand new","全新正品"]
    retail_penalty = sum(3 for r in RETAIL_SIGNALS if r in text)

    GENERIC_SIGNALS = ["如何","怎么","什么是","介绍","推荐","排行","top10","best","review",
                       "评测","攻略","教程","指南","百科","百度百科","wikipedia"]
    is_social = any(d in (link.lower() if link else "") for d in ["douyin","weibo","xiaohongshu","xhs"])
    generic_penalty = sum(1 for g in GENERIC_SIGNALS if g in text) if not is_social else 0

    total = s + contact_bonus + factory_bonus - retail_penalty - generic_penalty + location_bonus + rep_platform_bonus
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

def _baidu_ai_search(query, count=20):
    import requests
    key = os.getenv("BAIDU_API_KEY", "")
    if not key:
        return None
    try:
        resp = requests.post(
            "https://qianfan.baidubce.com/v2/ai_search",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            json={"messages": [{"role": "user", "content": query}], "resource_type_filter": [{"type": "web", "top_k": count}]},
            timeout=30,
        )
        logger.info("Baidu AI Search status: %d", resp.status_code)
        data = resp.json()
        if resp.status_code != 200:
            logger.warning("Baidu AI Search error: %s", resp.text[:200])
            return None
        results = []
        refs = (data.get("search_results") or data.get("references") or data.get("results") or data.get("web_search_results") or [])
        if not refs and "result" in data:
            refs = data["result"].get("search_results") or data["result"].get("references") or []
        for r in refs:
            title = r.get("title") or r.get("name") or ""
            url = r.get("url") or r.get("link") or r.get("id") or ""
            snippet = r.get("content") or r.get("snippet") or r.get("summary") or ""
            if title or url:
                results.append({"title": title, "url": url, "snippet": snippet})
        return results if results else None
    except Exception as e:
        logger.warning("Baidu AI Search exception: %s", e)
        return None

def _parse_baidu_html(html, full_q, platform_label, mode, seen_links, max_r, page_num):
    import html as html_module
    results = []
    tag_re = re.compile(r"<[^>]+>")
    logger.info("Parsing Baidu HTML len=%d sample=%s", len(html), html[1000:1300].replace("\n"," ")[:200])

    h3_pattern = re.compile(r'<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S|re.I)
    result_pattern = re.compile(r'<div[^>]+class="[^"]*result[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?(?:class="[^"]*c-abstract[^"]*"[^>]*>(.*?)</)', re.S|re.I)

    found_titles = []
    for m in h3_pattern.finditer(html):
        href = html_module.unescape(m.group(1)).strip()
        title = html_module.unescape(tag_re.sub("", m.group(2))).strip()
        if title and href and len(title) > 3 and not _is_blocked(href):
            found_titles.append((href, title, ""))
    if not found_titles:
        for m in result_pattern.finditer(html):
            href = html_module.unescape(m.group(1)).strip()
            title = html_module.unescape(tag_re.sub("", m.group(2))).strip()
            snippet = html_module.unescape(tag_re.sub("", m.group(3))).strip() if m.group(3) else ""
            if title and href:
                found_titles.append((href, title, snippet))

    snippet_pattern = re.compile(r'class="[^"]*(?:c-abstract|content-right)[^"]*"[^>]*>(.*?)</(?:span|div|p)>', re.S|re.I)
    snippets = [html_module.unescape(tag_re.sub("",s)).strip() for s in snippet_pattern.findall(html)]

    for i,(href,title,snippet) in enumerate(found_titles):
        if len(results) >= max_r: break
        if not title or not href: continue
        if href in seen_links or _is_blocked(href): continue
        if not snippet and i < len(snippets):
            snippet = snippets[i]
        c = _contacts(title + "\n" + snippet + "\n" + href)
        sc = _score(title, snippet, href, mode)
        best_wq = max((w["quality"] for w in c["wechat_ids"]),default=0)
        results.append({
            "title":title,"link":href,"snippet":snippet,
            "wechat_ids":c["wechat_ids"],"emails":c["emails"],"phones":c["phones"],
            "douyin":_extract_douyin(title+" "+snippet+" "+href, href),
            "xhs":_extract_xhs(title+" "+snippet+" "+href, href),
            "factory_score":sc,"wechat_quality":best_wq,
            "has_contact":bool(c["wechat_ids"] or c["emails"] or c["phones"]),
            "has_verified_wechat":best_wq>=3,"is_factory_like":sc>=3,
            "platform":platform_label,"baidu_query":full_q,"mode":mode,
            "deep_scanned":False,"page_num":page_num,"variation":0,
        })
    return results

async def _baidu_search(page, full_q, max_r, timeout, delay, seen_links, platform_label, mode, page_num=1):
    results = []
    pn = (page_num - 1) * 10
    url = f"https://www.baidu.com/s?wd={quote_plus(full_q)}&pn={pn}&rn=20"

    if os.getenv("BAIDU_API_KEY"):
        api_results = await asyncio.get_event_loop().run_in_executor(None, lambda: _baidu_ai_search(full_q, count=max_r))
        if api_results:
            for r in api_results:
                href = r["url"]
                title = r["title"]
                snippet = r["snippet"]
                if not title or href in seen_links or _is_blocked(href): continue
                c = _contacts(" ".join([title, snippet, href]))
                sc = _score(title, snippet, href, mode)
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
            if results:
                return results
        sd_refs = await asyncio.get_event_loop().run_in_executor(None, _do_scrapingdog, full_q, max_r)
        if sd_refs:
            for ref in sd_refs[:max_r]:
                if len(results) >= max_r: break
                title = ref.get("title","")
                href = ref.get("url","")
                snippet = ref.get("snippet","")
                combined = " ".join(filter(None,[title,snippet,href]))
                c = _contacts(combined)
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
                return results

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        try:
            await page.wait_for_selector("#content_left, .result, [class*='result']", timeout=15000)
        except:
            pass
        await asyncio.sleep(1.5)
        content_left = await page.locator("#content_left").count()
        logger.info("Baidu: content_left=%s url=%s", content_left > 0, page.url[:60])

        blocks = None
        total = 0
        for selector in ["#content_left > div.result", "#content_left > div.c-container", "#content_left > div", ".result[class*='c-container']", "[tpl]"]:
            b = page.locator(selector)
            t = await b.count()
            if t > 0:
                blocks = b
                total = t
                break
        if not blocks or total == 0:
            return results

        for i in range(total):
            if len(results) >= max_r: break
            block = blocks.nth(i)
            title = ""
            href = ""
            for title_sel in ["h3 a", ".c-title a", "h3", "a.c-title", "[class*='title'] a", "[class*='Title'] a", "a[href*='baidu']", "a[href^='http']", "a", "h3 span"]:
                tn = block.locator(title_sel).first
                if await tn.count() > 0:
                    try:
                        t = (await tn.inner_text()).strip()
                        h = (await tn.get_attribute("href") or "").strip()
                        if t and len(t) > 3:
                            title = t
                            href = h
                            break
                    except: continue
            if not title:
                try:
                    block_text_raw = (await block.inner_text()).strip()
                    if block_text_raw and len(block_text_raw) > 5:
                        title = block_text_raw[:80]
                except: pass
            if not href:
                try:
                    any_a = block.locator("a").first
                    if await any_a.count() > 0:
                        href = (await any_a.get_attribute("href") or "").strip()
                except: pass
            if not title: continue
            if href in seen_links or _is_blocked(href): continue
            snippet = ""
            for snip_sel in [".c-abstract", ".c-color-text", "p", ".content-right_8Zs40"]:
                sn = block.locator(snip_sel).first
                if await sn.count() > 0:
                    try:
                        snippet = (await sn.inner_text()).strip()
                        if snippet: break
                    except: continue
            try:
                block_text = await block.inner_text()
            except:
                block_text = ""
            combined = " ".join(filter(None, [title, snippet, block_text, href]))
            c = _contacts(combined)
            sc = _score(title, snippet + block_text, href, mode)
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
    except Exception as e:
        logger.warning("Baidu search error: %s", e)
    return results

async def _deep_scan_page(page, url, nav_timeout=22000):
    result={"wechat_ids":[],"emails":[],"phones":[]}
    try:
        actual_url = url
        if "baidu.com/link" in url:
            try:
                await page.goto(url, wait_until="commit", timeout=12000)
                await asyncio.sleep(0.5)
                actual_url = page.url
                if "baidu.com" in actual_url: actual_url = url
            except: pass
        if actual_url != page.url:
            try:
                await page.goto(actual_url, wait_until="domcontentloaded", timeout=nav_timeout)
            except:
                try: await page.goto(actual_url, wait_until="commit", timeout=nav_timeout)
                except: return result
        await asyncio.sleep(1.0)
        try:
            body = await page.inner_text("body")
            result = _merge(result, _contacts(body))
        except: pass
        try:
            html = await page.content()
            result = _merge(result, _contacts(html))
        except: pass
        try:
            img_data = await page.evaluate("""() => [...document.querySelectorAll('img')].map(i=>({
                alt:i.alt||'',title:i.title||'',src:i.src||'',
                cls:i.className||'',w:i.naturalWidth||i.width||0,h:i.naturalHeight||i.height||0
            }))""")
            for img in img_data:
                result = _merge(result, _contacts(img['alt']+" "+img['title']+" "+img['src']))
        except: img_data=[]
        if QR_AVAILABLE and img_data:
            for img in [i for i in img_data if i['w']>60 and i['h']>60 and i['w']<800 and i['src'] and not i['src'].endswith('.gif') and (any(k in i['src'].lower() for k in ['qr','weixin','wechat','wx']) or any(k in (i['alt']+i.get('cls','')).lower() for k in ['二维码','扫码']) or (0.7<i['w']/max(i['h'],1)<1.3 and i['w']>80))][:10]:
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
    id_counts = {}
    for result in existing_results:
        for w in result.get("wechat_ids", []):
            wid = w["id"]
            id_counts[wid] = id_counts.get(wid, 0) + 1
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
    import requests as req
    key = os.getenv("BAIDU_API_KEY", "")
    sources = []
    score = 0
    if re.search(r"[a-zA-Z]", wechat_id) and re.search(r"[0-9]", wechat_id) and len(wechat_id) >= 6:
        score += 20
    if key:
        try:
            resp = req.post(
                "https://qianfan.baidubce.com/v2/ai_search",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                json={"messages": [{"role": "user", "content": f"微信号 {wechat_id} 厂家 供应商"}], "resource_type_filter": [{"type": "web", "top_k": 10}]},
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
                        if any(d in url for d in ["1688","taobao","weidian","yupoo","ptx","nkt","莆田"]):
                            score += 25
                        else:
                            score += 15
        except Exception as e:
            logger.warning("WeChat verify error: %s", e)
    if re.match(r"^[a-z]{2,4}\d{3,6}$", wechat_id, re.I):
        score += 15
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
        ctx=await browser.new_context(user_agent=ua, locale="zh-CN", timezone_id="Asia/Shanghai", viewport={"width":1366,"height":768}, extra_http_headers={"Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"})
        page=await ctx.new_page()
        await ctx.add_cookies([{"name":"BAIDUID","value":"ABCDEF1234567890ABCDEF1234567890:FG=1","domain":".baidu.com","path":"/"}])
        try: result=await _deep_scan_page(page,url)
        finally: await ctx.close(); await browser.close()
    return result

async def search_platform(
    query, brand="", platform="all", mode="supplier",
    deep_scan=False, wechat_only=False,
    page_num=1, variation=0, seen_links=None,
):
    seen_links = set(seen_links or [])
    max_r = int(os.getenv("MAX_RESULTS","10"))
    headless = os.getenv("HEADLESS","true").lower()!="false"
    timeout = int(os.getenv("PLAYWRIGHT_TIMEOUT_MS","30000"))
    delay = float(os.getenv("ACTION_DELAY_SECONDS","1.0"))
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    results = []

    _b=brand.strip();_q=query.strip()
    base_raw=_q if (_b and _q.lower().startswith(_b.lower())) else (f"{_b} {_q}".strip() if _b else _q)
    base = _translate_to_zh(base_raw)
    if base != base_raw:
        logger.info("Auto-translated: %s -> %s", base_raw[:60], base[:60])

    async with async_playwright() as p:
        browser=await _launch(p,headless)
        ctx=await browser.new_context(user_agent=ua, locale="zh-CN", timezone_id="Asia/Shanghai", viewport={"width":1366,"height":768}, extra_http_headers={"Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"})
        page=await ctx.new_page()
        await ctx.add_cookies([{"name":"BAIDUID","value":"ABCDEF1234567890ABCDEF1234567890:FG=1","domain":".baidu.com","path":"/"}])

        try:
            if platform == "all":
                seen_all = set(seen_links)
                if mode == "passing":
                    _, _, passing_inject = detect_product_intent(query)
                    full_q = f"{base} {passing_inject}"
                    r1 = await _baidu_search(page, full_q, max_r, timeout, delay, seen_all, "All-in-One", mode)
                    for r in r1: seen_all.add(r["link"])
                    results.extend(r1)
                else:
                    _, inject, _ = detect_product_intent(query)
                    full_q = f"{base} {inject}"
                    r1 = await _baidu_search(page, full_q, max_r, timeout, delay, seen_all, "All-in-One", mode)
                    for r in r1: seen_all.add(r["link"])
                    results.extend(r1)
            else:
                if mode == "ff":
                    q_lower = query.lower()
                    is_rep_ff = any(kw in q_lower for kw in ["rep","putian","sensitive","private","莆田","仿","counterfeit","shoes","bag","sneaker","luxury","fake","1:1"])
                    ff_inject = FF_REP_INJECT if is_rep_ff else FF_SAFE_INJECT
                    full_q = f"{base} {ff_inject}"
                elif mode == "passing":
                    _, _, passing_inject = detect_product_intent(query)
                    full_q = f"{base} {passing_inject}"
                else:
                    _, inject, _ = detect_product_intent(query)
                    full_q = f"{base} {inject}"
                results = await _baidu_search(page, full_q, max_r, timeout, delay, seen_links, "Baidu", mode, page_num)

            results.sort(key=lambda r: r["factory_score"]*2 + r["wechat_quality"], reverse=True)

            if deep_scan:
                TOTAL_TO = int(os.getenv("DEEP_SCAN_TOTAL_TIMEOUT","60"))
                MAX_PAGES = 5
                start = asyncio.get_event_loop().time()
                for item in results[:MAX_PAGES]:
                    if asyncio.get_event_loop().time()-start > TOTAL_TO: break
                    try:
                        extra = await _deep_scan_page(page, item["link"], nav_timeout=12000)
                        merged = _merge({"wechat_ids":item["wechat_ids"],"emails":item["emails"],"phones":item["phones"]}, extra)
                        best_wq = max((w["quality"] for w in merged["wechat_ids"]), default=0)
                        item.update({"wechat_ids":merged["wechat_ids"],"emails":merged["emails"],"phones":merged["phones"],
                                     "deep_scanned":True,"wechat_quality":best_wq,"has_verified_wechat":best_wq>=3,
                                     "has_contact":bool(merged["wechat_ids"] or merged["emails"] or merged["phones"])})
                    except Exception as e:
                        logger.warning("Deep scan error: %s", e)
                results.sort(key=lambda r: r["factory_score"]*2 + r["wechat_quality"], reverse=True)

            if wechat_only:
                results = [r for r in results if r["wechat_ids"]]

        finally:
            await ctx.close()
            await browser.close()

    _BL=["nike.com","adidas.com","jordan.com","ray-ban.com","rayban.com","louisvuitton.com","lv.com","gucci.com","balenciaga.com","prada.com","chanel.com","dior.com","burberry.com","newbalance.com","asics.com","puma.com","vans.com","converse.com","reebok.com","rolex.com","omega.com","cartier.com","hublot.com","apple.com","samsung.com","amazon.com","amazon.cn","walmart.com","target.com","bestbuy.com","ebay.com","aliexpress.com","dhgate.com","stockx.com","goat.com","farfetch.com","ssense.com","grailed.com","wikipedia.org","youtube.com","instagram.com","twitter.com","facebook.com","tiktok.com","baike.baidu.com"]
    results=[r for r in results if not any(b in r.get("link","").lower() for b in _BL)]
    return results


PLATFORMS = {
    "1688": {"label":"1688"},
    "taobao": {"label":"Taobao"},
    "xianyu": {"label":"Xianyu"},
    "weidian": {"label":"Weidian"},
}

async def _scrape_importyeti(brand, page, timeout=20000):
    factories = []
    try:
        url = f"https://www.importyeti.com/company/{brand.lower().replace(' ','-')}"
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)
        text = await page.inner_text("body")
        url2 = f"https://www.importyeti.com/search?q={quote_plus(brand)}"
        await page.goto(url2, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)
        text2 = await page.inner_text("body")
        combined = text + "\n" + text2
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

async def _scrape_yupoo(query, brand, page, timeout=25000, max_results=6):
    results = []
    try:
        q = f"{brand} {query}".strip() if brand else query
        url = f"https://www.yupoo.com/search/?q={quote_plus(q)}&tab=album"
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        await asyncio.sleep(2.0)
        links = await page.evaluate("""() => { return [...document.querySelectorAll('a[href*="/photos/"]')].map(a => a.href).filter(h => h.includes('yupoo.com')).slice(0, 8); }""")
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
            except Exception as e:
                continue
    except Exception as e:
        logger.warning("Yupoo scrape error: %s", e)
    return results


# ── Brand cache & enrichment ──────────────────────────────────────────────────

_BRAND_CACHE = {
    "needoh": {"cn": "斯基林", "cat": "toy"},
    "nice cube": {"cn": "斯基林", "cat": "toy"},
    "squishy cube": {"cn": "斯基林", "cat": "toy"},
    "stress ball": {"cn": "", "cat": "toy"},
    "fidget": {"cn": "", "cat": "toy"},
    "jordan": {"cn": "乔丹", "cat": "sneaker"},
    "yeezy": {"cn": "椰子", "cat": "sneaker"},
    "dunk": {"cn": "耐克", "cat": "sneaker"},
    "air force": {"cn": "耐克", "cat": "sneaker"},
    "samba": {"cn": "阿迪达斯", "cat": "sneaker"},
    "new balance": {"cn": "新百伦", "cat": "sneaker"},
    "asics": {"cn": "亚瑟士", "cat": "sneaker"},
    "tech fleece": {"cn": "耐克", "cat": "clothing"},
    "hellstar": {"cn": "地狱星", "cat": "clothing"},
    "sp5der": {"cn": "蜘蛛", "cat": "clothing"},
    "lv": {"cn": "路易威登", "cat": "bag"},
    "louis vuitton": {"cn": "路易威登", "cat": "bag"},
    "gucci": {"cn": "古驰", "cat": "bag"},
    "lego": {"cn": "乐高", "cat": "lego"},
    "lepin": {"cn": "乐拼", "cat": "lego"},
    "rolex": {"cn": "劳力士", "cat": "watch"},
    "omega": {"cn": "欧米茄", "cat": "watch"},
    "airpods": {"cn": "", "cat": "electronics"},
    "freight": {"cn": "", "cat": "freight"},
    "forwarder": {"cn": "", "cat": "freight"},
    "shipping": {"cn": "", "cat": "freight"},
}

_CAT_INJECT = {
    "toy": "玩具厂 硅胶制品 减压球 工厂 微信 一手货源",
    "sneaker": "鞋厂 莆田 运动鞋 过验 纯原 微信 一手货源",
    "clothing": "服装厂 纯原 过验 卫衣 微信 一手货源",
    "bag": "包包工厂 皮具厂 原单 真皮 微信 一手货源",
    "watch": "手表厂 钟表 纯原 同机芯 微信 一手货源",
    "electronics": "数码配件厂 工厂直营 批发 微信 一手货源",
    "lego": "积木厂 兼容乐高 小颗粒积木 工厂 批发 微信",
    "freight": "货代 美国专线 双清包税 敏感货专线 微信 DDP",
}

def get_brand_info(query):
    ql = query.lower()
    for key, info in _BRAND_CACHE.items():
        if key in ql:
            return info.copy()
    return {"cn": "", "cat": "general"}

def build_brand_aware_query(query, brand=""):
    info = get_brand_info(query)
    cn = info["cn"] or brand or ""
    cat = info["cat"]
    inject = _CAT_INJECT.get(cat, "厂家直销 一手货源 工厂 微信")
    # Use CN brand name + Chinese category inject only (skip English query - confuses Baidu)
    if cn:
        return f"{cn} {inject}"
    return f"{query} {inject}"

_FF_ROUTES = {
    "USA": ["美国专线", "中美专线", "美线"],
    "UK": ["英国专线", "中英专线"],
    "EU": ["欧洲专线", "中欧专线"],
    "AU": ["澳洲专线"],
    "CA": ["加拿大专线"],
}

_FF_HUBS = {
    "putian": ["莆田货运", "莆田货代"],
    "guangzhou": ["广州货代", "广州物流"],
    "shenzhen": ["深圳货代"],
    "yiwu": ["义乌货代"],
}

def build_freight_query(origin="", destination="USA", cargo_type="replica"):
    parts = ["货代", "货运代理"]
    parts.extend(_FF_ROUTES.get(destination.upper(), _FF_ROUTES["USA"]))
    if cargo_type in ("replica", "sensitive"):
        parts.extend(["敏感货", "仿牌", "双清包税", "DDP", "包税"])
    hub = (origin or "").lower().strip()
    parts.extend(_FF_HUBS.get(hub, []))
    parts.append("微信")
    seen = set()
    out = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return " ".join(out)

def score_freight_result(title, snippet):
    text = (title + " " + snippet).lower()
    score = 0
    if any(k in text for k in ("敏感货", "仿牌", "仿品")):
        score += 25
    if any(k in text for k in ("双清包税", "包清关", "ddp", "包税")):
        score += 20
    if any(k in text for k in ("美国专线", "中美专线", "美线")):
        score += 15
    if any(k in text for k in ("莆田", "广州", "义乌", "深圳", "福建")):
        score += 10
    if any(k in text for k in ("fedex", "dhl", "ups")):
        score += 5
    if any(k in text for k in ("不接仿牌", "只接普货", "只做普货")):
        score += 30
    if "海运" in text and "空运" not in text and "快递" not in text:
        score -= 15
    return max(0, min(100, score))
