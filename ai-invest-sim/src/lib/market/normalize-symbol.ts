export function normalizeMarketSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase()
  const hkMatch = normalized.match(/^0+(\d{4})\.HK$/)

  if (hkMatch) {
    return `${hkMatch[1]}.HK`
  }

  return normalized
}
