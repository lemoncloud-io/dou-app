# ADR-0074: Place introduction text — reversing ADR-0047's exclusion of `desc`

> Status: Accepted · Decided: 2026-09-07
> · **Amends** ADR-0047 (0047-place-detail-read-only-screen.md) (place info screen) — cancels its §Scope exclusion of `desc`
> · Follows the owner gate established by ADR-0031 (0031-place-settings-hub.md) (settings hub)
> · Screen and implementation detail lives in [place-desc.md](../../apps/web/docs/feature/place/place-desc.md); settings overall in [place-settings.md](../../apps/web/docs/feature/place/place-settings.md)

## Context

When ADR-0047 stood up the place info screen, it explicitly **excluded** the introduction text
(`desc`):

> The introduction text (`desc`) is not in Figma, so it is not included. — ADR-0047 §Scope

`place-settings.md`'s exclusion list gave the same reason ("not in Figma"). In other words, the
exclusion was never a **technical impossibility** — it was an absence of design, the kind of
decision that comes back once a design exists. Planning has now requested the introduction text,
satisfying that condition.

### Facts from the investigation that shaped the decision

1. **The plumbing is already open at every layer.** The SDK request type `PlaceBodyData.desc?:
string` sits in the shared body for `place.create` and `place.update`, and the response
   `MySiteView.desc?: string` even carries the comment `/** place introduction text (플레이스 소개
문구) */`. `DomainPlace = CacheSiteView = MySiteView & …`, so the domain type already inherits
   it too.
2. **The mapper and cache have no field whitelist.** `toDomainPlace` is `...api` spread, and the
   local cache is JSON storage. A new field passes through and persists with no code change.
3. **Only one local web type was blocking it.** `useUpdatePlace`'s `UpdatePlacePayload` only
   declared `name`/`thumbnail`, so `desc` never got through. Nowhere in the app read or wrote
   `desc` — 0 places.
4. **`Textarea` deliberately has neither a counter nor a hard cap.** The component's own comment
   says "callers that need a hard cap clamp in `onChange`," and `FeedbackPage` actually does this.
   A 100-character cap belongs at the call site, not the component.
5. **ADR-0047's relay exception was "a planning decision," not "missing data."** Removing the
   created-date and owner rows from the relay default place (the DoU home) was a decision made even
   though `createdAt` actually arrives. So a new row has no automatic reason to inherit that
   exception — it has to be decided fresh each time.

## Decision

### 1. Show the introduction text in three places: info, edit, and hub

- `PlaceDetailPage` (read): one `InfoField` row, right after the name row.
- `PlaceEditPage` (write): one `Textarea` field, right after the name field. The owner gate is
  already applied at the screen level, so no per-field branch is added.
- `PlaceSettingsHubPage`: a one-line preview as the "Place info" row's `subtitle`. Since `ListRow`
  already truncates, no separate truncation logic is added.

### 2. There is exactly one save path, `place.update`, and only changed fields ride along

`updatePlace({ id, sid, name, desc?, thumbnail? })`. `desc` is only included when dirty, so saving
just a name change never overwrites the introduction. This is the same rule `thumbnail` already
follows.

**An empty string means "cleared," not "unchanged."** Clearing the input and saving sends
`desc: ''` for real. `...(isDescDirty && { desc })` includes `desc` whenever `isDescDirty` is true,
even if `desc` is `''`, which is exactly what makes this distinction hold.

### 3. No value means no row — an empty string also counts as absent

This continues the rule ADR-0047 established: "don't draw a fact the server didn't give us." No
label-only empty row, no `-` placeholder. `desc: ''` is falsy, so it naturally falls under this
rule — a cleared introduction and one that never existed look like the same screen.

### 4. Show it on the relay default place (DoU home) too — unlike created-date and owner

This diverges from the two rows ADR-0047 removed for relay. Those two rows answer "who made this
space someone else's, and when" — meaningless on a system site — but the introduction text is a
space describing itself, which still has meaning on the DoU home. So it is not gated by
`isHomePlace`; it is judged purely by whether a value exists.

Practical consequence: the relay default place has no edit entry point, so there is no way for a
value to be filled in yet. Still, no branch is added — so the code doesn't need to change again the
day a value does appear.

### 5. The cap is 100 characters; the clamp lives at the call site

Respecting `Textarea`'s design (fact 4), clamp with `slice(0, 100)` in `onChange`. No counter is
improvised on the screen — if design later requires a counter, an opt-in prop is added to
`Textarea` (the component's own comment already leaves room for that extension).

Box height drops from the default 198px to 96px. 198px was sized for the feedback form's
5000-character field, which is too tall for 100 characters.

### Out of scope

- **Introduction input during place creation.** `PlaceCreateRequestData` also accepts `desc`, but
  `CreatePlaceDialog`/`SetupWizardPage` are untouched. The creation flow is a place where every
  additional field raises drop-off, so it needs its own separate decision.
- Showing the introduction in the home place list/switch UI.
- Changes to `apps/mobile`/`desktop-web` — this covers web screens only.
- Server-side length or profanity validation. Only a client-side clamp is added.

## Alternatives

**Use a `TextField` for the introduction** — passing `maxLength` gives an "N/100" counter for
free. But it is a single-line input, so 100 characters would flow on one line with no line breaks.
The introduction is meant to be a sentence, not a name. Rejected.

**Also hide it on the relay default place** — would match the shape of ADR-0047's relay exception.
But the reasoning behind that exception (ownership/creation facts are meaningless on a system site)
does not apply to the introduction text. Adding a branch with no underlying reason, just for
shape-consistency, was rejected.

**Fill an empty introduction with a "no introduction yet" prompt** — signals to the owner that
"you can fill this in." But the info screen is read-only, so there's no way to act on that signal
there, and non-owners have no permission to fill it in either. It would also conflict with the rule
established for the created-date/owner rows. Rejected — if we want to nudge people to fill it in,
that belongs on the hub or home, not the info screen.

**Edit the ADR-0047 text directly and just delete the exclusion sentence** — the smallest change.
But erasing a past decision from an Accepted ADR would erase the record of "why it was once
excluded." ADR-0012 → ADR-0020's amendment is this repo's precedent, so this ADR follows that form
instead.

## Consequences

- ADR-0047 remains valid, but its §Scope sentence about `desc` is replaced by this ADR. A link back
  to this amendment is added to that document.
- The exclusion list in `place-settings.md` drops this item and moves it into the inclusion/
  scenario section. Changing only the code and leaving the doc as-is would make the doc lie.
- `PlaceEditPage` gets tests for the first time (`PlaceEditPage.test.tsx`). Seeding, dirty state,
  clamping, and payload composition become regression targets.
- **Two unverified assumptions remain** — (1) whether the `user.mysite` (list) response carries
  `desc`. ADR-0047 already saw `ownerId`/`isOwner` split between relay and cloud, so the type
  declaration alone isn't proof. If the list omits it, it also has to be checked whether
  `place.get` fills it in. (2) whether a partial payload (`{ id, name, desc }`) clears `thumbnail`
  on the server. Both require hitting the real server to confirm, and the results go into
  `place-settings.md` §Verified facts.
