# The plan page

One HTML artifact per plan. Sections, in this order:

1. **Scope · non-goals · verification** — three short cards.
2. **Target structure** — a mermaid diagram of what changes (modules, files, messages), and a before/after
   tree when files move.
3. **Steps** — a table: step, files it owns, where it runs, model, effort, cache impact, how it is checked.
4. **What moves where** — when rules, code or docs move, a table of source → destination.
5. **Decisions** — each with the recommendation first and the alternatives dropped; the ones that become an
   ADR are marked.
6. **Open questions** — only what the person must decide. Numbered, one line each.

Rules:

- Real paths and real names; no placeholder content.
- The page is a working artifact. It never gets committed; link it from the PR's `To Reviewers`.
- Republish the same file to the same URL when the plan changes; say what changed in one line.
