/**
 * Exchange adapters.
 * Each adapter normalizes its exchange's API into the same shape:
 *   ticker(symbol)  -> { lastPrice: number, changePercent: number }
 *   candles(symbol, interval) -> [{ time, open, high, low, close, volume }, ...]
 *
 * To add a new exchange: implement those two functions and a symbolMap,
 * then register it at the bottom with `Exchanges.register(...)`.
 * Nothing else in the app needs to change.
 *
 * Coverage note: not every exchange lists every coin (e.g. BNB isn't on
 * Coinbase). Missing pairs are simply left out of that exchange's symbolMap —
 * the app already shows a clear "unavailable here" message instead of
 * failing silently (see ApiEngine below).
 */
const Exchanges = (() => {
    const registry = {};
    const ALL_COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TONUSDT'];

    // ---------------- Binance ----------------
    const binance = {
        label: 'Binance',
        symbolMap: Object.fromEntries(ALL_COINS.map(c => [c, c])),
        intervalMap: { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' },

        ticker: async (symbol) => {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binance.symbolMap[symbol]}`);
            const d = await res.json();
            return { lastPrice: parseFloat(d.lastPrice), changePercent: parseFloat(d.priceChangePercent) };
        },

        candles: async (symbol, interval) => {
            const iv = binance.intervalMap[interval] || '15m';
            const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binance.symbolMap[symbol]}&interval=${iv}&limit=120`);
            const raw = await res.json();
            return raw.map(d => ({
                time: d[0] / 1000,
                open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
            }));
        }
    };

    // ---------------- Coinbase Exchange ----------------
    // Public API, no key required. BNB and TON aren't listed here, so
    // they're left out of the symbol map on purpose (not a bug — see the
    // "unavailable" handling below). No native weekly candle either, so
    // 1W is built by combining 7 daily candles (a rolling bucket, not
    // calendar-aligned to Monday).
    const coinbase = {
        label: 'Coinbase',
        symbolMap: {
            BTCUSDT: 'BTC-USD', ETHUSDT: 'ETH-USD', SOLUSDT: 'SOL-USD', XRPUSDT: 'XRP-USD',
            DOGEUSDT: 'DOGE-USD', ADAUSDT: 'ADA-USD', AVAXUSDT: 'AVAX-USD', LINKUSDT: 'LINK-USD'
        },
        granularityMap: { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 21600, '1d': 86400 },

        ticker: async (symbol) => {
            const pair = coinbase.symbolMap[symbol];
            if (!pair) throw new Error(`${symbol.replace('USDT', '')} isn't available on Coinbase — try another exchange.`);
            const [tickerRes, statsRes] = await Promise.all([
                fetch(`https://api.exchange.coinbase.com/products/${pair}/ticker`),
                fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`)
            ]);
            const ticker = await tickerRes.json();
            const stats = await statsRes.json();
            const last = parseFloat(ticker.price);
            const open = parseFloat(stats.open);
            const changePercent = open ? ((last - open) / open) * 100 : 0;
            return { lastPrice: last, changePercent };
        },

        candles: async (symbol, interval) => {
            const pair = coinbase.symbolMap[symbol];
            if (!pair) throw new Error(`${symbol.replace('USDT', '')} isn't available on Coinbase — try another exchange.`);
            if (interval === '1w') {
                const daily = await coinbase._fetchCandles(pair, 86400);
                return coinbase._aggregateWeekly(daily);
            }
            const granularity = coinbase.granularityMap[interval] || 900;
            return coinbase._fetchCandles(pair, granularity);
        },

        _fetchCandles: async (pair, granularity) => {
            const res = await fetch(`https://api.exchange.coinbase.com/products/${pair}/candles?granularity=${granularity}`);
            const raw = await res.json(); // [time, low, high, open, close, volume], newest first
            return raw
                .map(d => ({ time: d[0], open: d[3], high: d[2], low: d[1], close: d[4], volume: d[5] }))
                .sort((a, b) => a.time - b.time)
                .slice(-120);
        },

        _aggregateWeekly: (daily) => {
            const weeks = [];
            for (let i = 0; i < daily.length; i += 7) {
                const chunk = daily.slice(i, i + 7);
                if (!chunk.length) continue;
                weeks.push({
                    time: chunk[0].time, open: chunk[0].open, close: chunk[chunk.length - 1].close,
                    high: Math.max(...chunk.map(c => c.high)), low: Math.min(...chunk.map(c => c.low)),
                    volume: chunk.reduce((s, c) => s + c.volume, 0)
                });
            }
            return weeks;
        }
    };

    // ---------------- KuCoin ----------------
    // Public API, no key required. Pairs use a "COIN-USDT" format.
    const kucoin = {
        label: 'KuCoin',
        symbolMap: Object.fromEntries(ALL_COINS.map(c => [c, c.replace('USDT', '') + '-USDT'])),
        intervalMap: { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day', '1w': '1week' },

        ticker: async (symbol) => {
            const pair = kucoin.symbolMap[symbol];
            const res = await fetch(`https://api.kucoin.com/api/v1/market/stats?symbol=${pair}`);
            const json = await res.json();
            const d = json.data;
            return { lastPrice: parseFloat(d.last), changePercent: parseFloat(d.changeRate) * 100 };
        },

        candles: async (symbol, interval) => {
            const pair = kucoin.symbolMap[symbol];
            const type = kucoin.intervalMap[interval] || '15min';
            const res = await fetch(`https://api.kucoin.com/api/v1/market/candles?type=${type}&symbol=${pair}`);
            const json = await res.json();
            // KuCoin returns [time, open, close, high, low, volume, turnover], newest first
            return (json.data || [])
                .map(d => ({ time: parseInt(d[0], 10), open: parseFloat(d[1]), close: parseFloat(d[2]), high: parseFloat(d[3]), low: parseFloat(d[4]), volume: parseFloat(d[5]) }))
                .sort((a, b) => a.time - b.time)
                .slice(-120);
        }
    };

    // ---------------- Bybit ----------------
    // Public v5 unified API, no key required for market data.
    const bybit = {
        label: 'Bybit',
        symbolMap: Object.fromEntries(ALL_COINS.map(c => [c, c])),
        intervalMap: { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' },

        ticker: async (symbol) => {
            const pair = bybit.symbolMap[symbol];
            const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${pair}`);
            const json = await res.json();
            const d = json.result?.list?.[0];
            if (!d) throw new Error('No ticker data returned');
            return { lastPrice: parseFloat(d.lastPrice), changePercent: parseFloat(d.price24hPcnt) * 100 };
        },

        candles: async (symbol, interval) => {
            const pair = bybit.symbolMap[symbol];
            const iv = bybit.intervalMap[interval] || '15';
            const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=${iv}&limit=120`);
            const json = await res.json();
            // Bybit returns [start, open, high, low, close, volume, turnover], newest first
            return (json.result?.list || [])
                .map(d => ({ time: parseInt(d[0], 10) / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }))
                .sort((a, b) => a.time - b.time)
                .slice(-120);
        }
    };

    const register = (name, adapter) => { registry[name] = adapter; };
    register('binance', binance);
    register('coinbase', coinbase);
    register('kucoin', kucoin);
    register('bybit', bybit);

    return {
        register,
        get: (name) => registry[name] || registry.coinbase,
        isSupported: (name, symbol) => !!(registry[name] || registry.coinbase).symbolMap[symbol],
        list: () => Object.keys(registry)
    };
})();

const ApiEngine = {
    // Sets the little connection dot + label. status: 'active' | 'error' | 'unsupported'
    _setConnState: (status, message) => {
        const dot = document.getElementById('conn-indicator');
        const text = document.getElementById('conn-text');
        dot.className = dot.className.replace(/bg-(green|red|amber)-500/, '');
        if (status === 'active') {
            dot.classList.add('bg-green-500');
            text.className = 'text-[10px] font-bold text-green-500 uppercase tracking-widest';
            text.innerText = message || 'Feed Active';
        } else if (status === 'unsupported') {
            dot.classList.add('bg-amber-500');
            text.className = 'text-[10px] font-bold text-amber-400 uppercase tracking-widest';
            text.innerText = message || 'Pair unavailable';
        } else {
            dot.classList.add('bg-red-500');
            text.className = 'text-[10px] font-bold text-red-500 uppercase tracking-widest';
            text.innerText = message || 'Feed Error';
        }
    },

    pollPrice: async (state) => {
        const exchange = Exchanges.get(state.exchange);
        if (!exchange.symbolMap[state.symbol]) {
            ApiEngine._setConnState('unsupported', `Unavailable on ${exchange.label}`);
            return;
        }
        try {
            const start = Date.now();
            const { lastPrice, changePercent } = await exchange.ticker(state.symbol);
            const latency = Date.now() - start;

            state.lastPrice = lastPrice;
            document.getElementById('currentPrice').innerText = lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 });

            const pc = document.getElementById('priceChange');
            pc.innerText = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
            pc.className = `text-[10px] font-bold ${changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`;

            document.getElementById('latency-text').innerText = `${latency}ms`;
            ApiEngine._setConnState('active');
        } catch (e) {
            console.error("Price Poll Error", e);
            ApiEngine._setConnState('error', 'Connection lost — retrying');
        }
    },

    syncData: async (state, updateVitalsCallback) => {
        const exchange = Exchanges.get(state.exchange);
        if (!exchange.symbolMap[state.symbol]) {
            ApiEngine._setConnState('unsupported', `Unavailable on ${exchange.label}`);
            UIEngine?.logToHub?.(`${state.symbol.replace('USDT', '')} isn't available on ${exchange.label} — pick another asset or switch exchange.`);
            return;
        }
        try {
            const data = await exchange.candles(state.symbol, state.interval);
            if (!data.length) throw new Error('No candle data returned');

            state.data = data;
            state.series.setData(data);
            state.volume.setData(data.map(d => ({
                time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
            })));

            updateVitalsCallback(data, state);
        } catch (e) {
            console.error("Sync Failure", e);
            UIEngine?.logToHub?.(`Couldn't load chart data from ${exchange.label}: ${e.message}`);
            ApiEngine._setConnState('error', 'Data sync failed');
        }
    }
};
