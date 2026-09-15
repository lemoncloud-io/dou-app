# Build the issue report floating widget as a new standalone feature for all users, and split screenshots into Phase 2

> Status: Superseded · Decided: 2026-07-16
> Replaced by: [ADR-0047](./0047-feedback-page-replaces-issue-report-floating-widget.md) — the floating
> widget is removed in favour of a "Send feedback" page reached from My Page (2026-08-07). The
> automatic log and device attachment (`buildReportContext`) carries over unchanged.

## Context

Build a feature that lets any user report a bug or issue from anywhere in the app. The requirements:

- A **floating button** that stays in the bottom right and can be **dragged to another position**
- The **issue reporting overlay (form)** it opens can also be moved
- Built from `@libs/web-ui-kit` components
- Sends an **issue title, a body and a screenshot** attachment
- Automatically collects and attaches **the last 50 logs plus device and web state**

What a survey of the codebase found before starting — existing assets worth reusing:

- **The issue form and the send API already exist, but are mounted nowhere** —
  `apps/web/src/app/ui/components/ReportIssueDialog.tsx` and `reportIssue()`
  (`libs/web-core/src/api/common.ts:125`). `reportIssue` already attaches env, url, user and cloud
  context and POSTs to the Slack report endpoint (`${DOU_ENDPOINT}/hello/report`).
- Logs: `logBuffer.peek(50)` (`@chatic/bridges`, a 500-entry ring buffer —
  `libs/logger/src/runtime.ts`) gives the last 50 immediately.
- Device and version: `useDeviceInfo()` → `{ deviceInfo, versionInfo }`
  (`libs/device-utils/src/hooks/useDeviceInfo.ts`). Session, user and server context:
  `getGlobalSessionContext()` / `getActiveSessionUser()` (web-core).
- The drag pattern: `apps/web/src/app/features/debug/overlay/MiniPanel.tsx` already implements
  pointer-event dragging with viewport clamping (it does not persist the position). The fixed floating
  button pattern is in `DebugOverlayHost.tsx`.
- The settings persistence pattern: `usePreferenceStore` plus the `PREFERENCES` registry
  (`apps/web/src/app/stores/`), with the `ListRow` + `Switch` toggle on MyPage (`MyPage.tsx:168`).
- **The UI kit layers**: `@chatic/web-ui-kit` (the product design system: FloatingButton, BottomSheet,
  TextField, Button) wraps `@chatic/ui-kit` (shadcn primitives) internally. They are not competitors
  but an upper and a lower layer. web-ui-kit has no multiline Textarea, though.
- **No screenshot or image infrastructure**: there is no native bridge command to capture a
  screenshot, and no presigned / S3 image upload hosting. The app's image convention is an inline
  **base64 data URL** through `resizeImageToBase64`. The native `OpenPhotoLibrary` / `OpenCamera`
  bridges have an `includeBase64` option, but no web hook wraps them yet.

## Decision

### Scope and audience

- **Audience: every end user.** The floating widget is always present, production included, with no
  internal or debug gate.
- Built as a **new standalone feature** (`apps/web/src/app/features/issue-report/`). It neither extends
  the existing `ReportIssueDialog` nor joins the debug overlay. It does **reuse** the logic assets:
  `reportIssue()`, `logBuffer`, `useDeviceInfo()`, the session context readers, MiniPanel's drag
  pattern and the `usePreferenceStore` pattern.
- **Supported on both plain web and the native WebView** (branching on `isNative()`).

### UI

- Assembled from `@chatic/web-ui-kit` (BottomSheet for the overlay, TextField for inputs,
  FloatingButton / Button for the CTA). The multiline body falls back to `@chatic/ui-kit`'s Textarea,
  since web-ui-kit has none — consistent, as web-ui-kit sits above ui-kit.
- **The floating button**: bottom right by default, moved by pointer drag (reusing the MiniPanel
  pattern), clamped to the viewport.
- **The overlay form**: movable as well.
- **Position and visibility are persisted**: the position goes in a feature-owned store (backed by
  localStorage) so it survives a revisit. A user can **hide the button**, and **restoring it is a
  toggle in preferences (MyPage)** — a `local`-strategy key added to `usePreferenceStore`.

### The send payload (v1)

- **Extend** the existing `reportIssue()` payload with `logs` (`logBuffer.peek(50)`) and `device` /
  `version` (from `useDeviceInfo()`). The existing user, cloud, env, url and timestamp stay.
- **The destination stays the existing Slack report endpoint (`/hello/report`).**
- **Logs and device state are attached automatically, unscrubbed** (v1). There is no separate consent
  step.

### Screenshots move to Phase 2

- **Out of scope for v1.** v1 sends the title, the body, 50 logs and device / web state.
- The settled direction for Phase 2: capture through the **native photo library or camera picker**
  (the existing `OpenPhotoLibrary` / `OpenCamera` bridges, with no new native capture command), with
  an `<input type=file>` fallback on plain web. **The upload path is unresolved and needs its own
  design** — the Slack text endpoint cannot carry an image, so a new backend image endpoint is the
  likely answer, and that is cross-team work.

## Alternatives

- **Extend the existing ReportIssueDialog / fold it into the debug overlay** — fastest, but the debug
  overlay is gated for internal use, which is a different thing from shipping to every user, and it
  constrains the form UI. → Reuse the logic, build the UI as a new standalone feature.
- **Screenshot capture through web DOM capture (html-to-image)** — a new dependency, but
  self-contained in this repo; accuracy suffers with cross-origin images, canvas and video. → The
  photo library / camera picker won.
- **Screenshot capture through a new native command (`OnCaptureScreenshot`)** — the best fit for
  "capture the current screen automatically", but it needs new development in the native app (a
  separate repo). → Not adopted.
- **Image transfer as inline base64 (the existing convention)** — least backend work, but it does not
  render as an image in Slack and risks the text size limit. → Held, since v1 defers screenshots
  entirely.
- **Keeping the floating position for the session only** — simpler, but it falls short of what "can be
  moved" implies (that it survives a revisit). → Persisted in a store plus localStorage.

## Consequences

**What is gained**

- Reusing `reportIssue`, `logBuffer`, `useDeviceInfo`, the drag pattern and the preference pattern
  keeps duplication low and ships quickly.
- Self-service issue reporting for every user, with automatic context (logs, device, user, server),
  makes debugging faster.
- Splitting screenshots into Phase 2 lets v1 ship self-contained in this repo with no backend
  dependency.

**Trade-offs and risks accepted**

- **Part of the requirement is deferred**: v1 cannot send a screenshot.
- **Privacy**: 50 logs are sent unscrubbed, so tokens and personal data can reach Slack. (Explicitly
  accepted for now.)
- **Channel noise**: reports from every user land in an internal Slack report channel, which may
  become spam. The destination and routing may need revisiting.
- **Payload size**: attaching 50 logs makes requests large enough to fail or be truncated. A size cap
  and a truncation policy are settled in the spec phase.
- **Discoverability of recovery**: hiding the button makes recovery depend on preferences, which may
  be hard to find. Its placement and wording there have to be clear.
- **A Phase 2 backend dependency**: sending screenshots requires a new backend image endpoint
  (cross-team) first.
