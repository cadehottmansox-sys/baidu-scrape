// ============================================================
// SOURCEFINDER — COMPLETE REWRITE
// NO INNERHTML WITH ONCLICK — ALL DOM METHODS
// ============================================================

(function() {
    'use strict';
    
    // State
    let currentUser = null;
    let searchResults = [];
    let savedWechats = JSON.parse(localStorage.getItem('sf_wechats') || '[]');
    
    // ============================================================
    // DOM Elements
    // ============================================================
    function getElements() {
        return {
            searchBtn: document.getElementById('searchBtn'),
            queryInput: document.getElementById('queryInput'),
            brandInput: document.getElementById('brandInput'),
            modeSelect: document.getElementById('modeSelect'),
            resultsContainer: document.getElementById('resultsContainer'),
            statsContainer: document.getElementById('statsContainer')
        };
    }
    
    // ============================================================
    // UI Helpers
    // ============================================================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: ${type === 'success' ? 'rgba(0, 255, 136, 0.9)' : type === 'error' ? 'rgba(255, 0, 255, 0.9)' : 'rgba(0, 245, 255, 0.9)'};
            color: #000;
            padding: 12px 24px;
            border-radius: 40px;
            font-weight: 600;
            font-size: 13px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-family: 'Inter', sans-serif;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
    
    function copyToClipboard(text, label) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied: ${label || text}`, 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast(`Copied: ${label || text}`, 'success');
        });
    }
    
    // ============================================================
    // Build Result Card (Pure DOM — No innerHTML strings with onclick)
    // ============================================================
    function buildResultCard(result, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = `${index * 0.05}s`;
        
        // Score badge
        const score = result.factory_score || 0;
        const scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
        const scoreText = score >= 70 ? '🔥 FACTORY' : score >= 40 ? '⭐ LIKELY' : '⚠️ CHECK';
        
        const scoreBadge = document.createElement('div');
        scoreBadge.className = `score-badge ${scoreClass}`;
        scoreBadge.innerHTML = `${scoreText} ${score}%`;
        card.appendChild(scoreBadge);
        
        // Title
        const title = document.createElement('div');
        title.style.cssText = 'font-size: 16px; font-weight: 700; margin: 12px 0 8px; color: #f0f9ff;';
        title.textContent = result.title || 'Untitled';
        card.appendChild(title);
        
        // Platform tag
        const platform = document.createElement('span');
        platform.style.cssText = 'display: inline-block; background: rgba(0, 245, 255, 0.1); border-radius: 20px; padding: 4px 12px; font-size: 11px; margin-bottom: 10px; color: #00f5ff;';
        platform.textContent = result.platform || 'Baidu';
        card.appendChild(platform);
        
        // Snippet
        if (result.snippet) {
            const snippet = document.createElement('div');
            snippet.style.cssText = 'color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 14px;';
            snippet.textContent = result.snippet.substring(0, 200);
            card.appendChild(snippet);
        }
        
        // Signals
        if (result.signals && result.signals.length) {
            const signalsContainer = document.createElement('div');
            signalsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;';
            result.signals.forEach(signal => {
                const tag = document.createElement('span');
                tag.className = 'signal-tag signal-factory';
                tag.textContent = signal;
                signalsContainer.appendChild(tag);
            });
            card.appendChild(signalsContainer);
        }
        
        // WeChat IDs
        if (result.wechat_ids && result.wechat_ids.length) {
            const wechatContainer = document.createElement('div');
            wechatContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;';
            
            result.wechat_ids.forEach(wc => {
                const chip = document.createElement('div');
                chip.className = 'wechat-chip';
                chip.textContent = `💬 ${wc.id || wc}`;
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copy';
                copyBtn.style.cssText = 'background: rgba(0, 245, 255, 0.2); border: none; border-radius: 20px; padding: 2px 10px; margin-left: 8px; cursor: pointer; color: #00f5ff; font-size: 10px;';
                
                const wechatId = wc.id || wc;
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyToClipboard(wechatId, 'WeChat ID');
                    
                    // Save to localStorage
                    if (!savedWechats.includes(wechatId)) {
                        savedWechats.unshift(wechatId);
                        localStorage.setItem('sf_wechats', JSON.stringify(savedWechats.slice(0, 50)));
                    }
                });
                
                chip.appendChild(copyBtn);
                wechatContainer.appendChild(chip);
            });
            card.appendChild(wechatContainer);
        }
        
        // Action buttons
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 10px; margin-top: 8px;';
        
        if (result.link) {
            const viewBtn = document.createElement('a');
            viewBtn.href = result.link;
            viewBtn.target = '_blank';
            viewBtn.textContent = '🔗 View Page';
            viewBtn.style.cssText = 'color: #00f5ff; text-decoration: none; font-size: 12px; padding: 6px 12px; background: rgba(0, 245, 255, 0.1); border-radius: 20px;';
            actions.appendChild(viewBtn);
        }
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save WeChat';
        saveBtn.style.cssText = 'background: none; border: 1px solid rgba(0, 245, 255, 0.3); color: #00f5ff; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 12px;';
        saveBtn.addEventListener('click', () => {
            if (result.wechat_ids && result.wechat_ids.length) {
                result.wechat_ids.forEach(wc => {
                    const wid = wc.id || wc;
                    if (!savedWechats.includes(wid)) {
                        savedWechats.unshift(wid);
                    }
                });
                localStorage.setItem('sf_wechats', JSON.stringify(savedWechats.slice(0, 50)));
                showToast(`Saved ${result.wechat_ids.length} WeChat ID(s)`, 'success');
            }
        });
        actions.appendChild(saveBtn);
        
        card.appendChild(actions);
        
        return card;
    }
    
    // ============================================================
    // Smart Search
    // ============================================================
    async function performSmartSearch() {
        const elements = getElements();
        const query = elements.queryInput?.value.trim();
        const brand = elements.brandInput?.value.trim();
        const mode = elements.modeSelect?.value;
        
        if (!query) {
            showToast('Enter a product or brand to search', 'error');
            return;
        }
        
        if (elements.searchBtn) {
            elements.searchBtn.disabled = true;
            elements.searchBtn.textContent = '🔍 SEARCHING...';
        }
        
        if (elements.resultsContainer) {
            elements.resultsContainer.innerHTML = '<div style="text-align: center; padding: 60px; color: #00f5ff;">🚀 Searching across 1688, Baidu, Douyin...<br><span style="font-size: 12px; color: #475569;">This may take 15-30 seconds</span></div>';
        }
        
        try {
            const response = await fetch('/api/smart-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, brand, mode })
            });
            
            const data = await response.json();
            
            if (elements.resultsContainer) {
                elements.resultsContainer.innerHTML = '';
            }
            
            if (data.results && data.results.length > 0) {
                if (elements.statsContainer) {
                    elements.statsContainer.innerHTML = `
                        <div style="background: rgba(0, 245, 255, 0.1); border-radius: 12px; padding: 12px 20px; margin-bottom: 20px; display: flex; justify-content: space-between;">
                            <span>🎯 Found ${data.results.length} suppliers</span>
                            <span>🏭 ${data.results.filter(r => r.factory_score >= 70).length} high-confidence</span>
                            <span>💬 ${data.results.reduce((sum, r) => sum + (r.wechat_ids?.length || 0), 0)} WeChat IDs</span>
                        </div>
                    `;
                }
                
                data.results.forEach((result, i) => {
                    if (elements.resultsContainer) {
                        elements.resultsContainer.appendChild(buildResultCard(result, i));
                    }
                });
            } else {
                if (elements.resultsContainer) {
                    elements.resultsContainer.innerHTML = '<div style="text-align: center; padding: 60px; color: #475569;">😔 No results found. Try different keywords or enable Deep Scan.</div>';
                }
            }
            
        } catch (error) {
            console.error('Search error:', error);
            if (elements.resultsContainer) {
                elements.resultsContainer.innerHTML = '<div style="text-align: center; padding: 60px; color: #ff00ff;">❌ Search failed. Check your connection and try again.</div>';
            }
        } finally {
            if (elements.searchBtn) {
                elements.searchBtn.disabled = false;
                elements.searchBtn.textContent = '🔍 SEARCH';
            }
        }
    }
    
    // ============================================================
    // 1688 Search
    // ============================================================
    async function search1688() {
        const elements = getElements();
        const query = elements.queryInput?.value.trim();
        const brand = elements.brandInput?.value.trim();
        
        if (!query) return;
        
        if (elements.resultsContainer) {
            elements.resultsContainer.innerHTML = '<div style="text-align: center; padding: 60px; color: #00f5ff;">🏭 Searching 1688 factories...</div>';
        }
        
        try {
            const response = await fetch('/api/1688/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, brand, min_repurchase: 70 })
            });
            
            const data = await response.json();
            
            if (elements.resultsContainer) {
                elements.resultsContainer.innerHTML = '';
            }
            
            if (data.results && data.results.length > 0) {
                data.results.forEach((result, i) => {
                    if (elements.resultsContainer) {
                        elements.resultsContainer.appendChild(buildResultCard(result, i));
                    }
                });
            }
            
        } catch (error) {
            console.error('1688 search error:', error);
        }
    }
    
    // ============================================================
    // Event Listeners
    // ============================================================
    function initEventListeners() {
        const elements = getElements();
        
        if (elements.searchBtn) {
            elements.searchBtn.addEventListener('click', performSmartSearch);
        }
        
        // Enter key to search
        if (elements.queryInput) {
            elements.queryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    performSmartSearch();
                }
            });
        }
    }
    
    // ============================================================
    // Load User Info
    // ============================================================
    async function loadUser() {
        try {
            const response = await fetch('/api/me');
            const data = await response.json();
            if (data.valid) {
                currentUser = data;
                const userSpan = document.getElementById('userName');
                if (userSpan) userSpan.textContent = data.name || 'User';
            }
        } catch (e) {
            console.log('Not logged in');
        }
    }
    
    // ============================================================
    // Init
    // ============================================================
    function init() {
        loadUser();
        initEventListeners();
        
        // Add style for animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    init();
})();
