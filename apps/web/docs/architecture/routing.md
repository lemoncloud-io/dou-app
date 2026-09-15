# routing — the three route tables and the `ROUTES` builder

`apps/web/src/app/routes` centralizes router creation, the authenticated/unauthenticated split, and
error handling. `routes/index.tsx` builds one of two route sets straight off
`runtime.session.useSessionAuth().isAuthenticated`:

```ts
const baseRoutes = isAuthenticated
    ? [...privateRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.root} replace /> }]
    : [...publicRoutes, ...commonRoutes, { path: '*', element: <Navigate to={ROUTES.auth.login} replace /> }];
```

There is no separate auth-guard component — the branch above _is_ the guard, and it renders nothing
until `isInitialized` is true. `routes/PrivateRoutes.tsx`, `PublicRoutes.tsx` and
`CommonRoutes.tsx` hold the three tables:

- **`privateRoutes`** — behind `UnifiedLayout`, mounted only when authenticated. Eight feature
  groups are lazy-imported and composed under one `/` parent: `mypage`, `subscription`, `account`,
  `channels`, `place`, `invite`, `search`, `onboarding`. `home` is not lazy — it is the index route.
- **`publicRoutes`** — the signed-out root. It renders nothing and waits for the background guest
  login to flip `isAuthenticated`; it must not redirect to `/auth/login`, which is a shim that
  forwards back to `/` and would loop.
- **`commonRoutes`** — reachable from both states: `/auth/*`, the `/s` share-link redirect, and
  `/invite/accept` (deliberately not private, because an invite deeplink often lands before the
  background guest login finishes, and the signed-out `*` fallback would otherwise drop its query
  string).

A feature owns its own relative paths; `routes/` composes them by importing each group's own
`routes/index.tsx` under a `<group>/*` prefix, for example:

```tsx
const ChannelRoutes = lazy(() => import('../features/channels').then(m => ({ default: m.ChannelRoutes })));
```

## The `ROUTES` builder — the one source of absolute paths

`apps/web/src/app/routes/paths.ts` is the single source of truth for every absolute path. A path
with no parameter is a string constant; a parameterized path is a builder function, so the
compiler enforces its argument types and the template lives in one place:

```ts
export const ROUTES = {
    root: '/',
    channels: {
        root: '/channels',
        room: (channelId: string) => `/channels/${channelId}/room`,
        settings: (channelId: string) => `/channels/${channelId}/settings`,
        // …thread, invite, inviteLink
    },
    place: {
        detail: (placeId: string) => `/place/${placeId}`,
        // …settings, settingsDetail, settingsEdit, settingsProfile, settingsChannels
    },
    mypage: {
        root: '/mypage',
        account: {
            info: '/mypage/account',
            edit: '/mypage/edit',
            cloudProfile: '/mypage/cloud-profile',
            withdrawal: '/mypage/withdrawal',
        },
        cloud: { manage: '/mypage/cloud-manage' }, // cloud OWNERSHIP, distinct from `account` (login credentials)
        settings: {
            root: '/mypage/settings',
            notifications: '/mypage/settings/notifications',
            lab: '/mypage/settings/lab',
        },
        policy: {
            root: '/mypage/policy',
            terms: '/mypage/policy/terms',
            licenses: '/mypage/policy/licenses',
            privacy: '/mypage/policy/privacy',
        },
    },
    // …auth, account (signup/reset-password), invite, search, subscription, onboarding
} as const;
```

The object tree mirrors the feature/domain boundary so it stays browsable; the URL strings
themselves are **not** nested to match (a deep link, the native bridge, and a shared external link
all depend on the literal path staying flat). Nine top-level groups exist today:
`auth account channels invite place search subscription onboarding mypage`. `debug` is not one of
them — the debug overlay is a router-independent overlay, not a route.

```ts
export const ROUTE_PARAMS = {
    channelId: 'channelId',
    placeId: 'placeId',
} as const;
```

`ROUTE_PARAMS` exists to key `useParams` generically (`useParams<Record<typeof ROUTE_PARAMS.channelId, string>>()`)
where a key name is needed as a value; a simple `useParams<{ channelId: string }>()` reads better
for the common case.

## Verify

```bash
npx tsc -b apps/web/tsconfig.json
grep -rn "navigate(['\"]\/" apps/web/src/app/features --include='*.tsx' | grep -v '\.test\.'
```

`apps/web/src/app/routes/paths.test.ts` pins every constant and builder output. The grep above is
the check for a hardcoded absolute path outside `ROUTES` — it returns nothing today.
