# feedback — one screen, and the context it attaches without being asked

`apps/web/src/app/features/feedback` is a single screen at `/mypage/feedback`: a title, a body, up
to five photos, and a submit button. Its reason to exist is the part the user does not type — a
device and version snapshot, the viewport, the online flag, and the trail of screens they visited
before arriving. The goal is that nobody has to describe their situation for a report to be
reproducible.

The feature is deliberately small: two source files and their specs. Everything it sends leaves
through `runtime.report.reportIssue`, which belongs to
[`@chatic/app-runtime`](../../../../../libs/app-runtime/README.md).

## Layout

Two source files — the page, and `lib/buildReportContext.ts` — and their specs.

Two collaborators live outside the feature and are the reason a reader gets lost looking for them:

- **[`app/utils/routeTrail.ts`](../../../src/app/utils/routeTrail.ts)** — the ring buffer of visited
  paths. App-level because everything records into it.
- **[`app/navigation/stackObserver.ts`](../../../src/app/navigation/stackObserver.ts)** — the only caller of
  `recordRoute`, subscribed to the data router.

## Responsibilities

**In** — the screen, its validation, the photo budget and encoding, and the shape of
`extras` (`device`, `version`, `online`, `viewport`, `path`, `routeTrail`, `images`).

**Out** —

- **Sending.** `runtime.report.reportIssue` assembles the wire body, decides `silent`, and goes
  through the report repository like any other data call. It also attaches `user`, `cloud`, `env`
  and `url` — `buildReportContext` must not duplicate those.
- **Route recording.** `stackObserver` does it; this feature only reads the buffer at submit time.
- **The entry row.** `SettingsPage` under [mypage](../mypage/README.md) owns it.
- **Reading reports back.** admin-v2's report-logs console does.

## The shared contract

### Everything on this screen has a bound

An unbounded field does not fail loudly — it fails the whole submission at the server, long after
the person has typed. So every input has a ceiling, and each one is enforced where the user can be
told about it.

| Field       | Bound                                 | Enforced in                                            |
| ----------- | ------------------------------------- | ------------------------------------------------------ |
| Title, body | 5000 characters (`MAX_INPUT_LENGTH`)  | `onChange`, clamped with `slice`                       |
| Photos      | 5 (`MAX_PHOTOS`)                      | `handleSelectPhotos`, with a toast                     |
| Each photo  | 1024px longest edge, JPEG quality 0.6 | `prepareImage(file, REPORT_PHOTO)` before it is stored |
| Route trail | 10 paths (`ROUTE_TRAIL_SIZE`)         | `recordRoute`                                          |

The character clamp is written by hand rather than passed to `TextField`'s `maxLength`, because
that prop also renders an `N/5000` counter. The design shows no counter — a visible limit reads as
pressure in a field meant to invite a long complaint.

The photo budget is enforced by **the page, not the field**. `PhotoAttachField` returns whatever was
picked and renders what it is given; it hides its dropzone at `max` and nothing else. Keeping the
policy in the page is what lets the user be told why a pick was trimmed, and keeps encoding format,
size budget and limit handling out of the design system.

### The context is a projection, not a dump

`buildReportContext` picks six device fields: `platform`, `application`, `stage`, `deviceModel`,
`lang`, `uniqueDeviceId`. It leaves out `deviceToken` and the `deviceId` / `installId` /
`firebaseInstallationId` duplicates.

**That exclusion is a security rule, not tidiness.** `deviceToken` is an FCM/APNs push credential,
and a report without attachments is relayed into a shared Slack channel. Anything in `extras` is
something you have handed to everyone in that channel.

The same rule governs the route trail: `recordRoute` takes a `pathname` and callers must never pass
`search` or `href`. This app puts capability tokens in query strings (`/invite/accept?…`, `/s?…`).
Path segments are opaque resource ids the report already carries; query strings are credentials.
`routeTrail.test.ts` pins that contract.

**Logs are not attached.** They reach the server on their own through the batch uploader, keyed by
`runId` and `uid`, so a copy in the report would only duplicate them — in the one place that is
also relayed to Slack.

### The route trail exists because `path` stopped being informative

When feedback was a floating widget, `extras.path` was the screen the user was struggling with.
Reached from a settings menu instead, `path` is always `/mypage/feedback`. The trail restores the
lost signal: it is oldest-first, its last entry is the feedback screen, and **the one before it is
where the person actually was.**

`recordRoute` ignores a path identical to the previous one, which is what makes a router
resubscribe or a query-only change harmless — neither pushes the real previous screen out of a
ten-slot buffer. `getRouteTrail()` returns a copy so a caller cannot corrupt it, and the field is
omitted entirely rather than sent as `[]` when nothing has been recorded.

### Attachments buy storage by giving up the Slack ping

The whole payload is serialized into one `message` string, and that string becomes the Slack message
text. A single base64 photo blows past Slack's ~40k character limit. Sending the images in a
separate `meta` field was tried and the backend does not persist client `meta`, so `message` is the
only field that survives. A report with photos therefore trades its notification for its
attachments, and a report without photos keeps the ping.

A submission carrying images logs its photo count and payload size under `ISSUE_REPORT`, so if the
store's per-item ceiling is ever hit there is a number next to the failure instead of a guess.

### Failure keeps the text

On success the screen toasts and calls `navigate(-1)`. The fields are **not** cleared first — the
screen is unmounting, and emptying them would flash a blank form during the transition. On failure
the toast is destructive, the input stays, and the screen does not move. A person who typed three
paragraphs never loses them to a network error.

A photo batch the browser cannot decode rejects that batch only; already-attached photos survive.

## Usage

The page takes no props; its URL lives under the hub, and mypage's route table mounts it.

Guests can submit. The row in `SettingsPage` sits outside the `isGuest` branch, and `reportIssue`
puts `user.isAuthenticated: false` in the payload rather than refusing.

### What not to do

- **Do not import the `app/utils` barrel from this feature.** `buildReportContext` imports
  `utils/routeTrail` and `utils/viewport` by concrete path. The barrel drags in modules that read
  `import.meta`, which the CommonJS test transform cannot parse, and the spec dies at load. The same
  applies to `ui/layouts`: the page imports `KeyboardAwareLayout` directly.
- **Do not pass a full URL to `recordRoute`.** See the security rule above.
- **Do not pass `fit: 'cover'` for screenshots.** That is the 150px square center-crop avatars
  want; on a screen capture it throws away the part that mattered. The default `'contain'` keeps
  the aspect ratio and never upscales.
- **Do not add a second feedback entry point.** One row in settings, no floating widget. A control
  parked permanently over the content hides it and invites mistaps.
- **Do not attach logs "just to be safe".** See above.

## Notes for implementers and tests

- **Both source files have a spec, and between them they pin the contract** —
  `buildReportContext.test.ts` covers the field projection, the excluded credentials, the absent
  logs and the trail; `FeedbackPage.test.tsx` covers the enable conditions, trimming, the success
  and failure paths, the 5000-character clamp, and the full photo story (encode, remove, trim past
  five, hide the dropzone, survive an encode failure, include or omit `images`).

    ```bash
    npx jest --config apps/web/jest.config.js features/feedback
    ```

- **`buildReportContext` is pure and reads globals only**, which is why it is testable without
  React. Keep it that way; anything needing a hook belongs in the page.
- **The screen cannot be opened without a backend.** Booting the app depends on a guest device
  registration, so a browser check needs a reachable server. Worth confirming by hand there: the
  keyboard pushing the submit button up, emoji input, and that the `routeTrail` in the submitted
  payload really names the previous screen.

## Further reading

- [`@chatic/app-runtime`](../../../../../libs/app-runtime/README.md) — `runtime.report`, the wire
  body, and what the sender adds on top of `extras`.
- [mypage](../mypage/README.md) — the settings row that leads here.
- [observability/logging.md](../../observability/logging.md) — why the logs travel separately.
