# tools/eslint-rules

**The workspace's own ESLint rules.** `@nx/eslint-plugin` loads this folder by convention — it
requires `index.js` and `tsconfig.json` to be here — and offers each rule it exports as
`@nx/workspace-<name>`. The root `eslint.config.mjs` turns them on; no plugin has to be registered.

Nx also lists this folder among every project's lint inputs, so a change to a rule re-lints every
project instead of being served from cache. That is the reason a rule more than one project uses
belongs here rather than inline in a config file.

| Rule                  | Turned on as                        | What it does                                                                                                 |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `runtime-wiring-call` | `@nx/workspace-runtime-wiring-call` | Reports a runtime wiring call outside the assembly point. Catalogue and allowed file are in the root config. |

## Adding a rule

Write it as plain CommonJS next to the others, export it from `index.js`, and give it a
`<name>.spec.js` that runs it through ESLint's `RuleTester`. `npx nx test eslint-rules` runs the specs;
CI runs them with every other project's tests.
