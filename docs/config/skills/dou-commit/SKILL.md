---
name: dou-commit
description: >-
    This repo's commit message convention — conventional commits, enforced on every commit
    by the husky commit-msg hook running commitlint. Read and follow this before writing a
    commit message here. How to commit at all (staging, heredocs, never skipping hooks) is
    not this file's subject; it fixes only the type, scope and tone this repo uses.
---

# dou-commit

`commitlint.config.js` takes `@commitlint/config-conventional` as-is and the husky
`commit-msg` hook enforces it on every commit, so a message in the wrong shape is
rejected outright. Get the shape right before committing.

Commit messages are in English — `AGENTS.md` § Language names them explicitly.

## Shape

```
<type>(<scope>): <description>
```

- **type** — one of `feat` `fix` `refactor` `docs` `test` `style` `build` `ci` `chore`
  `perf` `revert`, whichever matches what actually happened. When a commit mixes
  several, pick the dominant one.
- **scope** — the `lib`/`app` directory touched (`data`, `app-runtime`, `web`,
  `desktop-web`, `ui-kit`, `config`, `mobile`, …). Comma-join several
  (`feat(web,mobile,data): …`). For a repo-wide change, use the subject instead — this
  repo's `AGENTS.md` is `agents`. Omit it only when nothing fits.
- **description** — lower case, no trailing period, stating what changed rather than
  commanding. Record the **fact that changed**, not the implementation detail.

## What this repo's log looks like

```
docs(agents): add the stale-dist and nx-sync verification traps
fix(app-runtime): end a server-revoked relay session on auth.switch
refactor(config): remove dead wiring left by web-config
feat(app-runtime): register the push device once per install, not on every launch
feat(web,mobile,data): hide what happened before I rejoined (ADR-0067)
refactor(web/home): make the last-chat preview a pure cache read
docs(cache): sync the cache docs with the post-ADR-0051 code
```

The patterns worth copying:

- **Contrast with what it was** — "not X", "not on every launch" — and the intent stops
  needing explanation. Prefer this tone.
- A commit carrying a decision may end with its ADR in parentheses (`(ADR-0067)`). That
  is about commit messages and PR bodies; `AGENTS.md`'s rule against referencing an ADR
  from a source comment is a different rule.
- Scope goes as deep as a sub-area (`web/home`). Narrow it to what actually changed
  rather than lumping it under the whole app.

## Do not

- Drop the type, or blur the scope away (`update stuff` is not this repo).
- Start the description with a capital or end it with a period — `config-conventional`
  does not reject it, but every commit here follows the style.
- Force unrelated concerns into one commit. When the type or the scope splits, the
  commit splits.
