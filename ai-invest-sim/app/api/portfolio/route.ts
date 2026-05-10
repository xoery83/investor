import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

const PORTFOLIO_ID = "b0f198ff-0676-40a0-b031-ee84c49d8e75"

export async function GET() {
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", PORTFOLIO_ID)
    .order("weight", { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data,
    error,
  })
}