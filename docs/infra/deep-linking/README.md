# Deep-linking assets

The Firebase-side pieces of the deferred-deep-link flow — the part with no home in an Nx
project because it deploys to Firebase, not to an app or a lib.

```text
docs/infra/deep-linking/
├── README.md                     this file
├── web-deferred-deeplink.ts      the landing-page write path (Firestore doc shape, TTL)
├── firestore.rules               create/read/delete open, update closed
├── firestore.indexes.json        the fingerprint + expiresAt composite index
├── firebase-functions/           scheduled + HTTP cleanup of expired links
└── .well-known/                  apple-app-site-association, assetlinks.json
```

The landing page that writes a `deferredDeepLinks` document lives in
[`apps/landing`](../../../apps/landing/README.md) (`features/deeplink/`), and the app that reads one
back is `apps/mobile` — see [its deeplink doc](../../../apps/mobile/docs/deeplink.md). Neither imports
`web-deferred-deeplink.ts` directly; it is the reference shape for what the landing page writes and
Firestore stores, not a shared module.

## Deploying the Firestore index

```bash
cp docs/infra/deep-linking/firestore.indexes.json firestore.indexes.json
firebase deploy --only firestore:indexes
```

Or in the Firebase console: Firestore → Indexes → composite index on `deferredDeepLinks`,
`fingerprint` (ascending) then `expiresAt` (descending).

## Deploying the cleanup functions

```bash
cd docs/infra/deep-linking/firebase-functions
npm install
npm run deploy
```

| Function                          | Trigger   | Does                               |
| --------------------------------- | --------- | ---------------------------------- |
| `cleanupExpiredDeferredLinks`     | Scheduled | Runs hourly, deletes expired links |
| `cleanupExpiredDeferredLinksHttp` | HTTP      | Same cleanup, for a manual trigger |

`firebase functions:log` shows the run history.

## Firestore rules

`firestore.rules` in this folder is the deployed policy: anyone can create a `deferredDeepLinks`
document (the landing page has no auth), anyone can read or delete one (matched by `fingerprint`,
not by owner), and updates are closed — a link is written once and only ever deleted, never edited.
That is intentionally permissive; it relies on the fingerprint being unguessable and the TTL cleanup
above, not on access control.
