export const DEFAULT_AGENT_MODEL = "gpt-5-mini"

export const AGENT_MODEL_OPTIONS: Array<{
  value: string
  label: string
  description: string
}> = [
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Default for new agents; stronger reasoning at mini-tier cost.",
  },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    description: "Stable fallback model used by earlier agents.",
  },
  {
    value: "gpt-4.1",
    label: "GPT-4.1",
    description: "Higher quality fallback for heavier research runs.",
  },
]
