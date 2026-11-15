# apps/mobile/e2e — device scenarios

One Maestro flow per scenario under `flows/<feature>/`, named after the feature's folder in
`apps/web/src/app/features`; sub-flows scenarios include under `flows/_shared/`; the fictional test
account under `fixtures/`. They run through `yarn mobile:verify` — opt-in, never a gate. With
`--session-owner native` the same scenarios run on the app's own runtime: `_shared/fresh-guest.yaml`
switches it on through `_shared/native-session-owner.yaml`.

How the runner works and how to write a scenario:
[`docs/release/device-verify.md`](../docs/release/device-verify.md).
