# Chatic

Nx monorepo (`apps/`, `libs/`); commands are in [`README.md`](./README.md). Branches start from `origin/develop` and
carry the domain noun of the work (`fix/revoked-session-recovery`, never a bare generated suffix).

## Working order

Plan → code → verify → ship. Skills live in [`docs/config/skills/`](./docs/config/skills/) (linked from `.claude/skills/`);
open the one that applies and follow it.

| Skill              | Open it when                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| `dou-plan`         | a feature, refactor or multi-file change is asked for, before writing code |
| `dou-verify`       | code changed and is about to be called done                                |
| `dou-e2e`          | a web screen or flow changed, or a feature has no scenario                 |
| `dou-chaos`        | session, transport, sync or retry code changed                             |
| `dou-load`         | lists, caches, paging or performance changed                               |
| `dou-property`     | state transitions, merging or ordering logic changed                       |
| `dou-failure-hunt` | before a release, after an incident, or asked to find what could break     |
| `dou-ratchet`      | the same correction or the same CI failure came back                       |
| `dou-cleanup`      | removing comments from a project, or lowering a ratchet baseline           |
| `dou-ship`         | a change is finished: review, commit, PR                                   |
| `dou-metrics`      | harness or delivery metrics are asked for, or a lane has merged            |

Where a task runs, on which model and effort: [`placement.md`](./docs/config/skills/dou-plan/references/placement.md), agents in `.claude/agents/`.

## Copy these, not prose

- Repository hook: `apps/web/src/app/features/pairing/hooks/usePairingDevices.ts`
- Screen: `apps/web/src/app/features/mypage/pages/NotificationSettingsPage.tsx` and its `.test.tsx`
- Bridge message: [`libs/bridge-messages/README.md` § Adding a message](./libs/bridge-messages/README.md#adding-a-message), e.g. `SetBadgeCount` in `src/types/`
- e2e scenario: `apps/web-e2e/src/specs/room-mute.spec.ts`

## Machine-checked rules

`yarn gate` (affected lint, typecheck, test; by hand per `dou-ship` until it exists) · `check:doc-korean` · `check:code-korean` ·
`check:internal-paths` · `check:doc-links` · `check:env` · `node scripts/check-instructions-size.js` · commitlint. Write no new
comments (a lint ratchet enforces it); allowed: published SDK public-API JSDoc, `eslint-disable` with a reason, license headers.

## Language and public surface

Everything written into the repo or onto GitHub is English. Two exceptions, both by path: translation resources
(`**/locales/**`, `**/i18n/**`) and the `.ko.md` author documents inside `libs/chatic-apps-sdk/` and
`libs/chatic-apps-devtools/`, which change in the same PR as their English pair. Chat with the user is unaffected.
The repo is public: no paths or issue/PR numbers from an internal store. Plans and reports go in the PR or an HTML artifact.

## Module docs and ADRs

- Read a module's `README.md` and `docs/` before editing it; update them in the same change when behaviour moves. Code with no
  feature folder is documented by category (`docs/bridge/`).
- A module's `docs/`: every category folder has a `README.md`, names answer "does this belong here?" (no `misc`, `common`,
  `architecture`), depth stops at `docs/<category>/<topic>.md`, nothing else directly under `docs/`. For `apps/web`,
  `diff <(ls apps/web/src/app/features) <(ls apps/web/docs/feature)` prints nothing.
- Root `docs/` holds `adr/`, `infra/` and `config/skills/` only. A decision gets one numbered English ADR; a number is never
  reused, a superseded ADR keeps its file, and renumbering repoints every mention, bare `ADR-0NNN` prose included. Source code never names an ADR; the module doc carries the reasoning.

## Reviewing a change

Gate `npx nx show projects --affected --base=origin/develop`; a project `.github/workflows/verify.yml` excludes is run
by hand and named in the PR. Questions the diff triggers: [`REVIEW.md`](./REVIEW.md). Procedure: `dou-ship`.
