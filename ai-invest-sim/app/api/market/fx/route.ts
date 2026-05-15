import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  getCachedFxRate,
  normalizeCurrency,
} from "../../../../src/lib/market/get-cached-fx-rate"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = normalizeCurrency(searchParams.get("from") || "USD")
  const to = normalizeCurrency(searchParams.get("to") || "USD")

  try {
    const fx = await getCachedFxRate(supabase, from, to)

    return NextResponse.json({
      success: true,
      from_currency: fx.fromCurrency,
      to_currency: fx.toCurrency,
      rate: fx.rate,
      fetched_at: fx.fetchedAt,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch FX rate",
      },
      { status: 500 }
    )
  }
}
