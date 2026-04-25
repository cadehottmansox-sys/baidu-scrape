# intent_detector.py
# Detects what product category the user is actually searching for
# ADD THIS FILE to your project root

import re

# Product category mapping
PRODUCT_INTENTS = {
    "stress_toy": {
        "keywords": ["needoh", "cube", "stress", "squishy", "slow rise", "fidget", "捏捏", "减压", "慢回弹"],
        "chinese": "减压球 慢回弹 捏捏乐 硅胶玩具",
        "factory_terms": "玩具厂 硅胶制品厂 塑胶厂",
        "exclude": ["鞋", "leather", "莆田鞋", "运动鞋"]
    },
    "sneaker": {
        "keywords": ["jordan", "nike", "yeezy", "dunk", "af1", "air force", "sneaker", "shoe", "莆田鞋", "运动鞋"],
        "chinese": "运动鞋",
        "factory_terms": "鞋厂 莆田鞋厂 运动鞋厂 生产厂家",
        "exclude": ["leather", "factory official", "nike.com"]
    },
    "clothing": {
        "keywords": ["hoodie", "tech fleece", "sweatshirt", "jacket", "pants", "卫衣", "夹克"],
        "chinese": "服装",
        "factory_terms": "服装厂 制衣厂 服饰厂 生产厂家",
        "exclude": ["official", "retail", "store"]
    },
    "bag": {
        "keywords": ["bag", "purse", "wallet", "backpack", "包", "钱包", "背包"],
        "chinese": "箱包",
        "factory_terms": "箱包厂 皮具厂 手袋厂",
        "exclude": []
    },
    "watch": {
        "keywords": ["watch", "rolex", "omega", "ap", "手表"],
        "chinese": "手表",
        "factory_terms": "手表厂 钟表厂",
        "exclude": ["repair", "service"]
    },
    "sunglasses": {
        "keywords": ["sunglasses", "oakley", "rayban", "眼镜", "太阳镜"],
        "chinese": "太阳镜",
        "factory_terms": "眼镜厂 光学厂",
        "exclude": []
    },
    "hat": {
        "keywords": ["hat", "cap", "beanie", "snapback", "帽子"],
        "chinese": "帽子",
        "factory_terms": "帽子厂 制帽厂",
        "exclude": []
    },
    "jersey": {
        "keywords": ["jersey", "nfl", "nba", "mlb", "soccer", "球衣"],
        "chinese": "球衣",
        "factory_terms": "球衣厂 运动服厂",
        "exclude": ["official", "fanatics"]
    },
    "toy": {
        "keywords": ["bearbrick", "labubu", "popmart", "玩具", "figure", "kaws"],
        "chinese": "玩具 公仔",
        "factory_terms": "玩具厂 塑胶厂 模型厂",
        "exclude": []
    }
}

def detect_intent(query: str, brand: str = "") -> dict:
    """
    Detect what product category the user is searching for.
    Returns category info with Chinese terms and factory keywords.
    """
    combined = f"{query} {brand}".lower()
    
    # Score each intent based on keyword matches
    scores = {}
    for intent, data in PRODUCT_INTENTS.items():
        score = 0
        for keyword in data["keywords"]:
            if keyword.lower() in combined:
                score += 1
        if score > 0:
            scores[intent] = score
    
    # Get best match
    if scores:
        best_intent = max(scores, key=scores.get)
        intent_data = PRODUCT_INTENTS[best_intent].copy()
        intent_data["detected_intent"] = best_intent
        intent_data["confidence"] = min(scores[best_intent] / 3, 1.0)
        return intent_data
    
    # Default fallback
    return {
        "detected_intent": "general",
        "chinese": "",
        "factory_terms": "厂家 生产 工厂 微信 一手货源",
        "exclude": [],
        "confidence": 0.3
    }

def build_targeted_query(query: str, brand: str = "") -> str:
    """Build an optimized search query based on detected intent"""
    intent = detect_intent(query, brand)
    
    base = f"{brand} {query}".strip() if brand else query
    
    if intent["detected_intent"] == "stress_toy":
        # For Needoh-style products, use specific Chinese terms
        return f"{base} {intent['chinese']} {intent['factory_terms']}"
    
    if intent["detected_intent"] == "sneaker":
        # For sneakers, prioritize Putian sources
        return f"{base} {intent['factory_terms']} 莆田 一手货源"
    
    if intent["detected_intent"] == "clothing":
        # For clothing, focus on manufacturers
        return f"{base} {intent['factory_terms']} 批发 定制"
    
    # Default: minimal injection (YOUR CURRENT APPROACH WAS ADDING TOO MANY)
    return f"{base} {intent['factory_terms']}"

def should_exclude_result(result_text: str, intent: dict) -> bool:
    """Check if a result should be filtered out"""
    result_lower = result_text.lower()
    for exclude_term in intent.get("exclude", []):
        if exclude_term.lower() in result_lower:
            return True
    return False
