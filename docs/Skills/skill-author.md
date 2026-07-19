# msx-mcp Skill Author

Create, audit, and improve skills in this repository.

## Execution Rules

- **Golden master is `acr`.** When in doubt about structure, frontmatter, or workflow patterns — inspect that skill first.
- **Read the authoring guide on demand.** This SKILL.md has routing and quick-reference rules. For full detail, read [references/SKILL_AUTHORING_GUIDE.md](references/SKILL_AUTHORING_GUIDE.md).
- **Always apply the checklist before declaring a skill done.** See the Checklist section below.
- **Edit files in their canonical locations.** Skills live at `skills/<name>/SKILL.md`. No mirrored copies.

---

## Plugin Layout

| File type | Location | Example |
|-----------|----------|---------|
| Skill knowledge | `skills/<name>/SKILL.md` | `skills/acr/SKILL.md` |
| Skill references | `skills/<name>/references/` | `skills/cplan/references/DAX_BASELINE_TEMPLATE.md` |
| Shared references | `skills/core/references/` | `skills/core/references/DAX_QUERIES.md` |
| MCP tools | `src/tools/<name>.ts` | `src/tools/get-deals.ts` |
| Plugin manifest | `plugin.json` (repo root) | — |
| MCP server config | `.mcp.json` (repo root) | — |

---

## New Skill Workflow

1. **Audit existing skills for overlap** — read every `skills/*/SKILL.md` (frontmatter + workflow sections). If an existing skill already covers the proposed use case, extend it with a new section instead of creating a separate skill. Example: PR #385 proposed a `milestone-comment` skill, but `msx-write` § 3.1 already covers milestone comments — the right action was to extend `msx-write`.
2. **Define scope** — 2–3 concrete use cases (trigger phrase, steps, expected result)
3. **Create directory** — `skills/<skill-name>/` with `SKILL.md`
4. **Write frontmatter** — `name`, `description` with trigger phrases. Description must be "pushy": *"Use this skill whenever the user mentions X, even if they don't use the skill name."*
5. **Write SKILL.md body** — prerequisites, workflow steps, output format, references table. Heavy content (schemas, templates) → `references/` with stub links.
6. **Add post-run reflection** — include `## Post-Run Reflection` section referencing [core § 5](../core/SKILL.md#5-post-run-reflection-continuous-improvement)
7. **Update plugin.json** — version is bumped automatically by release-please when the Release PR merges
8. **Run checklist** — see below

---

## Audit Workflow

When reviewing an existing skill:

1. Read `SKILL.md` — check size (≤500 lines), frontmatter quality, content split
2. Check references exist for heavy content (>30 line blocks)
3. Verify post-run reflection section exists
4. Run the full checklist and report gaps

---

## Key Conventions

| Rule | Detail |
|------|--------|
| **description is the trigger** | Agents see only name+description for skill selection. All "when to use" context must be there. |
| **≤500 lines in SKILL.md** | Over-limit → extract to `references/` with stub links |
| **Stubs over inline** | 2-3 line summary + link beats inlining large blocks |
| **One level deep references** | SKILL.md → refs/FILE.md ✓ / refs/FILE.md → refs/OTHER.md ✗ |
| **SCREAMING_SNAKE_CASE** | Reference doc names: `DAX_REFERENCE.md`, `DATA_DICTIONARY.md` |
| **Shared references** | Cross-skill content goes in `skills/core/references/`, not duplicated per-skill |
| **Forward slashes always** | Never `scripts\helper.py` — breaks non-Windows |
| **Post-run reflection** | Every skill must reference [core § 5](../core/SKILL.md#5-post-run-reflection-continuous-improvement) |
| **Fictitious data only** | See [core § 7](../core/SKILL.md#7-fictitious-data-policy) |

---

## Iteration Methodology

### Claude A / Claude B Pattern

Use one agent instance ("Claude A") to write/refine the skill, then test with a fresh CLI session ("Claude B") on real tasks:

1. Complete a representative task *without* a skill — note what context you repeatedly provide
2. Ask Claude A to draft the SKILL.md
3. Test with Claude B (fresh session) on similar tasks
4. Observe behavior: where it struggles, succeeds, makes unexpected choices
5. Bring specific observations back to Claude A for iteration

### Recognizing Iteration Signals

| Signal | Symptoms | Actions |
|--------|----------|---------|
| **Under-triggering** | Skill doesn't load when it should | Add more trigger phrases to description |
| **Over-triggering** | Skill loads for irrelevant queries | Add negative triggers, narrow scope |
| **Execution issues** | Inconsistent results, tool failures | Strengthen instructions, add error handling |
| **Token bloat** | Agent reads too much context | Move heavy content to references/ |

### Testing Approach

1. **Triggering tests** — does the skill load for obvious and paraphrased requests?
2. **Functional tests** — does it produce correct outputs with real data?
3. **Performance comparison** — compare the same task with and without the skill

Use `scripts/test-skills.ps1` for automated smoke testing (see [Dev Mode Docs](../../docs/SKILL_TESTING.md)).

---

## Checklist

Before shipping a skill, verify:

### Structure
- [ ] `name` is lowercase, hyphens, matches directory name
- [ ] `description` answers "what" and "when", includes trigger phrases, ≤1024 chars
- [ ] `description` is "pushy" — includes "use this skill whenever..." language
- [ ] SKILL.md body is ≤500 lines
- [ ] Heavy content (templates, schemas, field lists) is in `references/`
- [ ] Reference links are one level deep from SKILL.md
- [ ] Reference files use `SCREAMING_SNAKE_CASE.md` naming

### Content
- [ ] Prerequisites section lists required MCP servers and auth
- [ ] Workflow has numbered steps with clear tool/query instructions
- [ ] Error handling table covers common failure modes
- [ ] Output format section with example layout
- [ ] Cross-references use `[Display § Section](references/FILE.md#section)` convention
- [ ] Instructions explain the *why* behind non-obvious rules

### Overlap
- [ ] Audited all existing `skills/*/SKILL.md` (frontmatter + workflow sections) — no existing skill already covers this use case
- [ ] If overlap exists, extended the existing skill instead of creating a new one

### Integration
- [ ] Post-run reflection section references [core § 5](../core/SKILL.md#5-post-run-reflection-continuous-improvement)
- [ ] References table at bottom (load on-demand, not pre-load)
- [ ] Tested with real user prompts
- [ ] `plugin.json` version will be bumped automatically by release-please
- [ ] `doc-drift.test.ts` passes — skill counts in AGENTS.md, README, docs all updated

### Fictitious data
- [ ] No real company names in examples, templates, or docs
- [ ] Uses Microsoft-approved fictitious names only

---

## References

- [§ Full Authoring Guide](references/SKILL_AUTHORING_GUIDE.md) — complete reference
- [core/SKILL.md](../core/SKILL.md) — shared protocols (post-run reflection, error handling)
- [acr/SKILL.md](../acr/SKILL.md) — golden master skill implementation