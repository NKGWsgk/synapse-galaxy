<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Team setup

This project uses a multi-agent team. Custom agents live in `.claude/agents/`:

- **ui-builder** — Frontend (React/Tailwind/SVG) implementation. Always invokes `visual-qa` after visible changes.
- **visual-qa** — Verifies UI changes via dev server screenshots and DOM measurement. The team's eyes.
- **data-engineer** — Supabase, API routes, OGP/Amazon/Gemini integrations. Never touches visual layout.

The main agent (you) is the **planner / orchestrator**: align with user intent, dispatch to specialists, keep scope tight.

## Hard team rules

1. **Visual changes must pass `visual-qa` before being declared done.** Type-check passing ≠ visual correctness. We've been burned multiple times by code that compiled but rendered wrong.
2. **Quote the user's intent verbatim** in agent prompts. Paraphrasing causes drift (e.g. "arrow pointing toward target" ≠ "arrow tip lands on target card edge").
3. **Use `Edit`, not `Write`,** for existing files unless doing a full rewrite.
4. **No speculative refactors.** A bug fix doesn't need surrounding cleanup.
5. **TypeScript check is mandatory before declaring any code change done:**
   `npx tsc --noEmit --project /Users/nkgws/synapse-galaxy/tsconfig.json`

## When to use which agent

| Task type | Agent |
|-----------|-------|
| "Move this button" / "Change the layout" / "Animation" | ui-builder |
| "Verify this looks right" / "Take screenshot" / "Check rendering" | visual-qa (often called by ui-builder, can be called directly) |
| "Add API endpoint" / "Schema change" / "Fix OGP fetch" | data-engineer |
| "Plan this feature" / "Decide priority" / "Resolve ambiguity with user" | main agent (no delegation) |

## Synapse Galaxy domain notes

- **Two views:** Ring view (4×4 grid hub + 12 ring cells) and Global map (BFS-spread CSS grid). Both in `src/components/galaxy/FocusCompass.tsx`.
- **Synapse semantics:** A synapse is a directional connection (`source_url` → `target_url`) with a `description`, `keywords[]`, and 4 AI-scored dimensions (`dim_rika`, `dim_bunkei`, `dim_art`, `dim_time`).
- **Arrow design contract:** Arrow tip lands at the **target card's edge** (not at the center, not in the middle of the line). The line ends just before the arrow base via `lineEndBeforeArrowTip()`.
- **CSS gap reality:** SVG viewBox is 100×100 with `preserveAspectRatio="none"` for the ring view, but cells do NOT span 25 user units — CSS `column-gap`/`row-gap` reduces actual cell size. Layout is measured at runtime via `RingGridLayout` + `cellRectPct()`. **Never assume gap=0 in user space.**
