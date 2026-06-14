import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET() {
  const { data, error } = await supabase
    .from("copycat_sources")
    .select(
      "id,name,manager_name,description,source_type,benchmark_symbol,rebalance_frequency,default_base_currency,status"
    )
    .eq("status", "active")
    .order("name", { ascending: true })

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
