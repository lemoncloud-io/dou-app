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

## What is here today

This package re-exports `@chatic/runtime` unchanged, and `@chatic/runtime-react/testing` re-exports its
fake (`fakeRuntimeModule` and the browser ports). The React code — the hooks, the connection host and the
binders that tie the engine to a mount — still lives in `@chatic/runtime` and moves here in the next
step, after which `@chatic/runtime` keeps no hook groups. Until then the facade's documentation is
[`libs/runtime/README.md`](../README.md).

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
  re-exports still reaches `@chatic/shared` and the DOM; it becomes `platform:any` when those leave.
- **Mock what the app imports.** A test mocks `@chatic/runtime-react`, never `@chatic/runtime`: once the
  hooks live here, a mock of the headless package would leave them real. Lint bans the import, not the mock.
- **Resolution.** The package sits at `libs/runtime/react`, one folder deeper than the jest catch-all
  `^@chatic/(.*)$` assumes, so a jest config that maps that catch-all lists `@chatic/runtime-react` and its
  `/testing` before it, as `apps/web`'s does.
