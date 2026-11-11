# ADR-0282: A sub WebView page keeps its data in a device file per origin

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/sub-webview-storage`
> · Scope: `libs/bridge-messages` · `libs/bridges` (`BRIDGE_VERSION` 2.18.0) · `apps/mobile`
> (`subWebViewStorage.ts`, `subWebViewStorageFile.ts`, `subBridgeHandlers.ts`) · `libs/chatic-apps-sdk`
> (`apps.storage`)
> · The rules are in [apps/mobile docs/webview/sub-webview.md](../../apps/mobile/docs/webview/sub-webview.md)
> and the requests in [sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0271](./0271-a-sub-webview-page-gets-a-key-per-origin-derived-from-the-device-id.md),
> the user key, on the same terms; [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> the base set and the manifest

## Context

A page in the sub WebView had two places to keep a user's progress: the WebView's own `localStorage`,
which goes whenever the system or the user clears website data, and a server of its own under the user
key, which a quiz or a small game does not have. Pages are written by people outside the app's team,
often with an AI assistant, and "keep it on your own server" is the step such a page skips.

## Decision

**The shell keeps a store per opened origin, in an MMKV file of its own, and answers five base-set
requests over it.**

- **Isolated by origin, and by nothing finer.** The file is named from the shell's record of the opened
  origin — `subwebview.` plus a hash — never from anything in a request, so a page can reach no other
  page's data. An origin is never reused for a different page, so no page id or version is needed on
  top of it.
- **The device's, not the account's**: kept across launches and sign-outs, gone with an uninstall,
  the same on every account on the phone — the same terms as the user key, and for the same reason: a
  page is not told who the user is.
- **1,048,576 characters per origin**, keys of 1–200 characters, JSON values; a write is all or none,
  and past the limit it is `QUOTA_EXCEEDED`. One request stays within the 64 KiB message limit.
- **In the base set**, with no manifest permission: a page reading back its own data reaches nothing
  outside the view, so there is nothing for a reviewer to grant.
- The SDK offers it as `apps.storage`, with `localStorage` under the same limits in a browser and an
  in-memory store in the mock.

## Alternatives

- **Leave it to `localStorage`.** Rejected: data a page cannot rely on keeping is data a page loses,
  and the loss shows up as the app forgetting the user's progress.
- **A key per page id or bundle version on top of the origin.** Rejected: an origin is given to one
  page for good, so the extra key would only add a way for a page to lose its own data across releases.
- **One shared MMKV file with origin-prefixed keys.** Rejected: clearing a page's data would mean
  scanning every page's keys, a mistake in the prefix would cross pages, and the app's own `clearAll`
  on the shared file would take the pages' data with it.
- **Tie the data to the DoU account.** Rejected: that tells a page which accounts share a phone, which
  the user key already declines to do. Data that must follow the user belongs on the page's server.
- **A manifest permission.** Rejected: it guards nothing a reviewer could judge, and a page that is
  refused it falls back to `localStorage` anyway.

## Consequences

- One MMKV file per origin whose page stores something, each at most 1,048,576 characters of
  content — up to about 3 MiB as UTF-8, for text outside ASCII — plus MMKV's reserve.
  Nothing removes a file for a page that is withdrawn; with a handful of reviewed pages that is
  accepted, and a cleanup would come with a screen that lets the user clear a page's data.
- The file id cannot change without leaving every page's data behind, and a test pins it.
- There is no screen yet to see or clear a page's data, or to reset its user key.
