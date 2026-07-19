# Impact Report

Generate evidence-based SE reports in two modes: quick weekly impact summaries and structured monthly opportunity updates. Both combine MSX pipeline data, Power BI consumption analytics, and WorkIQ activity evidence.

| Mode | Trigger | Output |
|------|---------|--------|
| **Weekly Impact Summary** | "weekly report", "what did I do this week" | One-page impact-focused summary |
| **Monthly Opportunity Report** | "monthly report", "opportunity update", "pod update" | Structured SDP-format report with opportunity tables |

> **Prerequisites:** Dataverse connectivity required — corporate VPN + MSX authentication per [core § Connectivity Check — Dataverse](../core/SKILL.md#connectivity-check--dataverse).

## Shared: Data Gathering

Both modes use the same data sources. Gather in parallel:

### MSX Pipeline (via msx-mcp)
- `get_deals` → all deal team opportunities
- `get_pipeline_summary` → pipeline by stage with totals
- `suggest_top_opportunities(count: 5, criteria: "by_value")` → ranked deals
- `get_opportunity_details` for featured deals → stage, value, forecast, deal team

### Consumption Context (via Power BI)
- Use the [acr skill](../acr/SKILL.md) for top accounts — ACR baselines, MACC progress, service mix
- Correlate consumption with pipeline: growing ACR with no open deals = untracked growth

### Activity Evidence (via WorkIQ)
- "What meetings, emails, and Teams conversations did I have related to [account names]? Include links."
- "What technical work, blockers resolved, and deliverables did I create?"
- "What internal contributions (interviews, guilds, enablement) did I make?"

### Session Store (SQL)
```sql
SELECT DISTINCT s.id, s.summary, substr(t.user_message, 1, 200) as first_ask
FROM sessions s JOIN turns t ON t.session_id = s.id AND t.turn_index = 0
WHERE s.updated_at >= date('now', '-30 days')
ORDER BY s.updated_at DESC LIMIT 20;
```

## Core Principles (Both Modes)

**Evidence-Based** — Never claim credit without verifiable links. If WorkIQ can't find evidence, omit.

**Impact-Focused** — Lead with outcomes, not activities. Transform "Attended 3 meetings" → "Unblocked capacity issue enabling $X deployment."

**Conservative** — Understate rather than overstate. Credit others. Clarify your actual role.

**Never Fabricate** — If unsure about an activity, ask the user before including it.

**Tone** — Succinct and factual. No resume-speak ("Spearheaded", "Orchestrated"). State facts directly.

---

## Mode 1: Weekly Impact Summary

**When:** "weekly report", "what did I do this week", "weekly update", "impact summary"

### Process

1. **Gather data** (see Shared section above, scoped to past 7 days)
2. **Apply impact framework:**
   - **Primary:** Revenue/consumption impact, customer blockers removed, product improvements
   - **Secondary:** Team enablement, risk mitigation
   - **Exclude:** Meeting attendance without outcome, passive participation
3. **Verify every claim** — must have a link or concrete deliverable
4. **Format output:**

```markdown
**Weekly Impact Summary – Week of [dates]**

**[Category: e.g., "Contoso Account Growth"]**
- [Specific contribution with measurable outcome] [Link]
- _Impact: [What this enabled/prevented/accelerated]_

**[Category: e.g., "Customer Problem-Solving"]**
- [Blocker] → [What you did] [Link]
- _Impact: [Outcome]_

**Next Week Priorities**
- [3-5 forward-looking items]
```

Keep to one page. All links clickable for manager follow-up.

---

## Mode 2: Monthly Opportunity Report

**When:** "monthly report", "opportunity update", "pod update", "SE manager report"

> **CRITICAL:** Output MUST match the format in `references/`. Read ALL examples before generating.

### Step 0: Check for Existing Reports

Before starting, look for `monthly-update-*.md` in the current directory. If found, use as defaults — don't re-run full discovery unless asked.

### Step 1: Auto-Discovery

Run data gathering (see Shared section, scoped to past 30 days). Also:
- `get_account_team` → account assignments, roles, solution areas

### Step 2: Present Choices

Show pipeline snapshot, accounts, top 5 opportunities. Pre-select top 3.

**Confirmation UX (MANDATORY):** When asking which opportunities to feature, use a **free-text string field** — never enum or multi-select pickers. The user must be able to type a natural-language answer like "those 3 plus #5", "swap #1 for #4", or "all of them". Example `ask_user` schema:

```json
{
  "message": "Which opportunities should I feature? I've pre-selected #1, #2, #3.",
  "requestedSchema": {
    "properties": {
      "selection": {
        "type": "string",
        "title": "Featured opportunities",
        "description": "Type your picks (e.g. '#1 #2 #3', 'drop #1, add #5', 'all 5')",
        "default": "#1, #2, #3"
      }
    },
    "required": ["selection"]
  }
}
```

This rule applies to ALL `ask_user` calls in this skill — never restrict user input to a fixed set of choices when they might want to combine, reorder, or describe something the enum doesn't cover.

Resolve everything automatically — user should never provide GUIDs.

> Use relative time ("over the last month") — never hard-code month names.

### Step 3: Deep Dive

For each selected opportunity:
- `get_opportunity_details` with opportunity GUID
- WorkIQ per account for specific meetings/decisions/deliverables
- WorkIQ for internal contributions (interviews, guilds, enablement)

### Step 4: Generate Markdown

**Format:** 4-section structure matching reference examples:
1. Portfolio Summary (Field | Description | Input/Insight table)
2. Opportunity Details (repeat per opportunity, same table format)
3. MACC Snapshot (even if empty)
4. Contribution/Impact (Customer | Engagement Type | Contribution w/ Impact)

**MSX ID links (MANDATORY):**
```
[7-XXXXXXXXXX](https://microsoftsales.crm.dynamics.com/main.aspx?pagetype=entityrecord&etn=opportunity&id={GUID})
```

**Linking convention:**
- The **Opportunity Details header row** (`Account / Opp Name / MSX ID`) is the ONE place where a raw MSX ID appears — and it must be a clickable link per the format above.
- **Everywhere else** in the report (Portfolio Summary, Close Plan, Contributions, MACC, etc.): prefer embedding URLs as hyperlinks on descriptive text rather than showing raw MSX IDs or bare URLs — e.g., `[IBM Bob](https://bob.ibm.com)`, `[opportunity](dynamics_url)`, `[milestone](dynamics_url)`.
- **Proactively link** — when mentioning any MSX opportunity, milestone, external product, or tool by name, make the name a clickable link. More links = easier drill-in for the reader.
- Milestone link example: `[milestone](https://microsoftsales.crm.dynamics.com/main.aspx?pagetype=entityrecord&etn=msp_engagementmilestone&id={GUID})`

**Content rules:**
- MSX data fills structured fields; WorkIQ fills narrative fields
- Empty fields stay empty — no placeholders
- Order opportunities by impact, not alphabetically
- Order contributions by time invested (use session + calendar data)
- Separate sections with `---` horizontal rules

**Owner field:** Use `_ownerid_value` from `get_opportunity_details` (Dataverse owner) — do not infer from deal team members or forecast comment authorship.

**Attribution verification (Contribution/Impact table):**
Before writing each row in the Contribution/Impact table, verify:
1. Did the user **create** the deliverable, or just **attend/participate**?
2. Is the user listed as **organizer** on the calendar invite, or just an attendee?
3. If WorkIQ shows attendance only, use conservative language: "Attended" or "Participated in" — never "Led", "Organized", or "Hosted" unless there is concrete evidence.
4. When uncertain about the user's role, **omit the claim** rather than overclaim.
5. Ask the user before attributing authorship of deliverables that may have been created by others.

### Step 5: Review

Save as `monthly-update-YYYY-MM.md`. Tell user where it's saved, what's in it, and offer iteration.

### Step 6: Generate DOCX (on request)

If the user asks for a `.docx`, generate one alongside the `.md` using `python-docx`:

**Typography:**
- **Font:** Bahnschrift, 11pt everywhere (body, tables, headings)
- **Heading color:** `#0F6CBD` (Microsoft blue)
- **Table style:** "Light Grid Accent 1"

**Hyperlinks (MANDATORY):**
Every mention of an MSX opportunity, milestone, external product, or tool must be a clickable hyperlink in the `.docx` — not just in the header row. Use `python-docx` OxmlElement hyperlink construction (the library has no built-in hyperlink API). Build a `rich_cell()` helper that accepts mixed segments of plain text strings and `(text, url)` tuples to render inline hyperlinks. Links should be blue (`#0078D4`) and underlined.

**Save location:**
Save the `.docx` alongside the `.md` in the same directory with the same naming convention:
- `Monthly Opportunity Report - [Month] [Year].md`
- `Monthly Opportunity Report - [Month] [Year].docx`

## Reference Examples (Monthly Mode)

| Example | File | Highlights |
|---------|------|------------|
| Apps & AI SE (3 opps) | `references/anonymized-example-1-apps-ai.md` | Full report, 4 contribution rows |
| Data SE (3 opps, MACC) | `references/anonymized-example-2-data.md` | Filled MACC section |

Read these before generating to calibrate structure, tone, and depth.

## Post-Run Reflection

After completing a report, follow the [core § 5 Post-Run Reflection](../core/SKILL.md#5-post-run-reflection-continuous-improvement) protocol.