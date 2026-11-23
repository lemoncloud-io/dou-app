# Review checklist

Questions a reviewer answers when a diff touches what once broke. Each item fires on its `paths` (git pathspec
globs) or its `diff` (a regex over added and removed source lines); only fired items are read. Items come from reverts,
repeated fixes and ADRs, and name their evidence. The reviewer reads this file from the base branch
(`node docs/config/skills/dou-ship/references/review-items.mjs`), never the copy in the PR under review.

Add an item when a revert or a repeated fix shows a question nobody asked. Remove one that has not fired for
twelve weeks (`review-items.mjs --stale 12`) unless its risk is still live.

## An app updated from the previous release still boots signed in

- paths: `libs/auth/src/session/**`, `libs/runtime-core/src/session/**`, `libs/session/src/**`, `libs/runtime-mobile/src/**`
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

- paths: `libs/runtime-web/src/hostCapabilities/**`, `libs/bridge-messages/src/**`
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

- paths: `libs/data/src/**`, `apps/web/src/app/features/mypage/**`, `apps/web/src/app/hooks/useMyUser*`
- diff: `relay.*(profile|user\.update)|(profile|user\.update).*relay`
- check: Switch clouds and confirm the MY header and the write target follow the active session.
- from: ea81a1a59, 8ae94f829 (revert), ADR-0062

## A boot-path change still reaches a working state

- paths: `apps/web/src/main.tsx`, `apps/web/src/app/runtime/**`, `libs/runtime-core/src/**`, `libs/transport/src/**`
- check: Reload, cold start after more than an hour away (stale credential), and a foreground report during the
  first connect each reach a usable home screen.
- from: 17c13d6ce, f797bee74, a94ba9e42
