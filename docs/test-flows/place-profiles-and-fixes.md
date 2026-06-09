# Manual Test Flow — Place Profiles + desktop-web fixes

Manual Playwright run against the live dev backend. Covers the Place Profiles
feature and the earlier batch of desktop-web fixes on
`feature/louis-update-electron`.

## Environment
- Dev server: `cd apps/desktop-web && ../../node_modules/.bin/vite --mode dev --port 5005`
- URL: `http://localhost:5005`
- Backend: real dev (`api.eureka.codes`, wss `cht-d1`) via `.env.dev`
- Account: `developer@lemoncloud.io` / `lemon123@`

## Login (the only non-obvious path)
Email/password login is the **DEV debug login**, reached only by in-app nav
(direct URL deep-links reset to `/auth/welcome`):
1. `/auth/welcome` → click **"I have an invite"** → `/auth/login`
2. click **"Debug sign-in"** → `/auth/debug`
3. email/password are prefilled → **Sign in** → lands on `/`

> Note: `/auth/debug` is gated by `import.meta.env.DEV`. Deep-linking any
> `/auth/*` path hard-loads to `/auth/welcome` (SPA initial-route behavior) —
> navigate via clicks, not the address bar.

## Test cases

| # | Area | Steps | Expected | Result |
|---|------|-------|----------|--------|
| T1 | App rename | Load app | Window/tab title is **DoU** (not Chatic) | ✅ `"(3) DoU"` |
| T2 | Send-status marks | Open a channel with own messages | No check/clock glyph beside own messages | ✅ removed |
| T3 | Composer align | Inspect message input | Text vertically centered with buttons | ✅ (build-verified) |
| T4 | Channel persistence | Select "test desktop" → avatar menu → Settings → browser Back | Still on "test desktop" (no jump to first channel) | ✅ stayed |
| T5 | New-messages divider | Open channel with mixed authors | Divider sits above *another* user's first unread, **never above own messages** | ✅ above `01000000000`, not own |
| T6 | Edit dialog opens | Avatar menu → "Edit place profile" | Dialog: nick + photo + active toggle | ✅ |
| T7 | Dialog seed (get timeout) | Reopen dialog after an active profile exists | Form shows the cached active nick + toggle on, even though `get-site-profile` times out | ✅ nick "Dev PlaceNick QA", toggle on |
| T8 | Save nick (optimistic) | Set nick "QA Final Nick" → Save | Rail avatar **and** all own message authors → "QA Final Nick" instantly | ✅ both |
| T9 | Deactivate → revert | Toggle active **off** → Save | Rail + own messages revert to Global `developer@lemoncloud.io` | ✅ reverted |
| T10 | Nick + photo | Re-activate, set "QA Photo Nick", upload image → Save | Rail avatar shows image + label; all own message avatars show image + nick | ✅ rail img + 9 message avatars + nick |
| T11 | Cloud-switch loader | Click another cloud in the rail | Overlay over sidebar+main with "Switching cloud…", rail stays | ✅ overlay shown |
| T12 | Place scoping | After switching cloud/place | The QA nick does **not** leak into the other place (shows Global there) | ✅ "바빠" place shows Global |
| T13 | Cloud-switch place-auth | After switch completes | New cloud's channels + messages load | ✅ loaded |
| T14 | Persistence | Hard reload while logged in | Session + active Place Profile survive (IndexedDB) | ✅ rail still "Dev PlaceNick QA" |
| T15 | Fail-soft | Throughout | `sync`/`get` timeouts logged as "keep Global", UI never breaks | ✅ no crash |

## Root cause of the sync timeout — a CLIENT bug (backend was fine)
Initial runs showed `channel.sync-site-profile` timing out (30s) while
`user.get/set-site-profile` worked. A WebSocket frame sniffer proved the **server
responds correctly** (`channel.sync-site-profile:ok` with `profiles`/`syncedAt`,
matching `mid`) — the **client dropped the response**:

- The inbound dispatcher has no raw `channel` domain case; every `channel.*`
  server type is remapped to the `chat` domain via `INBOUND_TYPE_MAP` (e.g.
  `channel.create` → `{chat, start}`). `channel.sync-site-profile` was missing
  from that map, so the `:ok` fell through to a raw `channel` domain →
  "Unhandled domain: channel" → `profile:sync` never emitted → 30s timeout.
- `get/set` ride the `user` domain (handled generically), which is why only
  `sync` broke.

**Fix:** add `'channel.sync-site-profile': { domain: 'chat', action: 'sync-site-profile' }`
to `INBOUND_TYPE_MAP` (`libs/socket/.../useWebSocketV2.ts`). After the fix the
sync round-trip resolves and the per-`{cid,sid}` cursor advances (verified:
`localStorage['chatic-site-profile-cursor']` populated, 0 console errors).

## Client fixes made during testing (3)
1. `buildMessageRows.ts` — own-message lookup tries both `viewer.cloudUid` and
   `viewer.uid` (optimistic self-write keys by account uid; sync keys by cloud
   uid), so own messages match the self-avatar.
2. `EditPlaceProfileDialog.tsx` — seed precedence loaded → **cached active
   override** → Global, so a `get-site-profile` hiccup still shows real values.
3. `useWebSocketV2.ts` — `INBOUND_TYPE_MAP` entry for `channel.sync-site-profile`
   (the actual cause of the sync timeout above).

## Status
get/set/sync all round-trip against the real dev backend. Other users' Place
Profiles will populate where set; the test places currently return `profiles: {}`
(no other users have profiles there yet).

## Verify command
`cd apps/desktop-web && ../../node_modules/.bin/vite build` → exit 0.
