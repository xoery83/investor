import type { SupabaseClient } from "@supabase/supabase-js"

import { getPrice, type MarketQuote } from "./get-price"

const ACTIVE_MARKET_QUOTE_TTL_MS = 60_000
const AFTER_HOURS_QUOTE_TTL_MS = 5 * 60_000

type CachedQuoteRow = {
  symbol: string
  name: string | null
  price: number | null
  price_source: MarketQuote["priceSource"] | null
  currency: string | null
  exchange: string | null
  market_state: string | null
  asset_type: string | null
  fetched_at: string | null
}

export async function getCachedPrice(
  supabase: SupabaseClient,
  symbol: string
): Promise<MarketQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const cached = await readCachedQuote(supabase, normalizedSymbol)

  if (cached) {
    return cached
  }

  const fresh = await getPrice(normalizedSymbol)
  await writeCachedQuote(supabase, fresh)

  return fresh
}

async function readCachedQuote(
  supabase: SupabaseClient,
  symbol: string
): Promise<MarketQuote | null> {
  const { data, error } = await supabase
    .from("market_quotes_cache")
    .select("*")
    .eq("symbol", symbol)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as CachedQuoteRow
  const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : 0
  const ttlMs = getQuoteTtlMs(row.market_state || "UNKNOWN")

  if (!fetchedAt || Date.now() - fetchedAt > ttlMs) {
    return null
  }

  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    price: Number(row.price || 0),
    priceSource: row.price_source || "regular",
    currency: row.currency || "USD",
    exchange: row.exchange || "Unknown",
    marketState: row.market_state || "UNKNOWN",
    assetType: row.asset_type || "equity",
  }
}

async function writeCachedQuote(
  supabase: SupabaseClient,
  quote: MarketQuote
) {
  await supabase
    .from("market_quotes_cache")
    .upsert(
      {
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        price_source: quote.priceSource,
        currency: quote.currency,
        exchange: quote.exchange,
        market_state: quote.marketState,
        asset_type: quote.assetType,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "symbol" }
    )
}

function getQuoteTtlMs(marketState: string) {
  if (marketState === "REGULAR" || marketState === "PRE") {
    return ACTIVE_MARKET_QUOTE_TTL_MS
  }

  return AFTER_HOURS_QUOTE_TTL_MS
}
