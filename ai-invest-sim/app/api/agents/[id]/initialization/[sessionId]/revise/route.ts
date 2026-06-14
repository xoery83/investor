import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  addMemoryCard,
  addMemoryCards,
  buildProposalMemoryCards,
  extractPreferenceMemoryFromText,
  getActiveMemoryCards,
} from "../../../../../../../src/lib/agents/memory-cards"
import { evaluateAndStorePortfolio } from "../../../../../../../src/lib/agents/portfolio-evaluation"
import { storeInitializationVersion } from "../../../../../../../src/lib/agents/initialization-workflow"
import {
  getAgentProfile,
  getInvestmentUniverse,
  getRiskPolicy,
  getWorkflowConfig,
} from "../../../../../../../src/lib/agents/read-agent-config"
import { reviseInitializationProposal } from "../../../../../../../src/lib/agents/run-agent"
import { validateTradeProposal } from "../../../../../../../src/lib/agents/validate-trade-proposal"
import { canEditAgent } from "../../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../../src/lib/auth/server"
import type {
  Agent,
  AgentHolding,
  AgentInitializationVersion,
} from "../../../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await context.params
  const requestUser = await getRequestUser(request)
  const body = await request.json().catch(() => ({}))
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : ""

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
    )
  }

  if (!feedback) {
    return NextResponse.json(
      { success: false, error: "Revision feedback is required." },
      { status: 400 }
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found." },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent as Agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const { data: currentVersion, error: versionError } = await supabase
    .from("agent_initialization_versions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("agent_id", id)
    .eq("status", "current")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (versionError || !currentVersion) {
    return NextResponse.json(
      {
        success: false,
        error:
          versionError?.message ||
          "Current initialization proposal version not found.",
      },
      { status: 404 }
    )
  }

  const [
    holdingsResult,
    profile,
    riskPolicy,
    workflowConfig,
    universe,
  ] = await Promise.all([
    supabase.from("agent_holdings").select("*").eq("agent_id", id),
    getAgentProfile(supabase, id),
    getRiskPolicy(supabase, id),
    getWorkflowConfig(supabase, id),
    getInvestmentUniverse(supabase, id),
  ])

  if (holdingsResult.error) {
    return NextResponse.json(
      { success: false, error: holdingsResult.error.message },
      { status: 500 }
    )
  }

  const version = currentVersion as AgentInitializationVersion
  const memoryCards = await getActiveMemoryCards(supabase, id)
  const preferenceMemory = extractPreferenceMemoryFromText({
    agentId: id,
    text: feedback,
    sourceInitializationVersionId: version.id,
  })
  if (preferenceMemory) {
    await addMemoryCard(supabase, preferenceMemory)
  }

  const revisedProposal = await reviseInitializationProposal({
    agent: agent as Agent,
    currentProposal: version.proposal,
    validation: version.risk_validation,
    userFeedback: feedback,
    profile,
    riskPolicy,
    universe,
    memoryCards,
  })

  const holdings = (holdingsResult.data || []) as AgentHolding[]
  const proposalType = getProposalType(revisedProposal)
  const validationMode =
    proposalType === "capital_deployment" ? "capital_deployment" : "initial_build"
  const validation = validateTradeProposal({
    agent: agent as Agent,
    proposal: revisedProposal,
    holdings,
    riskPolicy,
    profile,
    universe,
    validationMode,
  })

  const { data: runRecord, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      agent_id: id,
      run_type: "initial_build",
      summary: revisedProposal.summary || "Initialization proposal revised.",
      recommendation: revisedProposal,
      risks: revisedProposal.risks || [],
      status: "completed",
    })
    .select()
    .single()

  if (runError) {
    return NextResponse.json(
      { success: false, error: runError.message },
      { status: 500 }
    )
  }

  const { data: proposalRecord, error: proposalError } = await supabase
    .from("trade_proposals")
    .insert({
      agent_id: id,
      source_run_id: runRecord.id,
      status: "pending",
      proposal: revisedProposal,
      validator_status: validation.validation_status,
    })
    .select()
    .single()

  if (proposalError) {
    return NextResponse.json(
      { success: false, error: proposalError.message },
      { status: 500 }
    )
  }

  const { data: validatorRecord, error: validatorError } = await supabase
    .from("validator_results")
    .insert({
      agent_id: id,
      run_id: runRecord.id,
      trade_proposal_id: proposalRecord.id,
      validation_status: validation.validation_status,
      violations: validation.violations,
      final_action_allowed: validation.final_action_allowed,
      revision_attempt: Number(version.version_number || 1),
      result: {
        ...validation.result,
        run_type: validationMode,
        max_revision_attempts: workflowConfig.max_revision_attempts,
        user_feedback: feedback,
      },
    })
    .select()
    .single()

  if (validatorError) {
    return NextResponse.json(
      { success: false, error: validatorError.message },
      { status: 500 }
    )
  }

  const initialization = await storeInitializationVersion({
    supabase,
    agent: agent as Agent,
    userId: requestUser.id,
    proposalId: proposalRecord.id,
    proposal: revisedProposal,
    validation: validatorRecord,
    source: "revision",
    userFeedback: feedback,
  })

  const evaluation = await evaluateAndStorePortfolio({
    supabase,
    agent: agent as Agent,
    holdings,
    proposal: revisedProposal,
    riskPolicy,
    evaluationScope: "initial_proposal",
    sourceRunId: runRecord.id,
    tradeProposalId: proposalRecord.id,
    initializationVersionId: initialization?.version?.id || version.id,
    period: "1Y",
  })

  await addMemoryCards(
    supabase,
    buildProposalMemoryCards({
      agentId: id,
      proposal: revisedProposal,
      validation: validatorRecord,
      sourceRunId: runRecord.id,
      sourceTradeProposalId: proposalRecord.id,
      sourceInitializationVersionId: initialization?.version?.id || version.id,
    })
  )

  await supabase.from("agent_initialization_messages").insert({
    session_id: sessionId,
    version_id: initialization?.version?.id || version.id,
    agent_id: id,
    role: "user",
    message_type: "change_request",
    content: feedback,
  })

  return NextResponse.json({
    success: true,
    result: revisedProposal,
    run: runRecord,
    trade_proposal: {
      ...proposalRecord,
      validator_results: [validatorRecord],
    },
    validation: validatorRecord,
    evaluation,
    initialization,
  })
}

function getProposalType(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "initial_build"
  }

  const proposalType = (value as Record<string, unknown>).proposal_type
  return proposalType === "capital_deployment"
    ? "capital_deployment"
    : "initial_build"
}
