export type WebSourcePayload = {
  source_url: string | null
  raw_text: string
  raw_payload: Record<string, unknown>
  warnings: string[]
}

const MAX_RAW_TEXT_CHARS = 120_000

export async function loadWebSource({
  sourceUrl,
  rawText,
}: {
  sourceUrl?: string | null
  rawText?: string | null
}): Promise<WebSourcePayload> {
  const text = cleanText(rawText)
  if (text) {
    return {
      source_url: cleanText(sourceUrl),
      raw_text: trimRawText(text),
      raw_payload: { input_type: "pasted_text" },
      warnings: text.length > MAX_RAW_TEXT_CHARS ? ["Raw text was truncated."] : [],
    }
  }

  const url = cleanText(sourceUrl)
  if (!url) {
    return {
      source_url: null,
      raw_text: "",
      raw_payload: {},
      warnings: ["No source URL or raw text was provided."],
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml,text/plain,application/json,*/*",
        "user-agent":
          "QuantaraDataIngestion/0.1 (+https://quantarasim.local)",
      },
      next: { revalidate: 0 },
    })

    const contentType = response.headers.get("content-type") || ""
    const body = await response.text()
    const rawTextBody = stripHtml(body)
    const warnings = []

    if (!response.ok) {
      warnings.push(`Source responded with HTTP ${response.status}.`)
    }

    if (body.length > MAX_RAW_TEXT_CHARS) {
      warnings.push("Raw source body was truncated.")
    }

    return {
      source_url: url,
      raw_text: trimRawText(rawTextBody),
      raw_payload: {
        input_type: "url",
        status: response.status,
        content_type: contentType,
        body_length: body.length,
      },
      warnings,
    }
  } catch (error) {
    return {
      source_url: url,
      raw_text: "",
      raw_payload: { input_type: "url" },
      warnings: [
        error instanceof Error
          ? `Failed to fetch source URL: ${error.message}`
          : "Failed to fetch source URL.",
      ],
    }
  }
}

export function trimRawText(value: string) {
  return value.slice(0, MAX_RAW_TEXT_CHARS)
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
