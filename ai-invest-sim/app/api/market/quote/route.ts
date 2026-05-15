import { NextResponse } from "next/server"
import { getPrice } from "@/lib/market/get-price"
import { normalizeMarketSymbol } from "@/lib/market/normalize-symbol"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "Symbol is required" },
      { status: 400 }
    )
  }

  try {
    const quote = await getPrice(normalizeMarketSymbol(symbol))

    return NextResponse.json({
      success: true,
      quote,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch quote",
      },
      { status: 500 }
    )
  }
}
