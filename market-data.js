/**
 * Market data — the numbers that replace the old "plain-language commentary"
 * panel. All free, no API key needed for any of it.
 *
 * Sources:
 *  - Market cap (total + per-coin): CoinGecko's public API.
 *  - Funding rate + Open Interest: Binance Futures' public API. These are
 *    Binance-specific numbers (perpetual futures), labeled as such in the UI
 *    — they're not a universal cross-exchange average, just the most
 *    liquid, freely-available reference point for these two metrics.
 *
 * A note on "24h liquidations": there's no reliable free public endpoint for
 * aggregate market-wide liquidations (the data exists, but only behind paid
 * APIs like CoinGlass). Rather than fake a number, Open Interest is shown
 * instead — it's the closest genuinely-free metric that tells a similar
 * story (how much leveraged exposure is sitting in the market).
 */
const MarketData = {
    // Maps our ticker symbols to CoinGecko's IDs and Binance Futures' symbol format.
    _coingeckoId: {
        BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana', BNBUSDT: 'binancecoin',
        XRPUSDT: 'ripple', DOGEUSDT: 'dogecoin', ADAUSDT: 'cardano', AVAXUSDT: 'avalanche-2',
        LINKUSDT: 'chainlink', TONUSDT: 'the-open-network'
    },

    fetchGlobalMarketCap: async () => {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/global');
            const json = await res.json();
            return json.data?.total_market_cap?.usd ?? null;
        } catch (e) {
            console.warn('Global market cap fetch failed:', e.message);
            return null;
        }
    },

    fetchCoinMarketCap: async (symbol) => {
        const id = MarketData._coingeckoId[symbol];
        if (!id) return null;
        try {
            const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_market_cap=true`);
            const json = await res.json();
            return json[id]?.usd_market_cap ?? null;
        } catch (e) {
            console.warn('Coin market cap fetch failed:', e.message);
            return null;
        }
    },

    // Binance Futures perpetuals — free, no key. Symbol is always the plain
    // "COINUSDT" form regardless of which spot exchange is currently selected.
    fetchFundingRate: async (symbol) => {
        try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
            const json = await res.json();
            return json.lastFundingRate !== undefined ? parseFloat(json.lastFundingRate) * 100 : null;
        } catch (e) {
            console.warn('Funding rate fetch failed:', e.message);
            return null;
        }
    },

    fetchOpenInterest: async (symbol) => {
        try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);
            const json = await res.json();
            return json.openInterest !== undefined ? parseFloat(json.openInterest) : null;
        } catch (e) {
            console.warn('Open interest fetch failed:', e.message);
            return null;
        }
    },

    // Bull / Bear / Neutral for one set of candles. All four signals point
    // the same direction as trend confirmation (not contrarian reversal
    // signals) — otherwise a strong, healthy trend with RSI pinned high
    // cancels itself out against its own trend signal and reads as
    // "Neutral", which is misleading for a straightforward bias read.
    computeBias: (data) => {
        if (!data || data.length < 30) return 'NEUTRAL';
        const closes = data.map(d => d.close);
        const rsi = Indicators.calculateRSI(closes, 14);
        const { histogram } = Indicators.calculateMACD(closes);
        const bb = Indicators.calculateBollingerBands(closes, 20, 2);
        const last = closes[closes.length - 1];
        const priorPrice = closes[closes.length - 20];
        const changePct = Math.abs((last - priorPrice) / priorPrice) * 100;
        if (changePct < 0.3) return 'NEUTRAL'; // genuinely flat — don't force a direction on noise

        const trendSignal = last > priorPrice ? 1 : -1;

        const rsiSignal = rsi > 55 ? 1 : rsi < 45 ? -1 : 0;
        const macdSignal = histogram > 0 ? 1 : -1;
        const bbSignal = last > bb.middle ? 1 : -1;

        const sum = rsiSignal + macdSignal + bbSignal + trendSignal;
        if (sum >= 2) return 'BULL';
        if (sum <= -2) return 'BEAR';
        return 'NEUTRAL';
    },

    // Fetches candles for 15M/1H/1D/1W on the currently selected exchange
    // and classifies each one. Falls back to Binance for a timeframe if the
    // current exchange doesn't support it for this symbol.
    fetchBiasByTimeframe: async (symbol) => {
        const timeframes = [
            { key: '15m', label: '15M' },
            { key: '1h', label: '1H' },
            { key: '1d', label: '1D' },
            { key: '1w', label: '1W' }
        ];
        const currentExchangeName = Terminal.getExchange();
        const exchange = Exchanges.isSupported(currentExchangeName, symbol) ? Exchanges.get(currentExchangeName) : Exchanges.get('binance');

        const results = await Promise.all(timeframes.map(async (tf) => {
            try {
                const data = await exchange.candles(symbol, tf.key);
                return { label: tf.label, bias: MarketData.computeBias(data) };
            } catch (e) {
                return { label: tf.label, bias: 'NEUTRAL' };
            }
        }));
        return results;
    }
};
