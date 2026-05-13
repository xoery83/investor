import YahooFinance from "yahoo-finance2"

const yahooFinance = new YahooFinance()

export type MarketQuote = {
  symbol: string
  name: string
  price: number
  currency: string
  exchange: string
  marketState: string
  assetType: string
}

export async function getPrice(
  symbol: string
): Promise<MarketQuote> {
  try {
    const quote: any = await yahooFinance.quote(symbol)

    return {
      symbol: quote.symbol || symbol.toUpperCase(),

      name:
        quote.longName ||
        quote.shortName ||
        symbol.toUpperCase(),

      price: Number(quote.regularMarketPrice || 0),

      currency: quote.currency || "USD",

      exchange: quote.fullExchangeName || "Unknown",

      marketState: quote.marketState || "UNKNOWN",

      assetType: quote.quoteType || "equity",
    }
  } catch (error) {
    console.error("Failed to fetch market price:", error)

    throw new Error(`Failed to fetch quote for ${symbol}`)
  }
}