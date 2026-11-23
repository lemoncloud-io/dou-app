# tools/jest

**What every jest project in `apps/` and `libs/` runs on.** Why: ADR-0371.

| File                         | Used as                                                              | What it does                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsdom-environment.js`       | `testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js'` | jsdom plus Node's `TextEncoder`/`TextDecoder`. Fails the test during which jsdom reported "not implemented" (navigation, `HTMLMediaElement.pause`, …) and names the API; a report after the last test fails the file. |
| `import-meta-transformer.js` | ts-jest `astTransformers.before`                                     | Rewrites `import.meta` for CommonJS: `env` is a production build (`MODE: 'test'`, `PROD: true`); `url`, `filename`, `dirname` are the module's own. Bump `version` with any edit: it is ts-jest's cache key.          |
| `adoption.spec.js`           | `nx test jest-harness`                                               | Fails a jest config or test docblock that uses bare `jsdom`, or a ts-jest transform without the transformer.                                                                                                          |

A test file that needs jsdom in a `node` project names the environment by path in its docblock:
`@jest-environment ../../tools/jest/jsdom-environment.js` (resolved from the project root).

A test that reaches a navigation or a media call passes the app's code a stub: give the function a parameter
or prop whose default is the browser call (`reload = () => window.location.reload()`), and pass `jest.fn()`
from the test.

To see a guard work, undo its fix: drop the transformer from `apps/web/jest.config.js` and
`npx jest src/app/config/shellKvAdapter.test.ts` fails with `Cannot use 'import.meta' outside a module`.
