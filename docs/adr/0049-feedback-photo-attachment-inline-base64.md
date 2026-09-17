# ADR-0049: Attach feedback photos as inline base64, and save-without-alerting for reports that include an attachment

> Status: Accepted · Decided: 2026-08-11
> Related: [ADR-0096](./0096-feedback-page-replaces-issue-report-floating-widget.md) (this ADR lifts its
> deferral of photo attachment) · [ADR-0017](./0017-issue-report-floating-widget.md) (superseded — split
> screenshots off to Phase 2)

## Context

[ADR-0096](./0096-feedback-page-replaces-issue-report-floating-widget.md) **excluded photo attachment
entirely** from the send-feedback screen. There was one reason: "no image upload API exists." Figma even
carries a dev note on that frame reading "wire up once the server spec is implemented."

That premise has now changed. Rather than waiting on an upload API, photos are sent as **inline base64**.
The app already does this — profile, place, and channel images all go out as data URLs built by
`resizeImageToBase64`. There's already a path to attach a photo without any separate hosting
infrastructure.

### The real constraint found during pre-work research

**The payload is the Slack message text.** `reportIssue` `JSON.stringify`s the whole payload into
`SlackReportBody.message` and sends it with `silent: false` (the API lives at
`libs/web-core/src/api/common.ts`). Slack's text limit is roughly 40,000 characters, and a single 1024px
JPEG's base64 alone exceeds 100,000 characters. Putting a photo straight into the existing payload path
risks **failing the report send itself**, and since this endpoint (`/hello/report`) is shared with automatic
error reporting (`reportError`), the fallout wouldn't stay confined to the feedback screen.

**The place meant for separate payload data exists only on paper.** `SlackReportBody.meta?:
Record<string, any>` ("additional context") looked like — and was implemented as — a slot separate from the
Slack text, but dev measurement confirmed that **the backend does not persist the client's `meta`** (see
decision 1 below). This is exactly what the
[admin-v2 report-logs doc](../../apps/admin-v2/docs/report-logs/README.md) had flagged as "storage
shape unconfirmed." In the end, **`message` is the only field that gets saved.**

**The existing resizer doesn't fit this use case.** `resizeImageToBase64` is a 150px **square center-crop** —
fine for avatars, but used on a screen capture it crops away most of the photo, dropping its diagnostic value
to zero.

## Decision

### 1. Photos go in the payload, and only reports with an attachment send with `silent: true`

`extras.images` rides along with the rest of `extras` into the payload as `body.message`. But **only when
there's an attachment**, `silent: true` is set, turning off the Slack notification while still saving the
record. Reports without an attachment keep `silent: false` as before, so the notification still fires.

**`meta` was tried first, and it failed.** The plan was to send it separately via `SlackReportBody.meta`
("additional context") so the Slack text stayed light while photos were stored apart — and it was built that
way. A dev-environment test deploy that filed a report with a photo attached came back with the saved
record's `meta` as **`{}`, empty** — the backend does not persist the client-sent `body.meta`.

```jsonc
// A report was sent with a photo attached, but meta came back empty (2026-08-11, dou-d1)
{ "title": "[web] issue: …", "message": "{…payload…}", "meta": {}, "silent": false, "save": true, "id": "1009178" }
```

With `message` as the only field that's actually persisted, the only way to keep the photo is to put it in
the payload. And putting it in the payload means exceeding Slack's limit, so giving up that report's
notification is the price. **The photo surviving was chosen over the notification** — the notification can
be substituted with the admin console, but a photo that was never saved has no way back.

### 2. Encoding budget: long edge 1024px · JPEG 0.6 · up to 5 photos

Add `scaleImageToDataUrl` to `libs/shared` — a downscale that **preserves aspect ratio and keeps the full
frame**, and never upscales. The existing `resizeImageToBase64` (square crop) stays as-is for avatar use.

Since base64 inflates 3 bytes into 4, these two numbers directly cap request size. Roughly 60–100KB per
photo, under 1MB for 5.

### 3. Admin lookup probes defensively

Following the existing style, `parseReportLog` checks several locations in order — the payload's `images`
(the current send path) → the SlackReportBody wrapper's `meta.images` → `images` on the record's own meta →
the record's top level. The `meta` spot is kept for reports filed during the brief period the meta-based
build was deployed, and in case the backend eventually does persist `meta`. Only values that could actually
render in an `<img src>` (`data:image/…`, `http(s)://`) pass through, so a stray field can't inject an
arbitrary URL.

Base64 is swapped out for a marker when rendering the raw JSON block — with a few attachments, the raw block
would balloon to megabytes of text that only the browser lays out and nobody reads.

## Alternatives

- **Send separately via `SlackReportBody.meta`** — chosen first, since it would keep the Slack text light
  while storing photos apart, but measurement showed **the photo was lost** because the backend doesn't
  persist the client's `meta` (see decision 1 above). If the backend is ever changed to preserve `meta`,
  this path becomes best again.
- **Wait for the upload API** — ADR-0096's original position. Rejected as too costly to leave the feature
  indefinitely blocked when the app already has a base64 convention.
- **Use `SlackReportBody.image`** — its contract is a "thumbnail image **URL**," and Slack doesn't render
  data URIs. It also only fits one image. Rejected.
- **Reuse `resizeImageToBase64`** — avoids a new function, but its 150px square crop makes a screen capture
  unreadable. Rejected.

## Consequences

**What is gained**

- Reports gain screen-capture attachments with no upload infrastructure. The diagnostic value of reports
  that were hard to reproduce from text alone goes up substantially.
- Reports without an attachment are unaffected — same Slack notification, same request shape.
- `PhotoAttachField` becomes a design-system component other screens can reuse for attachment UI.

**What is accepted / needs follow-up**

- **Reports with a photo attached produce no Slack notification.** The richest-context reports become the
  ones least visible in real time, so operations needs to periodically check admin-v2's `/report-logs`.
  Getting the notification back would require either (a) having the backend persist `meta`, or (b) sending a
  separate photo-free summary as a second message — the latter was deferred since it splits one report into
  two.

- **The per-item storage size cap is unverified.** Attaching 5 photos approaches 1MB, which could hit a
  400KB-per-item limit if the store is DynamoDB. If it does, the fix is fewer photos, more compression, or
  eventually moving to an upload API.
- Figma's "wire up once the server spec is implemented" note was a valid warning — the unpersisted `meta` was
  the substance of it, and the remaining open question is the size cap.
- Photos are screen captures the user chose to attach, so they **may contain personal information.** Since
  reports go to a shared Slack channel and the admin console, they're handled at the same level as the text
  body (no separate scrubbing — the same position as ADR-0096's deferral of log scrubbing).
