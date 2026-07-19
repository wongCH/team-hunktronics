---
title: LLM Wiki Electron Integration Research
description: Source-grounded research on Karpathy's LLM Wiki pattern and its minimum local Electron integration contract
ms.date: 2026-07-19
ms.topic: research
---

## Research questions

* What directory and file conventions does the source prescribe exactly?
* What update, read, query, and maintenance workflows does it define?
* Which rules are required, optional, or intentionally left to the implementer?
* What does onboarding require for an LLM agent and a human operator?
* What is the minimum integration contract for a local Electron application?
* Does the current team-hunktronics workspace already reference LLM Wiki?

## Source boundary

Primary source:

* [Karpathy, LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
* [Raw revision ac46de1](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md)

The gist comments are not Karpathy's specification. They may illustrate later
implementations, but they are excluded from source requirements unless identified
explicitly as community evidence.

## Executive finding

The primary source explicitly says it is an abstract pattern, not a specific
implementation. It does not prescribe an exact directory tree, schema convention,
page format, or toolchain. The exact source facts are limited to three logical
layers, three operations, two specially named wiki files, and several ownership
and mutability invariants.

No first-party LLM Wiki references were found in the current team-hunktronics
source, documentation, repository instructions, README, or root configuration.
The app has reusable managed-Markdown and policy primitives, but it does not have
a source/wiki/schema store, index-first retrieval, or an LLM tool or multi-phase
operation loop capable of performing the described ingest workflow.

## Author source facts

This section reports only facts present in Karpathy's pinned raw gist revision.

### Exact directory and file conventions

The source defines logical layers, not a literal root tree:

* Raw sources are a curated collection of source documents such as articles,
	papers, images, and data files. They are immutable from the LLM's perspective:
	the LLM may read them but never modify them. They are the source of truth.
* The wiki is one directory of LLM-generated Markdown files. Example page roles
	are summaries, entity pages, concept pages, comparisons, an overview, and a
	synthesis. The LLM creates and updates these files, maintains cross-references,
	and keeps them consistent. The human reads this layer.
* The schema is one document that defines wiki structure, conventions, and the
	ingest, query, and maintenance workflows. `CLAUDE.md` and `AGENTS.md` are
	examples, not mandatory filenames. The human and LLM co-evolve it.

The source names two special files inside the wiki:

* `index.md` is the content catalog. It lists every page with a link and one-line
	summary. Date and source count are optional metadata. It is organized by
	categories such as entities, concepts, and sources. The LLM updates it on every
	ingest. Query begins by reading it, then drills into relevant pages.
* `log.md` is an append-only chronological record of ingests, queries, and lint
	passes. A consistent heading prefix makes it machine-parseable. The example is
	`## [2026-04-02] ingest | Article Title`, and the example reader command is
	`grep "^## \[" log.md | tail -5`.

The only directory path shown is the optional example `raw/assets/` for downloaded
Obsidian attachments. It is not a prescribed root layout.

The author explicitly leaves these details unspecified:

* Literal names for the raw-source and wiki directories
* Page filenames and page-to-directory taxonomy
* Markdown link syntax, including whether to use standard links or wikilinks
* Page templates, heading layouts, and citation syntax
* YAML frontmatter and its fields
* A schema filename beyond the two agent-specific examples
* Git layout, branching, review gates, concurrency, and transaction semantics
* Search implementation, database, embedding model, and vector store
* UI, IPC, service API, and desktop application architecture

The final note in the source is decisive: the exact directory structure, schema
conventions, page formats, and tooling depend on the domain, preferences, and LLM.
It calls everything described optional and modular. Therefore, no more detailed
directory tree can accurately be attributed to Karpathy.

### Exact update workflows

Ingest is described as this example sequence:

1. The human drops a new source into the raw collection and asks the LLM to
	 process it.
2. The LLM reads the source and discusses key takeaways with the human.
3. The LLM writes a source summary page.
4. The LLM updates `index.md`.
5. The LLM updates all relevant entity and concept pages, including
	 cross-references, contradictions, and evolving synthesis.
6. The LLM appends an ingest entry to `log.md`.

A source may touch 10 to 15 wiki pages. One-at-a-time ingestion with human
guidance is the author's preference, not a rule. Batch ingestion is permitted.
The chosen procedure belongs in the schema so later sessions repeat it.

Query is described as this sequence:

1. The human asks a question against the wiki.
2. The LLM reads `index.md` first at the moderate scale discussed by the source.
3. The LLM searches for and reads relevant pages.
4. The LLM synthesizes an answer with citations.
5. A valuable answer may be filed back into the wiki as a new page.
6. `log.md` records queries as part of the wiki chronology.

The answer format may be Markdown, a comparison table, a Marp deck, a matplotlib
chart, or a canvas. These output formats are examples, not requirements.

Lint is periodic maintenance. The source directs the LLM to look for:

* Contradictions between pages
* Claims superseded by newer sources
* Orphan pages with no inbound links
* Important concepts that do not have pages
* Missing cross-references
* Data gaps that a web search could fill

The LLM may also suggest new questions and sources. `log.md` records lint passes.
No lint schedule, severity model, pass/fail threshold, or automatic repair rule is
specified.

### Exact ownership and behavior rules

* Raw sources are immutable to the LLM and remain the source of truth.
* The LLM owns wiki authoring and maintenance; the human normally reads it and
	writes it rarely or never.
* The human owns source curation, exploration, questions, and analytical
	direction.
* Wiki knowledge is integrated persistently rather than re-derived from raw
	documents for every query.
* New information updates existing pages, cross-references, contradictions, and
	synthesis rather than producing only an isolated summary.
* Query answers include citations, but the citation format is unspecified.
* Operational conventions are durable because they are written in the schema.
* The schema evolves with experience instead of being treated as fixed forever.

### Source-stated onboarding implications

The idea file is intended to be copied to an LLM agent. The agent and human then
instantiate a domain-specific version together. Onboarding therefore needs enough
collaboration to establish a schema before repeatable operations can exist.

The source implies that a newly onboarded agent must be able to:

* Read the schema and obey its local conventions
* Read raw sources without modifying them
* List, read, create, and update multiple Markdown wiki pages
* maintain cross-references, `index.md`, and `log.md`
* Search the wiki and cite material in answers
* Perform periodic semantic and structural health checks

Obsidian is the author's browsing environment, but it is not part of the protocol.
Git, qmd, Obsidian Web Clipper, local image downloads, Marp, Dataview, YAML
frontmatter, graph view, and embedding-based search are all optional.

## Workspace facts

### Reference search result

Exact and case-insensitive searches covered `src/**`, `docs/**`, `.github/**`,
`README.md`, and root TypeScript, JavaScript, JSON, YAML, and YML files. Search
terms included the gist ID, gist path, `llm-wiki`, `LLM Wiki`, `persistent wiki`,
`raw sources`, `CLAUDE.md`, and `AGENTS.md`.

No first-party reference was found. A broad search including ignored and generated
content returned unrelated `index.md` and changelog references under
`node_modules/` and `out/`; none referred to Karpathy or LLM Wiki.

### Relevant existing capabilities

* `src/main/memoryService.ts` stores managed Markdown below Electron `userData`,
	confines paths, uses SHA-256 revisions, writes atomically, creates backups,
	performs lexical search, and reports health findings.
* `src/shared/ipc.ts` and `src/preload/index.ts` provide the established typed IPC
	and context-bridge pattern for renderer access to main-process services.
* `src/main/contextAssembler.ts` injects agent identity, skills, and curated team
	and agent memory under a bounded context budget.
* `src/main/runService.ts` owns trusted prompt assembly and provider execution.
* `src/main/toolPolicy.ts` classifies side effects, checks agent grants and
	autonomy, redacts sensitive arguments, and creates approval records.
* `src/shared/types.ts` already defines a `files` tool grant, `local-write` side
	effects, agent skills, and draft, assist, and autonomous modes.

### Current gaps

These are code observations, not statements from the gist:

* `MemoryService` is memory-specific. It accepts only a safe single Markdown
	filename within fixed team or agent folders, limits files to 100 KB, limits
	baseline files to 200 lines, and applies memory-specific archival and health
	rules. It cannot represent a user-selected raw/wiki/schema workspace as-is.
* `RunService` performs one model generation from a statically assembled prompt.
	It has no tool-call loop or domain-specific multi-phase ingest loop.
* `ToolPolicyBroker` authorizes and records actions but does not execute file or
	MCP tools.
* Context assembly injects baseline memory. It does not read a wiki index, select
	relevant pages, or resolve citations.
* No source import, immutable source store, wiki page store, schema store, index
	maintainer, chronological operation log, or wiki lint service exists.

## Recommendations for team-hunktronics

Everything in this section is a recommendation, not a Karpathy source fact.

### Proposed minimum on-disk convention

Use a user-selected root or an app-managed root below Electron `userData` with one
fixed, model-neutral contract:

```text
llm-wiki/
├── AGENTS.md
├── raw/
└── wiki/
		├── index.md
		├── log.md
		└── <page>.md
```

`AGENTS.md` is recommended because the source names it as a schema example and the
app is agent-oriented. The app must load it explicitly for every wiki operation;
it must not rely on a provider discovering the file. Nested page folders can be
added later without changing the logical contract.

Keep the first version deliberately small:

* Use standard relative Markdown links so the renderer and deterministic link
	checks do not depend on Obsidian syntax.
* Do not require YAML frontmatter, a graph database, embeddings, qmd, Obsidian,
	Marp, or Dataview.
* Use lexical search plus `index.md` until measured scale or recall failures
	justify another index.
* Treat Git integration as optional. App-level revisions and history are enough
	for the first local version.

### Recommended onboarding flow

1. Let the user create or open one wiki root.
2. Explain and enforce the raw-source immutability boundary.
3. Bootstrap `AGENTS.md`, `raw/`, `wiki/index.md`, and `wiki/log.md` only when
	 absent. Never overwrite an existing wiki during onboarding.
4. Ask for the domain, desired page categories, filename convention, citation
	 convention, ingest supervision level, and write approval mode.
5. Write those choices into `AGENTS.md` and show the initial schema for approval.
6. Ingest one source interactively as a calibration run.
7. Show the proposed multi-file diff, then apply it through the existing tool
	 policy in assist mode by default.
8. Run a link and index health check and teach the user where query and lint live.

### Recommended process boundary

Create a separate main-process `WikiService`; do not broaden `MemoryService` into
two domains with incompatible limits. Reuse its proven patterns for confinement,
revision hashes, backups, and atomic writes.

The renderer should receive opaque wiki and document IDs through typed IPC. It
should never receive unrestricted filesystem capability. The main process should:

* Resolve all paths below a registered root and reject traversal
* Resolve or reject symlinks so a path cannot escape after lexical confinement
* Expose raw sources through read-only agent operations
* Reserve raw writes for an explicit human import operation
* Validate UTF-8 Markdown, size limits, links, and expected revisions
* Stage a multi-file change set before applying any wiki write
* Route the staged change set through `ToolPolicyBroker` as `local-write`
* Keep source content and full prompt content out of traces

### Recommended operation design

The current single provider call is insufficient for ingest. The smallest change
is a domain-specific, multi-phase `WikiOperationService`; a general autonomous
tool runtime is not required for version one.

Ingest should perform two model phases:

1. Send the schema, `index.md`, source metadata, source content, and user guidance
	 to obtain the existing pages to read and the planned page changes.
2. Load only those existing pages and request a typed `WikiChangeSet` containing
	 complete page writes, an updated index, and one log entry.

The app validates and stages that change set, presents a diff when policy requires
approval, then commits it with revision checks. The LLM never gets a generic raw
filesystem write tool.

Query should read the schema and index first, select relevant pages with lexical
search plus model selection, load a bounded set, and request an answer whose
citations resolve to known wiki or raw-source IDs. Saving an answer should create
a separate proposed change set rather than silently mutating the wiki.

Lint should combine deterministic checks for missing files, broken links, index
coverage, and orphan pages with a model pass for contradictions, superseded claims,
missing concepts, and knowledge gaps. Repairs should be proposals, not implicit
edits, unless the selected agent is explicitly autonomous.

## Minimum integration contract

This is the recommended acceptance contract for a local Electron implementation.

### Persistence contract

* One registered root contains `AGENTS.md`, `raw/`, and `wiki/`.
* `wiki/` contains `index.md`, `log.md`, and Markdown content pages.
* Agent-visible raw operations are list and read only.
* Human source import creates a new immutable source record and content hash.
* Wiki writes require expected revisions and use staged atomic replacement with
	recovery history.
* `log.md` is append-only through the service API.
* No renderer-supplied path can escape the registered root, including by symlink.

### Domain API contract

The main process needs these minimum domain operations, independent of IPC naming:

* Initialize or open a wiki without overwriting existing content
* Import, list, and read raw sources
* Read and revision-update the schema
* List, read, and lexical-search wiki pages
* Read `index.md` before query or ingest page selection
* Propose, validate, diff, authorize, and commit a multi-file wiki change set
* Append typed ingest, query, and lint entries to `log.md`
* Run deterministic structural lint and model-assisted semantic lint

### Model contract

Every ingest, query, and lint call receives the current schema. Model output that
can mutate state must be structured and validated. A change set needs, at minimum:

* Operation type and source or query identifier
* Complete target-relative Markdown paths
* Expected revision for every existing file
* Complete replacement content for page writes
* Updated `index.md` content for ingest
* Exactly one parseable `log.md` entry
* Citations or source IDs supporting generated claims

The app rejects partial, path-escaping, stale-revision, raw-mutating, or
schema-invalid change sets before requesting approval.

### User experience contract

The minimum UI exposes wiki selection, source import, index/page browsing, query,
change review, and lint findings. A graph view and semantic search are not minimum
features. The user must be able to see which files will change and why before an
assist-mode commit.

### Acceptance checks

* Ingest, query, and lint leave every existing raw-source hash unchanged.
* Ingest creates or revises synthesis pages, updates `index.md`, and appends one
	parseable log entry in one approved change set.
* Query consults `index.md` before content pages and returns only resolvable
	citations.
* A valuable query answer is saved only after an explicit save or approved change
	proposal.
* Lint detects broken links, unindexed pages, and orphans deterministically and
	reports semantic findings separately.
* Stale revisions, traversal, symlink escape, malformed Markdown paths, and any
	model attempt to modify `raw/` are rejected.
* Renderer code cannot directly read or write the filesystem.
* The first release works without Obsidian, Git, vector search, or a database.

## Evidence and interpretation limits

The raw gist revision is the authority for the author facts above. The rendered
gist page includes many community comments with concrete trees, review gates,
databases, MCP servers, and production lessons. Those comments are not part of
Karpathy's document and were not promoted into source requirements.

The GitHub API metadata endpoint returned an HTTP 502 during research. The rendered
gist and raw URL both identify the pinned revision as
`ac46de1ad27f92b28ac95459c782c07f6b8c964a`, and the rendered page reports one
revision. No conclusion depends on relative creation-time text from the page.

## Key discoveries

* The source deliberately has no exact directory tree. Any report claiming one as
	Karpathy's convention is adding an implementation choice.
* `index.md` and `log.md` are the only exact wiki filenames in the author text;
	`CLAUDE.md` and `AGENTS.md` are examples for the schema.
* The core compatibility boundary is behavioral: immutable raw truth, persistent
	LLM-maintained Markdown synthesis, durable schema instructions, index-first
	query, append-only history, and periodic lint.
* team-hunktronics has strong persistence and policy building blocks, but the
	missing capability is an operation loop that can read selectively and commit a
	validated multi-file change set.
* A separate `WikiService` plus a narrow multi-phase operation service is a smaller
	first integration than adding general MCP, vector storage, or an unrestricted
	model filesystem tool.

## Recommended next research

* None required for the minimum contract
* Benchmark lexical index-first retrieval before selecting a semantic search tool
* Test provider support for structured outputs before fixing the change-set wire
	format
* Threat-model user-selected roots, symlinks, and imported active content before
	implementation

## Clarifying questions

None. Product choices such as the default root location, citation style, and
approval mode can be decided during implementation without more source research.