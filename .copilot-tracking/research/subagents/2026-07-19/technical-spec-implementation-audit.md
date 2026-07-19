---
title: Technical Specification Implementation Audit
description: Evidence-backed audit of the current implementation against docs/technical-spec.html
ms.date: 2026-07-19
ms.topic: reference
---

## Research scope

Audit the current team-hunktronics implementation against `docs/technical-spec.html`.
Identify stale or missing architecture, data model, IPC, security, persistence,
testing, and feature documentation. Return precise HTML section IDs or text
anchors with concise replacement or addition recommendations.

## Questions

* Which technical-spec claims no longer match the implementation?
* Which implemented contracts and features are absent from the specification?
* Which section IDs or text anchors should receive each correction?
* Which planning statements must move to `.copilot-tracking` because that is the
  authoritative planning location?

## Findings

The specification is a 2026-07-09 MVP snapshot. The current implementation has
expanded into an agent command center, but the document still describes a
six-provider, direct-chat application with four persistence files and no tests.
The highest-risk stale statements concern persistence recovery, blanket IPC
validation, the primary run flow, tool execution, and the absence of tests.

### Document control and scope

1. `#doc-control`, anchors `Version 0.1.0 (MVP)`, `Date 2026-07-09`, and
   `Initial specification derived from the MVP codebase`
   * Add a 2026-07-19 document revision entry and describe the agent-team,
     memory, task, pipeline, scheduling, policy, operations, and data-explorer
     implementation. Keep document revision separate from the package version.
   * Change the provider statistic from six to seven.
2. Hero subtitle and `#intro`, anchors `A cross-platform Electron desktop
   application for chatting` and `Provide a single, secure desktop client`
   * Replace the chat-only description with a macOS-targeted local agent command
     center that also supports direct multi-provider chat. Do not imply shipped
     Windows or Linux packages; only macOS packaging is configured.
3. `#scope`, anchor `In scope`
   * Add LM Studio, agent hierarchy and configuration, trusted persisted runs,
     managed memory, tasks, pipelines, schedules, policy approvals, API traces,
     and the read-only local data explorer.

### Architecture

1. `#overview`, architecture diagram anchors `React 18 UI`, `Zustand stores`,
   `IPC handlers`, and `Store`
   * Replace the two-store and chat-modal diagram with the current pages and
     three Zustand stores: `useAppStore`, `useChatStore`, and `useAgentStore`.
   * Add `RunService`, `assembleContext`, `MemoryService`, `ScheduleService`,
     `PipelineService`, `ToolPolicyBroker`, API tracing, and the expanded JSON
     store to the main-process row.
2. `#stack`, anchor `2.1 Technology Stack`
   * Add React Flow `@xyflow/react` 12.11.x, Dagre `@dagrejs/dagre` 3.x,
     `cron-parser` 5.6.x, Vitest 2.1.x, and V8 coverage.
3. `#architecture`, anchor `3.1 Process responsibilities`
   * Replace the nine preload namespaces with the current namespaces: `vault`,
     `connections`, `secrets`, `models`, `chat`, `runs`, `traces`,
     `conversations`, `agents`, `memory`, `tasks`, `schedules`, `pipelines`,
     `toolPolicy`, `localData`, `settings`, `github`, and `shell`.
   * Describe main-process ownership of context assembly, conversation writes,
     run state transitions, scheduled dispatch, pipeline continuation, memory
     daily logs, trace persistence, and policy decisions.
4. `#architecture`, anchor `3.2 Streaming chat flow`
   * Replace this as the primary flow with a trusted-run sequence:
     `runs:start` validates identifiers and input, `RunService` loads the stored
     conversation and optional agent, resolves the model, loads team/agent
     baseline memory, assembles bounded context, persists user and assistant
     draft messages, streams `runs:event`, then persists terminal output.
   * Document context defaults of a 32,768-token window and 4,096-token
     completion reserve, required identity/memory/current input, and newest-first
     history retention. Required context fails closed when it exceeds budget.
   * Retain `chat:*` as a lower-level one-shot flow used by AI-assisted
     `soul.md` generation. It does not provide the trusted run lifecycle.
5. Add an architecture subsection after `3.2 Streaming chat flow` for service
   boundaries.
   * Runs and idempotency state are process-local; conversations, traces, task
     links, schedules, pipeline executions, and artifacts are durable.
   * Schedules run only while the desktop app is open, poll every 30 seconds,
     and have no background daemon. `maxAttempts` is persisted but no retry loop
     currently consumes it.
   * Pipelines run one to eight direct-report stages sequentially and preserve
     prior artifacts after later failure.
   * Tool policy records authorization and approval decisions only. It does not
     execute tools, MCP calls, or skill chains. Stored skill IDs are metadata.
     Automatic orchestrator delegation is also not implemented.

### Data model

1. `#datamodel`, `ConnectionConfig` anchor `One of the 6 allow-listed provider
   types`
   * Change six to seven and add `lm-studio` to `ProviderType`.
2. `#datamodel`, anchor `AppSettings`
   * Add `humanIdentity: string`, which is trimmed to 20,000 characters at the
     settings IPC boundary and injected into trusted run context.
3. Add model groups after the `AppSettings` table.
   * Trusted execution: `StartRunCommand`, `RunView`, `RunEvent`, and
     `RunStatus`.
   * Team model: `AgentConfig`, `AgentRole`, and `AgentAutonomy`. Document
     canonical `reportsTo`, derived `delegatesTo`, exactly one active
     orchestrator for a non-empty team, maximum depth three, no cycles, no
     specialist managers, and no specialist `code` grant.
   * Managed work: `AgentTask`, `AgentSchedule`, `AgentPipeline`,
     `PipelineStage`, `PipelineExecution`, and `RunArtifact`.
   * Memory: `MemoryDocument`, write/revision commands, search results, health
     findings, and compression proposals.
   * Policy and operations: `ToolAction`, `Approval`, `ApiTrace`,
     `LocalDataQuery`, and `LocalDataResult`.
4. Add relationship notes beside the new tables.
   * A task may own a conversation and current run; a completed task run moves
     to Review.
   * A schedule owns a reusable conversation and terminal status.
   * Pipeline executions reference versioned brief/output artifacts; a
     completed pipeline ends in Review rather than Done.
   * `RunView` itself is not persisted. `ApiTrace` is the durable provider-call
     diagnostic record.

### IPC contract

1. `#ipc`, anchor `All renderer ↔ main communication uses the channels below`
   * Replace the table with all constants from `src/shared/ipc.ts` or group the
     exhaustive contract by namespace while retaining each exact channel.
2. Add the missing run and trace channels.
   * `runs:start`, `runs:cancel`, `runs:event`
   * `traces:list`, `traces:clear`, `traces:clearScope`, `traces:update`
3. Add the missing agent, memory, and work channels.
   * `agents:list`, `agents:save`, `agents:delete`
   * `memory:list`, `memory:write`, `memory:search`, `memory:health`,
     `memory:compressPropose`, `memory:compressApply`
   * `tasks:list`, `tasks:save`, `tasks:delete`, `tasks:start`
4. Add the missing automation and policy channels.
   * `schedules:list`, `schedules:save`, `schedules:delete`,
     `schedules:runNow`
   * `pipelines:list`, `pipelines:save`, `pipelines:delete`, `pipelines:start`,
     `pipelineExecutions:list`, `artifacts:list`
   * `toolActions:list`, `toolActions:authorize`, `approvals:list`,
     `approvals:decide`
   * `localData:query`
5. Add a runtime-validation note after the IPC table.
   * Compile-time shared types do not guarantee runtime consistency. Main
     validates run, agent, task, schedule, pipeline, provider, and selected
     settings fields. Conversation saves, generic `chat:send`, tool-policy
     requests, and most settings fields do not have complete runtime schema
     validation.

### Persistence and reliability

1. `#architecture`, anchor `3.3 Persistence layout`
   * Replace the four-file table with `vault.json`, `connections.json`,
     `conversations.json`, `agents.json`, `tasks.json`, `schedules.json`,
     `pipelines.json`, `pipeline-executions.json`, `artifacts.json`,
     `tool-actions.json`, `approvals.json`, `traces.json`, and `settings.json`.
   * Add the managed Markdown tree under `userData/memory`: team and agent
     `MEMORY.md`, evergreen files, dated daily logs, archives, and `.history`
     snapshots.
2. `#nonfunctional`, anchor `NFR-REL-02`
   * Replace `Missing or corrupt persistence files fall back to safe defaults`.
     Missing JSON files use defaults. Non-secret store writes are serialized per
     file, written to a mode-0600 temporary file, file-synced, atomically
     renamed, and preceded by a valid `.bak` snapshot. A malformed primary
     recovers from `.bak`; if both are invalid, the read raises an explicit
     corruption error.
   * Document the vault separately: it is cached and mode 0600, but currently
     uses a direct write and treats any read/parse failure as an empty vault.
3. Add memory persistence rules under `3.3 Persistence layout`.
   * Managed names and paths are confined to the memory root; documents are at
     most 100 KB; baselines are at most 200 lines; writes support optimistic
     revision checks and prior-version history. Compression requires review and
     archives accepted daily logs.
4. Add trace persistence under `3.3 Persistence layout` and `8.6 Privacy &
   Observability`.
   * Traces persist request counts and flags, status, errors, and at most 2,000
     characters of response preview. They do not persist raw prompts or injected
     memory, but response previews can contain model-generated content.

### Security and privacy

1. `#security`, anchor `SEC-06`
   * Narrow the statement to the runtime checks actually present. Provider type
     is allow-listed and connection labels are required/bounded, but connection
     base URLs are trimmed rather than scheme-allow-listed, and not every IPC
     payload is runtime schema-validated.
2. `#security`, anchor `OWASP alignment`
   * Remove the blanket claim `IPC input is validated (injection)`. Replace it
     with a channel-specific summary and identify runtime schema validation as a
     tracked gap rather than an implemented control.
3. Add security requirements for implemented controls.
   * Main-owned trusted-run context assembly and bounded required context.
   * Managed-memory path confinement, safe Markdown names, size limits, and
     optimistic writes.
   * Team-graph invariants and specialist code-grant denial.
   * Tool-grant enforcement, 15-minute draft/assist approvals, and persisted
     argument sanitization. Sensitive values are redacted by key name and the
     original argument object is represented only by a SHA-256 digest.
   * The read-only local data explorer uses an explicit collection allow-list
     and excludes the encrypted vault. Memory is exposed only through its
     dedicated managed API, not `localData:query`.
4. `#nonfunctional`, anchor `NFR-PRV-01`
   * Replace `all data stays in the user-data directory` with: application state
     is local and there is no telemetry or app-managed cloud sync; prompts and
     responses transit the selected provider, and bounded response previews are
     persisted locally for operations diagnostics.
5. `#nonfunctional`, anchor `NFR-OBS-01`
   * Add the persisted trace lifecycle, live `traces:update` events, operations
     filtering, global/scoped clearing, task failures, and memory health. State
     explicitly that raw request text is excluded from traces.

### Features and current boundaries

1. `#functional`, insert after anchor `5.8 GitHub Device-Flow Authentication`
   * Add subsections for agent team management, trusted runs/context assembly,
     managed memory, durable tasks, sequential pipelines, app-open schedules,
     tool policy/approvals, operations traces, and the read-only local data
     explorer.
   * Document the actual renderer pages: Dashboard, Agents, Tasks/Pipelines,
     Chat, Memory, Operations/Schedules/Policy, Local Data, and Settings.
2. Agent-team addition
   * Describe React Flow/Dagre visualization, create/edit/archive behavior,
     persisted persona (`soul`), model binding, hierarchy, autonomy, grants, and
     direct agent conversations. Do not claim autonomous delegation or executed
     skills/tools.
3. Managed-memory addition
   * Describe team/agent baselines, evergreen and daily files, lexical search,
     health checks, run-completion daily logs, reviewable compression, and
     archive-on-accept.
4. Tasks, pipelines, and schedules additions
   * Tasks are durable board records and dispatch trusted runs; success routes
     to Review. Pipelines preserve versioned briefs and outputs and stop on
     failure. Schedules use cron plus timezone, deterministic occurrence keys,
     run-now, and terminal status, but only while the app is running.
5. Policy and operations addition
   * Policy authorizes or denies requests and records approvals; no tool
     transport executes approved actions. Operations displays persisted provider
     traces, task attention, and memory health. Local Data provides bounded,
     searchable, read-only JSON collection queries.
6. `#providers`, provider matrix
   * Add LM Studio: no key, default local OpenAI-compatible URL
     `http://127.0.0.1:1234/v1`, no device flow, stable implementation.
7. `#outofscope`, anchor `Plugins/tools/function-calling`
   * Replace with `actual tool/MCP transport and function execution`. Policy,
     grants, approval records, and their UI are implemented; execution is not.

### Testing, build, and traceability

1. `#build`, anchor `Scripts`
   * Add `npm test`, `npm run test:watch`, `npm run test:coverage`, and the manual
     `npm run test:chat` harness. Describe Vitest's Node environment and V8
     coverage scope (`src/main/**/*.ts`, excluding the entry point and tests).
2. `#outofscope`, anchor `Automated unit/integration test suite (currently
   none)`
   * Delete this false statement. On 2026-07-19, `npm test` passes 13 files and
     110 tests covering context assembly, IPC, memory, pipelines, trusted runs,
     schedules, store recovery, team validation, tool policy, vault, device
     flow, providers, and stream parsing.
   * Add an honest testing boundary: there are no renderer component tests,
     Electron end-to-end tests, or packaged-installer tests in the current
     Vitest configuration.
3. `#traceability`, traceability table
   * Add mappings for `runService.ts`/`contextAssembler.ts`, `teamGraph.ts`,
     `memoryService.ts`, `scheduleService.ts`, `pipelineService.ts`,
     `toolPolicy.ts`, Store tracing/local-data methods, their renderer pages,
     and all co-located `*.test.ts` suites.
   * Update `FR-CHAT-*` to show `runs:*` plus `useChatStore` and `AgentRunner` as
     the primary persisted flow. Keep provider `chat:*` mapping for the
     one-shot agent-persona helper.

### Planning authority

1. `#outofscope`, anchor `Candidate future requirements`
   * Remove backlog-style candidate requirements from the specification. Replace
     them with factual current limitations and a statement that authoritative
     planning, status, and prioritization live under `.copilot-tracking`.
2. `#build`, anchor `Deployment gap`
   * Replace the action item with the current fact that packages are unsigned
     and unnotarized. Track signing, entitlements, notarization, and release work
     only in `.copilot-tracking`.
3. `#doc-control` or footer, anchor `source of record`
   * Clarify that source and tests define implemented behavior, this document is
     the implementation contract, and `.copilot-tracking` is the sole planning
     authority. The technical specification must not become a second backlog.

## Evidence

* docs/technical-spec.html is versioned 0.1.0 and dated 2026-07-09. Its sections
  describe six providers, four persisted files, the direct `chat:*` flow, and no
  automated tests.
* src/shared/types.ts defines seven providers and the run, memory, task,
  schedule, pipeline, artifact, policy, trace, local-data, and agent-team models.
* src/shared/ipc.ts and src/preload/index.ts expose the expanded channel and
  namespace contract.
* src/main/ipc.ts owns runtime validation, trusted run wiring, trace collection,
  tasks, memory, policy, local-data queries, and the legacy direct-chat path.
* src/main/runService.ts and src/main/contextAssembler.ts own persisted trusted
  runs and bounded context assembly.
* src/main/store.ts implements the expanded JSON layout, serialized atomic
  writes, valid backups, explicit corruption errors, traces, and local-data
  queries.
* src/main/memoryService.ts owns confined Markdown memory, revision checks,
  history, health, search, daily logs, compression proposals, and archives.
* src/main/teamGraph.ts, src/main/scheduleService.ts,
  src/main/pipelineService.ts, and src/main/toolPolicy.ts define the implemented
  hierarchy, automation, and authorization boundaries.
* src/renderer/src/App.tsx exposes eight application pages. Renderer call sites
  confirm that regular chat and agent conversations use `runs:*`, while
  CreateAgentModal uses `chat:*` for one-shot persona generation.
* package.json and vitest.config.ts define Vitest, V8 coverage, and the current
  test commands. `npm test` passed 13 files and 110 tests on 2026-07-19.

## Clarifying questions

None.

## Recommended next research

* [ ] Run `npm run test:coverage` before adding any numeric coverage percentage
  to the specification; the existing HTML coverage artifacts may be stale.
* [ ] Validate signing, notarization, and packaged-app behavior separately before
  publishing release-readiness claims.
* [ ] Visually and semantically review the HTML after a future specification
  update, including navigation anchors and generated requirement counts.
