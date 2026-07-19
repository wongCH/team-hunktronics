---
name: visualized-response
description: DEFAULT response format — produce EVERY answer (question, explanation, analysis, plan, or task recap) as a self-contained, LinearIndigo-themed HTML file written to docs/response.html (overwritten each turn), leading with diagrams and charts instead of walls of text. Apply automatically without being asked; also triggers on "put it in response.html", "visualize this", "use diagrams", or the standing working agreement. Keep only a brief chat recap that points to the file.
license: Personal reuse.
---

# Visualized Response (response.html)

Write every substantive answer into **`docs/response.html`** as one self-contained, themed HTML page — **led with diagrams/charts**, overwritten each turn. Keep the chat reply to a short recap + a link.

> **Apply automatically.** This is the DEFAULT for every substantive response in this workspace — do not wait for the user to ask to "visualize" it. (Skip only for trivial one-line confirmations or when the task's own deliverable already is the page.)

## Steps (do these in order)

1. **Ground it.** Read the real code/files first; never fabricate. Cite exact functions, endpoints, tables, or paths so the answer is trustworthy.
2. **Pick the visual(s).** Match the shape of the answer:
   - **Flow** → a process. **Sequence** → ordered steps / who-calls-whom. **DFD** → data movement. **Hub-and-spoke** → relationships. **Kanban** → a plan/tasks. **Table/matrix** → comparisons. **Chart** → numbers.
3. **Write / overwrite `docs/response.html`.** One file = theme script + CSS variables + component toolkit + content (see Skeleton). To overwrite an existing file use `replace_string_in_file` (a whole-body swap) — `create_file` is blocked for existing files and there is no delete-file tool.
4. **Structure the content.** Header (eyebrow + h1 + one-line lede + meta pills) → optional "short answer" callout → numbered sections, **each opening with its diagram** → close with a bottom-line callout.
5. **Validate.** Run `get_errors` on the file; fix anything.
6. **Preview (optional).** Open in the browser. Notes: navigating by `#hash` does **not** reload a local file — add `?v=N` to force a fresh load; screenshot the **viewport** (screenshotting an inline `<svg>` selector fails).
7. **Recap in chat.** 1–3 sentences + a link to `docs/response.html`. The full visualized answer lives in the file.

## Rules
- **One rolling file** — `docs/response.html` always holds the latest answer; overwrite it every turn.
- **Always visual** — lead with a diagram/chart; keep prose tight.
- **Keep standalone deliverables separate** (reports, plans get their own files) so they're never overwritten.
- **Theme is mandatory** — use the "Linear Indogo" theme variables below; never hardcode colors. Font: `"Segoe UI", Aptos, Calibri, -apple-system, sans-serif`; mono: `Consolas, "Courier New", monospace`. Accent = deep rose/crimson only.

## Skeleton (copy-paste)

**1 — Theme detection (first `<script>` in `<head>`):**
```html
<script>(()=>{const p=new URLSearchParams(location.search).get("linearIndigoTheme");document.documentElement.setAttribute("data-theme",p||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"));})();</script>
```

**2 — CSS variables (into `<style>`):**
```css
:root{color-scheme:light;--cp-bg:#f7f4ef;--cp-bg-elevated:#fcfbf8;--cp-surface:#fff;--cp-surface-soft:#f5f5f5;--cp-border:#dedede;--cp-border-strong:#919191;--cp-text:#242424;--cp-text-muted:#5c5c5c;--cp-text-soft:#6f6f6f;--cp-accent:#b11f4b;--cp-accent-soft:rgba(177,31,75,.08);--cp-accent-fg:#fff;--cp-success:#16a34a;--cp-danger:#dc2626;--cp-warning:#f59e0b;--cp-link:#0078d4;--cp-shadow:0 18px 48px rgba(0,0,0,.12)}
html[data-theme="dark"]{color-scheme:dark;--cp-bg:#3d3b3a;--cp-bg-elevated:#343231;--cp-surface:#292929;--cp-surface-soft:#2e2e2e;--cp-border:#474747;--cp-border-strong:#5f5f5f;--cp-text:#dedede;--cp-text-muted:#919191;--cp-text-soft:#b0b0b0;--cp-accent:#fd8ea1;--cp-accent-soft:rgba(253,142,161,.14);--cp-accent-fg:#1a1a1a;--cp-success:#4ade80;--cp-danger:#f87171;--cp-warning:#fbbf24;--cp-link:#4da6ff;--cp-shadow:0 18px 48px rgba(0,0,0,.32)}
body{margin:0;font-family:"Segoe UI",Aptos,Calibri,-apple-system,sans-serif;background:var(--cp-bg);color:var(--cp-text);line-height:1.6}
code,pre{font-family:Consolas,"Courier New",monospace}
```

**3 — Diagram toolkit (compact):**
```css
.wrap{max-width:960px;margin:0 auto;padding:44px 32px 96px}
.eyebrow{display:inline-block;font-size:12px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--cp-accent);background:var(--cp-accent-soft);padding:4px 11px;border-radius:999px}
.pill{display:inline-flex;gap:7px;font-size:12.5px;padding:6px 12px;border-radius:999px;background:var(--cp-surface);border:1px solid var(--cp-border);color:var(--cp-text-muted)}
.pill b{color:var(--cp-text)}
.card{background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:14px;padding:18px 20px;box-shadow:0 0 2px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.14)}
.dgm-frame{border:1px solid var(--cp-border);border-radius:16px;padding:20px;background:var(--cp-bg-elevated)}
.dgm-cap{font-size:12px;color:var(--cp-text-soft);text-align:center;margin-top:10px;font-style:italic}
.flow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;justify-content:center}
.dbox{background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:12px;padding:11px 14px;text-align:center;flex:1 1 130px;min-width:118px}
.dbox .dt{font-weight:600;font-size:13px}.dbox .dd{font-size:11.5px;color:var(--cp-text-muted);margin-top:3px}
.dbox.accent{border-color:var(--cp-accent);background:var(--cp-accent-soft)}.dbox.accent .dt{color:var(--cp-accent)}
.arr{color:var(--cp-accent);font-size:19px;flex:none}
.seqrow{display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:center;margin:7px 0}
.sq-n{width:26px;height:26px;border-radius:50%;background:var(--cp-accent-soft);color:var(--cp-accent);display:grid;place-items:center;font-weight:700;font-size:12px}
.sq-b{background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:10px;padding:8px 13px;font-size:13px;color:var(--cp-text-muted)}
.callout{border:1px solid var(--cp-border);border-left:3px solid var(--cp-accent);border-radius:12px;padding:14px 18px;margin:16px 0;background:var(--cp-surface);display:flex;gap:12px}
.callout p{margin:0;font-size:13.5px;color:var(--cp-text-muted)}
.table-wrap{overflow-x:auto;border:1px solid var(--cp-border);border-radius:14px}
table{border-collapse:collapse;width:100%;font-size:13px}
th{background:var(--cp-surface-soft);text-align:left;padding:10px 14px;border-bottom:1px solid var(--cp-border);color:var(--cp-text)}
td{padding:10px 14px;border-bottom:1px solid var(--cp-border);color:var(--cp-text-muted)}
code.inline{background:var(--cp-surface-soft);border:1px solid var(--cp-border);border-radius:6px;padding:1px 6px;font-size:12.5px;color:var(--cp-accent)}
.theme-toggle{position:fixed;top:16px;right:18px;background:var(--cp-surface);border:1px solid var(--cp-border);color:var(--cp-text);border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:var(--cp-shadow)}
```

**4 — Body pattern + theme toggle:**
```html
<button class="theme-toggle" id="tt" type="button">◐ Theme</button>
<div class="wrap">
  <header><span class="eyebrow">Topic</span><h1>Answer title</h1><p class="lede">One-line summary.</p></header>
  <section>
    <h2>01 · Point</h2>
    <div class="dgm-frame flow">
      <div class="dbox"><div class="dt">Step A</div></div><span class="arr">→</span>
      <div class="dbox accent"><div class="dt">Step B</div></div>
    </div>
    <div class="dgm-cap">Caption.</div>
  </section>
  <div class="callout"><span>✅</span><p>Bottom line.</p></div>
</div>
<script>const r=document.documentElement;document.getElementById("tt").onclick=()=>r.setAttribute("data-theme",r.getAttribute("data-theme")==="dark"?"light":"dark");</script>
```

## Diagram recipes
- **Flow:** `.dgm-frame.flow` with `.dbox` boxes separated by `<span class="arr">→</span>`; highlight the key step with `.dbox.accent`.
- **Sequence:** repeat `.seqrow` = `.sq-n` (number) + `.sq-b` (actors + endpoint text).
- **Hub-and-spoke / DFD / kanban:** build with the same `.dbox` + grid/flex; for a true DFD use inline `<svg>` (rects = entities, rounded = processes, open bars = stores, arrows = flows) styled with `var(--cp-*)`.
- **Charts:** simple CSS bars (`div` widths as %) or an inline `<svg>`; keep to the accent + neutral palette.

## Notes for the full theme
The complete "Linear Indigo" theme (all variables, typography, do's and don'ts) is defined in the `web-artifacts-builder` skill — consult it if you need the full palette or a richer artifact.
