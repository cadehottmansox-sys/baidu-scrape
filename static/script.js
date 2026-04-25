<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>SOURCEFINDER — Factory WeChat Sourcing</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: radial-gradient(ellipse at 20% 30%, #0a0a12 0%, #030308 100%);
            color: #f0f9ff;
            min-height: 100vh;
        }

        /* Animated background */
        body::before {
            content: '';
            position: fixed;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle at 30% 40%, rgba(0, 245, 255, 0.06) 0%, transparent 50%),
                        radial-gradient(circle at 70% 60%, rgba(124, 58, 237, 0.06) 0%, transparent 50%);
            animation: blobMove 20s ease-in-out infinite;
            pointer-events: none;
            z-index: 0;
        }

        @keyframes blobMove {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(1%, 0.5%) rotate(1deg); }
            66% { transform: translate(-0.5%, 1%) rotate(-0.5deg); }
        }

        .glass-card {
            background: rgba(15, 20, 35, 0.65);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(0, 245, 255, 0.15);
            border-radius: 24px;
            transition: all 0.3s ease;
            position: relative;
            z-index: 1;
        }

        .glass-card:hover {
            border-color: rgba(0, 245, 255, 0.4);
            box-shadow: 0 20px 40px -15px rgba(0, 245, 255, 0.2);
        }

        .input-neon {
            background: rgba(10, 14, 25, 0.8);
            border: 1px solid rgba(0, 245, 255, 0.2);
            border-radius: 16px;
            padding: 14px 18px;
            color: #f0f9ff;
            font-size: 14px;
            width: 100%;
            transition: all 0.2s ease;
            outline: none;
        }

        .input-neon:focus {
            border-color: #00f5ff;
            box-shadow: 0 0 15px rgba(0, 245, 255, 0.15);
        }

        .btn-neon {
            background: linear-gradient(135deg, rgba(0, 245, 255, 0.15), rgba(124, 58, 237, 0.15));
            border: 1px solid rgba(0, 245, 255, 0.3);
            color: #00f5ff;
            font-weight: 700;
            padding: 14px 32px;
            border-radius: 40px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
        }

        .btn-neon:hover {
            background: linear-gradient(135deg, rgba(0, 245, 255, 0.25), rgba(124, 58, 237, 0.25));
            transform: scale(1.02);
            box-shadow: 0 0 20px rgba(0, 245, 255, 0.3);
        }

        select.input-neon {
            cursor: pointer;
        }

        ::-webkit-scrollbar {
            width: 6px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(0, 245, 255, 0.3);
            border-radius: 10px;
        }

        @media (max-width: 768px) {
            .glass-card {
                border-radius: 16px;
            }
            .btn-neon {
                padding: 12px 20px;
                font-size: 13px;
            }
        }
    </style>
</head>
<body>
    <div style="position: relative; z-index: 1; max-width: 1400px; margin: 0 auto; padding: 20px;">
        
        <!-- Header -->
        <div class="glass-card" style="padding: 20px 28px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
            <div>
                <h1 style="font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #00f5ff, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    SOURCEFINDER
                </h1>
                <p style="color: #475569; font-size: 12px; margin-top: 4px;">Factory WeChat Extraction · 1688 API · Smart Search</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <span id="userName" style="color: #00f5ff; font-weight: 600;">Loading...</span>
                <button onclick="fetch('/logout', {method:'POST'}).then(()=>location.href='/')" class="btn-neon" style="padding: 8px 20px;">Logout</button>
            </div>
        </div>
        
        <!-- Search Card -->
        <div class="glass-card" style="padding: 28px; margin-bottom: 24px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 16px; align-items: end;">
                <div>
                    <label style="color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">BRAND (OPTIONAL)</label>
                    <input type="text" id="brandInput" class="input-neon" placeholder="Nike, Jordan, LV...">
                </div>
                <div>
                    <label style="color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">PRODUCT / KEYWORD</label>
                    <input type="text" id="queryInput" class="input-neon" placeholder="Tech Fleece, Jordan 4, Dunk Low...">
                </div>
                <div>
                    <label style="color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">MODE</label>
                    <select id="modeSelect" class="input-neon">
                        <option value="passing">🔥 PASSING / NFC</option>
                        <option value="supplier">🏭 FACTORY SUPPLIER</option>
                        <option value="batch">📦 BATCH COMPARE</option>
                        <option value="ff">✈️ FREIGHT</option>
                    </select>
                </div>
                <button id="searchBtn" class="btn-neon" style="padding: 14px 32px; font-size: 16px;">🔍 SEARCH</button>
            </div>
            
            <!-- Quick search buttons -->
            <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
                <span style="color: #475569; font-size: 12px;">🔥 Quick Search:</span>
                <button class="quick-search-btn" data-brand="Nike" data-query="Tech Fleece" style="background: none; border: 1px solid rgba(0, 245, 255, 0.2); color: #94a3b8; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">Nike Tech Fleece</button>
                <button class="quick-search-btn" data-brand="" data-query="Jordan 4" style="background: none; border: 1px solid rgba(0, 245, 255, 0.2); color: #94a3b8; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">Jordan 4</button>
                <button class="quick-search-btn" data-brand="" data-query="Yeezy 350" style="background: none; border: 1px solid rgba(0, 245, 255, 0.2); color: #94a3b8; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">Yeezy 350</button>
                <button class="quick-search-btn" data-brand="LV" data-query="Belt" style="background: none; border: 1px solid rgba(0, 245, 255, 0.2); color: #94a3b8; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">LV Belt</button>
                <button class="quick-search-btn" data-brand="Stone Island" data-query="Hoodie" style="background: none; border: 1px solid rgba(0, 245, 255, 0.2); color: #94a3b8; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">Stone Island</button>
            </div>
        </div>
        
        <!-- Stats Bar -->
        <div id="statsContainer"></div>
        
        <!-- Results -->
        <div id="resultsContainer" style="display: flex; flex-direction: column; gap: 16px;"></div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 40px 20px; color: #2d3748; font-size: 12px; border-top: 1px solid rgba(0, 245, 255, 0.1); margin-top: 40px;">
            SOURCEFINDER · Factory Direct Sourcing · WeChat IDs Extracted in Real Time
        </div>
        
    </div>
    
    <script src="{{ url_for('static', filename='script.js') }}"></script>
</body>
</html>
// ============================================================
// SMART SEARCH FIX - Added at bottom
// Prevents generic "leather factory" results for specific products
// ============================================================

function buildSmartQuery(brand, product, mode) {
    const lowerProduct = product.toLowerCase();
    
    // Detect product type and use CORRECT Chinese keywords
    let chineseKeywords = "";
    
    // Toy / Stress ball (Needoh, Nice Cube, squishy toys)
    if (lowerProduct.includes("needoh") || lowerProduct.includes("cube") || 
        lowerProduct.includes("stress") || lowerProduct.includes("ball") ||
        lowerProduct.includes("squishy") || lowerProduct.includes("toy") ||
        lowerProduct.includes("plush") || lowerProduct.includes("fidget")) {
        chineseKeywords = "玩具厂 塑胶制品 硅胶玩具 厂家 微信号";
    }
    // Sneakers / Shoes
    else if (lowerProduct.includes("jordan") || lowerProduct.includes("nike") || 
             lowerProduct.includes("yeezy") || lowerProduct.includes("dunk") ||
             lowerProduct.includes("shoe") || lowerProduct.includes("sneaker") ||
             lowerProduct.includes("af1") || lowerProduct.includes("air force")) {
        chineseKeywords = "莆田鞋 运动鞋厂 一手货源 微信";
    }
    // Clothing / Hoodies / Tech Fleece
    else if (lowerProduct.includes("hoodie") || lowerProduct.includes("shirt") ||
             lowerProduct.includes("jacket") || lowerProduct.includes("pants") ||
             lowerProduct.includes("tech fleece") || lowerProduct.includes("sweatshirt")) {
        chineseKeywords = "服装厂 卫衣 批发 厂家直销 微信";
    }
    // Bags / Wallets
    else if (lowerProduct.includes("bag") || lowerProduct.includes("purse") ||
             lowerProduct.includes("wallet") || lowerProduct.includes("backpack") ||
             lowerProduct.includes("lv") || lowerProduct.includes("gucci")) {
        chineseKeywords = "箱包厂 皮具 代工 一手货源 微信";
    }
    // Watches
    else if (lowerProduct.includes("watch") || lowerProduct.includes("rolex") ||
             lowerProduct.includes("omega") || lowerProduct.includes("ap")) {
        chineseKeywords = "手表厂 复刻 高仿 微信 厂家";
    }
    // Default - minimal keywords, don't pollute with 70+ terms
    else {
        chineseKeywords = "厂家 微信 一手货源";
    }
    
    // Build clean query - product first, then ONLY relevant keywords
    const brandPart = brand ? `${brand} ` : "";
    const smartQuery = `${brandPart}${product} ${chineseKeywords}`;
    
    console.log(`[Smart Query] ${smartQuery}`);
    return smartQuery;
}

// Hook into existing search if possible
(function enhanceSearch() {
    // Try to intercept supplier form submission
    const supplierForm = document.getElementById('supplierForm');
    if (supplierForm) {
        const originalSubmit = supplierForm.onsubmit;
        supplierForm.addEventListener('submit', function(e) {
            const brandInput = document.getElementById('brandInput');
            const queryInput = document.getElementById('queryInput');
            const modeSelect = document.getElementById('supplierMode') || document.getElementById('modeSelect');
            
            if (queryInput && queryInput.value) {
                const brand = brandInput ? brandInput.value : '';
                const product = queryInput.value;
                const mode = modeSelect ? modeSelect.value : 'supplier';
                const enhancedQuery = buildSmartQuery(brand, product, mode);
                
                // Store enhanced query in a hidden field or data attribute
                queryInput.setAttribute('data-smart-query', enhancedQuery);
            }
        });
    }
    
    // Also enhance the fetch calls in existing search functions
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        // If it's a search request, check if we need to enhance the query
        if (url === '/search' && options && options.body) {
            try {
                const body = JSON.parse(options.body);
                if (body.query && !body._enhanced) {
                    const brand = body.brand || '';
                    const product = body.query;
                    const mode = body.mode || 'supplier';
                    const enhancedQuery = buildSmartQuery(brand, product, mode);
                    
                    // Create new body with enhanced query
                    const newBody = { ...body, query: enhancedQuery, _enhanced: true };
                    options.body = JSON.stringify(newBody);
                }
            } catch(e) {
                console.log('Enhance error:', e);
            }
        }
        return originalFetch.call(this, url, options);
    };
    
    console.log('✅ Smart search enhancement loaded');
})();
