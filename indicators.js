/**
 * Indicators — pure functions, no DOM access.
 * Each takes plain arrays of numbers (or candle objects where noted) and returns a value.
 * This is intentionally framework-agnostic: copy this single file into any project and it works.
 *
 * Want to add your own? Scroll to the bottom "Plugin registry" section —
 * that's the only part you need to touch.
 */
const Indicators = {
    // --- Relative Strength Index (Wilder's smoothing, rolled forward to the latest bar) ---
    calculateRSI: (prices, period = 14) => {
        if (prices.length <= period) return 50;
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) avgGain += diff; else avgLoss -= diff;
        }
        avgGain /= period; avgLoss /= period;

        for (let i = period + 1; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        return 100 - (100 / (1 + (avgGain / (avgLoss || 1e-10))));
    },

    // --- Simple Moving Average ---
    calculateSMA: (prices, period = 20) => {
        if (prices.length < period) return prices[prices.length - 1] || 0;
        const slice = prices.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    },

    // --- Exponential Moving Average. Returns the full series (needed by MACD). ---
    calculateEMASeries: (prices, period) => {
        if (prices.length === 0) return [];
        const k = 2 / (period + 1);
        const ema = [prices[0]];
        for (let i = 1; i < prices.length; i++) {
            ema.push(prices[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
    },

    calculateEMA: (prices, period = 20) => {
        const series = Indicators.calculateEMASeries(prices, period);
        return series[series.length - 1] || 0;
    },

    // --- MACD: { macd, signal, histogram } using the standard 12/26/9 setup ---
    calculateMACD: (prices, fast = 12, slow = 26, signalPeriod = 9) => {
        if (prices.length < slow + signalPeriod) {
            return { macd: 0, signal: 0, histogram: 0 };
        }
        const emaFast = Indicators.calculateEMASeries(prices, fast);
        const emaSlow = Indicators.calculateEMASeries(prices, slow);
        const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
        const signalLine = Indicators.calculateEMASeries(macdLine, signalPeriod);
        const macd = macdLine[macdLine.length - 1];
        const signal = signalLine[signalLine.length - 1];
        return { macd, signal, histogram: macd - signal };
    },

    // --- Bollinger Bands: { upper, middle, lower } ---
    calculateBollingerBands: (prices, period = 20, stdDevMultiplier = 2) => {
        const middle = Indicators.calculateSMA(prices, period);
        const slice = prices.slice(-period);
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
        const stdDev = Math.sqrt(variance);
        return {
            upper: middle + stdDev * stdDevMultiplier,
            middle,
            lower: middle - stdDev * stdDevMultiplier
        };
    },

    // --- Volume Weighted Average Price. Takes candle objects: {close, volume} ---
    calculateVWAP: (candles) => {
        let cumPV = 0, cumVol = 0;
        for (const c of candles) {
            cumPV += c.close * c.volume;
            cumVol += c.volume;
        }
        return cumVol ? cumPV / cumVol : 0;
    },

    // --- Bollinger Bands as a full series (one {upper,middle,lower} per bar, null until enough data) ---
    calculateBollingerBandsSeries: (prices, period = 20, stdDevMultiplier = 2) => {
        const out = [];
        for (let i = 0; i < prices.length; i++) {
            if (i + 1 < period) { out.push(null); continue; }
            const slice = prices.slice(i + 1 - period, i + 1);
            const mean = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / period;
            const sd = Math.sqrt(variance);
            out.push({ upper: mean + sd * stdDevMultiplier, middle: mean, lower: mean - sd * stdDevMultiplier });
        }
        return out;
    },

    // --- MACD as full series: { macdLine[], signalLine[], histogram[] }, one entry per bar ---
    calculateMACDSeries: (prices, fast = 12, slow = 26, signalPeriod = 9) => {
        const emaFast = Indicators.calculateEMASeries(prices, fast);
        const emaSlow = Indicators.calculateEMASeries(prices, slow);
        const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
        const signalLine = Indicators.calculateEMASeries(macdLine, signalPeriod);
        const histogram = macdLine.map((v, i) => v - signalLine[i]);
        return { macdLine, signalLine, histogram };
    },

    // --- Plugin registry ---
    // Add your own indicator without touching anything above:
    //   Indicators.register('MyIndicator', (prices) => { ... return value; });
    // Then call it anywhere with: Indicators.run('MyIndicator', prices);
    _registry: {},
    register: (name, fn) => { Indicators._registry[name] = fn; },
    run: (name, ...args) => {
        if (!Indicators._registry[name]) throw new Error(`Indicator "${name}" is not registered.`);
        return Indicators._registry[name](...args);
    }
};
