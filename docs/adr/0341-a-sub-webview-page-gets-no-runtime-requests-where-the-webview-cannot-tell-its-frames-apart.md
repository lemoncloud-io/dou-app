# ADR-0341: A sub WebView page gets no runtime requests where the WebView cannot tell its frames apart

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/sub-webview-frame-gate`
> · Scope: `apps/mobile/src/app/subWebView/` (`subWebViewFrameOrigin.ts`, `subWebViewRuntimeGate.ts`,
> `subWebViewRuntimeAccess.ts`) · `apps/mobile/android` (`SubWebViewFramesModule`, `androidx.webkit`)
> · `libs/runtime-core` (`SUB_WEB_VIEW_REPOSITORY_WHITELIST`)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> (the runtime requests), [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md)
> (the one text send)

## Context

The sub WebView answers only the origin it was opened on. Its one check is that the origin of the URL a
message arrives with is the opened origin; a message from another origin, a frame of another site
included, gets no answer.

That check is only as good as the URL the WebView reports, and on Android the URL depends on the
WebView. react-native-webview 13.16.0 sets up its messaging channel one of two ways
(`RNCWebView.createRNCWebViewBridge`):

- **Where the WebView supports web message listeners** (`WebViewFeature.WEB_MESSAGE_LISTENER`), it
  registers one. Each message carries the origin of the frame that posted it, so a frame of another
  site fails the check.
- **Where it does not**, it falls back to a JavaScript interface. Every frame of the page can call it,
  and the library reports `WebView.getUrl()` — the top-level page's URL — for every message, whatever
  frame posted it. A frame of another site inside a reviewed page then passes the check as the page.

iOS is not affected: the library reports the URL of the frame that posted each message
(`WKScriptMessage.frameInfo`), so a frame of another site fails the check there.

The fallback was known when the sub WebView first shipped, and was accepted. A frame could then reach
little more than closing the view or setting its title. Since ADR-0320 and ADR-0325 a reviewed page's
host can read the current cloud's rooms, messages and members and post in the user's name. An ad, an
embedded video or any third-party frame on such a page would get the same, on a device whose WebView
predates web message listeners.

Nothing in react-native-webview tells JavaScript which channel it set up. The URL a message reports
hints at it — a bare origin from the listener, a full URL from the fallback — but that is a detail of
the library's code, not an answer it gives, and it is only seen after a message has arrived, while the
host decides what it registers before the page's first message.

## Decision

1. **A sixth condition for the runtime requests.** `RuntimeHello`, `RuntimeCall`, `RuntimeSubscribe`
   and `RuntimeUnsubscribe` are registered only where the WebView reports a frame's message under the
   frame's own origin, besides the five existing conditions. Elsewhere they are not registered: the
   handshake does not list them and they answer `NOT_FOUND`, as for a page with no runtime permission
   or an app that predates them. The text send goes through `RuntimeCall`, so it closes with them.
2. **The base set and the manifest's four capabilities stay, as an accepted cost.** On an old Android
   WebView a frame of another site still reaches them as the page: it can read and write the page's
   own storage, get the page's user key, set the title, and use the clipboard, the share sheet and
   `OpenURL` where the manifest declares them. None of them reaches the user's DoU data, and closing
   them would break every page on those devices, not only its cloud features.
3. **The answer comes from the same check the library makes.** A small Android module,
   `SubWebViewFrames`, exposes `WebViewFeature.isFeatureSupported(WEB_MESSAGE_LISTENER)` as a constant.
   react-native-webview picks its channel by that exact call in the same process, so the two cannot
   disagree. The provider is fixed for the life of the process; an update of it restarts the app.
4. **Unknown is closed.** An app without the module — every Android app released before it — a module
   that cannot ask the WebView, or a value that is not `true` keeps the four requests closed. iOS answers
   yes without a module.
5. **The list streams that can name a cache partition answer two arguments only.** Found while closing
   the frame hole, and closed with it: `channel.observeList`, `join.observeList` and
   `place.observeList` take a third parameter after their callback, `contextOverride` (`{ cid, uid }`),
   which pins the device-cache partition they observe. The whitelist opened them with no guard and the
   runtime passes a page's arguments through, so a page could name another cloud and read that cloud's
   rows held on this device — the whitelist's "the current cloud only" rule did not hold for them. They
   now carry `argCount` 2 (the query and the listener); a third argument is refused as `guard`. No
   other open method takes such a parameter, and every other open read resolves its partition from the
   session's current cloud.

## Alternatives

- **Read the channel from the shape of the reported URL.** A bare origin means the listener, a full URL
  the fallback. Needs no native code and no release. Rejected: it relies on what the library happens to
  pass, not on anything it promises. A later version that reported the top-level origin on the fallback
  would open the gate on exactly the devices it exists for. The signal also arrives with a message, after
  the host is built, so it would have to be learned from the main WebView or the host rebuilt at the
  first message.
- **Close the runtime requests on every Android device.** Simple and certain. Rejected: it takes the
  cloud reads and the text send from every Android user to protect the few on an old WebView.
- **Patch react-native-webview to drop messages from other frames.** The listener already passes
  `isMainFrame`, but the fallback cannot know the frame at all, so a patch does not close the hole on
  the devices that have it.
- **Hide the bridge from frames with an injected script.** The fallback's JavaScript interface is
  injected by the WebView into every frame, beyond a page script's reach.

## Consequences

- A page that sent a third argument to one of the three list streams is refused where it was answered.
  No page DoU knows of does; the SDK sends the query and the listener only.

- On an Android device whose WebView lacks web message listeners, a mini app loses its cloud reads and
  its text send. It sees the same `supportedWebMessages` as on an app that predates them, so a page
  written to the protocol degrades as it already must. How many devices that is has not been measured;
  the app's logs are where to look.
- Until an app with the module is released, Android behaves as before: the module is native, so the
  gate exists only in builds that carry it. An Android app built before it never runs this JS, since
  the JS bundle ships with the app.
- The protocol's list of conditions for the runtime requests gains this one. The security invariant
  "the host answers only the opened origin" still does not hold on an old Android WebView for the base
  set and the four capabilities; the protocol says so, and only the runtime requests rest on the
  checked condition.
- `androidx.webkit` becomes a direct dependency of the app, at the version react-native-webview builds
  against.
