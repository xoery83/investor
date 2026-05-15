import YahooFinance from "yahoo-finance2"
import { normalizeMarketSymbol } from "./normalize-symbol"

const yahooFinance = new YahooFinance()

export type MarketQuote = {
  symbol: string
  name: string
  price: number
  priceSource: "pre" | "regular" | "post"
  currency: string
  exchange: string
  marketState: string
  assetType: string
}

export async function getPrice(
  symbol: string
): Promise<MarketQuote> {
  const normalizedSymbol = normalizeMarketSymbol(symbol)

  try {
    const quote = (await yahooFinance.quote(normalizedSymbol)) as Record<
      string,
      unknown
    >
    const fallbackSymbol = normalizedSymbol
    const marketState = readString(quote.marketState, "UNKNOWN")
    const selectedPrice = selectDisplayPrice(quote, marketState)

    return {
      symbol: readString(quote.symbol, fallbackSymbol),

      name:
        readString(quote.longName) ||
        readString(quote.shortName) ||
        fallbackSymbol,

      price: selectedPrice.price,

      priceSource: selectedPrice.source,

      currency: readString(quote.currency, "USD"),

      exchange: readString(quote.fullExchangeName, "Unknown"),

      marketState,

      assetType: readString(quote.quoteType, "equity"),
    }
  } catch (error) {
    console.error("Failed to fetch market price:", error)

    throw new Error(`Failed to fetch quote for ${normalizedSymbol}`)
  }
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function selectDisplayPrice(
  quote: Record<string, unknown>,
  marketState: string
): { price: number; source: MarketQuote["priceSource"] } {
  const preMarketPrice = readNumber(quote.preMarketPrice)
  const postMarketPrice = readNumber(quote.postMarketPrice)
  const regularMarketPrice = readNumber(quote.regularMarketPrice)

  if (marketState === "PRE" && preMarketPrice > 0) {
    return { price: preMarketPrice, source: "pre" }
  }

  if (
    (marketState === "POST" || marketState === "POSTPOST") &&
    postMarketPrice > 0
  ) {
    return { price: postMarketPrice, source: "post" }
  }

  return { price: regularMarketPrice, source: "regular" }
}
