/**
 * AI signal engine.
 *
 * IMPORTANT: This file never holds an API key. Real AI keys must never sit in
 * browser-side JS — anyone can open devtools and steal them. Instead this
 * calls a tiny local proxy server (see /server) that holds the keys on the
 * backend and forwards the request to whichever provider you pick.
 *
 *   1. cd server && npm install
 *   2. cp .env.example .env   and paste keys for whichever provider(s) you want
 *   3. npm start              (runs the proxy on http://localhost:8787)
 *
 * The dropdown next to "Run Inference" picks the provider (Gemini, DeepSeek,
 * Claude, or ChatGPT). Only the provider *name* travels from the browser to
 * the proxy — never a key. The proxy looks up the matching key from its own
 * .env file and calls that provider directly.
 *
 * If the proxy isn't running (e.g. you're just browsing the static GitHub
 * Pages demo), this falls back to DEMO_MODE and returns a clearly-labeled
 * mock signal so the UI still works end to end.
 */
const AI_PROXY_URL = 'http://localhost:8787/api/signal';

const AIEngine = {
    runInference: async (state, logCallback, renderCallback) => {
        if (state.isAnalyzing) return;
        state.isAnalyzing = true;

        document.getElementById('loading-overlay').classList.remove('hidden');
        document.getElementById('inference-btn').disabled = true;

        const closes = (state.data || []).map(d => d.close);
        const rsi = closes.length ? Indicators.calculateRSI(closes, 14).toFixed(1) : '--';
        const trend = closes.length >= 20 ? (closes[closes.length - 1] > closes[closes.length - 20] ? 'BULL' : 'BEAR') : '--';
        const provider = document.getElementById('providerSelect')?.value || 'gemini';

        const payload = { symbol: state.symbol, rsi, trend, price: state.lastPrice, provider };

        try {
            const response = await fetch(AI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const body = await response.json();
            if (!response.ok) throw new Error(body.error || `Proxy responded ${response.status}`);
            renderCallback(body, state, logCallback);
            if (body._providerUsed) logCallback(`Signal generated via ${body._providerUsed}.`);
        } catch (e) {
            console.warn("AI proxy unreachable or errored, falling back to demo mode:", e.message);
            const demo = AIEngine._demoSignal(state);
            renderCallback(demo, state, logCallback);
            logCallback(`⚠ Demo mode — ${e.message || 'no AI backend running'} (see README to connect a real key).`);
        } finally {
            state.isAnalyzing = false;
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('inference-btn').disabled = false;
        }
    },

    // Deterministic-ish mock signal so the public GitHub Pages demo still
    // feels alive without anyone's real API key attached to it.
    _demoSignal: (state) => {
        const biasRoll = Math.random();
        const bias = biasRoll > 0.6 ? 'LONG' : biasRoll > 0.3 ? 'SHORT' : 'NEUTRAL';
        const price = state.lastPrice || 100;
        const spread = price * 0.01;
        return {
            bias,
            confidence: Math.floor(55 + Math.random() * 35),
            entry: price,
            tp: bias === 'SHORT' ? price - spread * 2 : price + spread * 2,
            sl: bias === 'SHORT' ? price + spread : price - spread,
            summary: `[DEMO MODE] Sample ${bias} signal — connect a real key via /server for live inference.`
        };
    }
};
