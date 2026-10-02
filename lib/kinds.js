// Instrument kinds beyond NSE/BSE listings, shared by server and browser.
//   US stocks:  "US:AMZN"   (Yahoo ticker after the prefix; priced in USD)
//   Gold:       "GOLD:24K"  (24-carat gold, priced in ₹ per gram; see lib/gold.js)

export const GOLD = { symbol: 'GOLD:24K', name: 'Gold (24K, per gram)' };

export const isUs = (symbol) => /^US:[A-Z0-9.\-]{1,10}$/.test(symbol || '');
export const isGold = (symbol) => symbol === GOLD.symbol;

/** The ticker Yahoo knows the instrument by. */
export const yahooSymbol = (symbol) => (isUs(symbol) ? symbol.slice(3) : symbol);

/** Currency the instrument is priced in. */
export const currencyOf = (symbol) => (isUs(symbol) ? 'USD' : 'INR');
