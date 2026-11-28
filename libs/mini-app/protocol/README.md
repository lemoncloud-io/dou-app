# @chatic/mini-app-protocol

**The rules a mini app page and its hosts agree on**: which pages a sub WebView opens and how far it
trusts them, the limits on what crosses with a page, a page's link (`/apps/<appId>?…`), the `params`
it opens with and the mini app links an owner saves. Every side reads the same rules: both shells
(mobile and desktop), both webs, and landing.

Tags: `layer:foundation` · `platform:any` · `formfactor:any`. Foundation, because it is wire
vocabulary like [`@chatic/bridge-messages`](../../bridge-messages/README.md) — the only package it
imports, for types — and both shells and both webs sit above it. It has no DOM, no React Native and
no timers, so a React Native app, Electron's main process and a browser load it as it is. Folders and
tags follow [ADR-0377](../../../docs/adr/0377-every-project-carries-a-layer-a-platform-and-a-form-factor-tag-and-folders-group-families.md).

| File                     | Holds                                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| `subWebViewTrust.ts`     | `subWebViewTrustOf` (three tiers), origins, data limits, `subWebViewDisplayOf` |
| `subWebViewLink.ts`      | reading and building a page link and the older `/sub-webview?url=…` path       |
| `miniAppLaunchParams.ts` | the `params` a mini app opens with                                             |
| `miniAppLinks.ts`        | the rules for the mini apps an owner adds to a cloud                           |

`@chatic/shared` re-exports all of it, so its consumers did not change, and keeps
`@chatic/shared/subWebViewTrust` as the one-file entry the desktop shell's main bundle aliases. New
code imports this package. The shell-side decisions built on these rules (the reviewed-page allowlist,
the page manifest) are in [`@chatic/mini-app-host`](../host/README.md).

## What the files do not tell you

- **`subWebViewLink.ts` is the only reader of a sub WebView page link**,
  `https://app.chatic.io/apps/<appId>?<query>` (and `app-dev`): an app id and a query, no path, no
  fragment. Landing reads it to decide whether to offer the app, mobile to check it and hand the web
  `/apps/<appId>?…`, and the web to read that path; mobile also builds a page's `appLink` with it. It
  maps no id to a page — that is the web's list, and later the server's — and reads the
  `/sub-webview?url=…` path older apps hand over. It parses by hand, not with `URL`, for the reason the invite decoder in
  [`@chatic/format`](../../foundation/format/README.md) gives about React Native, whose query parser throws on a
  malformed `%` escape.

- **`subWebViewTrust.ts` is the only place that decides what a sub WebView opens**, and how far
  the shell trusts it: `firstParty` for the hub (`https://apps.chatic.io`, `https://apps-dev.chatic.io`,
  exact origin), `reviewed` for one label under those domains (the pages the review pipeline deploys),
  `external` for any other plain https host, and `null` for anything a parser could read two ways —
  userinfo, a port, a backslash, whitespace, an IP literal — and the limits on what crosses with it
  (`params` and `result` at most 16 KiB, a title 100 characters). Both shells check a request against it and
  both webs check a link an owner saves against it, so the web never stores a link the shell would
  refuse. It also reads a page manifest's `display` for both shells (`subWebViewDisplayOf`): `titled`,
  `clean`, `immersive`, and `standard` and `fullscreen`, the earlier names for the first two, so the
  phone and the desktop cannot read a name differently. It imports nothing, on purpose: the desktop
  shell's main bundle reaches it through an alias rather than pulling a whole barrel into Electron's
  main process. `miniAppLaunchParams.ts` builds the
  `params` a mini app opens with from it — ids and display names, never a token, and `user.isOwner`
  and the cloud's mini app list (`miniApps`, name and host) for a `firstParty` page only. `miniAppLinks.ts` holds the rules for the mini apps an owner adds
  to a cloud, so both webs keep the same list: `checkMiniAppLink` (a name of 1–30 characters, an
  address that rule opens and that is not on the hub's own hosts, `hubUrl` — a page there would get the
  owner flag and the list), `MINI_APP_LINK_LIMIT` (10 per cloud), and `parseMiniAppLinks`, which reads
  a stored list back and drops any entry the rules no longer pass.
