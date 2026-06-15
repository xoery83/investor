import type { SupabaseClient } from "@supabase/supabase-js"

import type { ExtractorKind } from "./openai-extract"

export type IngestionJobStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"

export type IngestionJobInput = {
  job_type: ExtractorKind
  requested_by: string | null
  target_symbol?: string | null
  target_name?: string | null
  source_url?: string | null
}

export async function createIngestionJob(
  supabase: SupabaseClient,
  input: IngestionJobInput
) {
  const { data, error } = await supabase
    .from("data_ingestion_jobs")
    .insert({
      job_type: input.job_type,
      status: "running",
      requested_by: input.requested_by,
      target_symbol: normalizeSymbol(input.target_symbol),
      target_name: cleanText(input.target_name),
      source_url: cleanText(input.source_url),
    })
    .select()
    .single()

  if (error) {
    if (isMissingIngestionJobTableError(error.message)) return null
    throw new Error(error.message)
  }

  return data as { id: string }
}

export async function updateIngestionJob(
  supabase: SupabaseClient,
  jobId: string | null,
  input: {
    status: IngestionJobStatus
    raw_text?: string
    raw_payload?: Record<string, unknown>
    extracted_json?: Record<string, unknown>
    confidence?: number | null
    warnings?: string[]
    error_message?: string | null
    source_url?: string | null
  }
) {
  if (!jobId) return null

  const { data, error } = await supabase
    .from("data_ingestion_jobs")
    .update({
      status: input.status,
      raw_text: input.raw_text,
      raw_payload: input.raw_payload || {},
      extracted_json: input.extracted_json || {},
      confidence: input.confidence ?? null,
      warnings: input.warnings || [],
      error_message: input.error_message || null,
      source_url: cleanText(input.source_url),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single()

  if (error) {
    if (isMissingIngestionJobTableError(error.message)) return null
    throw new Error(error.message)
  }

  return data
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeSymbol(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase().replace(/-/g, ".")
    : null
}

function isMissingIngestionJobTableError(message: string) {
  return (
    message.includes("data_ingestion_jobs") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
