const UIEngine = {
    logToHub: (msg) => {
        const log = document.createElement('div');
        log.className = "p-3 rounded-lg bg-white/[0.02] border border-white/5 text-[9px] font-medium leading-relaxed";
        log.innerHTML = `<span class="text-blue-500 font-bold opacity-70">[${Utils.formatTimeLog()}]</span> ${msg}`;
        const cont = document.getElementById('ai-logs');
        cont.prepend(log);
        if (cont.children.length > 8) cont.lastChild.remove();
    },

    renderIntelligence: (data, state, logCallback) => {
        const container = document.getElementById('signal-display');
        const idle = document.getElementById('idle-msg');
        const card = document.getElementById('signal-card');
        const badge = document.getElementById('market-badge');

        idle.classList.add('hidden');
        container.classList.remove('hidden');

        const isNeutral = data.bias === 'NEUTRAL';
        card.className = `setup-card p-5 rounded-2xl border border-white/5 bg-white/[0.02] ${isNeutral ? '' : data.bias.toLowerCase()}`;
        
        document.getElementById('setup-dir').innerText = data.bias;
        document.getElementById('setup-dir').className = `text-xs font-black px-2 py-0.5 rounded uppercase tracking-tighter ${data.bias === 'LONG' ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`;
        
        document.getElementById('setup-prob').innerText = `${data.confidence}%`;
        document.getElementById('entry-p').innerText = data.entry.toLocaleString();
        document.getElementById('tp-p').innerText = data.tp.toLocaleString();
        document.getElementById('sl-p').innerText = data.sl.toLocaleString();
        document.getElementById('setup-summary').innerText = data.summary;

        badge.innerText = data.bias;
        badge.className = `text-[9px] font-bold px-2 py-0.5 rounded uppercase border ${data.bias === 'LONG' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`;

        logCallback(`Model detected ${data.bias} structure for ${state.symbol} (${data.confidence}% Confidence)`);
    },

    _formatUsd: (n) => {
        if (n === null || n === undefined) return '--';
        if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
        if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
        return `$${n.toLocaleString()}`;
    },

    renderMarketData: ({ globalCap, coinCap, funding, oi }) => {
        document.getElementById('stat-global-cap').innerText = UIEngine._formatUsd(globalCap);
        document.getElementById('stat-coin-cap').innerText = UIEngine._formatUsd(coinCap);

        const fundingEl = document.getElementById('stat-funding');
        if (funding === null) {
            fundingEl.innerText = '--';
            fundingEl.className = 'stat-value';
        } else {
            fundingEl.innerText = `${funding >= 0 ? '+' : ''}${funding.toFixed(4)}%`;
            fundingEl.className = `stat-value ${funding >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        document.getElementById('stat-oi').innerText = oi !== null ? `${oi.toLocaleString(undefined, { maximumFractionDigits: 0 })} units` : '--';
    },

    renderBiasTable: (results) => {
        const toneStyles = { BULL: 'text-green-400 bg-green-500/10 border-green-500/20', BEAR: 'text-red-400 bg-red-500/10 border-red-500/20', NEUTRAL: 'text-gray-400 bg-white/5 border-white/10' };
        const container = document.getElementById('bias-table');
        container.innerHTML = results.map(r => `
            <div class="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border ${toneStyles[r.bias]}">
                <span class="text-[9px] font-bold text-gray-500 uppercase">${r.label}</span>
                <span class="text-[9px] font-black uppercase">${r.bias}</span>
            </div>
        `).join('');
    },

    updateQuantVitals: (data, state) => {
        if (state) ChartEngine.updateIndicators(state, data);
    }
};

document.getElementById('exchangeSelect').addEventListener('change', (e) => Terminal.updateExchange(e.target.value));

// Global Input and Selection Listeners
document.getElementById('assetSelect').addEventListener('change', (e) => Terminal.updateSymbol(e.target.value));

document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Terminal.updateInterval(btn.dataset.tf);
    });
});

// First-visit demo banner — dismissible, remembers the choice per browser
const banner = document.getElementById('demo-banner');
if (banner) {
    if (localStorage.getItem('coinscope_banner_dismissed') === '1') {
        banner.style.display = 'none';
    }
    document.getElementById('dismiss-banner')?.addEventListener('click', () => {
        banner.style.display = 'none';
        localStorage.setItem('coinscope_banner_dismissed', '1');
    });
}

// AI provider picker — remembers your last choice in this browser.
// Only the provider name (e.g. "gemini") travels to the proxy; the actual
// key for that provider lives server-side in .env and never leaves the server.
const providerSelect = document.getElementById('providerSelect');
const savedProvider = localStorage.getItem('coinscope_provider_choice');
if (savedProvider && [...providerSelect.options].some(o => o.value === savedProvider)) {
    providerSelect.value = savedProvider;
}
providerSelect.addEventListener('change', () => {
    localStorage.setItem('coinscope_provider_choice', providerSelect.value);
});
