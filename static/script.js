// SOURCEFINDER - Frontend JavaScript
(function() {
    'use strict';
    
    let searchResults = [];
    let savedWechats = JSON.parse(localStorage.getItem('sf_wechats') || '[]');
    
    // Helper: Show toast notification
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: ${type === 'success' ? '#00ff88' : type === 'error' ? '#ff00ff' : '#00f5ff'};
            color: #000;
            padding: 12px 24px;
            border-radius: 40px;
            font-weight: 600;
            font-size: 13px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-family: 'Inter', sans-serif;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
    
    // Helper: Copy to clipboard
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
    
    // Build a result card
    function buildResultCard(result, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.cssText = `
            background: rgba(10, 14, 25, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 245, 255, 0.12);
            border-radius: 20px;
            padding: 20px;
            margin-bottom: 16px;
            transition: all 0.25s ease;
        `;
        
        const score = result.factory_score || 0;
        const scoreColor = score >= 70 ? '#00ff88' : score >= 40 ? '#00f5ff' : '#ff00ff';
        const scoreText = score >= 70 ? '🔥 FACTORY' : score >= 40 ? '⭐ LIKELY' : '⚠️ CHECK';
        
        // Score badge
        const badge = document.createElement('div');
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 40px;
            font-size: 12px;
            font-weight: 700;
            background: ${scoreColor}20;
            border: 1px solid ${scoreColor}40;
            color: ${scoreColor};
            margin-bottom: 12px;
        `;
        badge.textContent = `${scoreText} ${score}%`;
        card.appendChild(badge);
        
        // Title
        const title = document.createElement('div');
        title.style.cssText = 'font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #f0f9ff;';
        title.textContent = result.title || 'Untitled';
        card.appendChild(title);
        
        // Platform
        const platform = document.createElement('div');
        platform.style.cssText = 'color: #00f5ff; font-size: 11px; margin-bottom: 10px;';
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
            const signalsDiv = document.createElement('div');
            signalsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;';
            result.signals.forEach(signal => {
                const tag = document.createElement('span');
                tag.style.cssText = 'background: rgba(0, 245, 255, 0.1); border-radius: 20px; padding: 4px 10px; font-size: 11px; color: #00f5ff;';
                tag.textContent = signal;
                signalsDiv.appendChild(tag);
            });
            card.appendChild(signalsDiv);
        }
        
        // WeChat IDs
        const wechats = result.wechat_ids || [];
        if (wechats.length > 0) {
            const wechatDiv = document.createElement('div');
            wechatDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;';
            
            wechats.forEach(wc => {
                const wid = wc.id || wc;
                const chip = document.createElement('div');
                chip.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(0, 245, 255, 0.1);
                    border: 1px solid rgba(0, 245, 255, 0.25);
                    border-radius: 40px;
                    padding: 6px 14px;
                    font-family: monospace;
                    font-size: 13px;
                    font-weight: 600;
                    color: #00f5ff;
                    cursor: pointer;
                `;
                chip.innerHTML = `💬 ${wid} <span style="background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 20px; margin-left: 4px;">Copy</span>`;
                chip.addEventListener('click', () => copyToClipboard(wid, 'WeChat ID'));
                wechatDiv.appendChild(chip);
            });
            card.appendChild(wechatDiv);
        }
        
        // Link
        if (result.link && result.link !== '#') {
            const link = document.createElement('a');
            link.href = result.link;
            link.target = '_blank';
            link.style.cssText = 'color: #00f5ff; text-decoration: none; font-size: 12px;';
            link.textContent = '🔗 View on 1688 →';
            card.appendChild(link);
        }
        
        return card;
    }
    
    // Perform smart search
    async function performSearch() {
        const brandInput = document.getElementById('brandInput');
        const queryInput = document.getElementById('queryInput');
        const modeSelect = document.getElementById('modeSelect');
        const resultsDiv = document.getElementById('resultsContainer');
        const statsDiv = document.getElementById('statsContainer');
        const searchBtn = document.getElementById('searchBtn');
        
        const brand = brandInput?.value.trim() || '';
        const query = queryInput?.value.trim();
        const mode = modeSelect?.value || 'passing';
        
        if (!query) {
            showToast('Enter a product or brand to search', 'error');
            return;
        }
        
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.textContent = '🔍 SEARCHING...';
        }
        
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 60px; color: #00f5ff;">🚀 Searching across 1688, Baidu, Douyin...<br><span style="font-size: 12px; color: #475569;">This may take 15-30 seconds</span></div>';
        }
        
        try {
            const response = await fetch('/api/smart-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand, query, mode })
            });
            
            const data = await response.json();
            
            if (resultsDiv) resultsDiv.innerHTML = '';
            
            if (data.results && data.results.length > 0) {
                if (statsDiv) {
                    statsDiv.innerHTML = `
                        <div style="background: rgba(0, 245, 255, 0.1); border-radius: 12px; padding: 12px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                            <span>🎯 Found ${data.results.length} suppliers</span>
                            <span>🏭 ${data.results.filter(r => r.factory_score >= 70).length} high-confidence</span>
                            <span>💬 ${data.results.reduce((sum, r) => sum + (r.wechat_ids?.length || 0), 0)} WeChat IDs</span>
                        </div>
                    `;
                }
                
                data.results.forEach((result, i) => {
                    if (resultsDiv) resultsDiv.appendChild(buildResultCard(result, i));
                });
            } else {
                if (resultsDiv) {
                    resultsDiv.innerHTML = '<div style="text-align: center; padding: 60px; color: #475569;">😔 No results found. Try different keywords.</div>';
                }
            }
            
        } catch (error) {
            console.error('Search error:', error);
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 60px; color: #ff00ff;">❌ Search failed. Check your connection and try again.</div>';
            }
        } finally {
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.textContent = '🔍 SEARCH';
            }
        }
    }
    
    // Load user info
    async function loadUser() {
        try {
            const response = await fetch('/api/me');
            const data = await response.json();
            if (data.valid) {
                const userNameSpan = document.getElementById('userName');
                if (userNameSpan) userNameSpan.textContent = data.name || 'User';
            }
        } catch (e) {
            console.log('Not logged in or session expired');
        }
    }
    
    // Setup event listeners
    function init() {
        loadUser();
        
        const searchBtn = document.getElementById('searchBtn');
        const queryInput = document.getElementById('queryInput');
        
        if (searchBtn) searchBtn.addEventListener('click', performSearch);
        if (queryInput) {
            queryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }
        
        // Quick search buttons
        const quickBtns = document.querySelectorAll('.quick-search-btn');
        quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const brand = btn.dataset.brand || '';
                const query = btn.dataset.query || '';
                const brandInput = document.getElementById('brandInput');
                const
