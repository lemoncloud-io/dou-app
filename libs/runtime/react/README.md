# @chatic/runtime-react

**The runtime a React app imports.** One name, `runtime`: the same object the headless
[`@chatic/runtime`](../README.md) sells, with the hook groups on it, and beside it the domain's names
([ADR-0378](../../../docs/adr/0378-a-react-app-imports-one-runtime-from-runtime-react.md)). The four React
apps — `apps/web`, `apps/desktop-web`, `apps/admin` and `apps/landing` — import the runtime from here and
from nowhere else; their lint refuses `@chatic/runtime` in an app's call part.

```tsx
import { runtime } from '@chatic/runtime-react';

const ChannelList = () => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
};
```

A consumer with no React — a CLI, an MCP server — imports `runtime` from `@chatic/runtime` instead.

## What is here

The React half of the runtime: the hooks (`hooks/` under each group), the connection host
(`RuntimeConnectionHost`, `RuntimeAuthHost`). The react-query keys and the rules a hook caches by come
from the headless package, so a hook here only binds them to React. Each group barrel re-exports the
headless group through its subpath (`export * from '@chatic/runtime/session'`) and adds its hooks, and the
facade takes `boot`, `report` and the host ports from `@chatic/runtime/facade` unchanged — so every
headless name is the very same value here. [`src/public-surface.test.ts`](./src/public-surface.test.ts)
holds both: today's 151 symbols, and each headless name equal to the headless one. How the pieces work is
documented with the headless package, in [`libs/runtime/docs/`](../docs/).

`@chatic/runtime-react/testing` is the headless fake built over this facade (`fakeRuntimeOf`), so a mocked
group keeps its real hooks.

`@chatic/runtime-react/react-utils` is a separate entry for generic React utilities that came from
`@chatic/shared` (which still re-exports them): `useCustomMutation`, `useDebounce`, `useInterval`,
`useGlobalLoader` with its `useLoaderStore`, `useVersionCheck`, and `waitForDestination`. They know nothing
about the runtime, so they are not part of the facade or of `public-surface.test.ts`, and the "two apps or
more" rule below is about the facade's domain hooks, not these. The session and data hooks import
`useCustomMutation` from `src/reactUtils/` by relative path.

A test mocks the package the app imports:

```ts
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        data: { useRuntimeRepositories: () => repositories },
    })
);
```

## Rules

- **Same names only.** Every name re-exported from `@chatic/runtime` keeps its name; nothing here sells an
  existing symbol under a second one. A new capability lands in `@chatic/runtime` first.
- **Two apps or more.** A hook belongs here when two or more apps use it; a hook or screen state one app
  uses stays in that app.
- **Tags.** `layer:binding`, `platform:web`, `formfactor:any`. The platform is `web` while what this package
  re-exports still reaches the DOM (`@chatic/host-web-browser`'s image code, `useVersionCheck`'s `fetch` of
  `/version.json`); it becomes `platform:any` when those leave.
- **Mock what the app imports.** A test mocks `@chatic/runtime-react`, never `@chatic/runtime`: once the
  hooks live here, a mock of the headless package would leave them real. Lint bans the import, not the mock.
- **Resolution.** The package sits at `libs/runtime/react`, one folder deeper than the jest catch-all
  `^@chatic/(.*)$` assumes, so a jest config that maps that catch-all lists `@chatic/runtime-react` and its
  `/testing` and `/react-utils` before it, as `apps/web`'s does — and `^@chatic/runtime/(.*)$` too, since the group barrels
  re-export the headless package's subpaths (`@chatic/runtime/session`, …) that the catch-all would send to a
  folder that does not exist. Vite and vitest resolve them through the tsconfig paths.
