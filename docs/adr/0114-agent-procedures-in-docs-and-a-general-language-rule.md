# ADR-0114: keep agent procedures in `docs/`, and make the language rule general

> Status: Accepted · Decided: 2026-09-17
> Scope: `docs/config/skills/**` · `AGENTS.md` · `package.json` (one hint string)
> Related: [ADR-0100](./0100-libs-data-doc-canon-and-layer-flattening.md) (the doc-canon rules these
> procedures defer to)
> · Merged as ADR-0104, a number the `apps/web` form-factor decision had already taken; the
> `ADR-0104` in #466 means this record

## Context

`AGENTS.md` says how a change should be verified — run the gate for the projects you touched, check
whether a decision needs an ADR, keep the module doc in step, fill the PR template. What it does
not have is anything that walks that list. It is followed from memory, which means sometimes.

Three procedures for the rest of the work — how code gets written, how a commit message is shaped,
how a PR is filled in — did exist, but only on one machine. `.gitignore:2` excludes `/.claude`
entirely, so `git ls-files .claude` returns nothing and a session opened by anyone else got none of
them. The repo's whole agent surface was `AGENTS.md` and the `CLAUDE.md` that points at it. Amazon Q
rules under `.amazonq/rules/` were already tracked, so the asymmetry was Claude's alone.

Two other things surfaced while settling this.

`AGENTS.md` § Language listed five places English is required. A list decides nothing about what is
not on it, and two such cases were live: test names, split roughly evenly across the repo, and the
procedure files this change was about to add.

`package.json`'s `mobile:local:check` pointed at `apps/mobile/docs/local-run.md`, which moved to
`docs/release/` in the docs-tree reorganisation. Every other reference followed; this one did not.
It is the message printed when the local run refuses to start.

## Decision

1. **The procedures live in `docs/config/skills/`, as four documents** — `dou-implement`,
   `dou-review`, `dou-commit`, `dou-pr` — and `.gitignore` is not touched.

2. **`AGENTS.md` lists them and says to open them.** The list carries a name and when to open it,
   nothing else.

3. **The procedures hold no standards.** Each check names the `AGENTS.md` section that owns it and
   says to open it. Where the two disagree, `AGENTS.md` wins.

4. **`dou-review` reviews the working tree before a commit**, not a pull request, and reports to
   the person: findings with `file:line`, a proposed fix each, and the decision on what to apply
   left to them.

5. **§ Language becomes general** — everything written into the repo is English — **with one
   exception, stated as a path**: translation resources under `**/locales/**` and `**/i18n/**`.
   Test names are not an exception. Names written before this was settled stay as they are.

6. **Three rules the repo was applying without stating are written down**: § Public surface (no
   internal paths or private issue numbers, because the repo is public and must stand on its own),
   § Branch names (a name carries the domain noun of the work), § Working order (agree, implement,
   review, ship — with review before the commit).

7. **The `mobile:local:check` hint points at the file that exists.**

## Alternatives

**Opening `.gitignore` and tracking `.claude/skills/`.** This is the only arrangement that gets
automatic discovery, and it was the first plan. It was dropped because the discovery path cannot be
narrowed to what we would want tracked: `.claude/settings.local.json` holds absolute paths from a
developer's home directory, and this repo is public, so the arrangement puts a machine-local file
one mistake away from publication. A whitelist in `.gitignore` reduces that risk without removing
it.

**A symlink from `.claude/skills` to the documents.** Same exposure — the symlink still has to be
tracked, so `.gitignore` still has to open — with the added uncertainty of how a symlinked config
directory is treated.

**Prose in `AGENTS.md` instead of separate documents.** `AGENTS.md` is loaded in full every session,
so everything added to it is paid for on every turn. A review procedure with its subagent layout and
reporting order would roughly double the file to serve one kind of turn.

What all three cost us is automatic invocation, and what pays for it is that `AGENTS.md` is loaded
every session: a line saying which file to open before doing X is close to the same thing. The repo
already works this way — "before editing a module, read its own `README.md`" is the same mechanism.
The documents keep the `SKILL.md` name and front matter, so if the trade turns out wrong, copying
them into `.claude/skills/` is the whole migration.

**Leaving § Language as a list and adding two entries.** The list would have been correct again and
undecided about the next thing added. The general rule with a path-shaped exception has no such
gap, and costs the exception being stated once.

## Consequences

Anyone cloning this repo gets the same four procedures, and they are readable by a person and by
tools other than Claude Code — which matters here, since `.amazonq/rules/` is tracked and rules
splitting per tool is a real risk.

Nothing triggers automatically. The catalogue in `AGENTS.md` is the only thing pointing at these
documents, so the folder, each file's front-matter `name` and the catalogue have to agree, and that
agreement is the whole wiring.

The review step costs real time — four subagents over a 1,450-line change took about ten minutes of
wall-clock in the pass that validated it. It found a confirmed defect that no test covered, a stale
contract in another shell, and the two CI-excluded projects the change touched. Whether that trade
holds for a small change is not settled; a reduced mode is the likely answer.

§ Language now makes four existing files wrong, three of them ADRs carrying internal paths, and
§ Public surface is what they are wrong against. They are not fixed here — each needs its own
judgement about what to say instead.
