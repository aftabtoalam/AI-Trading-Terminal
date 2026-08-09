const Terminal = (() => {
    const state = {
        symbol: 'BTCUSDT',
        interval: '15m',
        exchange: 'coinbase',
        chart: null,
        series: null,
        volume: null,
        data: [],
        lastPrice: 0,
        isAnalyzing: false,
        priceTimer: null
    };

    // Market cap / funding / open interest / bias table — none of these need
    // to refresh every couple seconds like price does, so they run on their
    // own slower timer.
    const refreshMarketData = async () => {
        const [globalCap, coinCap, funding, oi, bias] = await Promise.all([
            MarketData.fetchGlobalMarketCap(),
            MarketData.fetchCoinMarketCap(state.symbol),
            MarketData.fetchFundingRate(state.symbol),
            MarketData.fetchOpenInterest(state.symbol),
            MarketData.fetchBiasByTimeframe(state.symbol)
        ]);
        UIEngine.renderMarketData({ globalCap, coinCap, funding, oi });
        UIEngine.renderBiasTable(bias);
    };

    return {
        boot: () => {
            lucide.createIcons();
            ChartEngine.init(state);
            ApiEngine.syncData(state, UIEngine.updateQuantVitals);
            ApiEngine.pollPrice(state);
            refreshMarketData();

            state.priceTimer = setInterval(() => ApiEngine.pollPrice(state), 2000);
            setInterval(() => ApiEngine.syncData(state, UIEngine.updateQuantVitals), 60000);
            setInterval(refreshMarketData, 3 * 60 * 1000); // market cap / funding / OI don't move fast enough to need faster polling

            setInterval(() => {
                document.getElementById('utc-clock').innerText = Utils.getUTCTimestamp();
            }, 1000);

            UIEngine.logToHub("Engine initialized. REST bridge active.");
        },
        updateSymbol: (s) => {
            state.symbol = s;
            ApiEngine.syncData(state, UIEngine.updateQuantVitals);
            ApiEngine.pollPrice(state);
            refreshMarketData();
            UIEngine.logToHub(`Switched context to ${s}`);
        },
        updateInterval: (i) => {
            state.interval = i;
            ApiEngine.syncData(state, UIEngine.updateQuantVitals);
        },
        updateExchange: (ex) => {
            state.exchange = ex;
            ApiEngine.syncData(state, UIEngine.updateQuantVitals);
            ApiEngine.pollPrice(state);
            refreshMarketData();
            UIEngine.logToHub(`Switched feed to ${Exchanges.get(ex).label}`);
        },
        resetChart: () => state.chart.timeScale().fitContent(),
        runInference: () => AIEngine.runInference(state, UIEngine.logToHub, UIEngine.renderIntelligence),
        getCurrentPrice: () => state.lastPrice,
        getExchange: () => state.exchange
    };
})();

window.onload = Terminal.boot;
