# ADR-0105: An ADR number is permanent, and CI reads the links

> Status: Accepted · Decided: 2026-09-17
> Scope: `AGENTS.md` · `scripts/check-doc-links.js` · `.github/workflows/verify.yml` ·
> `docs/adr/**` · `apps/**` · `libs/**` (the citations repointed by this change)
> Related: [ADR-0100](./0100-libs-data-doc-canon-and-layer-flattening.md) (the doc-canon work whose
> renumbering this cleans up after)

## Context

Parallel branches each took "the next ADR number" from the state of their own branch, so the same
number was handed out more than once: three files were called `0027-*`, three `0033-*`, three
`0045-*`, four `0047-*`. On 2026-09-15 that was tidied up — 17 files were renumbered into the 0086
to 0102 range so every number was unique again.

The rename moved the files and updated nothing that pointed at them. The cost, measured on
2026-09-17:

- **65 dead relative links**, about half of them ADR-to-ADR (`[ADR-0033](./0033-relay-dm-invite-and-auth-parallel-tracks.md)`
  against a file that is now `0089-…`).
- **458 `ADR-00NN` citations written under the old numbering** — 274 of them in source comments —
  where the number is now held by an unrelated decision. ADR-0074 opened with "reversing ADR-0047's
  exclusion of `desc`" while ADR-0047 had become the reaction/thread ADR; the place-detail decision
  it meant is ADR-0095.

The second class is the expensive one. A dead link announces itself; a reused number does not. It
resolves, to the wrong record, and the reader has no signal that anything is off.

Nothing in the repo could have caught either. Lint reads source, typecheck reads types, tests read
behaviour — a document is the one artifact no step opens.

## Decision

1. **A number, once taken, is never reused** — not for a deleted ADR, not for a renumbered one. Take
   the next free number and leave the gaps (38, 61, 64, 65, 69 and 78 are gaps today, and stay
   gaps). The number is the name every other document and comment refers to; reusing it silently
   redirects all of them.

2. **Renumbering is a rename plus repointing everything that referred to the old number, in the same
   change.** Not a follow-up. The people who know which of three `0033`s a comment meant are the
   ones doing the renumber, and that knowledge does not survive the week.

3. **`yarn check:doc-links` gates two invariants,** and runs in `verify.yml` ahead of lint — it needs
   no build and is the cheapest step in the file:
    - every relative markdown link resolves to a file that exists (the `path.ts:42` suffix
      convention is understood and stripped);
    - every link **labelled** `ADR-00NN` points at `docs/adr/00NN-*.md`. That mismatch is the exact
      residue a renumber leaves, and it is decidable without knowing anything about the content.

4. **Bare `ADR-00NN` prose stays unchecked, deliberately.** It carries no target, so no gate can
   judge it — which is the argument for decision 2 rather than for a cleverer script.

The 458 citations were repointed in this change. Where the number alone was ambiguous, the referent
was recovered from the commit that introduced the line (the ADR its PR also touched), and read by
hand where that was silent. `CHANGELOG.md` was deliberately left alone: its entries record what a
release said at the time, and editing them would falsify that.

## Alternatives considered

**Renumber the ADRs back / renumber again so numbers read chronologically.** Every renumber has the
cost this ADR exists to describe, and doing it again pays it twice for a cosmetic ordering.

**A redirect file per vacated number.** It fixes links, and does nothing for the bare mentions that
are the actual damage — while adding 17 files that exist only to apologise for a rename.

**Check bare `ADR-00NN` mentions against a per-ADR keyword list.** Tried while repairing this: the
text-only classifier disagreed with the commit-history signal on 45 of 252 decidable citations, and
the commit was right nearly every time. A gate that is wrong one time in six trains people to
ignore it.

**Leave it to review.** This is what happened. The renumber was reviewed and merged.

## Consequences

- ADR numbers are now write-once, so the sequence has holes and is not a count of decisions. That is
  the price of a stable name.
- A new CI step can fail a PR for a documentation-only reason. It is green across all 241 tracked
  markdown files today, and its failure output names the file, the link and the mismatch.
- The label/target rule only bites on links written `[ADR-00NN](…)`. A link labelled with prose
  ("the relay DM decision") is not checked, which is intended — the rule is about the shape a
  renumber breaks, not about link style.
- Source comments still cite ADRs in 608 files, which `AGENTS.md` forbids ("never reference an ADR
  in a source code comment"). This change corrected their numbers; it did not remove them. Rewriting
  those comments to carry the reasoning in their own words is a separate piece of work, and until it
  happens the citations are at least pointing at the right records.
