---
title: ClawPort Agent Team and Memory Product Requirements Research
description: Source-grounded product requirements for adding agent teams and managed memory to team-hunktronics
author: GitHub Copilot
ms.date: 2026-07-19
ms.topic: concept
keywords:
  - agent teams
  - agent memory
  - Electron
  - product requirements
estimated_reading_time: 18
---

## Research Status

Complete. The requested pages and the relevant team-hunktronics implementation
surfaces were reviewed on 2026-07-19.

## Agent Handoff

All planning state, implementation status, decisions, unresolved questions, and
handoff notes must be managed through files under `.copilot-tracking`. Chat
summaries are not authoritative state. Each agent must read the relevant
tracking files before acting and update them before handing work to another
agent.

The current workflow agent is Task Planner. After Task Planner records that
planning is complete, the user will switch to Task Implementor. Task Implementor
must resume from the `.copilot-tracking` files and keep implementation progress
and handoff state there.

## Research Questions

* What concrete agent-team patterns do the pages prescribe?
* What memory lifecycle, classifications, thresholds, and retrieval behavior do
  the pages prescribe?
* What workflows, safety requirements, observability, and failure modes follow
  directly from the pages?
* How should those findings become implementable requirements for the current
  team-hunktronics Electron app?
* Which statements are source-supported and which are engineering inferences?

## Evidence Labels

* `[BP]` is directly supported by the ClawPort best-practices page.
* `[MM]` is directly supported by the ClawPort memory-management article.
* `[APP]` is directly observed in the current team-hunktronics source.
* `[INF]` is an engineering inference or product recommendation derived from the
  sources and current app.

## Sources

* [AI Agent Team Best Practices](https://www.clawport.dev/best-practices)
* [AI Agent Memory Management](https://www.clawport.dev/blog/ai-agent-memory-management)
* Current app surfaces:
  * src/shared/types.ts
  * src/main/store.ts
  * src/main/ipc.ts
  * src/renderer/src/components/AgentEditor.tsx
  * src/renderer/src/components/AgentRunner.tsx
  * src/renderer/src/pages/AgentsPage.tsx
  * src/renderer/src/pages/DataExplorerPage.tsx
  * src/renderer/src/store/useAgentStore.ts
  * src/renderer/src/store/useChatStore.ts

## Executive Product Direction

team-hunktronics should evolve from an agent configuration and single-agent test
surface into a local-first agent operations system with four product pillars:

1. A validated, three-tier team graph with one root orchestrator, domain leads,
   and specialist leaves.
2. Durable run records and file-backed handoffs that make delegation inspectable
   and resumable.
3. Managed memory with small baseline summaries, detailed evergreen notes, raw
   daily logs, shared team artifacts, and explicit maintenance.
4. Policy enforcement and observability in the Electron main process, not only
   descriptive metadata in the renderer.

The recommended MVP uses compression-based forgetting and lexical file search.
Hybrid vector search, temporal scoring, and MMR are a later profile because the
two pages describe different ClawPort memory strategies. `[INF]`

## Directly Supported Agent-Team Patterns

### Hierarchy and Ownership

* A team has one orchestrator at the root, team leads in the middle, and
  specialist leaf agents at the bottom. Each tier has a distinct responsibility.
  `[BP]`
* Exactly one agent has no manager. This agent is the root orchestrator. `[BP]`
* Team leads own and deliver domain pipelines end to end. `[BP]`
* Specialists perform one focused job, report upward, and do not manage other
  agents. `[BP]`
* Hierarchy depth is capped at three levels because deeper chains add latency and
  coordination cost. `[BP]`
* `reportsTo` and `directReports` must agree. `[BP]`
* More than eight to ten root-level direct reports is a signal to introduce a
  team lead. This is guidance rather than a hard invariant. `[BP]`
* A small initial team of one orchestrator, one lead, and one specialist is
  enough to validate the operating pattern. `[BP]`

### Agent Definition

* Each agent has a character document containing identity, expertise, operating
  rules, relationships, and memory location or behavior. `[BP]`
* Character documents should define exclusions and delegation boundaries, not
  only positive capabilities. `[BP]`
* Output format examples should be included when an agent produces structured
  artifacts. `[BP]`
* Character documents should stay under 500 lines, with details moved to linked
  reference documents. `[BP]`
* Each agent should perform one job. A description that repeatedly joins
  responsibilities is a signal to split the agent. `[BP]`

### Tools and Communication

* Tool assignment follows least privilege. Agents receive only the capabilities
  needed for their role. `[BP]`
* Command execution is generally inappropriate for leaf specialists; a lead
  should perform or mediate it. `[BP]`
* Sub-agent spawning belongs to orchestrators and team leads. Team-wide memory
  search belongs to the orchestrator in the example policy. `[BP]`
* Files are the default communication channel because they are inspectable,
  diffable, persistent, and loosely coupled. `[BP]`
* Upstream reports, downstream briefs, and cross-team context are represented as
  files. Real-time messages are reserved for urgent signals. `[BP]`

### Scheduled Work

* A scheduled job should have one fetch, one decision, and one output. `[BP]`
* Research schedules belong to specialists, pipeline schedules to team leads,
  and briefing schedules to the orchestrator. `[BP]`
* Schedules should be staggered so upstream outputs exist before downstream
  consumers run. `[BP]`
* Failure should be isolated to one job. Downstream use of visibly stale data is
  preferred to a cascade failure. `[BP]`

## Directly Supported Memory Lifecycle

### Memory Classes

* Raw daily logs contain unedited, timestamped session activity. Each agent owns
  its own logs. `[BP]`
* An agent baseline file contains curated patterns, decisions, active context,
  and learned preferences. It is updated through compression and retained
  indefinitely. `[BP]`
* Shared team memory contains reusable market, customer, strategy, brand, and
  planning context. Leads and the orchestrator maintain it. `[BP]`
* The memory article describes an always-loaded `MEMORY.md` plus searchable topic
  files and date-named daily logs. `[MM]`
* A date-formatted filename is a daily log; other memory files are evergreen.
  The two classes have different staleness and pruning rules. `[MM]`

### Loading and Context Control

* Baseline memory is always loaded and should contain project facts,
  conventions, key paths, active decisions, and links to detailed topic files.
  `[MM]`
* Full histories and complete reference material belong in topic files, not in
  baseline memory. `[MM]`
* The article states that Claude Code loads at most 200 lines of `MEMORY.md` and
  treats content beyond that limit as absent. `[MM]`
* The article recommends a warning at 150 lines and critical status above 200
  lines. `[MM]`

### Compression and Retention

* The best-practices workflow compresses the previous seven days of daily logs
  into each agent's baseline, keeps the result under 200 lines, and archives the
  processed logs. `[BP]`
* The best-practices overview describes raw logs as active for 7 to 14 days
  before compression or archival. `[BP]`
* A dedicated memory-maintenance agent performs compression so domain agents do
  not spend execution cycles on housekeeping. `[BP]`
* Information omitted during compression is implicitly forgotten. The weekly
  compression cycle acts as the retention half-life. `[BP]`
* A shorter compression interval or line budget produces more aggressive
  forgetting without a scoring system. `[BP]`
* The memory article recommends weekly review of logs older than 30 days, monthly
  verification of evergreen notes, and quarterly directory health audits.
  `[MM]`
* The article marks daily logs aged 30 to 60 days as informational review items,
  logs older than 60 days as warnings and archive candidates, and evergreen
  files untouched for 90 days as verification candidates. `[MM]`

### Retrieval Profile Described by the Memory Article

* Search combines vector similarity at weight 0.7 and text matching at weight
  0.3, then applies temporal decay. `[MM]`
* Temporal decay uses a default 30-day half-life. `[MM]`
* MMR deduplication uses lambda 0.7 to balance relevance and result diversity.
  `[MM]`
* The search cache holds up to 256 entries. `[MM]`

The reported formula is:

```text
score = (0.7 * vector_similarity + 0.3 * text_match) * temporal_decay
```

### Source Tension Requiring a Product Decision

* The best-practices page explicitly says ClawPort uses weekly compression
  instead of explicit decay and avoids vector database infrastructure. `[BP]`
* The memory article says the described architecture is implemented by ClawPort
  and specifies vector and text scoring, temporal decay, MMR, and caching. `[MM]`

These are incompatible as a single mandatory MVP algorithm. They can be
reconciled as two product profiles: a simple file and compression profile, and
an advanced retrieval profile. team-hunktronics should ship the simple profile
first and gate the advanced profile behind demonstrated retrieval need. `[INF]`

## Directly Supported Safety Requirements

* Canonicalize and validate every memory path before I/O, rejecting targets
  outside the designated memory root. `[MM]`
* Snapshot memory state in Git before writes so corrupted content can be
  restored. `[MM]`
* Write to a temporary file in the target directory and atomically rename it to
  prevent partial content. `[MM]`
* Detect optimistic concurrency conflicts by checking whether a target changed
  after the writer last read it. Do not silently overwrite. `[MM]`
* Tool access should use least privilege, with elevated capabilities restricted
  by agent tier and job. `[BP]`
* Scheduled failures should remain isolated, and stale downstream input should
  be visible rather than triggering a cascade. `[BP]`

## Directly Supported Memory Health and Observability

The article defines a score starting at 100, with 20 points deducted per
critical finding, 10 per warning, and 3 per informational finding. `[MM]`

The ten reported checks are:

1. Missing baseline memory, critical.
2. Baseline line count from 150 to 200, warning; above 200, critical.
3. Baseline file size from 50 to 100 KB, warning; above 100 KB, critical.
4. Any individual file from 50 to 100 KB, warning; above 100 KB, critical.
5. Total memory directory from 500 KB to 1 MB, warning; above 1 MB, critical.
6. Daily logs aged 30 to 60 days, informational; above 60 days, warning.
7. Evergreen files untouched for 90 days, informational.
8. Excessive file count, warning, with no numeric threshold stated.
9. Substantially duplicate content, warning, with no similarity threshold stated.
10. Baseline links to missing files, informational.

Healthy projects reportedly score 80 to 95. Scores below 70 need structural
attention, and scores below 50 indicate an unmaintained memory system. `[MM]`

## Current App Fit and Gaps

### Existing Foundations

* `AgentConfig` already stores name, title, role, connection, model, inline soul,
  tools, ordered skills, autonomy, and delegation targets. `[APP]`
* The UI can create orchestrators and workers, edit character text, assign tools
  and skills, choose autonomy, and select workers for an orchestrator. `[APP]`
* API traces persist provider, model, full requests and responses, chunk count,
  status, timestamps, and optional agent identity. `[APP]`
* Conversations, agents, traces, connections, and settings persist as JSON and
  are available through a read-only local data explorer. Vault contents are
  excluded. `[APP]`

### Material Gaps

* The model has two roles rather than orchestrator, team lead, and specialist.
  It has no parent relationship, root invariant, depth validation, or complete
  team graph. `[APP]`
* The renderer says tool execution wiring is forthcoming. Selected tools,
  ordered skills, autonomy, and delegation are not enforced in the Electron
  main process. `[APP]`
* Agent testing sends one provider request containing only the inline soul and
  transient component messages. It does not create child runs, briefs, output
  artifacts, memory reads, or team synthesis. `[APP]`
* Agent test messages disappear when the user changes agents or restarts the
  app. `[APP]`
* JSON writes use direct `writeFile` calls with no atomic rename, conflict token,
  per-file serialization, snapshot, or recovery history. `[APP]`
* JSON reads return an empty fallback for any read or parse failure, which can
  mask corruption as a valid empty data set. `[APP]`
* Agent save and conversation save IPC handlers accept renderer payloads without
  the validation applied to connection payloads. `[APP]`
* Traces store full prompts and responses without redaction or retention policy.
  Future memory injection would therefore duplicate potentially sensitive
  memory into trace storage. `[APP]` `[INF]`
* The data explorer has no run, handoff, artifact, schedule, memory document,
  memory health, approval, or tool-action collection. `[APP]`

## Product Requirements

### Team Graph

* `TEAM-001`: The system shall support `orchestrator`, `team-lead`, and
  `specialist` roles. `[BP]`
* `TEAM-002`: An active team shall have exactly one root orchestrator. `[BP]`
* `TEAM-003`: Every non-root active agent shall reference exactly one active
  manager, and graph depth shall not exceed three. `[BP]`
* `TEAM-004`: Specialists shall have no direct reports or spawn permission.
  `[BP]`
* `TEAM-005`: Team leads shall own explicit pipeline definitions and be
  accountable for pipeline completion. `[BP]`
* `TEAM-006`: The editor shall block cycles, missing managers, multiple roots,
  depth violations, and inconsistent relationships before save. `[INF]`
* `TEAM-007`: The root shall receive a non-blocking warning after eight direct
  reports and a strong warning after ten. `[BP]` `[INF]`
* `TEAM-008`: One canonical `reportsTo` edge shall be stored; direct reports
  shall be derived to prevent bidirectional drift. `[INF]`

### Agent Policy and Character

* `AGENT-001`: Agent character content shall provide structured sections for
  identity, expertise, operating rules, relationships, memory, and output
  contract. `[BP]`
* `AGENT-002`: Character content above 500 lines shall produce a warning and
  offer reference-document extraction. `[BP]` `[INF]`
* `AGENT-003`: Tool grants shall be enforced by the main-process execution
  broker. Renderer metadata alone shall not authorize actions. `[INF]`
* `AGENT-004`: High-risk tools shall be denied to specialists by default and
  require an explicit policy override with rationale. `[BP]` `[INF]`
* `AGENT-005`: Side effects shall pass through the existing draft, assist, and
  autonomous approval policy before execution. `[APP]` `[INF]`
* `AGENT-006`: Every denial, approval request, approval decision, and action
  result shall be recorded against the run. `[INF]`

### Durable Runs and Handoffs

* `RUN-001`: Every manual, delegated, or scheduled invocation shall create a
  durable run before model execution. `[INF]`
* `RUN-002`: An orchestrator or lead delegation shall create a child run and a
  versioned brief artifact containing task, constraints, expected output, input
  references, and due or timeout metadata. `[BP]` `[INF]`
* `RUN-003`: Specialist output shall be a versioned artifact linked to the child
  run and readable by its manager. `[BP]` `[INF]`
* `RUN-004`: Parent runs shall remain resumable after process restart and shall
  synthesize only completed child outputs unless the operator chooses partial
  synthesis. `[INF]`
* `RUN-005`: Urgent messages shall carry signals and artifact references, not be
  the sole storage location for substantive output. `[BP]` `[INF]`
* `RUN-006`: Cancellation shall propagate only to active descendants owned by
  the cancelled run and shall not delete completed artifacts. `[INF]`

### Memory Storage and Loading

* `MEM-001`: Each agent shall have baseline memory, evergreen topic notes, daily
  logs, outputs, and an archive under a designated local workspace root. `[BP]`
  `[MM]`
* `MEM-002`: The team shall have a shared memory area with ownership and write
  permissions assigned to leads and the orchestrator. `[BP]`
* `MEM-003`: Baseline memory shall be loaded for each agent run and limited to
  200 lines. A warning shall begin at 150 lines. `[MM]`
* `MEM-004`: Detailed files shall be loaded only through explicit references or
  task-scoped search, and the run shall record which documents were injected.
  `[MM]` `[INF]`
* `MEM-005`: Each completed run shall append a timestamped daily-log entry with
  the task, decisions, outputs, errors, and provenance references. `[BP]`
  `[INF]`
* `MEM-006`: Secrets and raw provider credentials shall never be written to
  memory, artifacts, or traces. `[INF]`
* `MEM-007`: Memory injected into a provider request shall pass through the same
  redaction policy as persisted traces. `[INF]`

### Memory Maintenance

* `MAINT-001`: A dedicated maintenance workflow shall read recent logs and the
  current baseline, extract durable facts and decisions, keep the new baseline
  within 200 lines, and archive processed logs. `[BP]`
* `MAINT-002`: Compression shall produce a reviewable change set and provenance
  links before an autonomous write is allowed. `[INF]`
* `MAINT-003`: Contradictions shall be surfaced during compression. Newest-wins
  may be offered as a default, but the previous claim shall remain recoverable.
  `[BP]` `[INF]`
* `MAINT-004`: The default active-log window shall be 14 days, compression shall
  run weekly, and archival shall preserve older logs outside normal context
  loading. `[BP]` `[INF]`
* `MAINT-005`: Monthly evergreen review and quarterly full health audit shall be
  available as maintenance schedules. `[MM]`
* `MAINT-006`: The MVP shall use compression and line budgets as forgetting.
  Advanced temporal ranking shall be separately configurable. `[BP]` `[INF]`

### Search and Advanced Retrieval

* `SEARCH-001`: MVP search shall support filename, exact text, scope, agent,
  memory class, and date filters without requiring embeddings. `[INF]`
* `SEARCH-002`: An optional advanced profile may implement 0.7 vector and 0.3
  text weighting, 30-day half-life, MMR lambda 0.7, and a 256-entry cache. `[MM]`
* `SEARCH-003`: Search results shall show source path, class, owner, age, score
  components, and the excerpt injected into the run. `[INF]`
* `SEARCH-004`: Advanced retrieval shall not ship as the default until an
  evaluation shows better task outcomes than lexical search and compression at
  acceptable latency and storage cost. `[INF]`

### Safe Writes and Recovery

* `SAFE-001`: All writable paths shall be canonicalized and checked against the
  configured workspace root before I/O. `[MM]`
* `SAFE-002`: All JSON, memory, and artifact replacement writes shall use a
  same-directory temporary file, flush where supported, and atomic rename.
  `[MM]` `[INF]`
* `SAFE-003`: A write shall include the last-read content hash or version. A
  mismatch shall return a conflict and preserve both versions. `[MM]` `[INF]`
* `SAFE-004`: A recoverable snapshot shall precede memory mutation. Git may be
  used only when the managed workspace is an isolated repository and does not
  create commits in the user's application repository without consent. `[MM]`
  `[INF]`
* `SAFE-005`: Parse failures shall be reported as corruption, not converted to
  an empty collection. Recovery shall use the latest valid snapshot. `[INF]`
* `SAFE-006`: Main-process IPC shall validate all agent, run, schedule, memory,
  approval, and artifact payloads. `[INF]`

### Scheduling and Failure Isolation

* `SCHED-001`: A schedule shall target one agent and one focused job with one
  output contract. `[BP]`
* `SCHED-002`: Dependencies and offsets shall allow upstream jobs to complete
  before downstream jobs start. `[BP]` `[INF]`
* `SCHED-003`: A failed job shall not automatically fail unrelated jobs or erase
  the last successful output. `[BP]`
* `SCHED-004`: Downstream runs may use stale input only when the artifact is
  visibly labeled with age and last-successful-run metadata. `[BP]` `[INF]`
* `SCHED-005`: Retries shall be bounded, idempotency-aware, and disabled by
  default for non-idempotent side effects. `[INF]`

### Observability and Operations

* `OBS-001`: The system shall expose a run timeline spanning model calls, memory
  reads, handoffs, tool actions, approvals, artifact writes, retries, and final
  status. `[INF]`
* `OBS-002`: Every trace shall include `runId`, optional `parentRunId`, agent,
  trigger, provider, model, timing, status, and referenced artifacts. `[INF]`
* `OBS-003`: Memory health shall implement the ten page-defined checks and
  deductions. File-count and duplicate thresholds shall be configurable because
  the source does not define numeric values. `[MM]` `[INF]`
* `OBS-004`: The dashboard shall display health score history, current findings,
  last compression, next maintenance run, conflicts, and failed writes. `[MM]`
  `[INF]`
* `OBS-005`: Traces shall support retention, scoped clearing, export, and
  redaction. Clearing one agent's traces shall not clear unrelated traces.
  `[INF]`
* `OBS-006`: Context assembly shall report baseline lines, selected memory files,
  estimated tokens, omitted content, and truncation warnings. `[MM]` `[INF]`

## Proposed Data Model

### Agent

Extend the current `AgentConfig` with:

* `slug`: unique lowercase human-readable identifier
* `role`: `orchestrator | team-lead | specialist`
* `reportsTo`: nullable agent identifier
* `status`: `active | archived`
* `characterPath`: relative path to character content
* `memoryRoot`: relative agent memory directory
* `toolGrants`: capability identifiers plus optional constraints
* `policyOverrides`: elevated grants with rationale and timestamp

Keep one canonical `reportsTo` relation and derive direct reports. `[INF]`

### Pipeline

* `id`, `ownerAgentId`, `name`, `version`
* Ordered stage definitions with `agentId`, input contract, output contract,
  timeout, and failure policy
* `createdAt`, `updatedAt`, `archivedAt`

### Run

* `id`, `pipelineRunId`, `parentRunId`, `agentId`, `pipelineId`, `stageId`
* `trigger`: `manual | delegated | scheduled | maintenance`
* `status`: `queued | running | blocked | succeeded | failed | cancelled`
* `inputArtifactIds`, `outputArtifactIds`, `memoryDocumentIds`
* `approvalIds`, `attempt`, `errorCode`, `errorMessage`
* `queuedAt`, `startedAt`, `finishedAt`

### Artifact

* `id`, `runId`, `ownerAgentId`, `kind`
* `relativePath`, `contentHash`, `version`, `mediaType`
* `createdAt`, `updatedAt`, `supersedesArtifactId`
* `provenanceRunIds`, `staleAfter`, `lastSuccessfulRunId`

### MemoryDocument

* `id`, `scope`: `agent | team`
* `ownerAgentId`, `kind`: `baseline | evergreen | daily | archive`
* `relativePath`, `contentHash`, `version`, `lineCount`, `byteSize`
* `createdAt`, `updatedAt`, `lastReviewedAt`, `archivedAt`
* `sourceRunIds`, `supersedesDocumentId`

### Schedule

* `id`, `agentId`, optional `pipelineId`, `name`, `cron`, `timeZone`
* `dependencyScheduleIds`, `offsetMinutes`, `enabled`
* `failurePolicy`, `maxAttempts`, `nextRunAt`, `lastRunId`

### Approval and Tool Action

* Approval: `id`, `runId`, `actionId`, `requiredByPolicy`, `status`, actor, and
  decision timestamps
* Tool action: `id`, `runId`, `toolId`, sanitized arguments, side-effect class,
  status, timing, approval ID, and sanitized result

### Memory Health Snapshot

* `id`, `scope`, `score`, `findings`, `measuredAt`
* Each finding stores check ID, severity, deduction, target path, observed value,
  threshold, and remediation state

## Core Workflows

### Configure a Team

1. Create the root, lead, and specialist agents.
2. Assign one canonical manager to every non-root agent.
3. Validate root count, cycles, depth, leaf constraints, and tool grants in the
   main process.
4. Save the graph atomically or reject it as one transaction.
5. Render a derived organization map and policy warnings.

### Execute a Delegated Goal

1. Persist the root run before calling a provider.
2. Load the root character and baseline memory, recording provenance.
3. Produce a structured plan constrained to allowed direct reports.
4. Persist a brief artifact and child run for each delegation.
5. Let each child load its own baseline and referenced team files.
6. Persist child output artifacts and daily-log entries.
7. Resume the parent, collect completed outputs, record gaps, and synthesize.
8. Route every side effect through tool grants and autonomy approval.
9. Finalize run status and retain all completed artifacts after cancellation or
   partial failure.

### Maintain Memory

1. Acquire a scoped maintenance lock.
2. Read the current baseline and unprocessed recent daily logs.
3. Extract durable facts, decisions, preferences, and unresolved blockers.
4. Detect contradictions and duplicate candidates.
5. Generate a proposed baseline under 200 lines with source provenance.
6. Snapshot, conflict-check, and atomically replace the baseline.
7. Archive only the logs included in the successful compression.
8. Recompute health and emit a maintenance run trace.

### Run a Schedule

1. Resolve dependencies and check the freshness of required artifacts.
2. Create a run with a deterministic occurrence key for idempotency.
3. Execute one focused job and persist one declared output.
4. On failure, preserve the last good artifact, label it stale, and isolate the
   failure.
5. Trigger downstream jobs only according to their declared stale-input policy.

## Failure Modes and Required Responses

* Session amnesia: baseline memory and durable runs restore decisions and active
  context. `[MM]` `[INF]`
* Context pollution: only baseline memory is always loaded; topic notes are
  retrieved selectively with a visible token budget. `[MM]` `[INF]`
* Hierarchy drift or cycles: transactional graph validation rejects invalid
  saves. `[BP]` `[INF]`
* Capability escalation: main-process grants deny unassigned tools regardless
  of prompt output. `[BP]` `[INF]`
* Partial or corrupt write: atomic replacement and snapshot recovery retain the
  previous valid version. `[MM]`
* Concurrent overwrite: a version mismatch creates a conflict instead of
  replacing newer content. `[MM]`
* Path traversal: canonical root containment rejects the operation before I/O.
  `[MM]`
* Memory poisoning: provenance, reviewable compression, snapshots, and approval
  policy limit durable propagation. `[MM]` `[INF]`
* Stale shared context: age labels and last-success metadata permit explicit,
  non-cascading degraded operation. `[BP]` `[INF]`
* Schedule cascade: failure isolation preserves unrelated jobs and previous
  outputs. `[BP]`
* Run interruption: persisted parent and child states allow restart and resume.
  `[INF]`
* Sensitive trace leakage: redaction and retention prevent injected memory and
  secrets from becoming indefinite full-text traces. `[INF]`
* Retrieval monoculture: MMR diversifies advanced search results. `[MM]`
* Silent baseline truncation: line-count checks block or warn before context
  assembly. `[MM]`
* False empty state after parse failure: corruption is explicit and recoverable,
  not converted to an empty array. `[APP]` `[INF]`

## Acceptance Criteria

### Team and Policy

* Saving a graph with zero roots, two roots, a cycle, a missing manager, or depth
  greater than three fails with a specific validation message.
* A specialist cannot have reports or spawn a child session.
* A tool call absent from the agent's grant set is rejected in the main process
  and appears as a denied action in the run timeline.
* Draft mode never performs a side effect. Assist mode requires an approval
  record. Autonomous mode executes only granted actions.

### Runs and Handoffs

* A delegated request produces one persisted parent run, at least one child run,
  a brief artifact, a child output artifact, and a synthesis linked by IDs.
* Restarting the Electron app during a blocked or running workflow exposes the
  interrupted state and allows retry, resume, or cancel without losing completed
  artifacts.
* A child failure is visible to the parent and does not delete successful sibling
  outputs.

### Memory

* Every run loads no more than 200 baseline lines and records every additional
  memory document injected into the provider request.
* Baseline memory at 150 lines raises a warning; content above 200 lines raises a
  critical health finding and is never silently omitted.
* A successful run creates a timestamped daily-log record with provenance.
* Weekly compression archives only processed logs, creates a baseline under 200
  lines, and allows restoration of the prior baseline.
* Logs and evergreen files receive the page-defined staleness findings at 30,
  60, and 90 days.

### Safe Writes

* Traversal and symlink escape tests cannot write outside the managed root.
* A forced process termination during replacement leaves either the old complete
  file or the new complete file, never partial JSON or Markdown.
* Two writers using the same prior version cause one success and one conflict.
* Malformed persisted JSON produces a corruption state and recovery option, not
  an empty collection.

### Observability

* Operators can trace a final answer to parent and child runs, model calls,
  memory inputs, briefs, outputs, tool actions, approvals, and errors.
* Health scoring uses the stated deductions and displays the observed value and
  threshold for each finding.
* Clearing traces can be scoped to one agent or run and does not remove other
  agents' records.
* Sensitive fields are redacted before persistence and export.

### Scheduling

* A dependency schedule does not start before its upstream success or declared
  stale-input fallback decision.
* Reprocessing the same schedule occurrence does not duplicate an idempotent
  output.
* A failed schedule preserves and visibly ages the previous successful artifact.

## Recommended Delivery Sequence

### Phase 1: Trustworthy Local Foundation

* Add three-tier graph types and main-process invariant validation.
* Replace direct JSON writes with atomic, serialized, version-aware persistence.
* Stop converting parse errors into empty collections.
* Add run, artifact, approval, and tool-action records.
* Add trace redaction and scoped retention controls.

### Phase 2: Real Delegation

* Implement durable parent and child execution.
* Enforce tool grants and autonomy in a main-process broker.
* Add file-backed briefs and output artifacts.
* Add resumable timelines and partial-failure synthesis.

### Phase 3: Managed Memory

* Add baseline, evergreen, daily, archive, and team-memory storage.
* Add context assembly with a 200-line baseline budget and provenance.
* Add weekly compression, snapshots, conflicts, archival, and ten-check health
  scoring.

### Phase 4: Scheduled Operations

* Add focused schedules, dependencies, staggering, stale-input policy,
  idempotency, and failure isolation.

### Phase 5: Evaluated Advanced Retrieval

* Establish retrieval and task-quality benchmarks.
* Compare lexical search and compression with the article's vector, text,
  temporal, and MMR profile.
* Ship semantic retrieval only when the evaluation demonstrates net benefit.

## Recommended Next Research Not Completed

* [ ] Inspect the ClawPort source repository to verify whether the deployed
  implementation uses compression-only memory, hybrid retrieval, or both.
* [ ] Define a threat model for local files, prompt injection, MCP tools, and
  side-effect approval bypass.
* [ ] Benchmark the current provider adapters for token accounting, structured
  output reliability, and resumable multi-run orchestration.
* [ ] Evaluate SQLite versus atomic JSON plus files for run metadata and
  concurrent workflow state.
* [ ] Test Electron lifecycle behavior for scheduled jobs while the app is
  closed, sleeping, or restarting after an update.
* [ ] Specify quantitative thresholds for excessive memory file count and
  duplicate-content detection because the source article leaves them undefined.

## Clarifying Questions

No question blocks the requirements. The following product decisions remain for
implementation planning:

* Should the managed agent workspace live only under Electron `userData`, or may
  a user opt into a project-local workspace?
* Should schedules run only while the desktop app is open, or through a separate
  background service?
* May autonomous agents mutate shared team memory directly, or must shared-memory
  changes always pass through lead or operator approval?
* Is advanced semantic retrieval an intended product differentiator, or should
  team-hunktronics remain dependency-light and file-first?