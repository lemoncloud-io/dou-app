# Commit messages

`commitlint.config.js` extends `@commitlint/config-conventional`; the husky `commit-msg` hook rejects anything
else. English.

```
<type>(<scope>): <description>
```

- **type**: `feat` `fix` `refactor` `docs` `test` `style` `build` `ci` `chore` `perf` `revert` — the dominant one.
- **scope**: the lib or app touched (`data`, `runtime`, `web`, `desktop-web`, `mobile`, `config`, …), as deep as a
  sub-area (`web/home`); comma-join several. `agents` for AGENTS.md and the skills.
- **description**: lower case, no trailing period, the fact that changed. Contrast with what it was ("not on
  every launch"). A commit carrying a decision may end with `(ADR-0NNN)`.
- Lines of the body stay at 100 characters or fewer.
- One concern per commit: when the type or the scope splits, the commit splits.
- End with a `Verified-by:` trailer naming the methods that actually ran, from the verification report:
  `Verified-by: gate, web-e2e, chaos`, or `Verified-by: none` (by convention with the reason in the body). The commit
  hook blocks a commit whose `yarn gate` fails (`gate-before-commit: enforce`) and only logs a missing trailer
  (`verified-by-trailer: observe` in `.claude/hooks/modes.json`). A gate that could not run (timeout, no merge
  base, `node_modules` out of sync with `yarn.lock` per `yarn check --integrity`, stale `dist/out-tsc` (TS6305), a `cd` or `-C` the hook cannot
  resolve) and a `wip` commit pass with a note instead.

```
fix(runtime): end a server-revoked relay session on auth.switch
feat(runtime): register the push device once per install, not on every launch
refactor(web/home): make the last-chat preview a pure cache read
```
