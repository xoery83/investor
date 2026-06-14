import type { SupabaseClient } from "@supabase/supabase-js"
import YahooFinance from "yahoo-finance2"

import { normalizeMarketSymbol } from "./normalize-symbol"

const yahooFinance = new YahooFinance()

export type MarketHistoryRow = {
  symbol: string
  price_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  adj_close: number | null
  volume: number | null
  currency: string
  provider: string
}

export async function getHistoricalPrices({
  supabase,
  symbol,
  period = "1Y",
}: {
  supabase: SupabaseClient
  symbol: string
  period?: "1Y" | "3Y"
}) {
  const normalizedSymbol = normalizeMarketSymbol(symbol)
  const startDate = getStartDate(period)
  const cached = await readCachedHistory({
    supabase,
    symbol: normalizedSymbol,
    startDate,
  })

  if (cached.length >= minimumRowsForPeriod(period)) {
    return cached
  }

  const fetched = await fetchYahooHistory({
    symbol: normalizedSymbol,
    startDate,
  })

  if (fetched.length > 0) {
    await writeCachedHistory(supabase, fetched)
    return fetched
  }

  return cached
}

async function readCachedHistory({
  supabase,
  symbol,
  startDate,
}: {
  supabase: SupabaseClient
  symbol: string
  startDate: Date
}) {
  try {
    const { data, error } = await supabase
      .from("market_price_history_cache")
      .select("*")
      .eq("symbol", symbol)
      .gte("price_date", toDateKey(startDate))
      .order("price_date", { ascending: true })

    if (error) {
      if (isMissingHistoryTableError(error.message)) return []
      throw new Error(error.message)
    }

    return (data || []).map(normalizeHistoryRow)
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingHistoryTableError(error.message)
    ) {
      return []
    }
    throw error
  }
}

async function fetchYahooHistory({
  symbol,
  startDate,
}: {
  symbol: string
  startDate: Date
}) {
  try {
    const result = (await yahooFinance.historical(symbol, {
      period1: toDateKey(startDate),
      period2: toDateKey(new Date()),
      interval: "1d",
    })) as Array<Record<string, unknown>>

    return result
      .map((row) => normalizeYahooRow(symbol, row))
      .filter((row): row is MarketHistoryRow => Boolean(row))
      .sort((a, b) => a.price_date.localeCompare(b.price_date))
  } catch (error) {
    console.error("Failed to fetch market history:", symbol, error)
    return []
  }
}

async function writeCachedHistory(
  supabase: SupabaseClient,
  rows: MarketHistoryRow[]
) {
  if (rows.length === 0) return

  try {
    const { error } = await supabase
      .from("market_price_history_cache")
      .upsert(rows, { onConflict: "symbol,price_date,provider" })

    if (error && !isMissingHistoryTableError(error.message)) {
      throw new Error(error.message)
    }
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingHistoryTableError(error.message)
    ) {
      return
    }
    throw error
  }
}

function normalizeYahooRow(symbol: string, row: Record<string, unknown>) {
  const date = row.date instanceof Date ? row.date : null
  const close = readNumber(row.close)
  if (!date || !close) return null

  return {
    symbol,
    price_date: toDateKey(date),
    open: readOptionalNumber(row.open),
    high: readOptionalNumber(row.high),
    low: readOptionalNumber(row.low),
    close,
    adj_close: readOptionalNumber(row.adjClose),
    volume: readOptionalNumber(row.volume),
    currency: "USD",
    provider: "yahoo",
  }
}

function normalizeHistoryRow(row: Record<string, unknown>) {
  return {
    symbol: readString(row.symbol),
    price_date: readString(row.price_date),
    open: readOptionalNumber(row.open),
    high: readOptionalNumber(row.high),
    low: readOptionalNumber(row.low),
    close: readNumber(row.close),
    adj_close: readOptionalNumber(row.adj_close),
    volume: readOptionalNumber(row.volume),
    currency: readString(row.currency, "USD"),
    provider: readString(row.provider, "yahoo"),
  }
}

function getStartDate(period: "1Y" | "3Y") {
  const date = new Date()
  date.setFullYear(date.getFullYear() - (period === "3Y" ? 3 : 1))
  return date
}

function minimumRowsForPeriod(period: "1Y" | "3Y") {
  return period === "3Y" ? 500 : 160
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isMissingHistoryTableError(message: string) {
  return (
    message.includes("market_price_history_cache") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
