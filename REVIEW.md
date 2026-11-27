# Review checklist

Questions a reviewer answers when a diff touches what once broke. Each item fires on its `paths` (git pathspec
globs) or its `diff` (a regex over added and removed source lines); only fired items are read. Items come from reverts,
repeated fixes and ADRs, and name their evidence. The reviewer reads this file from the base branch
(`node docs/config/skills/dou-ship/references/review-items.mjs`), never the copy in the PR under review.

Add an item when a revert or a repeated fix shows a question nobody asked. Remove one that has not fired for
twelve weeks (`review-items.mjs --stale 12`) unless its risk is still live. Measure an edit here with
[`tools/reviewer-eval`](./tools/reviewer-eval/README.md): recall on its defect cases, false alarms on its controls.

## An app updated from the previous release still boots signed in

- paths: `libs/auth/src/session/**`, `libs/runtime/src/engine/session/**`, `libs/session/src/**`, `libs/runtime-mobile/src/**`
- diff: `SESSION_KEYS|secretStorage`
- check: Seed the store the previous build wrote (vault empty with a page session, and the reverse), boot, and
  confirm the same account is signed in and no guest login replaced it.
- from: f8573ff6d, b8c665a67, 84f731885, ADR-0315, ADR-0331, ADR-0332

## Invited clouds are matched by every id they were accepted with

- paths: `apps/web/src/app/hooks/useInvitedClouds*`, `apps/web/src/app/utils/invitedCloudAcceptance*`,
  `apps/desktop-web/src/app/shared/hooks/useClouds*`, `apps/desktop-web/src/app/shared/stores/useJoinedCloudsStore*`,
  `apps/desktop-web/src/app/shared/hooks/useCloudRecordOwnership*`
- diff: `acceptedBy`
- check: With an account holding an invited cloud, and with a guest who logs out and back in, the list still shows
  it; the match accepts both the guest id and the relay uid.
- from: 1d560bca7, 91778cc07, e29dddb81, ADR-0209, ADR-0275

## Logout, release and reset leave the invited-cloud records alone

- paths: `apps/desktop-web/src/**/auth/**`, `apps/desktop-web/src/app/features/account/pages/**`,
  `apps/desktop-web/src/app/shared/hooks/useAccountResetOnLogout*`, `libs/auth/src/**`, `libs/db/src/**`
- diff: `(clear|reset|logout|removeAll)\w*\(.*(cloud|joined)`
- check: Log out as a guest and as an account, sign back in, and confirm the invited clouds are still listed.
- from: f1f31a44d, 34593aec9, ADR-0245

## A cloud is entered with the role and token the backend issues for it

- paths: `libs/auth/src/socket/**`, `apps/web/src/app/features/invite/**`, `apps/web/src/app/features/home/hooks/useSwitchPlace*`
- diff: `login-invite|delegate-cloud`
- check: An owner accepting their own invite enters as owner; a guest invitee gets no 403 "not a member"; any
  re-issue or reclaim sweep touches only clouds the token was issued for (count the delegate calls against a
  catalog holding someone else's clouds).
- from: 3790fdab6, 230ad216f, defee60b6 (revert), ADR-0156, ADR-0169, ADR-0207

## Installed older shells still work, or the floor is raised on purpose

- paths: `apps/web/src/app/features/appUpdate/**`, `apps/web/src/app/bridge/**`, `libs/bridges/src/**`,
  `apps/desktop/src/main/bridgeHandlers*`
- check: If the web now needs a shell handler, fake it as `NOT_FOUND` on the oldest shell above the floor and
  confirm the screen copes; otherwise the PR raises the floor and deletes the fallbacks together.
- from: 0fa0f321f, 2905715b0, ADR-0332, and the version-floor ADR ("a phone app below the version floor sees
  only the update screen")

## A renamed capability or message value still reads the old spelling

- paths: `libs/runtime-hybrid-web/src/hostCapabilities/**`, `libs/bridge-messages/src/**`
- check: Feed the values the previous release declares; the reader accepts them (with a warning) until no
  supported shell sends them.
- from: 7c156d8d7, 3b9b63eea, ADR-0324

## Every host answers a changed bridge message exactly once

- paths: `apps/mobile/src/app/webview/**`, `apps/mobile/android/app/src/main/java/**`, `apps/desktop/src/main/bridgeHandlers*`, `libs/fake-shell/src/**`
- check: Phone app, desktop, fake shell and sub view each answer the message once, or list it as unsupported; the
  shells' contract tests pass.
- from: 0fa0f321f, ed2c20875, e059d6812

## A WebView trust or file-access change was run on a device

- paths: `apps/mobile/src/app/webview/**`, `apps/mobile/src/app/subWebView/**`
- diff: `urlTrust|originWhitelist|allowFileAccess`
- check: Run it on a simulator or emulator through the mini app and deep-link entry points (`dou-verify` device
  check), not only in the browser.
- from: 033cca6f3 (revert), 22547e73e, e059d6812

## A timeout counts visible time, and a reported failure really failed

- paths: `libs/bridges/src/**`, `apps/web/src/app/features/invite/**`, `apps/mobile/src/app/webview/hooks/**`
- check: Background the app for 15 s mid-request, and complete a native action that succeeds (SMS composer,
  clipboard); neither is reported as a failure.
- from: 1930596d6, f24e2e23e, ADR-0211

## Invite and deep links parse in every shape they arrive in

- paths: `libs/shared/src/utils/inviteLink*`, `apps/mobile/src/app/services/deeplinks/**`, `apps/web/src/app/routes/EncodedLinkRedirect*`,
  `apps/mobile/android/app/src/main/AndroidManifest.xml`, `apps/landing/src/app/features/deeplink/**`,
  `apps/desktop-web/src/app/features/auth/utils/parseInviteInput*`
- check: Encoded links, `/s?code=`, `/i`, text glued after the token, cold and warm start on Android and iOS; run
  the table-driven tests and one cold start.
- from: 8d551f0eb, 0493b0513, 717cc248b, 37120a842, ADR-0212

## A backend types bump keeps a clean typecheck

- paths: `package.json`, `yarn.lock`
- diff: `@lemoncloud/[a-z-]*api|api-types`
- check: `rm -rf dist out-tsc` and typecheck `libs/http` and `libs/data`; if a field is missing, declare it locally
  rather than raising the package.
- from: dfc26c1a6, 38c0437f3 (revert), e1088668f

## A read pinned to one server agrees with the active session

- paths: `libs/data/**/src/**`, `apps/web/src/app/features/mypage/**`, `apps/web/src/app/hooks/useMyUser*`
- diff: `relay.*(profile|user\.update)|(profile|user\.update).*relay`
- check: Switch clouds and confirm the MY header and the write target follow the active session.
- from: ea81a1a59, 8ae94f829 (revert), ADR-0062

## A boot-path change still reaches a working state

- paths: `apps/web/src/main.tsx`, `apps/web/src/app/runtime/**`, `libs/runtime/src/engine/**`, `libs/runtime/src/remote/**`, `libs/transport/src/**`
- check: Reload, cold start after more than an hour away (stale credential), and a foreground report during the
  first connect each reach a usable home screen.
- from: 17c13d6ce, f797bee74, a94ba9e42

## A screen reused for another room, cloud or account starts from that one's state

- diff: `\[[^\]\n]*\b(channelId|roomId|cloudId|placeId|siteId|cid|uid)\b[^\]\n]*\]`
- check: The route keeps the component mounted when the id changes (push toast, search jump, cloud switch, account
  change). On the first render with the new id, does any hook, ref, pending dialog or callback still answer with the
  previous id's state, or act on the new one with a result started for the old one? State must carry the id it
  belongs to, or reset on it.
- from: 0117d6d0e, 870d421ae, 2d24cf310

## An empty list that only means "not loaded yet" is not read as "none"

- diff: `\?\?\s*\[\]|\|\|\s*\[\]|,\s*\[\]\s*\)|useState<[^>]*\[\]>\(\s*\[\]\s*\)`
- check: Where a cache, store or in-flight read first yields `[]`, does the code treat it as known-empty (show "no
  rooms", withdraw every socket, delete rows)? Unknown needs its own value (`null`, a loaded flag) and a bound on how
  long it may last.
- from: 400fa3ff9, 60bbd858c

## A value sent across the bridge or a stream survives JSON and a reconnect

- paths: `libs/runtime/src/engine/**`, `libs/runtime/src/remote/**`, `libs/runtime-web/src/**`, `libs/runtime-mobile/src/**`, `libs/bridges/src/**`,
  `libs/transport/src/**`
- diff: `postMessage\(|\bhello\b|lastEvent\w*|handshake`
- check: Every result type that crosses carries only JSON (a promise, Map, class or function arrives as `{}`); a
  test round-trips it through `JSON.parse(JSON.stringify(...))`. Per-connection state (sequence numbers,
  subscriptions, verified flags) is reset on a new hello, a page reload or a resume, and a half-open connection that
  still reads verified is probed, not trusted.
- from: bb15af1e0, f797bee74, 5a9c6b41c

## A refused request is not sent again by the effect that sent it

- diff: `auth\.switch|switch(Place|Cloud|Site)\w*\(|\.mutate(Async)?\(|\bretry\b`
- check: Make the server refuse the call. Does the refusal (or its rollback) change the effect's inputs back to what
  triggers the same call, so it repeats forever with a toast each time? The effect remembers what failed and waits
  while the socket is down.
- from: 453faa06c

## A token, row or message is matched to the user it belongs to

- diff: `\b(uid|userId|ownerId|delegatorId|acceptedBy|issuedFor|isViewerId)\b|reissue\w*|exchange\w*Token`
- check: The same person has several ids (device guest delegatorId, relay uid, per-cloud `$join.userId`). Each
  comparison accepts every id that can be recorded there, and a token, cached row or room from one user is never
  committed or fetched as another's after a sign-in, account change or re-issue (compare the answer's uid with the
  one recorded, and refuse a mismatch).
- from: d8bc34a4d, bfd3127a1, 6f62b2cd8, 1d560bca7, 2d24cf310

## Browser globals that outlive the app are not read as app state

- diff: `history\.length|document\.referrer|window\.name|performance\.navigation`
- check: These count what happened before the app loaded and across sessions in the same WebView. Use the router's
  own index (`history.state.idx`) or the app's own record instead.
- from: defa8c6b1

## Ids in push and link payloads are normalized before they are used

- paths: `apps/*/src/**/push/**`, `apps/*/src/**/notifications/**`, `libs/*/src/**/push/**`
- diff: `\b(data|payload)\.(cid|sid|channelId)\b`
- check: A payload names the relay `'#'` and may omit a place; read it through the shared normalizer, then click the
  banner for a relay push and a cloud push and confirm each opens where it was sent.
- from: e32da2ec2

## A sign-in starts the way the backend expects and accepts only what it started

- paths: `apps/*/src/app/features/auth/**`, `apps/landing/src/app/features/**/auth*/**`, `libs/auth/src/**`
- diff: `nonce|oauth|verify-oauth|social\w*(Login|Start)|deeplink`
- check: The device session is registered before a social start; the returned link is refused without the nonce
  this app sent (not only when it carries a wrong one); the exchange signs as the device guest, not with a session
  left on the tab.
- from: 03a12ff4b, 28024c08e, 17d4d1649

## A file is judged by what it is, and its upload time by its size

- paths: `libs/data/**/src/**/*ttachment*`, `libs/shared/src/**/*ttachment*`, `apps/*/src/**/upload/**`,
  `apps/*/src/**/*Upload*`, `apps/*/src/**/xhrPut*`, `apps/*/src/**/image-send/**`
- diff: `image/gif|application/zip|\bmimeType\b|\bthumbUrl\b`
- check: Send a GIF (still animates in the room), a .docx the OS types as `application/zip`, and a 300 MB video on a
  throttled link (the time limit grows with size; a retry does not resend into the same limit).
- from: ad4fcdeee, f55a38259, 7f2a511ec
