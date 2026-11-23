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

1. **Read first.** The `README.md` and `docs/` of every module the change touches, and the exemplar for the
   pattern you will write (AGENTS.md § Copy these). Copy the exemplar's shape; do not invent a new one.
2. **State three things**, each in a sentence or a short list:
    - **Scope** — what changes, by path.
    - **Non-goals** — what is deliberately left alone, and why.
    - **Verification** — which methods from [`dou-verify`](../dou-verify/SKILL.md) you will run and what each
      will show. "Tests pass" is not a verification choice; name the scenario, the fault or the invariant.
3. **Draw the target structure**: files or modules before and after, and the data or message flow that changes.
   A mermaid diagram in the page is enough.
4. **Place every step** with the columns in [`references/placement.md`](./references/placement.md): where it
   runs, model, effort, cache impact. Independent steps that touch disjoint files can go to subagents or
   sessions; two writers never share a file, subagents never stage, commit or stash, and the gate re-runs after
   their work is integrated.
5. **A decision needs an ADR.** Write its `Alternatives` now, while the options are still in your head.
6. **Publish and ask.** One HTML page ([`references/plan-page.md`](./references/plan-page.md)), then one
   question: go ahead, or change what. Unclear terse answers get restated before you build.

Skip the page for a bug fix with its test that needs no decision; still say the verification choice.
