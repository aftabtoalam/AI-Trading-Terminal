/**
 * AI proxy — talks directly to whichever provider the dropdown picked.
 *
 * This exists for one reason: to keep your API keys off the browser. The
 * frontend (ai.js) POSTs market context + a `provider` name to /api/signal;
 * this server looks up the matching key from its own .env, calls that
 * provider's real API, and returns clean JSON. The browser never sees any key.
 *
 * Set up whichever provider(s) you want to use in .env (see .env.example) —
 * you don't need all four, just the ones you'll actually pick from the dropdown.
 *
 * Honest note on cost: Gemini has a genuine free tier. DeepSeek, Claude
 * (Anthropic), and OpenAI generally require a funded/paid account — there's
 * no way around that, they're not free providers. Only Gemini is free money-wise;
 * the rest just aren't billed through this proxy in any special way, it's a
 * direct pass-through to each provider's normal pricing.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;

function buildPrompt({ symbol, rsi, trend, price }) {
    return `You are a technical analysis assistant. Given this market snapshot for ${symbol}:
RSI: ${rsi}
Trend: ${trend}
Price: ${price}

Respond with ONLY a JSON object, no markdown code fences, no extra text, in exactly this shape:
{"bias": "LONG" or "SHORT" or "NEUTRAL", "confidence": a number 0-100, "entry": a number, "tp": a number, "sl": a number, "summary": "one short sentence"}`;
}

function parseModelResponse(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
}

// --- One handler per provider. Each returns the parsed {bias, confidence, ...} object. ---

async function callGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set in .env');
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return parseModelResponse(text);
}

async function callDeepSeek(prompt) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY not set in .env');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from DeepSeek');
    return parseModelResponse(text);
}

async function callClaude(prompt) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set in .env');
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Empty response from Claude');
    return parseModelResponse(text);
}

async function callOpenAI(prompt) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set in .env');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from ChatGPT');
    return parseModelResponse(text);
}

const PROVIDERS = {
    gemini: { label: 'Gemini', call: callGemini },
    deepseek: { label: 'DeepSeek', call: callDeepSeek },
    claude: { label: 'Claude', call: callClaude },
    openai: { label: 'ChatGPT', call: callOpenAI }
};

app.post('/api/signal', async (req, res) => {
    const { symbol, rsi, trend, price, provider } = req.body;
    const chosen = PROVIDERS[provider];

    if (!chosen) {
        return res.status(400).json({ error: `Unknown provider "${provider}". Expected one of: ${Object.keys(PROVIDERS).join(', ')}` });
    }

    const prompt = buildPrompt({ symbol, rsi, trend, price });

    try {
        const analysis = await chosen.call(prompt);
        res.json({ ...analysis, _providerUsed: chosen.label });
    } catch (e) {
        console.error(`${chosen.label} failed:`, e.message);
        res.status(502).json({ error: `${chosen.label} request failed: ${e.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`CoinScope AI proxy running on http://localhost:${PORT}`);
    const configured = Object.entries(PROVIDERS).filter(([key]) => {
        const envKey = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[key];
        return !!process.env[envKey];
    }).map(([, p]) => p.label);
    console.log(configured.length ? `Configured providers: ${configured.join(', ')}` : '⚠ No provider keys set in .env yet — every provider will return an error until you add at least one.');
});
