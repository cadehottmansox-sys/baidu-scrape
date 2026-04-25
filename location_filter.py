# location_filter.py
# Filters and prioritizes results by location
# ADD THIS FILE to your project root

# High-value locations (rep capitals)
PRIORITY_LOCATIONS = {
    "putian": 30,      # Sneeaker capital - highest value
    "fujian": 25,      # Fujian province (contains Putian)
    "quanzhou": 25,    # Shoe manufacturing hub
    "jinjiang": 20,    # Another shoe hub
    "guangdong": 15,   # General manufacturing province
    "guangzhou": 15,   # Major trade hub
    "shenzhen": 15,    # Electronics hub
    "zhejiang": 10,    # General manufacturing
    "yiwu": 10,        # Small commodity hub
}

# Locations that indicate official/retail (filter out)
FILTER_LOCATIONS = {
    "beaverton": -50,   # Nike HQ
    "netherlands": -40, # Many official EU distribution
    "usa": -30,         # Official US retail
    "germany": -25,     # Adidas HQ
    "uk": -20,
    "canada": -15,
}

def extract_location(text: str) -> tuple:
    """
    Extract location from text and return (location_name, score_modifier)
    """
    text_lower = text.lower()
    
    # Check priority locations first
    for loc, score in PRIORITY_LOCATIONS.items():
        if loc in text_lower:
            return (loc, score)
    
    # Check filter locations
    for loc, score in FILTER_LOCATIONS.items():
        if loc in text_lower:
            return (loc, score)
    
    return (None, 0)

def filter_and_score_by_location(results: list) -> list:
    """
    Add location scores to results and filter out bad locations
    """
    filtered = []
    
    for result in results:
        text = f"{result.get('title', '')} {result.get('snippet', '')} {result.get('link', '')}"
        location, score_mod = extract_location(text)
        
        # Skip results that are definitely not factories
        if score_mod < -20:
            continue
        
        result["location_score"] = score_mod
        result["detected_location"] = location
        
        filtered.append(result)
    
    return filtered
