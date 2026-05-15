export function normalizeDisplayCurrency(value: unknown) {
  const currency = String(value || "USD").trim().toUpperCase()
  return currency || "USD"
}

export function formatCurrencyAmount(
  value: number,
  currency?: string,
  options?: {
    maximumFractionDigits?: number
    minimumFractionDigits?: number
  }
) {
  const normalizedCurrency = normalizeDisplayCurrency(currency)
  const amount = Number(value || 0)

  return `${normalizedCurrency} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    minimumFractionDigits: options?.minimumFractionDigits,
  }).format(amount)}`
}

export function formatCompactCurrencyAmount(value: number, currency?: string) {
  return formatCurrencyAmount(value, currency, {
    maximumFractionDigits: 0,
  })
}
