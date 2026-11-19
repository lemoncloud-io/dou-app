# tools/eslint-rules

**The workspace's own ESLint rules.** `@nx/eslint-plugin` loads this folder by convention — it
requires `index.js` and `tsconfig.json` to be here — and offers each rule it exports as
`@nx/workspace-<name>`. The root `eslint.config.mjs` turns them on; no plugin has to be registered.

Nx also lists this folder among every project's lint inputs, so a change to a rule re-lints every
project instead of being served from cache. That is the reason a rule more than one project uses
belongs here rather than inline in a config file.

| Rule                  | Turned on as                        | What it does                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-wiring-call` | `@nx/workspace-runtime-wiring-call` | Reports a runtime wiring call outside the assembly point. Catalogue and allowed file are in the root config.                                                                                                                                            |
| `host-facts`          | `@nx/workspace-host-facts`          | Reports `isNative()`, `isNativeApp()` and a `CHATIC_APP_*` read off `window` outside the allowed files. The allow-list is `host-facts-allowlist.js`, here so a change to it re-lints every project.                                                     |
| `host-port-kind`      | `@nx/workspace-host-port-kind`      | Reports a read of `kind` off the host ports named in its `ports` option (`runtime.links.kind`, or through a local bound to the port), so a feature calls the port's members instead of branching on its side. Off for `apps/*/src/config/**` and tests. |

## Adding a rule

Write it as plain CommonJS next to the others, export it from `index.js`, and give it a
`<name>.spec.js` that runs it through ESLint's `RuleTester`. `npx nx test eslint-rules` runs the specs;
CI runs them with every other project's tests.
