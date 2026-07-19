# MSX Write Operations

Guide for composing `dataverse_write` calls using Dataverse schema from MCP Resources (`msxdata://schema/{entity}`, `msxdata://optionsets/{entity}`, etc.) to modify MSX Dataverse data. This skill replaces 16 specialized write tools with domain knowledge that makes the generic writer work correctly.

> **Prerequisites:** Dataverse connectivity required — corporate VPN + MSX authentication per [core § Connectivity Check — Dataverse](../core/SKILL.md#connectivity-check--dataverse).

## § 1 — Write Protocol

Every write uses **MCP Elicitation** — a single tool call that:

1. **Builds a preview** of the proposed change
2. **Pauses and asks the human** via the MCP client's elicitation UI
3. **Executes or cancels** based on the human's response

**No bypass.** If the MCP client does not support elicitation, the write **fails
with a clear error** that includes the full preview — there is no `confirm`
argument or any other AI-settable override. This is by design: an agent must
never be able to approve its own writes. Use an elicitation-capable client
(e.g. GitHub Copilot CLI v1.0.57+ interactive, or VS Code) to perform writes.

**Content quality rules:**
- Never generate placeholder or boilerplate content (no "just checking in" comments)
- Research context first (Work IQ, emails, meetings, prior comments) before writing
- If no real context is available, ask the user — don't fabricate
- Match existing format conventions (e.g., forecast comments use `"EH - 21/Mar - ..."` with initials + date)

### `@odata.bind` Case Sensitivity (Important)

Dataverse `@odata.bind` uses the entity's **navigation property name**, which is
case-sensitive and differs between Microsoft-provided (OOTB) entities and custom
(`msp_*`) entities:

| Field Kind | Convention | Example |
|------------|------------|---------|
| OOTB single-valued lookups | lowercase logical name | `parentaccountid@odata.bind`, `transactioncurrencyid@odata.bind`, `customerid_account@odata.bind` |
| Custom `msp_*` single-valued lookups | **Exact SchemaName casing** | `msp_OpportunityId@odata.bind`, `msp_WorkloadlkId@odata.bind` |

Using the wrong case silently fails with an opaque error (e.g.,
`An undeclared property 'msp_opportunityid' was found`). When a custom lookup
bind fails, the first thing to try is PascalCase. Look up the SchemaName via
`msxdata://schema/{entity}` if uncertain.

## § 2 — Quick Reference

| Operation | Entity Set | Method | Recipe |
|-----------|-----------|--------|--------|
| Add milestone comment | `msp_engagementmilestones` | PATCH | [§ 3.1](#31-add-milestone-comment) |
| Add opportunity comment | `opportunities` | PATCH | [§ 3.2](#32-add-opportunity-comment) |
| Create milestone | `msp_engagementmilestones` | POST | [§ 3.3](#33-create-milestone) |
| Create opportunity | `opportunities` | POST | [§ 3.4](#34-create-opportunity) |
| Create HoK / task activity | `tasks` | POST | [§ 3.5](#35-create-hok--task-activity) |
| Update opportunity | `opportunities` | PATCH | [§ 3.6](#36-update-opportunity) |
| Update milestone | `msp_engagementmilestones` | PATCH | [§ 3.7](#37-update-milestone) |
| Join/leave milestone team | `systemusers` | executeAction | [§ 3.8](#38-joinleave-milestone-team) |
| Join/leave deal team | `systemusers` | executeAction | [§ 3.9](#39-joinleave-deal-team) |
| Add opportunity contact | `connections` | POST | [§ 3.10](#310-add-opportunity-contact) |
| Add opportunity product | `opportunityproducts` | POST | [§ 3.11](#311-add-opportunity-product) |
| Close opportunity | `opportunities` | executeAction | [§ 3.12](#312-close-opportunity) |
| Close task | `tasks` | PATCH | [§ 3.13](#313-close-task) |
| Update account | `accounts` | PATCH | [§ 3.14](#314-update-account) |
| Update contact | `contacts` | PATCH | [§ 3.15](#315-update-contact) |
| Create contact | `contacts` | POST | [§ 3.16](#316-create-contact) |

## § 3 — Write Recipes

### 3.1 Add Milestone Comment

**Prepend** new comment to existing forecast comments (not append/replace).

> [!WARNING]
> **Field naming trap:** MSX milestones have two comment fields with confusing names.
>
> | UI Label | Dataverse Field | When to use |
> |----------|----------------|-------------|
> | **Milestone Comments** (main comment area) | `msp_forecastcomments` | ✅ **Use this one** — visible on the milestone form, editable by users |
> | Status Reason Comments | `msp_milestonecomments` | ❌ Auto-populated when setting milestone status to Blocked. Do NOT overwrite unless updating status context |
>
> The UI label "Milestone Comments" maps to `msp_forecastcomments`, NOT `msp_milestonecomments`.

Steps:

1. **Resolve milestone** — accept any of these identifiers:
   - **Milestone number** (e.g., `7-503569293`) → filter by `msp_milestonenumber`
   - **Milestone GUID** → use directly
   - **Customer + keyword** → use `get_account_overview` to find the account, then
     `dataverse_fetchxml` to search milestones by name keyword:
     ```xml
     <fetch>
       <entity name="msp_engagementmilestone">
         <attribute name="msp_engagementmilestoneid" />
         <attribute name="msp_name" />
         <attribute name="msp_milestonenumber" />
         <attribute name="msp_forecastcomments" />
         <filter>
           <condition attribute="msp_milestonenumber" operator="eq" value="{{MILESTONE_NUMBER}}" />
         </filter>
       </entity>
     </fetch>
     ```
2. **Fetch current `msp_forecastcomments`** value (read-before-write to avoid data loss)
3. **Build payload:** `newComment + "\n" + existingComments`
4. **PATCH** via `dataverse_write`:

```json
{
  "entity_set": "msp_engagementmilestones",
  "operation": "patch",
  "id": "<milestone-guid>",
  "data": "{\"msp_forecastcomments\": \"<prepended-comments>\"}"
}
```

5. **Confirm** to the user: which milestone was updated (name + number), the comment written, and offer to open it via `open_msx_record(type="msp_engagementmilestone", id="<guid>")`

> [!IMPORTANT]
> After PATCH, MCP readback may show `msp_forecastcomments` as one flattened
> string with generated initials/date prefixes and prior comments. This does
> not mean MSX created a duplicate comment or put prior history inside the UI
> comment body. Do not post a corrective comment based only on flattened
> readback; verify the MSX UI entry or ask the user to confirm.

### 3.2 Add Opportunity Comment

Same prepend pattern as milestone comments.

```json
{
  "entity_set": "opportunities",
  "operation": "patch",
  "id": "<opportunity-guid>",
  "data": "{\"msp_forecastcomments\": \"<prepended-comments>\"}"
}
```

### 3.3 Create Milestone

#### Pre-flight checks (before creating a milestone)

1. **Parent opportunity MUST have `msp_eststartdate` set.** If null, PATCH it first:
   ```json
   {
     "entity_set": "opportunities",
     "operation": "patch",
     "id": "<opp-guid>",
     "data": "{\"msp_eststartdate\": \"<date>\"}"
   }
   ```
2. Parent opportunity SHOULD have `estimatedclosedate` set.

```json
{
  "entity_set": "msp_engagementmilestones",
  "operation": "create",
  "primary_key_field": "msp_engagementmilestoneid",
  "data": "{
    \"msp_name\": \"POC for Azure AI Studio on Contoso workload\",
    \"msp_milestonecategory\": 861980000,
    \"msp_milestonedate\": \"2026-06-30\",
    \"msp_milestonecomments\": \"Initial milestone for Contoso AI Studio evaluation\",
    \"msp_OpportunityId@odata.bind\": \"/opportunities(<opp-guid>)\",
    \"msp_WorkloadlkId@odata.bind\": \"/msp_workloads(<workload-guid>)\",
    \"msp_monthlyuse\": 5000,
    \"msp_commitmentrecommendation\": 861980000,
    \"msp_milestonestatus\": 861980000
  }"
}
```

**Required fields:** `msp_name`, `msp_milestonecategory`, `msp_milestonedate`, `msp_OpportunityId@odata.bind`, `msp_WorkloadlkId@odata.bind`

**Optional:** `msp_milestonecomments`, `msp_monthlyuse`, `msp_commitmentrecommendation` (default: uncommitted), `msp_milestonestatus` (default: on-track)

#### Workload field

The workload lookup is settable via `msp_WorkloadlkId@odata.bind` → `/msp_workloads(<guid>)`.
The casing is **critical** — only the exact SchemaName `msp_WorkloadlkId` works. Using
`msp_WorkloadLkId` (uppercase L) or `msp_workloadlkid` (all lowercase) returns 400
("An undeclared property" error). Resolve workloads with `dataverse_query` on `msp_workloads`,
filter `contains(msp_name, '<name>')`.

> **For quota/capacity milestones:** See `skills/quota/SKILL.md` § Step 1 for additional
> required fields (status, status reason, help needed, capacity type, preferred azure region).
> Note: `msp_milestoneazurecapacitytype` is a multi-select OptionSet that requires the
> value as a **string** (`"861980081"`), not an integer. `msp_milestonepreferredazureregion`
> and `msp_milestoneazurecapacitytype` are required (red asterisk) on capacity milestones.

OptionSet codes → see [references/optionsets.md](references/optionsets.md).

### 3.4 Create Opportunity

```json
{
  "entity_set": "opportunities",
  "operation": "create",
  "primary_key_field": "opportunityid",
  "data": "{
    \"name\": \"Contoso Ltd. - Azure AI Platform Migration\",
    \"estimatedvalue\": 500000,
    \"msp_opportunitytype\": \"606820001\",
    \"msp_eststartdate\": \"2026-04-01\",
    \"estimatedclosedate\": \"2026-12-31\",
    \"parentaccountid@odata.bind\": \"/accounts(<account-guid>)\",
    \"customerid_account@odata.bind\": \"/accounts(<account-guid>)\",
    \"transactioncurrencyid@odata.bind\": \"/transactioncurrencies(ff2971d7-b412-e411-8d49-6c3be5a82b68)\",
    \"pricelevelid@odata.bind\": \"/pricelevels(95fbede1-8ce3-ef11-a731-0022480ac88d)\",
    \"msp_solutionarea\": 394380000,
    \"msp_dealtype\": 861980001,
    \"description\": \"Migration from on-prem to Azure AI services\"
  }"
}
```

**Required:** `name`, `estimatedvalue`, `msp_opportunitytype` (opportunity intent), `parentaccountid@odata.bind`, `customerid_account@odata.bind`, `transactioncurrencyid@odata.bind`, `pricelevelid@odata.bind`

**Recommended (not API-enforced but expected by business process):** `msp_eststartdate`, `estimatedclosedate`, `msp_dealtype`

**Always include `transactioncurrencyid` and `pricelevelid`** — hardcoded GUIDs in [references/constants.md](references/constants.md).

**Account resolution:** Use `dataverse_query` on `accounts` with `contains(name, '<name>')` or filter by `msp_mstopparentid` (TPID). Bind both `parentaccountid` and `customerid_account` to the same account.

**Aliases:** When user says "Azure" → use solution area code for "Cloud and AI". See [references/optionsets.md](references/optionsets.md).

### 3.5 Create HoK / Task Activity

```json
{
  "entity_set": "tasks",
  "operation": "create",
  "primary_key_field": "activityid",
  "data": "{
    \"subject\": \"Architecture review of Contoso Azure migration path\",
    \"regardingobjectid_msp_engagementmilestone@odata.bind\": \"/msp_engagementmilestones(<milestone-guid>)\",
    \"msp_taskcategory\": 861980004,
    \"scheduledend\": \"2026-04-01\",
    \"actualdurationminutes\": 60,
    \"description\": \"Reviewed AKS cluster topology and networking design\",
    \"ownerid@odata.bind\": \"/systemusers(<your-user-id>)\"
  }"
}
```

**Get your user ID:** Call `dataverse_query` on `WhoAmI` function, or use the value from `msx_auth_status`.

**HoK eligibility rules (CRITICAL):**
- Only **7 categories** count as HoK: Architecture Design Session, Demo, PoC/Pilot, Workshop, Technical Close/Win Plan, Consumption Plan, Blocker Escalation
- **Briefing** is a valid category but does NOT count as HoK — warn the user in preview
- A **due date** (`scheduledend`) is REQUIRED for HoK to appear in dashboards
- Must reflect actual hands-on delivery time, not prep
- Logged at the **milestone** level (bind to milestone, not opportunity)
- Each SE logs their own HoK, even on shared milestones

**Auto-complete past activities (two-step — REQUIRED):** When the `scheduledend`
date is **before today**, the activity has already happened and must be marked
Completed. Dataverse **rejects** `statecode`/`statuscode` in the POST payload
(error: *"5 is not a valid status code for state code TaskState.Open"*), so this
requires two writes:

1. **POST** to create the task (without `statecode`, `statuscode`, or `actualend`)
2. **PATCH** the returned `activityid` to complete it:
   ```json
   {
     "entity_set": "tasks",
     "operation": "patch",
     "id": "<activityid from step 1>",
     "data": "{\"statecode\": 1, \"statuscode\": 5, \"actualend\": \"<scheduledend value>\"}"
   }
   ```

Setting `actualend` is critical — without it, Dataverse defaults to the current
datetime, which misattributes the work to the wrong period in dashboards and
reports. Only leave activities as Open when the due date is today or in the
future.

> **Never include `statecode`, `statuscode`, or `actualend` in a task create
> payload.** These fields are only valid on PATCH after the record exists.

> **Retry safety:** If POST succeeds but PATCH fails, retry the PATCH on the
> same `activityid` — do **not** create another task.

**Preview table (REQUIRED):** Before creating HoK activities, always show the user
a preview table that includes **all** of these columns so they can verify before
you write:

| Column | Source |
|--------|--------|
| Date | `scheduledend` value |
| Activity | `subject` |
| Type | HoK category name |
| Milestone | milestone name |
| Account | parent account |
| Duration | `actualdurationminutes` |
| Status | "✅ Completed" if past date, "🔵 Open" if today or future |

Past-dated rows require **two** `dataverse_write` calls (create Open → PATCH to
Completed). Future/today rows need only the create call.

Category codes → see [references/optionsets.md](references/optionsets.md).

### 3.6 Update Opportunity

**Safety allowlist — only these fields should be updated** (advisory; the human approves every previewed write):

| Field | Label | Type |
|-------|-------|------|
| `estimatedvalue` | Estimated Value | Currency |
| `estimatedclosedate` | Close Date | Date |
| `msp_opportunitystartdate` | Opportunity Start Date | Date |
| `msp_eststartdate` | Est. Start Date | Date |
| `msp_estcompletiondate` | Est. Completion Date | Date |
| `description` | Description | Text |
| `msp_forecastcomments` | Forecast Comments | Text |
| `msp_activesalesstage` | Active Sales Stage | OptionSet |
| `msp_solutionarea` | Solution Area | OptionSet |
| `msp_salesplay` | Sales Play | OptionSet |
| `msp_solutionplay` | Solution Play | OptionSet |
| `msp_opportunityintent` | Opportunity Intent | OptionSet |
| `msp_opportunitytype` | Opportunity Type | OptionSet |
| `ownerid@odata.bind` | Owner | Lookup (`/systemusers(<id>)`) |
| `parentcontactid@odata.bind` | Primary Contact | Lookup (`/contacts(<id>)`) |

**Prefer to reject fields outside this list** and explain why if the user asks to update other fields (e.g. stage gates, status, hierarchy). OptionSet codes → see [references/optionsets.md](references/optionsets.md).

> **`msp_forecastcomments` attribution format:** match the existing convention
> `"<initials> - <d/Mon> - <text>"` (e.g. `"EH - 21/Mar - Verbal commit from CTO"`),
> and **prepend** to existing comments rather than overwriting (read-before-write).

```json
{
  "entity_set": "opportunities",
  "operation": "patch",
  "id": "<opportunity-guid>",
  "data": "{\"estimatedvalue\": 750000, \"estimatedclosedate\": \"2026-09-30\"}"
}
```

### 3.7 Update Milestone

Updatable fields: `msp_name`, `msp_milestonedate`, `msp_monthlyuse`, `msp_commitmentrecommendation`, `msp_milestonestatus`, `msp_WorkloadlkId@odata.bind`.

> ⚠️ Workload binding is case-sensitive — use exactly `msp_WorkloadlkId` (SchemaName). See § 3.3.

```json
{
  "entity_set": "msp_engagementmilestones",
  "operation": "patch",
  "id": "<milestone-guid>",
  "data": "{\"msp_milestonestatus\": 861980001, \"msp_monthlyuse\": 10000}"
}
```

Status codes → see [references/optionsets.md](references/optionsets.md).

### 3.8 Join/Leave Milestone Team

Uses Dataverse `AddUserToRecordTeam` / `RemoveUserFromRecordTeam` actions.

**Join:**
```json
{
  "entity_set": "systemusers",
  "operation": "execute_action",
  "action_path": "systemusers(<your-user-id>)/Microsoft.Dynamics.CRM.AddUserToRecordTeam",
  "data": "{
    \"Record\": {
      \"@odata.type\": \"Microsoft.Dynamics.CRM.msp_engagementmilestone\",
      \"msp_engagementmilestoneid\": \"<milestone-guid>\"
    },
    \"TeamTemplate\": {
      \"@odata.type\": \"Microsoft.Dynamics.CRM.teamtemplate\",
      \"teamtemplateid\": \"316e4735-9e83-eb11-a812-0022481e1be0\"
    }
  }"
}
```

**Leave:** Same but use `RemoveUserFromRecordTeam` in the action path.

### 3.9 Join/Leave Deal Team

Same pattern as milestone team but with opportunity entity and deal team template:

```json
{
  "entity_set": "systemusers",
  "operation": "execute_action",
  "action_path": "systemusers(<your-user-id>)/Microsoft.Dynamics.CRM.AddUserToRecordTeam",
  "data": "{
    \"Record\": {
      \"@odata.type\": \"Microsoft.Dynamics.CRM.opportunity\",
      \"opportunityid\": \"<opportunity-guid>\"
    },
    \"TeamTemplate\": {
      \"@odata.type\": \"Microsoft.Dynamics.CRM.teamtemplate\",
      \"teamtemplateid\": \"cc923a9d-7651-e311-9405-00155db3ba1e\"
    }
  }"
}
```

### 3.10 Add Opportunity Contact

Creates a `connection` record linking a contact to an opportunity with a role.

Steps:
1. Resolve opportunity (by name or ID)
2. Resolve contact: `dataverse_query` on `contacts`, filter `contains(fullname, '<name>')`
3. Resolve connection role: `dataverse_query` on `connectionroles`, filter `name eq '<role>'` (e.g., "Champion", "Decision Maker", "Blocker")

```json
{
  "entity_set": "connections",
  "operation": "create",
  "primary_key_field": "connectionid",
  "data": "{
    \"record1id_opportunity@odata.bind\": \"/opportunities(<opp-guid>)\",
    \"record2id_contact@odata.bind\": \"/contacts(<contact-guid>)\",
    \"record1roleid@odata.bind\": \"/connectionroles(<role-guid>)\"
  }"
}
```

### 3.11 Add Opportunity Product

Creates a write-in (non-catalog) product line item.

```json
{
  "entity_set": "opportunityproducts",
  "operation": "create",
  "primary_key_field": "opportunityproductid",
  "data": "{
    \"opportunityid@odata.bind\": \"/opportunities(<opp-guid>)\",
    \"isproductoverridden\": true,
    \"productdescription\": \"Azure OpenAI Service - GPT-4 Turbo\",
    \"quantity\": 1,
    \"priceperunit\": 50000,
    \"ispriceoverridden\": true
  }"
}
```

**Required:** `opportunityid@odata.bind`, `quantity`

Set `isproductoverridden: true` for write-in products. Set `ispriceoverridden: true` when specifying a price.

### 3.12 Close Opportunity

Close an opportunity as Won or Lost using `execute_action`.

**Won reasons (`WinOpportunity`):**

| Reason | Status Code |
|--------|-------------|
| MS Sales Validated | 861980017 |
| Competitive Win | 861980019 |
| Partial Win | 861980018 |
| Non-Compete | 861980003 |

**Lost reasons (`LoseOpportunity`):**

| Reason | Status Code |
|--------|-------------|
| Pipeline Hygiene/Duplicate | 861980001 |
| Project Canceled/Delayed | 4 |
| Competitive Loss | 861980020 |
| Kept Existing Solution | 861980002 |
| Consolidated | 861980023 |

**Close as Won (default: MS Sales Validated):**

```json
{
  "entity_set": "opportunities",
  "operation": "execute_action",
  "action_path": "WinOpportunity",
  "data": "{\"Status\": 861980017, \"OpportunityClose\": {\"subject\": \"Won - description\", \"opportunityid@odata.bind\": \"/opportunities(<guid>)\", \"actualend\": \"2026-05-04\", \"actualrevenue\": 24246}}"
}
```

**Close as Lost (default: Pipeline Hygiene/Duplicate):**

```json
{
  "entity_set": "opportunities",
  "operation": "execute_action",
  "action_path": "LoseOpportunity",
  "data": "{\"Status\": 861980001, \"OpportunityClose\": {\"subject\": \"Pipeline cleanup\", \"opportunityid@odata.bind\": \"/opportunities(<guid>)\"}}"
}
```

**Rules:**
- `actualrevenue` is optional (useful for Won to record landed amount)
- `actualend` is optional (defaults to today)
- Direct PATCH of `statecode` is blocked by MSX — must use WinOpportunity/LoseOpportunity actions
- Status code `3` (default Dynamics) does NOT work — use the MSX-specific codes above

### 3.13 Close Task

Closing a task requires setting **both** `statecode` and `statuscode` in a single PATCH.

#### Status Codes

| Status | `statuscode` | `statecode` |
|--------|-------------|-------------|
| Completed | 5 | 1 |
| Cancelled | 6 | 2 |

```json
{
  "entity_set": "tasks",
  "operation": "patch",
  "id": "<task-activity-guid>",
  "data": "{\"statecode\": 1, \"statuscode\": 5}"
}
```

> **Historical tasks:** When completing a task whose `scheduledend` is in the
> past, always include `actualend` set to the `scheduledend` value:
> `"{\"statecode\": 1, \"statuscode\": 5, \"actualend\": \"<scheduledend>\"}"`.
> Without it, Dataverse defaults `actualend` to today, misattributing the work
> in dashboards.

To cancel instead of complete, use `statecode: 2, statuscode: 6`.

> **Tip:** The task GUID is the `activityid` field, not `taskid`. Resolve it via
> `dataverse_query` on `tasks` with filter on `_regardingobjectid_value` (milestone GUID)
> or `subject`.

#### Reopening a closed task

PATCH back to open state:

```json
{
  "entity_set": "tasks",
  "operation": "patch",
  "id": "<task-activity-guid>",
  "data": "{\"statecode\": 0, \"statuscode\": 3}"
}
```

### 3.14 Update Account

PATCH an `accounts` record. **Field allowlist** (advisory — the human approves the previewed write):

`name`, `telephone1`, `websiteurl`, `emailaddress1`, `description`, `industrycode`,
`revenue`, `numberofemployees`, `address1_line1`, `address1_line2`, `address1_city`,
`address1_stateorprovince`, `address1_postalcode`, `address1_country`,
`primarycontactid@odata.bind` (`/contacts(<id>)`), `ownerid@odata.bind` (`/systemusers(<id>)`).

> [!WARNING]
> **Never write account hierarchy fields** (`parentaccountid`, `msp_mstopparentid`,
> TPID/parenting). Account hierarchy is managed by upstream systems — changing it
> here corrupts territory rollups. If the user asks to re-parent an account, decline
> and point them to the account-management process.

```json
{
  "entity_set": "accounts",
  "operation": "patch",
  "id": "<account-guid>",
  "data": "{\"websiteurl\": \"https://contoso.com\", \"numberofemployees\": 5000}"
}
```

### 3.15 Update Contact

PATCH a `contacts` record. **Field allowlist** (advisory):

`firstname`, `lastname`, `jobtitle`, `emailaddress1`, `emailaddress2`, `telephone1`,
`mobilephone`, `description`, `address1_line1`, `address1_city`,
`address1_stateorprovince`, `address1_postalcode`, `address1_country`,
`parentcustomerid_account@odata.bind` (`/accounts(<id>)`),
`ownerid@odata.bind` (`/systemusers(<id>)`).

> The parent-account lookup uses the OOTB navigation property
> `parentcustomerid_account` (lowercase), not a custom `msp_*` bind. See § 1 casing rules.

```json
{
  "entity_set": "contacts",
  "operation": "patch",
  "id": "<contact-guid>",
  "data": "{\"jobtitle\": \"VP of Engineering\", \"mobilephone\": \"+1-555-0142\"}"
}
```

### 3.16 Create Contact

POST a new `contacts` record. **Required:** `firstname`, `lastname`, `jobtitle`, `emailaddress1`, and `parentcustomerid_account@odata.bind`.
**Field allowlist** (advisory): `firstname`, `lastname`, `jobtitle`, `emailaddress1`,
`telephone1`, `mobilephone`, `description`, `address1_city`, `address1_country`,
`parentcustomerid_account@odata.bind`.

Steps:
1. Resolve the parent account (by name → `get_account_overview`, or by GUID) and
   **verify it exists** before creating the contact.
2. POST with `primary_key_field: "contactid"`:

```json
{
  "entity_set": "contacts",
  "operation": "create",
  "primary_key_field": "contactid",
  "data": "{\"firstname\": \"Dana\", \"lastname\": \"Reyes\", \"jobtitle\": \"CTO\", \"emailaddress1\": \"dana.reyes@contoso.com\", \"parentcustomerid_account@odata.bind\": \"/accounts(<account-guid>)\"}"
}
```

3. Confirm the new contact (name + account) and offer to add them to an opportunity
   via § 3.10 (Add Opportunity Contact).

After completing a write operation, silently evaluate per [core § 5](../core/SKILL.md#5--post-run-reflection).