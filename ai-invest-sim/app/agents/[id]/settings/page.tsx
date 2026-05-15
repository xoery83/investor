"use client"

import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { supabase } from "../../../../src/lib/supabase"

type AgentForm = {
  name: string
  description: string
  philosophy: string
  risk_level: string
  visibility: string
  lifecycle_status: string
  is_active: boolean
  manual_trade_allowed: boolean
  proposal_execution_required: boolean
  rebalance_frequency: string
  model_name: string
  base_currency: string
}

type ProfileForm = {
  strategy_type: string
  objective: string
  target_annual_return_min: string
  target_annual_return_max: string
  max_drawdown_pct: string
  target_markets: string
  allowed_assets: string
  excluded_assets: string
  manager_instructions: string
}

type RiskForm = {
  min_cash_pct: string
  max_cash_pct: string
  max_single_stock_pct: string
  max_etf_pct: string
  max_one_trade_pct: string
  max_weekly_turnover_pct: string
  max_drawdown_pct: string
  prohibited_assets: string
}

type WorkflowForm = {
  daily_enabled: boolean
  daily_prompt_template_key: string
  weekly_enabled: boolean
  weekly_prompt_template_key: string
  escalation_enabled: boolean
  escalation_prompt_template_key: string
  validator_enabled: boolean
  validator_prompt_template_key: string
  max_revision_attempts: string
}

type CurrentUser = {
  id: string
  email: string | null
  profile: {
    role: "admin" | "free" | "plus" | "pro"
    plan_status: string
  }
}

type PublicationReadiness = {
  ready: boolean
  status: "ready" | "blocked"
  checks: {
    key: string
    label: string
    passed: boolean
    severity: "blocker" | "warning"
    message: string
  }[]
  blockers: string[]
  warnings: string[]
}

const defaultAgentForm: AgentForm = {
  name: "",
  description: "",
  philosophy: "",
  risk_level: "medium",
  visibility: "private",
  lifecycle_status: "active",
  is_active: true,
  manual_trade_allowed: true,
  proposal_execution_required: false,
  rebalance_frequency: "daily",
  model_name: "gpt-4.1-mini",
  base_currency: "USD",
}

const defaultProfileForm: ProfileForm = {
  strategy_type: "conservative_growth",
  objective: "",
  target_annual_return_min: "8",
  target_annual_return_max: "15",
  max_drawdown_pct: "20",
  target_markets: "",
  allowed_assets: "",
  excluded_assets: "",
  manager_instructions: "",
}

const defaultRiskForm: RiskForm = {
  min_cash_pct: "5",
  max_cash_pct: "25",
  max_single_stock_pct: "20",
  max_etf_pct: "40",
  max_one_trade_pct: "10",
  max_weekly_turnover_pct: "15",
  max_drawdown_pct: "20",
  prohibited_assets: "",
}

const defaultWorkflowForm: WorkflowForm = {
  daily_enabled: true,
  daily_prompt_template_key: "conservative_daily_v1",
  weekly_enabled: true,
  weekly_prompt_template_key: "conservative_weekly_v1",
  escalation_enabled: true,
  escalation_prompt_template_key: "conservative_escalation_v1",
  validator_enabled: true,
  validator_prompt_template_key: "conservative_validator_v1",
  max_revision_attempts: "2",
}

export default function AgentSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [agentForm, setAgentForm] = useState<AgentForm>(defaultAgentForm)
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(defaultProfileForm)
  const [riskForm, setRiskForm] = useState<RiskForm>(defaultRiskForm)
  const [workflowForm, setWorkflowForm] =
    useState<WorkflowForm>(defaultWorkflowForm)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [agentOwnerId, setAgentOwnerId] = useState<string | null>(null)
  const [naturalUpdate, setNaturalUpdate] = useState("")
  const [drafting, setDrafting] = useState(false)
  const [draftNotice, setDraftNotice] = useState("")
  const [profileConfig, setProfileConfig] = useState<Record<string, unknown>>({})
  const [riskPolicyConfig, setRiskPolicyConfig] = useState<
    Record<string, unknown>
  >({})
  const [workflowConfig, setWorkflowConfig] = useState<Record<string, unknown>>(
    {}
  )
  const [publicationReadiness, setPublicationReadiness] =
    useState<PublicationReadiness | null>(null)

  useEffect(() => {
    async function loadAgent() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const [agentRes, meRes] = await Promise.all([
        fetch(`/api/agents/${id}`, { headers }),
        token
          ? fetch("/api/auth/me", { headers })
          : Promise.resolve(null),
      ])
      const res = agentRes
      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Failed to load agent")
        setLoading(false)
        return
      }

      const agent = data.agent || {}
      const profile = data.profile || {}
      const riskPolicy = data.risk_policy || {}
      const workflow = data.workflow_config || {}
      setPublicationReadiness(data.publication_readiness || null)

      if (meRes?.ok) {
        const meData = await meRes.json()
        if (meData.success) setCurrentUser(meData.user)
      }
      setAgentOwnerId(agent.owner_user_id || null)
      setAgentForm({
        name: String(agent.name || ""),
        description: String(agent.description || ""),
        philosophy: String(agent.philosophy || ""),
        risk_level: String(agent.risk_level || "medium"),
        visibility: String(agent.visibility || "private"),
        lifecycle_status: String(agent.lifecycle_status || "active"),
        is_active: Boolean(agent.is_active),
        manual_trade_allowed: agent.manual_trade_allowed !== false,
        proposal_execution_required: Boolean(agent.proposal_execution_required),
        rebalance_frequency: String(agent.rebalance_frequency || "daily"),
        model_name: String(agent.model_name || "gpt-4.1-mini"),
        base_currency: String(agent.base_currency || "USD"),
      })

      setProfileForm({
        strategy_type: String(
          profile.strategy_type || defaultProfileForm.strategy_type
        ),
        objective: String(profile.objective || ""),
        target_annual_return_min: numberText(
          profile.target_annual_return_min,
          defaultProfileForm.target_annual_return_min
        ),
        target_annual_return_max: numberText(
          profile.target_annual_return_max,
          defaultProfileForm.target_annual_return_max
        ),
        max_drawdown_pct: numberText(
          profile.max_drawdown_pct,
          defaultProfileForm.max_drawdown_pct
        ),
        target_markets: listToText(profile.target_markets),
        allowed_assets: listToText(profile.allowed_assets),
        excluded_assets: listToText(profile.excluded_assets),
        manager_instructions: String(profile.manager_instructions || ""),
      })

      setRiskForm({
        min_cash_pct: numberText(
          riskPolicy.min_cash_pct,
          defaultRiskForm.min_cash_pct
        ),
        max_cash_pct: numberText(
          riskPolicy.max_cash_pct,
          defaultRiskForm.max_cash_pct
        ),
        max_single_stock_pct: numberText(
          riskPolicy.max_single_stock_pct,
          defaultRiskForm.max_single_stock_pct
        ),
        max_etf_pct: numberText(
          riskPolicy.max_etf_pct,
          defaultRiskForm.max_etf_pct
        ),
        max_one_trade_pct: numberText(
          riskPolicy.max_one_trade_pct,
          defaultRiskForm.max_one_trade_pct
        ),
        max_weekly_turnover_pct: numberText(
          riskPolicy.max_weekly_turnover_pct,
          defaultRiskForm.max_weekly_turnover_pct
        ),
        max_drawdown_pct: numberText(
          riskPolicy.max_drawdown_pct,
          defaultRiskForm.max_drawdown_pct
        ),
        prohibited_assets: listToText(riskPolicy.prohibited_assets),
      })

      setWorkflowForm({
        daily_enabled: Boolean(workflow.daily_enabled),
        daily_prompt_template_key: String(
          workflow.daily_prompt_template_key ||
            defaultWorkflowForm.daily_prompt_template_key
        ),
        weekly_enabled: Boolean(workflow.weekly_enabled),
        weekly_prompt_template_key: String(
          workflow.weekly_prompt_template_key ||
            defaultWorkflowForm.weekly_prompt_template_key
        ),
        escalation_enabled: Boolean(workflow.escalation_enabled),
        escalation_prompt_template_key: String(
          workflow.escalation_prompt_template_key ||
            defaultWorkflowForm.escalation_prompt_template_key
        ),
        validator_enabled: Boolean(workflow.validator_enabled),
        validator_prompt_template_key: String(
          workflow.validator_prompt_template_key ||
            defaultWorkflowForm.validator_prompt_template_key
        ),
        max_revision_attempts: numberText(
          workflow.max_revision_attempts,
          defaultWorkflowForm.max_revision_attempts
        ),
      })

      setProfileConfig(readObject(profile.config))
      setRiskPolicyConfig(readObject(riskPolicy.policy))
      setWorkflowConfig(readObject(workflow.config))
      setLoading(false)
    }

    loadAgent()
  }, [id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before saving agent settings.")
      setSaving(false)
      return
    }

    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...agentForm,
        profile: {
          strategy_type: profileForm.strategy_type,
          objective: profileForm.objective,
          target_annual_return_min: toNumber(
            profileForm.target_annual_return_min
          ),
          target_annual_return_max: toNumber(
            profileForm.target_annual_return_max
          ),
          max_drawdown_pct: toNumber(profileForm.max_drawdown_pct),
          target_markets: textToList(profileForm.target_markets),
          allowed_assets: textToList(profileForm.allowed_assets),
          excluded_assets: textToList(profileForm.excluded_assets),
          manager_instructions: profileForm.manager_instructions || null,
          config: profileConfig,
        },
        risk_policy: {
          min_cash_pct: toNumber(riskForm.min_cash_pct),
          max_cash_pct: toNumber(riskForm.max_cash_pct),
          max_single_stock_pct: toNumber(riskForm.max_single_stock_pct),
          max_etf_pct: toNumber(riskForm.max_etf_pct),
          max_one_trade_pct: toNumber(riskForm.max_one_trade_pct),
          max_weekly_turnover_pct: toNumber(
            riskForm.max_weekly_turnover_pct
          ),
          max_drawdown_pct: toNumber(riskForm.max_drawdown_pct),
          prohibited_assets: textToList(riskForm.prohibited_assets),
          policy: riskPolicyConfig,
        },
        workflow_config: {
          daily_enabled: workflowForm.daily_enabled,
          daily_prompt_template_key: workflowForm.daily_prompt_template_key,
          weekly_enabled: workflowForm.weekly_enabled,
          weekly_prompt_template_key: workflowForm.weekly_prompt_template_key,
          escalation_enabled: workflowForm.escalation_enabled,
          escalation_prompt_template_key:
            workflowForm.escalation_prompt_template_key,
          validator_enabled: workflowForm.validator_enabled,
          validator_prompt_template_key:
            workflowForm.validator_prompt_template_key,
          max_revision_attempts: Math.max(
            0,
            Math.round(toNumber(workflowForm.max_revision_attempts))
          ),
          config: workflowConfig,
        },
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to save agent")
      if (data.publication_readiness) {
        setPublicationReadiness(data.publication_readiness)
      }
      setSaving(false)
      return
    }

    router.push(`/agents/${id}`)
    router.refresh()
  }

  async function handleNaturalUpdate() {
    setDrafting(true)
    setError("")
    setDraftNotice("")

    const res = await fetch("/api/agents/parse-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "update",
        description: naturalUpdate,
        currentDraft: buildCurrentDraft(),
      }),
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to generate settings draft")
      setDrafting(false)
      return
    }

    applyDraft(data.draft)
    setDraftNotice(
      data.source === "fallback"
        ? "Draft applied with conservative fallback. Review fields before saving."
        : "Draft applied to the form. Review fields before saving."
    )
    setDrafting(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
        Loading...
      </main>
    )
  }

  const userRole = currentUser?.profile.role || "free"
  const isAdmin = userRole === "admin"
  const isOwner = Boolean(currentUser && agentOwnerId === currentUser.id)
  const canPublish = isAdmin || userRole === "pro"
  const canUseSystemVisibility = isAdmin
  const canEditSettings = isAdmin || isOwner
  const visibilityOptions: [string, string][] = [
    ["private", "Private"],
    ...(canPublish ? [["public", "Public"] as [string, string]] : []),
    ...(canUseSystemVisibility ? [["system", "System"] as [string, string]] : []),
  ]
  const canEditLifecycle = isAdmin || isOwner

  if (!canEditSettings) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6">
            <Link href={`/agents/${id}`} className="text-sm text-blue-400">
              ← Back to Dashboard
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold">Agent Settings</h1>
            <p className="mt-2 text-slate-500">
              This agent can be viewed, but only the owner or an admin can edit its configuration.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 uppercase tracking-wide text-slate-700">
                Role: {userRole}
              </span>
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-slate-500">
                Limited access
              </span>
            </div>
          </div>

          <div className="space-y-6">
            <PublicationReadinessPanel readiness={publicationReadiness} />

            <SettingsSection
              title="Basic Agent"
              description="Read-only identity and publication details."
            >
              <ReadOnlyField label="Agent Name" value={agentForm.name} />
              <ReadOnlyField
                label="Description"
                value={agentForm.description || "No description"}
              />
              <ReadOnlyField
                label="Investment Philosophy"
                value={agentForm.philosophy || "No philosophy defined."}
              />
              <div className="grid gap-4 md:grid-cols-3">
                <ReadOnlyField label="Risk Level" value={agentForm.risk_level} />
                <ReadOnlyField
                  label="Rebalance Frequency"
                  value={agentForm.rebalance_frequency}
                />
                <ReadOnlyField label="Model" value={agentForm.model_name} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField label="Visibility" value={agentForm.visibility} />
                <ReadOnlyField
                  label="Lifecycle Status"
                  value={agentForm.lifecycle_status}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label="Manual Trade"
                  value={agentForm.manual_trade_allowed ? "Allowed" : "Disabled"}
                />
                <ReadOnlyField
                  label="Proposal Execution"
                  value={
                    agentForm.proposal_execution_required
                      ? "Required"
                      : "Optional"
                  }
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Investment Profile"
              description="Read-only market scope, objectives, and manager preferences."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label="Strategy Type"
                  value={profileForm.strategy_type}
                />
                <ReadOnlyField label="Objective" value={profileForm.objective} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <ReadOnlyField
                  label="Target Return Min %"
                  value={profileForm.target_annual_return_min}
                />
                <ReadOnlyField
                  label="Target Return Max %"
                  value={profileForm.target_annual_return_max}
                />
                <ReadOnlyField
                  label="Max Drawdown %"
                  value={profileForm.max_drawdown_pct}
                />
              </div>
              <ReadOnlyField
                label="Target Markets"
                value={profileForm.target_markets || "Not configured"}
              />
              <ReadOnlyField
                label="Allowed Assets"
                value={profileForm.allowed_assets || "Not configured"}
              />
              <ReadOnlyField
                label="Excluded Assets"
                value={profileForm.excluded_assets || "None"}
              />
              <ReadOnlyField
                label="Manager Instructions"
                value={profileForm.manager_instructions || "None"}
              />
            </SettingsSection>

            <SettingsSection
              title="Risk Policy"
              description="Read-only limits used by the local validator."
            >
              <div className="grid gap-4 md:grid-cols-4">
                <ReadOnlyField label="Min Cash %" value={riskForm.min_cash_pct} />
                <ReadOnlyField label="Max Cash %" value={riskForm.max_cash_pct} />
                <ReadOnlyField
                  label="Max Single Stock %"
                  value={riskForm.max_single_stock_pct}
                />
                <ReadOnlyField label="Max ETF %" value={riskForm.max_etf_pct} />
                <ReadOnlyField
                  label="Max One Trade %"
                  value={riskForm.max_one_trade_pct}
                />
                <ReadOnlyField
                  label="Max Weekly Turnover %"
                  value={riskForm.max_weekly_turnover_pct}
                />
                <ReadOnlyField
                  label="Max Drawdown %"
                  value={riskForm.max_drawdown_pct}
                />
              </div>
              <ReadOnlyField
                label="Prohibited Assets"
                value={riskForm.prohibited_assets || "None"}
              />
            </SettingsSection>

            <SettingsSection
              title="Workflow"
              description="Read-only run module configuration."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label="Daily Routine"
                  value={workflowForm.daily_enabled ? "Enabled" : "Disabled"}
                />
                <ReadOnlyField
                  label="Weekly Deep Research"
                  value={workflowForm.weekly_enabled ? "Enabled" : "Disabled"}
                />
                <ReadOnlyField
                  label="Escalation Run"
                  value={
                    workflowForm.escalation_enabled ? "Enabled" : "Disabled"
                  }
                />
                <ReadOnlyField
                  label="Risk Validator"
                  value={workflowForm.validator_enabled ? "Enabled" : "Disabled"}
                />
              </div>
            </SettingsSection>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <Link href={`/agents/${id}`} className="text-sm text-blue-400">
            ← Back to Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Agent Settings</h1>
          <p className="mt-2 text-slate-500">
            Modify agent identity, investment profile, risk policy, and workflow configuration.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 uppercase tracking-wide text-slate-700">
              Role: {userRole}
            </span>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-slate-500">
              {isAdmin ? "Admin access" : isOwner ? "Owner access" : "Limited access"}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <PublicationReadinessPanel readiness={publicationReadiness} />

          <SettingsSection
            title="Natural Language Update"
            description="Describe what you want to change. The system will update the fields below, but nothing is saved until you click Save Changes."
          >
            <div className="space-y-4">
              <TextAreaField
                label="Update Brief"
                value={naturalUpdate}
                onChange={setNaturalUpdate}
                rows={4}
                hint="Example: Expand this agent to include Hong Kong-listed China tech ETFs and US-listed China ADRs, but avoid broad US index ETFs."
              />
              {draftNotice && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  {draftNotice}
                </div>
              )}
              <button
                type="button"
                onClick={handleNaturalUpdate}
                disabled={drafting || !naturalUpdate.trim()}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-5 py-2 text-blue-700 hover:bg-blue-500/20 disabled:border-blue-200 disabled:bg-blue-100 disabled:text-slate-400"
              >
                {drafting ? "Generating field updates..." : "Apply Draft to Fields"}
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Basic Agent"
            description="These fields describe the agent and determine whether it can run."
          >
            <TextField
              label="Agent Name"
              value={agentForm.name}
              onChange={(value) => updateAgent("name", value)}
              required
            />
            <TextField
              label="Description"
              value={agentForm.description}
              onChange={(value) => updateAgent("description", value)}
            />
            <TextAreaField
              label="Investment Philosophy"
              value={agentForm.philosophy}
              onChange={(value) => updateAgent("philosophy", value)}
              rows={5}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <SelectField
                label="Risk Level"
                value={agentForm.risk_level}
                onChange={(value) => updateAgent("risk_level", value)}
                options={[
                  ["low", "Low"],
                  ["medium", "Medium"],
                  ["high", "High"],
                ]}
              />
              <SelectField
                label="Rebalance Frequency"
                value={agentForm.rebalance_frequency}
                onChange={(value) =>
                  updateAgent("rebalance_frequency", value)
                }
                options={[
                  ["daily", "Daily"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                ]}
              />
              <TextField
                label="Model Name"
                value={agentForm.model_name}
                onChange={(value) => updateAgent("model_name", value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <SelectField
                label="Base Currency"
                value={agentForm.base_currency}
                onChange={(value) => updateAgent("base_currency", value)}
                options={[
                  ["USD", "USD"],
                  ["HKD", "HKD"],
                  ["AUD", "AUD"],
                  ["NZD", "NZD"],
                  ["CNY", "CNY"],
                  ["EUR", "EUR"],
                  ["GBP", "GBP"],
                  ["JPY", "JPY"],
                ]}
                hint="All portfolio totals, cash, weights, and valuation snapshots use this currency. It can only be changed before holdings exist."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Visibility"
                value={agentForm.visibility}
                onChange={(value) => updateAgent("visibility", value)}
                options={visibilityOptions}
                hint={
                  canPublish
                    ? "Public agents can be discovered by other users. System agents are admin-only."
                    : "Free and Plus users can create private agents only. Pro users can publish agents."
                }
              />
              <SelectField
                label="Lifecycle Status"
                value={agentForm.lifecycle_status}
                onChange={(value) => updateAgent("lifecycle_status", value)}
                options={[
                  ["draft", "Draft"],
                  ["active", "Active"],
                  ["paused", "Paused"],
                  ["retired", "Retired"],
                  ["archived", "Archived"],
                ]}
                disabled={!canEditLifecycle}
                hint="Retired agents stop accepting new followers in the future; archived agents are historical."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleRow
                label="Manual Trade"
                description="When disabled, holdings must be changed through approved rebalance proposals."
                checked={agentForm.manual_trade_allowed}
                onChange={(value) => updateAgent("manual_trade_allowed", value)}
                checkedLabel="Allowed"
                uncheckedLabel="Disabled"
              />
              <ToggleRow
                label="Proposal Execution"
                description="When required, public execution must come from a validated trade proposal."
                checked={agentForm.proposal_execution_required}
                onChange={(value) =>
                  updateAgent("proposal_execution_required", value)
                }
                checkedLabel="Required"
                uncheckedLabel="Optional"
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Investment Profile"
            description="These fields give the model the target market, return objective, and manager preferences."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Strategy Type"
                value={profileForm.strategy_type}
                onChange={(value) => updateProfile("strategy_type", value)}
              />
              <TextField
                label="Objective"
                value={profileForm.objective}
                onChange={(value) => updateProfile("objective", value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField
                label="Target Return Min %"
                value={profileForm.target_annual_return_min}
                onChange={(value) =>
                  updateProfile("target_annual_return_min", value)
                }
              />
              <NumberField
                label="Target Return Max %"
                value={profileForm.target_annual_return_max}
                onChange={(value) =>
                  updateProfile("target_annual_return_max", value)
                }
              />
              <NumberField
                label="Max Drawdown %"
                value={profileForm.max_drawdown_pct}
                onChange={(value) =>
                  updateProfile("max_drawdown_pct", value)
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <TextAreaField
                label="Target Markets"
                value={profileForm.target_markets}
                onChange={(value) => updateProfile("target_markets", value)}
                rows={5}
                hint="One per line or comma separated."
              />
              <TextAreaField
                label="Allowed Assets"
                value={profileForm.allowed_assets}
                onChange={(value) => updateProfile("allowed_assets", value)}
                rows={5}
                hint="One per line or comma separated."
              />
              <TextAreaField
                label="Excluded Assets"
                value={profileForm.excluded_assets}
                onChange={(value) => updateProfile("excluded_assets", value)}
                rows={5}
                hint="One per line or comma separated."
              />
            </div>
            <TextAreaField
              label="Manager Instructions"
              value={profileForm.manager_instructions}
              onChange={(value) =>
                updateProfile("manager_instructions", value)
              }
              rows={4}
            />
          </SettingsSection>

          <SettingsSection
            title="Risk Policy"
            description="The local validator uses these limits before any proposal is shown as approved."
          >
            <div className="grid gap-4 md:grid-cols-4">
              <NumberField
                label="Min Cash %"
                value={riskForm.min_cash_pct}
                onChange={(value) => updateRisk("min_cash_pct", value)}
              />
              <NumberField
                label="Max Cash %"
                value={riskForm.max_cash_pct}
                onChange={(value) => updateRisk("max_cash_pct", value)}
              />
              <NumberField
                label="Max Single Stock %"
                value={riskForm.max_single_stock_pct}
                onChange={(value) =>
                  updateRisk("max_single_stock_pct", value)
                }
              />
              <NumberField
                label="Max ETF %"
                value={riskForm.max_etf_pct}
                onChange={(value) => updateRisk("max_etf_pct", value)}
              />
              <NumberField
                label="Max One Trade %"
                value={riskForm.max_one_trade_pct}
                onChange={(value) => updateRisk("max_one_trade_pct", value)}
              />
              <NumberField
                label="Max Weekly Turnover %"
                value={riskForm.max_weekly_turnover_pct}
                onChange={(value) =>
                  updateRisk("max_weekly_turnover_pct", value)
                }
              />
              <NumberField
                label="Max Drawdown %"
                value={riskForm.max_drawdown_pct}
                onChange={(value) => updateRisk("max_drawdown_pct", value)}
              />
            </div>
            <TextAreaField
              label="Prohibited Assets"
              value={riskForm.prohibited_assets}
              onChange={(value) => updateRisk("prohibited_assets", value)}
              rows={4}
              hint="One per line or comma separated."
            />
          </SettingsSection>

          <SettingsSection
            title="Workflow"
            description="Enable or disable run modules and point each module at a prompt template key."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <WorkflowToggle
                label="Daily Routine"
                checked={workflowForm.daily_enabled}
                templateKey={workflowForm.daily_prompt_template_key}
                onCheckedChange={(value) =>
                  updateWorkflow("daily_enabled", value)
                }
                onTemplateChange={(value) =>
                  updateWorkflow("daily_prompt_template_key", value)
                }
              />
              <WorkflowToggle
                label="Weekly Deep Research"
                checked={workflowForm.weekly_enabled}
                templateKey={workflowForm.weekly_prompt_template_key}
                onCheckedChange={(value) =>
                  updateWorkflow("weekly_enabled", value)
                }
                onTemplateChange={(value) =>
                  updateWorkflow("weekly_prompt_template_key", value)
                }
              />
              <WorkflowToggle
                label="Escalation Run"
                checked={workflowForm.escalation_enabled}
                templateKey={workflowForm.escalation_prompt_template_key}
                onCheckedChange={(value) =>
                  updateWorkflow("escalation_enabled", value)
                }
                onTemplateChange={(value) =>
                  updateWorkflow("escalation_prompt_template_key", value)
                }
              />
              <WorkflowToggle
                label="Risk Validator"
                checked={workflowForm.validator_enabled}
                templateKey={workflowForm.validator_prompt_template_key}
                onCheckedChange={(value) =>
                  updateWorkflow("validator_enabled", value)
                }
                onTemplateChange={(value) =>
                  updateWorkflow("validator_prompt_template_key", value)
                }
              />
            </div>
            <NumberField
              label="Max Revision Attempts"
              value={workflowForm.max_revision_attempts}
              onChange={(value) =>
                updateWorkflow("max_revision_attempts", value)
              }
            />
          </SettingsSection>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-blue-200 bg-white/95 py-4 backdrop-blur">
            <Link
              href={`/agents/${id}`}
              className="rounded-lg border border-blue-200 px-5 py-2 text-slate-700 hover:bg-blue-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </main>
  )

  function updateAgent<Key extends keyof AgentForm>(
    key: Key,
    value: AgentForm[Key]
  ) {
    setAgentForm((current) => ({ ...current, [key]: value }))
  }

  function updateProfile<Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key]
  ) {
    setProfileForm((current) => ({ ...current, [key]: value }))
  }

  function updateRisk<Key extends keyof RiskForm>(
    key: Key,
    value: RiskForm[Key]
  ) {
    setRiskForm((current) => ({ ...current, [key]: value }))
  }

  function updateWorkflow<Key extends keyof WorkflowForm>(
    key: Key,
    value: WorkflowForm[Key]
  ) {
    setWorkflowForm((current) => ({ ...current, [key]: value }))
  }

  function buildCurrentDraft() {
    return {
      name: agentForm.name,
      description: agentForm.description,
      philosophy: agentForm.philosophy,
      risk_level: agentForm.risk_level,
      rebalance_frequency: agentForm.rebalance_frequency,
      profile: {
        strategy_type: profileForm.strategy_type,
        objective: profileForm.objective,
        target_annual_return_min: toNumber(
          profileForm.target_annual_return_min
        ),
        target_annual_return_max: toNumber(
          profileForm.target_annual_return_max
        ),
        max_drawdown_pct: toNumber(profileForm.max_drawdown_pct),
        target_markets: textToList(profileForm.target_markets),
        allowed_assets: textToList(profileForm.allowed_assets),
        excluded_assets: textToList(profileForm.excluded_assets),
        manager_instructions: profileForm.manager_instructions,
        config: profileConfig,
      },
      risk_policy: {
        min_cash_pct: toNumber(riskForm.min_cash_pct),
        max_cash_pct: toNumber(riskForm.max_cash_pct),
        max_single_stock_pct: toNumber(riskForm.max_single_stock_pct),
        max_etf_pct: toNumber(riskForm.max_etf_pct),
        max_one_trade_pct: toNumber(riskForm.max_one_trade_pct),
        max_weekly_turnover_pct: toNumber(riskForm.max_weekly_turnover_pct),
        max_drawdown_pct: toNumber(riskForm.max_drawdown_pct),
        prohibited_assets: textToList(riskForm.prohibited_assets),
        policy: riskPolicyConfig,
      },
      workflow_config: {
        daily_enabled: workflowForm.daily_enabled,
        daily_prompt_template_key: workflowForm.daily_prompt_template_key,
        weekly_enabled: workflowForm.weekly_enabled,
        weekly_prompt_template_key: workflowForm.weekly_prompt_template_key,
        escalation_enabled: workflowForm.escalation_enabled,
        escalation_prompt_template_key:
          workflowForm.escalation_prompt_template_key,
        validator_enabled: workflowForm.validator_enabled,
        validator_prompt_template_key:
          workflowForm.validator_prompt_template_key,
        max_revision_attempts: Math.max(
          0,
          Math.round(toNumber(workflowForm.max_revision_attempts))
        ),
        config: workflowConfig,
      },
    }
  }

  function applyDraft(draft: Record<string, unknown>) {
    setAgentForm((current) => ({
      ...current,
      name: readDraftString(draft.name, current.name),
      description: readDraftString(draft.description, current.description),
      philosophy: readDraftString(draft.philosophy, current.philosophy),
      risk_level: readDraftString(draft.risk_level, current.risk_level),
      rebalance_frequency: readDraftString(
        draft.rebalance_frequency,
        current.rebalance_frequency
      ),
    }))

    const profile = readObject(draft.profile)
    setProfileForm((current) => ({
      strategy_type: readDraftString(profile.strategy_type, current.strategy_type),
      objective: readDraftString(profile.objective, current.objective),
      target_annual_return_min: numberText(
        profile.target_annual_return_min,
        current.target_annual_return_min
      ),
      target_annual_return_max: numberText(
        profile.target_annual_return_max,
        current.target_annual_return_max
      ),
      max_drawdown_pct: numberText(
        profile.max_drawdown_pct,
        current.max_drawdown_pct
      ),
      target_markets: listToTextOrFallback(
        profile.target_markets,
        current.target_markets
      ),
      allowed_assets: listToTextOrFallback(
        profile.allowed_assets,
        current.allowed_assets
      ),
      excluded_assets: listToTextOrFallback(
        profile.excluded_assets,
        current.excluded_assets
      ),
      manager_instructions: readDraftString(
        profile.manager_instructions,
        current.manager_instructions
      ),
    }))

    const riskPolicy = readObject(draft.risk_policy)
    setRiskForm((current) => ({
      min_cash_pct: numberText(riskPolicy.min_cash_pct, current.min_cash_pct),
      max_cash_pct: numberText(riskPolicy.max_cash_pct, current.max_cash_pct),
      max_single_stock_pct: numberText(
        riskPolicy.max_single_stock_pct,
        current.max_single_stock_pct
      ),
      max_etf_pct: numberText(riskPolicy.max_etf_pct, current.max_etf_pct),
      max_one_trade_pct: numberText(
        riskPolicy.max_one_trade_pct,
        current.max_one_trade_pct
      ),
      max_weekly_turnover_pct: numberText(
        riskPolicy.max_weekly_turnover_pct,
        current.max_weekly_turnover_pct
      ),
      max_drawdown_pct: numberText(
        riskPolicy.max_drawdown_pct,
        current.max_drawdown_pct
      ),
      prohibited_assets: listToTextOrFallback(
        riskPolicy.prohibited_assets,
        current.prohibited_assets
      ),
    }))

    const workflow = readObject(draft.workflow_config)
    setWorkflowForm((current) => ({
      daily_enabled: readBoolean(workflow.daily_enabled, current.daily_enabled),
      daily_prompt_template_key: readDraftString(
        workflow.daily_prompt_template_key,
        current.daily_prompt_template_key
      ),
      weekly_enabled: readBoolean(
        workflow.weekly_enabled,
        current.weekly_enabled
      ),
      weekly_prompt_template_key: readDraftString(
        workflow.weekly_prompt_template_key,
        current.weekly_prompt_template_key
      ),
      escalation_enabled: readBoolean(
        workflow.escalation_enabled,
        current.escalation_enabled
      ),
      escalation_prompt_template_key: readDraftString(
        workflow.escalation_prompt_template_key,
        current.escalation_prompt_template_key
      ),
      validator_enabled: readBoolean(
        workflow.validator_enabled,
        current.validator_enabled
      ),
      validator_prompt_template_key: readDraftString(
        workflow.validator_prompt_template_key,
        current.validator_prompt_template_key
      ),
      max_revision_attempts: numberText(
        workflow.max_revision_attempts,
        current.max_revision_attempts
      ),
    }))
  }
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-blue-200 bg-white/65 p-6 shadow-sm shadow-blue-100/50">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function PublicationReadinessPanel({
  readiness,
}: {
  readiness: PublicationReadiness | null
}) {
  if (!readiness) {
    return (
      <section className="rounded-xl border border-blue-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Publication Readiness</h2>
            <p className="mt-1 text-sm text-slate-500">
              Readiness is checked before an agent can become public or accept followers.
            </p>
          </div>
          <span className="rounded-md border border-blue-200 px-3 py-1 text-sm text-slate-500">
            Loading
          </span>
        </div>
      </section>
    )
  }

  return (
    <section
      className={
        readiness.ready
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-6"
          : "rounded-xl border border-amber-200 bg-amber-50 p-6"
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Publication Readiness</h2>
          <p className="mt-1 text-sm text-slate-500">
            Public agents must pass these checks before users can follow or buy simulated Agent ETF positions.
          </p>
        </div>
        <span
          className={
            readiness.ready
              ? "rounded-md border border-emerald-200 bg-emerald-100 px-3 py-1 text-sm text-emerald-700"
              : "rounded-md border border-amber-200 bg-amber-100 px-3 py-1 text-sm text-amber-700"
          }
        >
          {readiness.ready ? "Ready to publish" : "Blocked"}
        </span>
      </div>

      {!readiness.ready && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {readiness.blockers[0] || "Publication is blocked by risk policy."}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {readiness.checks.map((check) => (
          <div
            key={check.key}
            className="rounded-lg border border-blue-200 bg-white/70 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-800">{check.label}</p>
              <span
                className={
                  check.passed
                    ? "text-sm text-emerald-700"
                    : "text-sm text-amber-700"
                }
              >
                {check.passed ? "Pass" : "Blocked"}
              </span>
            </div>
            {!check.passed && (
              <p className="mt-2 text-sm text-slate-500">{check.message}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function TextField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-500">{label}</span>
      <input
        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-2 text-sm text-slate-500">{label}</p>
      <div className="min-h-10 whitespace-pre-wrap rounded-lg border border-blue-200 bg-white/70 px-4 py-2 text-slate-800">
        {value}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-500">{label}</span>
      <input
        type="number"
        step="0.01"
        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-500">{label}</span>
      <textarea
        rows={rows}
        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  disabled?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-500">{label}</span>
      <select
        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  checkedLabel,
  uncheckedLabel,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  checkedLabel: string
  uncheckedLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-200 p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "rounded-lg bg-emerald-100 px-4 py-2 text-emerald-700"
            : "rounded-lg bg-blue-100 px-4 py-2 text-slate-500"
        }
      >
        {checked ? checkedLabel : uncheckedLabel}
      </button>
    </div>
  )
}

function WorkflowToggle({
  label,
  checked,
  templateKey,
  onCheckedChange,
  onTemplateChange,
}: {
  label: string
  checked: boolean
  templateKey: string
  onCheckedChange: (value: boolean) => void
  onTemplateChange: (value: string) => void
}) {
  return (
    <div className="rounded-lg border border-blue-200 p-4">
      <ToggleRow
        label={label}
        description="Controls whether this module is available to run."
        checked={checked}
        onChange={onCheckedChange}
        checkedLabel="Enabled"
        uncheckedLabel="Disabled"
      />
      <div className="mt-3">
        <TextField
          label="Prompt Template Key"
          value={templateKey}
          onChange={onTemplateChange}
        />
      </div>
    </div>
  )
}

function listToText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : ""
}

function listToTextOrFallback(value: unknown, fallback: string) {
  return Array.isArray(value) ? value.map(String).join("\n") : fallback
}

function textToList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberText(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback
  return String(value)
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readDraftString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}
