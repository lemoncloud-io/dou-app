# Device services — permissions, sign-in, SMS, link previews, purchases

Rules the small device services follow, where the reason is not visible in the code. Permissions, SMS
and link previews live in [`@chatic/host-mobile`](../../../../libs/host/mobile/README.md) (paths below are
under its `src/`); the app builds them in `src/app/services/provider.ts`.
The bridge messages that reach them are in [../webview/README.md](../webview/README.md); the contacts
read is in [the WebView document](../webview/README.md#device-contacts).

## Permissions (`permission/PermissionService.ts`)

- **`status` reads without asking; `request` can answer `BLOCKED`.** On Android the library's `check`
  never reports blocked (it only knows granted or not); `request` does, once the OS has stopped showing
  the prompt. So a permission refused for good reads `DENIED` from `status` until a request has been
  made, and `BLOCKED` after it. A blocked permission can only be fixed in Settings, a denied one can be
  asked again; reporting the difference lets the web tell them apart.
- **`LIMITED` (iOS photo library) is usable access**, on both `check` and `status`. Reporting it as
  denied would turn a Limited grant into a dead end.
- **A permission that does not exist on this platform is granted**, for `check`, `status` and
  `request` alike: there is nothing to ask. `status` reports `UNAVAILABLE` only when the platform has the
  permission but the device lacks the hardware.
- **Any failure reads as not granted** (`check` false, `status` and `request` `DENIED`), and is logged.
  A failed `status` reads `DENIED` (askable) rather than `BLOCKED`, so a later request can give the
  real answer where reading it as blocked would not.

## Sign-in (`@chatic/sign-in-mobile`)

The Google and Apple sign-in service is its own package; its rules (a cancel resolves `null`, every
other failure throws) are in [its README](../../../../libs/sign-in/mobile/README.md). The app hands it the
Google web client id from `src/config/families.ts`.

## SMS (`sms/SmsService.ts`)

The `sms:` URL differs by platform, and the difference decides whether the composer opens with the
recipients and body filled in:

- Several recipients are joined with `,` on iOS and `;` on Android.
- The body follows `&body=` on iOS and `?body=` on Android.
- When the full URL cannot be opened, the service tries `sms:<recipients>` without the body before
  giving up, so the person at least gets the composer. Opening it answers `true`.

The Android `<queries>` entry that makes `canOpenURL` work is described with the `SendSms` message.

## Link previews (`unfurl/UnfurlService.ts`)

The shell fetches the page behind a chat link on the WebView's behalf, because the page cannot read
cross-origin HTML. Any channel member can post any URL and the shell fetches it automatically, so the
fetch is guarded as a server-side request would be.

- **Hosts are denied unless they look public.** A host passes only if it is a public DNS name (a dot
  and an alphabetic or punycode top level) or a public IPv4 literal. That also rejects single-label
  intranet names and every alternate IP encoding (`http://2130706433/`, `http://0x7f000001/`) that an
  "allow what is not a dotted quad" rule would let through. Loopback, private, link-local and
  unique-local ranges and `.local`, `.internal` and `.localhost` names are refused. A `user@host` link
  is judged by the host after the last `@`, which is the one the request goes to.
- **The check is on the string only.** A public name that resolves to a private address still gets
  through, because the shell cannot see resolution results; closing that needs a server-side unfurl.
- **The landing host is checked again** when the response headers arrive, before any body is read: a
  redirect chain may end on an internal host, and intermediate hops cannot be inspected. A non-2xx
  answer or a non-HTML content type ends the request there.
- **The fetch is a raw `XMLHttpRequest`**, not `fetch` or axios. `fetch` here is backed by XHR and has
  no `response.body`, so a streaming byte cap reads nothing; aborting an axios request discards the
  bytes already received, so a page larger than the cap would yield nothing even though its `og:` tags
  sit in the first kilobytes. XHR gives all three guards a natural place: header-time checks, a
  256 KB cap that keeps what was already read (`UNFURL_MAX_BYTES`), and a 3-second native timeout
  (`UNFURL_TIMEOUT_MS`) with a 500 ms JS backstop for a stalled native layer. The progress listener is
  also what makes React Native stream text into `responseText`; if that stopped holding, oversized
  pages would simply fail and pages under the cap would be unaffected.
- **Settle before aborting.** `abort()` dispatches an `abort` event synchronously, and that handler
  answers `null`; every caller resolves its own result first so the abort cannot win. The response
  text is read into a snapshot first because `abort()` clears the buffer.
- **The result echoes the requested URL, not the landing URL.** It is the web side's cache key; a
  mismatch would make every redirecting link miss that cache.
- **An `og:image` is kept only if it ends up `https`**, after resolving it against the landing page.
  The WebView blocks `http` images as mixed content, so an `http` one would only add weight to the
  bridge. A page with no title gives no card.
- **Failure is never an error.** Everything — a malformed URL, a blocked host, a timeout, a non-HTML
  response — resolves `{ success: false, url }`. The service is stateless; the web caches per session
  in memory.
- React Native's `URL` global exposes little beyond `href`, so the service splits absolute URLs by
  hand and does not rely on `protocol` or `hostname`.

## Purchases (`@chatic/checkout-store`)

Store purchases are their own package with an `apple` and a `google` strategy; its rules (connection
and refusal logging, Android plan changes, iOS prices, finishing a transaction) are in
[its README](../../../../libs/checkout/store/README.md). `src/config/families.ts` picks the strategy once,
by platform, with the SKU and plan lists from the build's env.
