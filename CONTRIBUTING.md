# Contributing

Thanks for considering it. This project stays small on purpose, so contributions are meant to be small too — a single function, not a rewrite.

## Add an indicator

Open `indicators.js` and add a pure function (no DOM access, just math):

```js
Indicators.register('StochRSI', (prices, period = 14) => {
    // your math here
    return value;
});
```

That's the whole contribution. If it's generally useful, also add it as a named method (like `calculateRSI`) so it shows up in autocomplete — but the registry alone is enough for a PR.

## Add an exchange

Open `api.js`, copy the `coinbase` adapter as a template, and implement two functions for your exchange:

```js
const myExchange = {
    symbolMap: { BTCUSDT: 'your-exchange-format', ... },
    ticker: async (symbol) => ({ lastPrice, changePercent }),
    candles: async (symbol, interval) => [{ time, open, high, low, close, volume }, ...]
};
register('myexchange', myExchange);
```

Add the option to the `#exchangeSelect` dropdown in `index.html` and you're done.

## Add another AI provider

`server/server.js` calls four providers directly (Gemini, DeepSeek, Claude, ChatGPT), each as its own small function. To add a fifth, write a `callYourProvider(prompt)` function following any of the existing four as a template, add it to the `PROVIDERS` object at the bottom, and add its key to `.env.example`. Keep the response shape the same:

```json
{ "bias": "LONG" | "SHORT" | "NEUTRAL", "confidence": 0-100, "entry": float, "tp": float, "sl": float, "summary": "string" }
```

The frontend (`ai.js`) doesn't care which provider produced it — just add the option to the `#providerSelect` dropdown in `index.html`.

## Ground rules

- No build step for the frontend — plain JS, no bundler.
- No API keys in frontend files, ever. Anything needing a secret goes through `server/`.
- Keep PRs scoped to one thing (one indicator, one exchange, one fix).
