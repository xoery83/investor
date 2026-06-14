# Initialization Portfolio Workflow Redesign

Date: 2026-06-13

## Background

The current initialization workflow is too binary:

```text
Create Agent
  -> Generate Initial Allocation
  -> Accept All / Reject
```

This works for a simple robo-advisor, but it is too opaque for an AI investment manager. Users need to understand, challenge, and shape the portfolio before it becomes the agent's starting state.

Current pain points:

- AI proposes a portfolio.
- User disagrees with specific positions.
- User cannot discuss or modify individual decisions.
- User must accept everything or regenerate everything.
- Regeneration may fix one issue while introducing another.

This reduces trust and limits the core value of an AI-native investment product.

## Product Goal

Transform initialization into an interactive investment committee process.

Instead of a one-way flow:

```text
AI -> User
```

The flow should become collaborative:

```text
AI <-> User
```

The target experience should feel like working with an AI portfolio manager, not receiving a black-box portfolio.

## Recommended Workflow

### Step 1: Initial Proposal

The AI generates an initial portfolio proposal.

Required output:

- Target allocation.
- Holdings list.
- Cash allocation.
- Sector exposure.
- Currency exposure when relevant.
- Market/exchange exposure when relevant.

Example:

```text
AAPL 11%
MSFT 11%
NVDA 9%
CASH 8%
```

### Step 2: Investment Thesis

For every proposal, the AI must explain why the portfolio exists.

Example:

- Large-cap technology provides stability.
- AI infrastructure remains a long-term growth theme.
- Defensive exposure reduces macro risk.
- Cash is reserved for future opportunities.

### Step 3: Self-Critique

The AI should automatically identify weaknesses in its own proposal.

Example:

```text
Potential concerns:
1. Technology allocation is only 65%, below the target 80%.
2. SpaceX is not included.
3. ARKK overlaps with existing holdings.
4. Cash allocation may be higher than necessary.
```

This is a trust-building feature. It lets users see that the system is not only generating a recommendation, but also stress-testing it.

### Step 4: Interactive Discussion

Users should be able to challenge individual decisions without restarting the whole process.

Examples:

```text
User: Why is SpaceX missing?

AI:
Reasons:
- IPO too recent.
- Volatility history unavailable.
- Risk model reduced weighting.

Alternative:
SPCE 5% -> SpaceX 5%
```

```text
User: Reduce cash to 5%.

AI:
Updated allocation generated.
```

```text
User: Increase AI exposure.

AI:
NVDA 9% -> 12%
PLTR 3% -> 6%
```

## Portfolio Revision Loop

The initialization flow should support iterative revisions.

```text
Version 1
  -> User feedback
  -> Version 2
  -> User feedback
  -> Version 3
  -> Approve
```

Maximum revision count should be configurable by role or system policy.

## Suggested UI Actions

Each proposal version should expose four primary actions:

- Accept Entire Proposal.
- Request Changes.
- Ask AI.
- Generate Alternative.

The final execution action should be explicit:

- Approve and Execute.

The portfolio should not be created until the user explicitly approves execution.

## Optional Feature: Committee Mode

Committee mode introduces multiple AI perspectives before final allocation.

### Growth Manager

Goal: maximize return.

Example:

```text
NVDA 15%
PLTR 10%
SpaceX 8%
```

### Risk Manager

Goal: challenge risk assumptions.

Example:

```text
NVDA too concentrated.
SpaceX IPO risk.
Portfolio volatility exceeds target.
```

### Committee Decision

System generates:

- Investment committee summary.
- Agreements.
- Disagreements.
- Recommended final allocation.

This mimics a real investment committee process and can become a signature product feature.

## Initialization Completion Criteria

Portfolio initialization should not execute until:

- A proposal version exists.
- Required thesis and self-critique sections exist.
- Risk validation has passed or warnings are explicitly accepted where allowed.
- User explicitly clicks Approve and Execute.

After approval:

- Portfolio is created.
- Initial positions are established.
- Tracking begins.
- The approved proposal becomes the agent's initial investment memory.

## Expected Benefits

1. Higher user trust.
2. Better transparency.
3. Reduced black-box behavior.
4. Better portfolio quality.
5. More realistic AI fund manager experience.
6. Lower regeneration frustration.
7. Easier debugging of agent reasoning.

## Proposed Data Model

### `agent_initialization_sessions`

Stores one initialization workflow per agent.

Suggested fields:

- `id`
- `agent_id`
- `user_id`
- `status`: `draft`, `in_review`, `approved`, `executed`, `abandoned`
- `current_version`
- `max_revisions`
- `created_at`
- `updated_at`
- `approved_at`
- `executed_at`

### `agent_initialization_versions`

Stores each generated or revised proposal.

Suggested fields:

- `id`
- `session_id`
- `version_number`
- `source`: `initial`, `revision`, `alternative`, `committee`
- `user_feedback`
- `proposal_json`
- `thesis_json`
- `self_critique_json`
- `risk_validation_json`
- `status`: `draft`, `current`, `superseded`, `approved`, `executed`
- `created_at`

### `agent_initialization_messages`

Stores the discussion thread between user and AI.

Suggested fields:

- `id`
- `session_id`
- `version_id`
- `role`: `user`, `assistant`, `system`
- `message_type`: `question`, `answer`, `change_request`, `revision_summary`
- `content`
- `created_at`

## Proposed API Surface

- `POST /api/agents/[id]/initialization/start`
- `POST /api/agents/[id]/initialization/[sessionId]/ask`
- `POST /api/agents/[id]/initialization/[sessionId]/revise`
- `POST /api/agents/[id]/initialization/[sessionId]/alternative`
- `POST /api/agents/[id]/initialization/[sessionId]/approve`
- `POST /api/agents/[id]/initialization/[sessionId]/execute`

## Proposed UI Structure

### Initialization Workspace

For new or uninitialized agents, show an initialization workspace instead of a normal rebalance proposal.

Recommended layout:

- Left: proposal allocation and holdings.
- Right: thesis, self-critique, and risk validation.
- Bottom: discussion thread and change request input.
- Sticky footer: Accept, Request Changes, Ask AI, Generate Alternative, Approve and Execute.

### Version History

Show proposal versions as tabs or timeline:

```text
V1 -> V2 -> V3 -> Approved
```

Each version should be viewable and comparable.

## Engineering Notes

- Initial build should no longer directly execute from a single proposal card.
- The approved initialization version should become durable agent memory.
- Rebalance should reference the approved initial allocation and thesis.
- Later daily/weekly/rebalance runs should compare current holdings against the approved target allocation.
- Committee mode can be deferred until the single-agent revision loop is stable.

## Open Product Questions

1. Should free users have fewer revision attempts than plus/pro users?
2. Should public agents require committee mode before publication?
3. Should self-critique be mandatory for all proposals, including normal rebalance?
4. Should users be allowed to approve a proposal with unresolved risk warnings?
5. Should generated alternatives preserve the same universe or allow new universe candidates?
6. Should initialization approval lock the agent's starting thesis as immutable history?

## Recommended Implementation Phases

### Phase 1: Single-Agent Interactive Initialization

- Add initialization session/version/message tables.
- Add start, ask, revise, approve, and execute endpoints.
- Replace one-click initial build with proposal review workspace.
- Store approved proposal as agent memory.

### Phase 2: Better Revision Intelligence

- Add structured change request handling.
- Add version comparison.
- Add self-critique and risk validation panels.
- Add revision count limits.

### Phase 3: Committee Mode

- Add growth manager and risk manager perspectives.
- Generate committee summary.
- Let user approve committee final allocation.

### Phase 4: Public Agent Requirements

- Require completed initialization before publication.
- Require approved thesis and risk validation.
- Use initial proposal and thesis as public transparency materials.

