---
name: dou-plan
description: >-
    Settle scope, non-goals and how a change will be verified, and publish an HTML plan with a target-structure
    diagram before any code is written. Use whenever a new feature, a refactor, a behaviour change across modules
    or a decision is requested in this repo ("add X", "let's build", "refactor Y", "how should we"), and before
    handing work to subagents or new sessions. Not for a bug fix with its test, or a question.
---

# dou-plan

No code before the person agrees to the plan. The plan is an HTML artifact, not a file in the repo.

1. **Read first**: the touched modules' `README.md`/`docs/` and the pattern's exemplar (AGENTS.md); copy its shape.
2. **State three things**, each in a sentence or a short list:
    - **Scope** — what changes, by path.
    - **Non-goals** — what is deliberately left alone, and why.
    - **Verification** — which methods from [`dou-verify`](../dou-verify/SKILL.md) you will run and what each
      will show. "Tests pass" is not a verification choice; name the scenario, the fault or the invariant.
3. **Draw the target structure**: files or modules before and after, and the data or message flow that changes.
   A mermaid diagram in the page is enough.
4. **Place every step** ([`references/placement.md`](./references/placement.md)): where, model, effort, cache impact.
   Disjoint files may go to subagents; they never stage, commit or stash; re-run the gate after integrating.
5. **A decision needs an ADR.** Write its `Alternatives` now, while the options are still in your head.
6. **Publish and ask.** One HTML page ([`references/plan-page.md`](./references/plan-page.md)), then one
   question: go ahead, or change what. Record its URL: every implementation brief and subagent gets it, and
   `dou-verify` checks the result against it.

Values words cannot pin down (colour, easing, spacing, priority): a live editor ([`tuning-editor.md`](./references/tuning-editor.md)).

Skip the page for a bug fix with its test that needs no decision; still say the verification choice.
