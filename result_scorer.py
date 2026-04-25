# result_scorer.py
# Scores search results by relevance
# ADD THIS FILE to your project root

import re

def score_result(result: dict, query: str, brand: str = "") -> dict:
    """
    Score a search result 0-100 based on relevance to user's query.
    Returns the result with added score and signals.
    """
    title = result.get("title", "").lower()
    snippet = result.get("snippet", "").lower()
    link = result.get("link", "").lower()
    combined = f"{title} {snippet}"
    
    query_lower = query.lower()
    brand_lower = brand.lower() if brand else ""
    
    score = 0
    signals = []
    
    # 1. Exact product match (highest weight - 40 points)
    if query_lower in combined:
        score += 30
        signals.append("🎯 Exact product match")
    elif any(word in combined for word in query_lower.split()[:3]):
        score += 15
        signals.append("📦 Partial product match")
    
    # 2. Brand match (20 points)
    if brand_lower and brand_lower in combined:
        score += 20
        signals.append(f"✅ Brand '{brand}' matched")
    
    # 3. Factory signals (20 points)
    factory_terms = ["工厂", "厂", "factory", "manufacturer", "厂家", "生产"]
    for term in factory_terms:
        if term in combined:
            score += 4
            signals.append(f"🏭 Factory signal: '{term}'")
            break
    
    # 4. Location priority (15 points)
    putian_terms = ["莆田", "putian", "福建", "fujian", "晋江", "泉州", "quanzhou"]
    for term in putian_terms:
        if term in combined:
            score += 15
            signals.append(f"📍 Location: {term} (rep capital)")
            break
    
    # 5. WeChat presence (10 points)
    wechat_patterns = [r'微信', r'wechat', r'wx[\s:：]*[a-z0-9_]+', r'[a-z0-9_]{6,20}']
    for pattern in wechat_patterns:
        if re.search(pattern, combined, re.I):
            score += 10
            signals.append("💬 WeChat contact found")
            break
    
    # 6. Yupoo signal (bonus 5 points)
    if "yupoo" in link or "yupoo" in combined:
        score += 5
        signals.append("📸 Yupoo catalog (rep seller signal)")
    
    # PENALTIES
    
    # Penalize official retail sites (-30 points)
    retail_domains = ["nike.com", "adidas.com", "gucci.com", "lv.com", "amazon", "walmart", "target", "footlocker"]
    for domain in retail_domains:
        if domain in link:
            score -= 30
            signals.append(f"⚠️ Official retail: {domain}")
            break
    
    # Penalize news/blog posts (-15 points)
    blog_terms = ["blog", "news", "review", "top 10", "best", "指南", "评测"]
    for term in blog_terms:
        if term in combined:
            score -= 15
            signals.append("📄 Blog/news article (not a supplier)")
            break
    
    # Cap score between 0 and 100
    final_score = max(0, min(100, score))
    
    # Determine grade
    if final_score >= 70:
        grade = "A 🔥 HIGH CONFIDENCE"
    elif final_score >= 50:
        grade = "B ⭐ MEDIUM CONFIDENCE"
    elif final_score >= 30:
        grade = "C ⚠️ LOW CONFIDENCE"
    else:
        grade = "D ❌ UNLIKELY"
    
    # Add scoring to result
    result["relevance_score"] = final_score
    result["relevance_grade"] = grade
    result["signals"] = signals
    
    return result

def sort_by_relevance(results: list, query: str, brand: str = "") -> list:
    """Sort results by relevance score, highest first"""
    scored = [score_result(r, query, brand) for r in results]
    return sorted(scored, key=lambda x: x.get("relevance_score", 0), reverse=True)
