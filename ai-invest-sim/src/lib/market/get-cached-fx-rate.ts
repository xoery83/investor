import type { SupabaseClient } from "@supabase/supabase-js"

import { getPrice } from "./get-price"

const FX_RATE_TTL_MS = 60 * 60_000

type CachedFxRow = {
  from_currency: string | null
  to_currency: string | null
  rate: number | null
  fetched_at: string | null
}

export type FxRate = {
  fromCurrency: string
  toCurrency: string
  rate: number
  fetchedAt: string
  source: "cache" | "yahoo" | "identity"
}

export async function getCachedFxRate(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
  options: { force?: boolean } = {}
): Promise<FxRate> {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)

  if (from === to) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      fetchedAt: new Date().toISOString(),
      source: "identity",
    }
  }

  const cached = options.force ? null : await readCachedFxRate(supabase, from, to)
  if (cached) return cached

  const fresh = await fetchFxRate(from, to)
  await writeCachedFxRate(supabase, fresh)

  return fresh
}

async function readCachedFxRate(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string
): Promise<FxRate | null> {
  const { data, error } = await supabase
    .from("fx_rates_cache")
    .select("*")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .maybeSingle()

  if (error || !data) return null

  const row = data as CachedFxRow
  const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : 0
  const rate = Number(row.rate || 0)

  if (!fetchedAt || Date.now() - fetchedAt > FX_RATE_TTL_MS || rate <= 0) {
    return null
  }

  return {
    fromCurrency,
    toCurrency,
    rate,
    fetchedAt: row.fetched_at || new Date().toISOString(),
    source: "cache",
  }
}

async function fetchFxRate(
  fromCurrency: string,
  toCurrency: string
): Promise<FxRate> {
  const directSymbol = `${fromCurrency}${toCurrency}=X`

  try {
    const quote = await getPrice(directSymbol)
    if (quote.price > 0) {
      return buildFxRate(fromCurrency, toCurrency, quote.price)
    }
  } catch {
    // Try inverse quote below.
  }

  const inverseSymbol = `${toCurrency}${fromCurrency}=X`
  const inverseQuote = await getPrice(inverseSymbol)
  if (inverseQuote.price <= 0) {
    throw new Error(`Failed to fetch FX rate ${fromCurrency}/${toCurrency}`)
  }

  return buildFxRate(fromCurrency, toCurrency, 1 / inverseQuote.price)
}

function buildFxRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number
): FxRate {
  return {
    fromCurrency,
    toCurrency,
    rate,
    fetchedAt: new Date().toISOString(),
    source: "yahoo",
  }
}

async function writeCachedFxRate(supabase: SupabaseClient, fxRate: FxRate) {
  await supabase
    .from("fx_rates_cache")
    .upsert(
      {
        from_currency: fxRate.fromCurrency,
        to_currency: fxRate.toCurrency,
        rate: fxRate.rate,
        provider: fxRate.source === "identity" ? "identity" : "yahoo",
        fetched_at: fxRate.fetchedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "from_currency,to_currency" }
    )
}

export function normalizeCurrency(value: unknown) {
  const currency = String(value || "USD").trim().toUpperCase()
  return currency || "USD"
}
