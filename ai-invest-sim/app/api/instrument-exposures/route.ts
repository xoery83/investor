import { NextResponse } from "next/server"

import { isAdmin } from "../../../src/lib/auth/permissions"
import { getRequestUser, serverSupabase } from "../../../src/lib/auth/server"

type ExposureInput = {
  instrument_symbol?: string
  instrument_name?: string | null
  instrument_type?: string
  underlying_symbol?: string
  underlying_name?: string | null
  underlying_type?: string | null
  weight?: number
  currency?: string | null
  source?: string
  source_url?: string | null
  as_of?: string | null
  confidence?: number
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const symbol = normalizeSymbol(url.searchParams.get("symbol") || "")

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "symbol is required" },
      { status: 400 }
    )
  }

  const { data, error } = await serverSupabase
    .from("instrument_exposures")
    .select("*")
    .eq("instrument_symbol", symbol)
    .order("weight", { ascending: false })

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    exposures: data || [],
  })
}

export async function POST(request: Request) {
  const user = await getRequestUser(request)
  if (!isAdmin(user)) {
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    exposures?: ExposureInput[]
  }
  const exposures = Array.isArray(body.exposures) ? body.exposures : []
  const rows = exposures.flatMap(normalizeExposureInput)

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "At least one valid exposure row is required." },
      { status: 400 }
    )
  }

  const { data, error } = await serverSupabase
    .from("instrument_exposures")
    .upsert(rows, { onConflict: "instrument_symbol,underlying_symbol,as_of" })
    .select()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    exposures: data || [],
  })
}

function normalizeExposureInput(input: ExposureInput) {
  const instrumentSymbol = normalizeSymbol(input.instrument_symbol || "")
  const underlyingSymbol = normalizeSymbol(input.underlying_symbol || "")
  const weight = Number(input.weight)

  if (!instrumentSymbol || !underlyingSymbol || !Number.isFinite(weight)) {
    return []
  }

  return [
    {
      instrument_symbol: instrumentSymbol,
      instrument_name: cleanText(input.instrument_name),
      instrument_type: cleanText(input.instrument_type) || "etf",
      underlying_symbol: underlyingSymbol,
      underlying_name: cleanText(input.underlying_name),
      underlying_type: cleanText(input.underlying_type),
      weight: normalizeWeight(weight),
      currency: cleanText(input.currency),
      source: cleanText(input.source) || "manual",
      source_url: cleanText(input.source_url),
      as_of: cleanDate(input.as_of),
      confidence: clamp(Number(input.confidence || 0.8), 0, 1),
      updated_at: new Date().toISOString(),
    },
  ]
}

function normalizeWeight(weight: number) {
  if (weight > 0 && weight <= 1) return weight * 100
  return weight
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace(/-/g, ".")
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
