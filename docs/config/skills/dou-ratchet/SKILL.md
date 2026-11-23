---
name: dou-ratchet
description: >-
    Turn a repeated correction or a repeated CI failure into something a machine enforces — a type, a lint
    rule, a test or a check script — so it cannot pass again. Use when the person corrects the same thing a
    second time, says "again" or "I told you", when CI fails twice for the same cause, when a revert happens,
    or when asked to make a rule stick.
---

# dou-ratchet

Prose is the weakest enforcement. Pick the strongest that fits, in this order:

1. **A type** that makes the wrong code not compile (a branded id, a discriminated union, a required field).
2. **A lint rule** in `tools/eslint-rules/`. Copy `runtime-wiring-call.js` and its `.spec.js`; register it in
   `index.js` and `eslint.config.mjs`.
3. **A test** that fails on the mistake (a contract test, a snapshot of a public surface).
4. **A check script** `scripts/check-<name>.js` with a test in `scripts/__tests__/` and a `check:<name>` entry.
5. **A Claude Code hook** in `.claude/settings.json` when the mistake is in how the agent works, not in code.
6. **One line in AGENTS.md or a skill** only when nothing above can express it; it costs instruction budget.

Steps:

- Write the failing case first: a fixture with the mistake must fail the new rule.
- Existing violations go into a baseline that only shrinks, never into a blanket disable.
- New hooks start in `observe` (`.claude/hooks/modes.json`); a question no machine can check becomes a `REVIEW.md` item.
- Remove the prose the rule replaces in the same change; leave only the command name.
- The PR says which correction or CI failure it came from (in words, no internal links).
