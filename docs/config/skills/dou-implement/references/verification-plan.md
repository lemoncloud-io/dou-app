# The verification checklist

For every change, leave a checklist a person can follow to confirm it works. The purpose
is to **make verification status visible** — what was confirmed, what still needs a human
look, and where the regression risk sits.

This is a document, not a script. It covers both what the automated tests already hold
and what tests cannot reach.

## Format

Attach it at the end of the response. Give each unit of change its own section.

```markdown
## Verification

### Change: <one line on what changed>

- [x] Unit tests pass: `npx jest libs/data/.../Foo.test.ts` — 6 passed
- [ ] <manual/integration check — specifically how to do it>
- [ ] Regression risk: <what could be affected> — <how to check it>
```

## Honest boxes

- `[x]` is **only** for something actually run in this work. Tests that were run and
  passed get the box, plus the command and the result (`6 passed`).
- `[ ]` is for what the reader has to do themselves, or what cannot run in this
  environment. Say what to do and how, so they can follow it straight off.
- Never check something that was not checked. The checklist is worth having only because
  it is honest.

## What goes in it

- **Automated** — which tests cover the change, the command, the result.
- **Manual** — UI behaviour, what is drawn, user flows: anything a person has to look at.
  Where it needs the app running, say which screen and what to look for.
- **Integration points** — the other modules, APIs or cache layers this touches, and
  whether the contract still holds.
- **Regression risk** — other callers of the same function or type, what could break,
  and how to check.

## Example

```markdown
## Verification

### Change: CloudRepositoryV2 now mirrors a remote get into the local cache

- [x] Unit tests pass: `npx jest libs/data/src/data/repositories-v2/CloudRepositoryV2.test.ts` — 4 passed
- [x] Cache-miss → empty-list contract still holds (no regression in the existing tests)
- [ ] Watch rows accumulate locally when cloud is queried from the testbed DBBrowser
- [ ] Regression risk: ChannelRepositoryV2 shares the contextProvider — check with `npx jest ChannelRepositoryV2`
```
