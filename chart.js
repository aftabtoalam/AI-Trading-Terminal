const ChartEngine = {
    init: (state) => {
        const container = document.getElementById('chart-main');
        state.chart = LightweightCharts.createChart(container, {
            layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' },
            grid: { vertLines: { color: '#10141b' }, horzLines: { color: '#10141b' } },
            rightPriceScale: { borderColor: '#1a1f2b', autoScale: true, scaleMargins: { top: 0.1, bottom: 0.2 } },
            timeScale: { borderColor: '#1a1f2b', timeVisible: true },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#334155' }, horzLine: { color: '#334155' } }
        });

        state.series = state.chart.addCandlestickSeries({
            upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
            wickUpColor: '#10b981', wickDownColor: '#ef4444'
        });

        state.volume = state.chart.addHistogramSeries({
            color: '#3b82f6', priceFormat: { type: 'volume' }, priceScaleId: '',
        });
        state.volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        // --- Overlays: EMA(20) line + Bollinger Bands, drawn on the same price scale ---
        state.emaLine = state.chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        state.bbUpper = state.chart.addLineSeries({ color: 'rgba(99,102,241,0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        state.bbMiddle = state.chart.addLineSeries({ color: 'rgba(99,102,241,0.25)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        state.bbLower = state.chart.addLineSeries({ color: 'rgba(99,102,241,0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

        // --- MACD sub-panel: a second, smaller chart synced to the main one's time scale ---
        const macdContainer = document.getElementById('chart-macd');
        state.macdChart = LightweightCharts.createChart(macdContainer, {
            layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' },
            grid: { vertLines: { color: '#10141b' }, horzLines: { color: '#10141b' } },
            rightPriceScale: { borderColor: '#1a1f2b' },
            timeScale: { borderColor: '#1a1f2b', timeVisible: true },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
        });
        state.macdHist = state.macdChart.addHistogramSeries({ color: '#3b82f6' });
        state.macdLine = state.macdChart.addLineSeries({ color: '#38bdf8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        state.signalLine = state.macdChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

        // Keep both charts scrolling/zooming together
        let syncing = false;
        state.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (syncing || !range) return;
            syncing = true;
            state.macdChart.timeScale().setVisibleLogicalRange(range);
            syncing = false;
        });
        state.macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (syncing || !range) return;
            syncing = true;
            state.chart.timeScale().setVisibleLogicalRange(range);
            syncing = false;
        });

        const resize = () => {
            state.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
            state.macdChart.applyOptions({ width: macdContainer.clientWidth, height: macdContainer.clientHeight });
        };
        new ResizeObserver(resize).observe(container);
        new ResizeObserver(resize).observe(macdContainer);

        state.chart.subscribeCrosshairMove(param => {
            if (param.time && param.seriesData.get(state.series)) {
                const d = param.seriesData.get(state.series);
                document.getElementById('o-val').innerText = d.open.toFixed(2);
                document.getElementById('h-val').innerText = d.high.toFixed(2);
                document.getElementById('l-val').innerText = d.low.toFixed(2);
                document.getElementById('c-val').innerText = d.close.toFixed(2);
            }
        });

        // Overlay toggle buttons
        document.getElementById('toggle-ema').addEventListener('click', (e) => ChartEngine._toggle(state.emaLine, e.target));
        document.getElementById('toggle-bb').addEventListener('click', (e) => ChartEngine._toggleGroup([state.bbUpper, state.bbMiddle, state.bbLower], e.target));
    },

    _toggle: (series, btn) => {
        const visible = !series.options().visible;
        series.applyOptions({ visible });
        btn.classList.toggle('opacity-40', !visible);
    },
    _toggleGroup: (seriesList, btn) => {
        const visible = !seriesList[0].options().visible;
        seriesList.forEach(s => s.applyOptions({ visible }));
        btn.classList.toggle('opacity-40', !visible);
    },

    // Called whenever fresh candle data comes in — recomputes and redraws overlays + MACD panel
    updateIndicators: (state, data) => {
        const closes = data.map(d => d.close);

        const ema = Indicators.calculateEMASeries(closes, 20);
        state.emaLine.setData(data.map((d, i) => ({ time: d.time, value: ema[i] })));

        const bb = Indicators.calculateBollingerBandsSeries(closes, 20, 2);
        state.bbUpper.setData(data.map((d, i) => bb[i] ? { time: d.time, value: bb[i].upper } : null).filter(Boolean));
        state.bbMiddle.setData(data.map((d, i) => bb[i] ? { time: d.time, value: bb[i].middle } : null).filter(Boolean));
        state.bbLower.setData(data.map((d, i) => bb[i] ? { time: d.time, value: bb[i].lower } : null).filter(Boolean));

        const { macdLine, signalLine, histogram } = Indicators.calculateMACDSeries(closes);
        state.macdHist.setData(data.map((d, i) => ({
            time: d.time, value: histogram[i], color: histogram[i] >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'
        })));
        state.macdLine.setData(data.map((d, i) => ({ time: d.time, value: macdLine[i] })));
        state.signalLine.setData(data.map((d, i) => ({ time: d.time, value: signalLine[i] })));
    }
};
