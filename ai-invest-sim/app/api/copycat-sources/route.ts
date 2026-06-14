import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { isAdmin } from "../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const user = await getRequestUser(request)
  const url = new URL(request.url)
  const includeInactive =
    isAdmin(user) && url.searchParams.get("include_inactive") === "true"

  let query = supabase
    .from("copycat_sources")
    .select(
      "id,name,manager_name,description,source_type,benchmark_symbol,rebalance_frequency,default_base_currency,status"
    )
    .order("name", { ascending: true })

  if (!includeInactive) query = query.eq("status", "active")

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    sources: data || [],
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

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  const name = readString(body.name)
  if (!name) {
    return NextResponse.json(
      { success: false, error: "name is required" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("copycat_sources")
    .insert({
      name,
      manager_name: readString(body.manager_name),
      description: readString(body.description),
      source_type: normalizeSourceType(body.source_type),
      source_url: readString(body.source_url),
      benchmark_symbol: readString(body.benchmark_symbol)?.toUpperCase() || null,
      reporting_lag_days: readInteger(body.reporting_lag_days, 45),
      rebalance_frequency: normalizeFrequency(body.rebalance_frequency),
      default_base_currency:
        readString(body.default_base_currency)?.toUpperCase() || "USD",
      status: normalizeStatus(body.status),
      metadata: isRecord(body.metadata) ? body.metadata : {},
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    source: data,
  })
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readInteger(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isInteger(numeric) ? numeric : fallback
}

function normalizeSourceType(value: unknown) {
  const text = readString(value)
  return ["manual", "13f", "fund_holdings", "api"].includes(text || "")
    ? text
    : "manual"
}

function normalizeFrequency(value: unknown) {
  const text = readString(value)
  return ["daily", "weekly", "monthly", "quarterly"].includes(text || "")
    ? text
    : "quarterly"
}

function normalizeStatus(value: unknown) {
  const text = readString(value)
  return ["active", "paused", "archived"].includes(text || "") ? text : "active"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
