# ADR-0055: Mobile Web — Code Block Rendering, Home Sort Fix, and Post-Login Return

> Status: Decisions 1·4 Accepted (implemented) · **Decisions 2·3 Reverted (2026-08-14) → Re-landed (2026-08-18)** ·
> Decided: 2026-08-14
>
> Where the implementation landed is described in two documents — Decision 1 in
> chat-link-preview.md (lived in the root docs tree, which has since been removed), Decision 4 in
> [apps/web/docs/feature/auth/login-return.md](../../apps/web/docs/feature/auth/login-return.md).
>
> **Decisions 2 and 3 (changing the home sort key, removing the `lastChat$` derivation) were reverted
> on 2026-08-14 after a runtime error, then re-landed on 2026-08-18.** The cause of the rollback (a
> refactor that lifted the row-level `useLastChat` up to the list level) had, by the time of the
> re-landing, already been superseded by ADR-0057's `useLastChats` + `chat.observeLastList`, so this
> time only the sort key had to consume that result. Details are in the note under each decision.
> See also [last-chat.md](../../apps/web/docs/feature/home/last-chat.md).
>
> This document is a historical record, so the original decision text is not edited. **The
> `linkTokens.ts`/`LinkedText.tsx` paths this body cites were each replaced during implementation by
> `messageTokens.ts`/`MessageText.tsx`, and no longer exist** — read them as links to the code as it
> was at decision time. A note has been added under each decision where it later diverged from what was
> decided.

## Context

Three requests came in for mobile web (`apps/web`). Investigation found all three were not "build a
feature that doesn't exist" — they were **either the current implementation drifting from intent, or
an item an earlier ADR had deliberately deferred.**

### 1. Message bodies have no code-block recognition

Message body rendering is a single component, `LinkedText`, and its tokenizer **deliberately excludes**
markdown:

> Deliberately URLs only — no markdown, no mentions. (…) widening this to real formatting is a
> **product decision**, not a side effect of link previews.
> — `linkTokens.ts`

So this request reverses that product decision, and it is worth recording as an ADR.

Measuring the actual render sites found that the three screens named in the request were **not three
independent sites**:

- `ChannelRoomPage` and `ThreadPage` use **the same component** — one `<LinkedText>` at
  [`ChannelMessageRow.tsx:268`](../../apps/web/src/app/features/channels/components/ChannelMessageRow.tsx)
  draws both screens' bubbles.
- The room screen's **full-view dialog** calls `LinkedText` separately
  ([`ChannelRoomPage.tsx:897`](../../apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx)).
- **Home is different in kind.** It is a single-line preview, not a bubble
  ([`ChannelList.tsx:117`](../../apps/web/src/app/features/home/components/ChannelList.tsx)'s
  `preview`), so there is no room to render a code block at all.

Technical constraints were also confirmed. The repo has **no** markdown or syntax-highlighting
dependency at all (`@lexical/markdown` is for the admin editor only). Adding highlighting means a new
dependency in the mobile web bundle.

### 2. Home sort is not "most recent chat arrival"

`DEFAULT_CHANNEL_SORT` is already `'recent'`
([`preferenceKeys.ts`](../../apps/web/src/app/stores/preferenceKeys.ts)). The problem is which value
that `'recent'` reads — `sortChannels.ts:40`:

```
join.updatedAt  →  channel.$join.updatedAt  →  lastActivityAt / updatedAt
```

**The primary key is my own join's `updatedAt` — the moment my read cursor was last updated.** The
result:

- If I simply **enter and read** a room, even with no new message, it jumps to the top.
- Since **someone else's newest message never touches my join**, it cannot change the order.

This is already known. ADR-0047 found it during its investigation and **explicitly deferred it as a
follow-up:**

> Investigation shows sort barely reacts to reactions. `'recent'`'s primary key is my own join's
> `updatedAt`, so whatever anyone else sends never changes the order. (…) As a side finding, the
> preexisting property that **someone else's new message never changes home's order** surfaced, but
> it is out of this scope (see follow-up).
> — ADR-0047 §3

**This ADR is that follow-up.**

It was also confirmed that the same row's **displayed time comes from an entirely different source.**
`time` is the actual last message's `createdAt`, pulled from the chat cache by
[`useLastChat`](../../apps/web/src/app/hooks/useLastChat.ts). In other words, **the timestamp printed
on screen and the sort order look at two different values.**

#### `lastChat$` is a dead field

The fallback path's `lastActivityAt` is derived in the mapper
([`mappers.ts:90`](../../libs/data/src/domain/mappers.ts)):

```ts
lastActivityAt: Math.max(lastChatAtMs, updatedAtMs); // lastChatAtMs = toEpochMs(api.lastChat$?.createdAt)
```

But **the server no longer embeds `lastChat$` in the channel.** Several places in the repo testify to
this:

- `useLastChat` itself exists precisely because "the server no longer embeds `lastChat$`."
- desktop-web — "The channel record's `lastChat$` cannot stand in."
- [ADR-0048](0048-unread-count-derivation-contract.md) explicitly flags `computeUnreads`'s use of
  `lastChat$.chatNo` as a **Rule 1 violation** in its table.

In other words, `lastChatAtMs` is always `0`, and `lastActivityAt` is effectively identical to
`channel.updatedAt`. A derived field pretends to be "the last chat time" while doing nothing at all.

### 3. Login unconditionally bounces to home

The `LoginPage` the request pointed at
(`apps/web/src/app/features/auth/pages/LoginPage.tsx`) is an 18-line redirect shim, not a screen. **The
actual login screen is
`apps/web/src/app/features/mypage/pages/LoginPage.tsx`**, and the culprit is that screen's
`leaveForHome()`:

```ts
// [/, /mypage, /mypage/login] → [/]
const stepsBack = window.history.length - 1;
window.history.go(-stepsBack); // rewind history to the start
// popstate then window.location.replace('/'); // full reload to home
```

**Both** social login and phone login call this. There are 5 entry points, each expecting to return
somewhere different:

| Entry point                | Location                                                                    | Expected return point      |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `MyPage`                   | `apps/web/src/app/features/mypage/pages/MyPage.tsx:127`                     | My page                    |
| `PhoneVerifyBanner`        | `apps/web/src/app/features/auth/components/PhoneVerifyBanner.tsx:34`        | The screen with the banner |
| `SubscriptionSelectDialog` | `apps/web/src/app/features/home/components/SubscriptionSelectDialog.tsx:87` | Home (subscription select) |
| `SubscriptionPage`         | `apps/web/src/app/features/subscription/pages/SubscriptionPage.tsx:43`      | Subscription screen        |
| `SubscriptionPlansPage`    | `apps/web/src/app/features/subscription/pages/SubscriptionPlansPage.tsx:61` | Plans screen               |

Notably, if the user **logged in mid subscription checkout**, the flow needs to continue back on the
payment screen — instead it bounces to home and the flow breaks.

The original intent behind rewinding history was to prevent "back button loops back into the login
screen." This is achievable with `replace` navigation alone.

On the session side: for phone login, `applySessionToken` installs the new identity into web-core and
the live socket **before** `onVerified`
([`usePhoneVerify.ts`](../../apps/web/src/app/features/auth/hooks/usePhoneVerify.ts)), and for social
login, `useLoginRelaySocial` hydrates the session. In other words, a full reload is **not required**
for the identity swap. A guest is already `isAuthenticated`, so login is a guest→real-account
promotion, and the router's route set (`privateRoutes`) stays the same throughout
([`routes/index.tsx`](../../apps/web/src/app/routes/index.tsx)).

The remaining concern was whether the local cache filled under a guest identity would stay stale after
promotion, but **it was confirmed (by the user) that the cache is compatible across a user change**, so
no separate handling is needed.

## Decision

### Decision 1 — Code blocks support inline and fenced blocks, no syntax highlighting

- **Supported syntax**: inline backticks (`` `code` ``) and triple-backtick fenced blocks (` ``` `).
  All other markdown (bold, italic, headings, lists, blockquotes, link syntax) is **still
  unsupported.** The "not markdown" principle declared in `linkTokens.ts` makes an exception only for
  these two.
- **No syntax highlighting.** A fence's language tag (` ```ts `) is parsed and either discarded or
  shown only as a label — no color. This is to avoid adding a shiki/highlight.js-class dependency to
  the mobile web bundle.
- **The tokenizer becomes a single unified pass.** Code tokenizing must apply **before** URL
  tokenizing, so a `https://...` inside a code region **does not become a link.** For the same reason
  `extractFirstUrl` (the link preview card) also skips code regions — a URL inside a code sample must
  not trigger an unfurl card.
- **Fenced blocks get their own copy button.** Only the code body, not the whole message, is copied to
  the clipboard. Since this coexists with the existing long-press → action-sheet → copy flow, the
  button's hit area must be explicitly bounded with pointer events so it does not swallow the
  long-press gesture.

**Scope of application**:

| Screen                              | Handling                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Channel room bubble · thread bubble | One fix to `ChannelMessageRow` applies to both screens at once                                                            |
| Room screen's full-view dialog      | Same renderer applies (fences are intact since the text is not truncated)                                                 |
| Home list's single-line preview     | **Plain text with backticks stripped.** A fenced block drops the fence lines and keeps only the first line of its content |

Home does not render — it **converts to plain text.** The goal is to keep markup characters from
showing up as noise in the list; no separate "this is code" badge or monospace font is added (avoiding
row-structure complexity and entanglement with the `blurLastMessage` setting).

### Decision 2 — Home sorts by the chat cache's latest message time, falling back to `channel.updatedAt`

- **Remove `join.updatedAt` / `$join.updatedAt` from `sortChannels`'s primary key.** My read cursor is
  not "the time a chat arrived."
- **The new primary key is the chat cache's latest message time.** It uses the exact value the home
  row already pulls in to display the time (`useLastChat`'s result) for sorting too. **The point of
  this decision is that display and sort now look at one source** — closing the preexisting flaw where
  the two values diverged.
- **The fallback is `channel.updatedAt`.** A channel whose cache is not yet filled (right after cold
  boot, or a row that was off-screen) falls back to this value to take its place.
- **Lift the `useLastChat` observation up to the list level.** Today `ChannelItem` (the row) calls it
  individually, but sorting needs to know the time **before** the rows are drawn. Since both the
  register and subscribe APIs are imperative (`getSyncManager().register`,
  `repositories.chat.observeList` — [`useSyncTarget.ts`](../../libs/app-runtime/src/socket/sync/hooks/useSyncTarget.ts)),
  a list-level hook handling N items is feasible. Rows **receive the result as a prop** — no
  duplicate observation is created.
- **`'unread'` sort and pinning stay as-is.** Both are stable sorts layered on top of this base order,
  so they are corrected automatically along with it.

> **Implementation note (2026-08-14).** This decision assumed the singular `useLastChat` would remain
> for `PlaceChannelManagePage`, but in fact **that screen also called `sortChannels`** — its code
> comment explicitly stated "same order as home" as a goal. Changing home's primary key alone would
> have silently split the two screens' order, so the management screen was converted along with it,
> and the singular hook was deleted once it had no callers left. The table above's "rows call it
> individually" description applied to the management screen too, not just home.

> **Rollback note (2026-08-14).** This decision was **reverted.** The list-level observation
> (`useLastChats`) caused a runtime error on home, and since home-entry stability outranks sort
> accuracy, the feature was dropped rather than patched. Scope of the revert: deleting `useLastChats`
> and its fan-out cap `limitConcurrency`, restoring the row-level `useLastChat`, restoring
> read-cursor-based sort in `sortChannels`, `ChannelList`, and `PlaceChannelManagePage`, and restoring
> `useSyncTarget` and `libs/app-runtime`'s public surface. As a result, the **"display time and sort
> order diverged" flaw** this decision claimed to close **is open again**, and the follow-up ADR-0047
> §3 left behind is still unresolved. Retrying this is handled by a separate ADR.

> **Re-landing note (2026-08-18).** This decision was **re-landed.** The part that caused the rollback
> (lifting a row-level hook to the list level) had already been done by ADR-0057 on independent
> grounds — `useLastChats` reads the entire list in one shot via `chat.observeLastList` rather than a
> fan-out cap, and home and the management screen split its result as props. So this change touched
> only `sortChannels`'s primary key: it takes the map already on screen, `lastChatByChannel`, sorts by
> `createdAtMs`, and removes `join.updatedAt`/`$join.updatedAt` from the activity-time chain (the
> fallback stays `channel.updatedAt` as decided). `joinByChannel` dropped out of `sortChannels`'s input
> but stays in `ChannelList`'s props for nickname/mute display, and the management screen's `myJoins`
> is still used for unread aggregation as before. So the **"display time and sort order diverged"
> flaw is now closed.**

### Decision 3 — Remove the `lastChat$` derivation from the mapper

- Remove the `lastChat$`-based `lastActivityAt` derivation from `mappers.ts`'s `toDomainChannel`, and
  fix the matching unit test to the new contract.
- **Scope is limited to the `libs/data` mapper.** `apps/testbed`'s `computeUnreads` is a separate item
  ADR-0048 already flags as a violation, and `desktop-web` is not part of this change.

> **Rollback note (2026-08-14).** Reverted along with Decision 2. `toDomainChannel`'s `lastChat$`-based
> `lastActivityAt` derivation and its unit test were restored to the original contract. The observation
> that context (§2) raised — "`lastChatAtMs` is always `0`, so the derivation does nothing" — **remains
> a valid preexisting debt**, independent of sorting, still open to be cleaned up separately.

> **Re-landing note (2026-08-18).** Re-landed along with Decision 2. `toDomainChannel`'s
> `lastActivityAt` is now `updatedAt` alone, and the unit test explicitly pins "does not look at
> `lastChat$`." Further, as of 2026-08-18, **`lastChat$` is used for nothing at all:** the sole source
> of the last message and its time is the chat cache (`chat.observeLastList`) — mixing in the server
> summary would give one channel two different answers about its "last activity." An empty preview for
> a channel with no cached row is not filled with this field; filling it is left to the chat-loading
> path.

### Decision 4 — Login return is a `returnTo` + `replace` soft navigation

- **The login screen stays a route.** It is not promoted to a modal/sheet — all 5 entry points would
  need fixing and deep-link paths would need separate handling, too broad a change for what it buys.
- On entering the login screen, **pass the previous path via `location.state`.** After a successful
  login, return with `navigate(returnTo, { replace: true })`. Since `replace` replaces the login entry,
  **no back-button loop can form** — this takes over the protection `leaveForHome`'s history rewind
  used to provide.
- **If there is no `returnTo`, go home.** This covers arriving at the login screen directly via a deep
  link or a refresh.
- **Drop `window.location.replace` (the full reload).** Both social and phone identities are swapped
  before the callback, so the reload is unnecessary, and this removes one white-flash.
- **The cache is not cleared.** It was confirmed to be compatible across a user change.
- **The return is "screen-level," not "state-level."** Returning to the subscription plans screen does
  not restore the plan selection state from before login. Restoring state is out of this scope.

### Excluded from scope

- Syntax highlighting, per-language coloring.
- Markdown syntax beyond code blocks (bold, italic, headings, lists, blockquotes, links).
- Compose-time assistance in the input box (`MessageInput`) — backtick auto-closing, a code-block
  insert button, a preview.
- Corresponding changes in `apps/desktop-web`, `apps/testbed`.
- A code badge or monospace font in the home preview.
- Restoring in-screen state (form input, selected plan) on login return.
- Home badges and unread-count aggregation logic (owned by ADR-0048, independent of this sort change).

## Alternatives

### Code blocks — inline backticks only

The minimal change, touching no bubble layout at all. Rejected because in practice, code people want
to share is usually multi-line, and supporting only inline means nothing happens exactly when it is
needed most.

### Code blocks — with highlighting

Looks best on paper, but brings a shiki/highlight.js dependency and needs a lazy-load design. Given
this targets **mobile web** and there is no precedent in the repo, the cost of a first introduction was
judged higher than the feature's value. Monospace font and horizontal scroll alone meet the readability
goal.

### Home preview — show the raw text as-is

`HomePage` would not need touching at all. Rejected because backticks would show up raw in the list,
making home look messier once code-block support is turned on, not less.

### Sort — `lastActivityAt` (= `channel.updatedAt`) alone

The smallest change surface, confined to one file, `sortChannels`. Rejected because once `lastChat$` is
removed this value equals `channel.updatedAt`, and **`updatedAt` also rises from channel-name or
setting changes.** Asking for "arrival order of the last chat" while a room jumps to the top just
because its name changed only half-satisfies the request. `updatedAt` is kept only as the fallback for
an unfilled cache.

### Sort — have the chat cache write `lastActivityAt` back onto the channel

Would capture both accuracy and incremental update. Rejected because it creates a **write that crosses
a layer boundary** — the chat local source writing to the channel record — and introduces a new
coupling into the cache contract (ADR-0051/0053). Reads alone achieve the same goal.

### Login — promote to a modal/sheet

The history problem disappears entirely and "the previous screen" stays automatically. Rejected
because all 5 entry points would need fixing, and deep-link/redirect paths into the login screen would
need separate design. `returnTo` + `replace` gives the same result with a much smaller change surface.

### Login — keep the route, return with a full reload

`window.location.replace(returnTo)`. Would fully preserve the cache-reboot effect, the safest option.
Rejected because cache compatibility was confirmed, removing that safety benefit, while every return
would still carry a white-flash.

## Consequences

### What is gained

- Code looks like code in the channel room, thread, and full view. **One component fix resolves two
  screens at once**, so the actual change surface is smaller than the request implied.
- URLs inside code regions no longer misbehave as links or unfurl cards. This is not a side effect —
  it is the unified tokenizer's **design goal.**
- Home's order follows actual conversation flow. **Someone else's message changes the order, and my
  own reading does not** — closing the item ADR-0047 deferred.
- Home rows now show **the same value** for display time and sort order — closing the preexisting flaw
  where the two sources diverged.
- The dead `lastChat$` dependency disappears from the mapper, removing the illusion that
  `lastActivityAt` — which in practice did nothing — was "the last chat time."
- Login no longer breaks the flow. In particular, **login mid subscription checkout** now returns to
  the payment screen.
- The full-reload white-flash on login return is gone.

### Trade-offs accepted

- **Code blocks have no color.** They are distinguished only by monospace font, background, and
  horizontal scroll. If a highlighting request comes back, it is handled by a separate ADR.
- **This applies retroactively to past messages.** An old message that used a backtick as punctuation
  could suddenly render as code. Unavoidable — the tokenizer reduces false positives with an "an
  unclosed backtick is plain text" rule.
- **Long-message truncation conflicts with fences.** A bubble is truncated at `MAX_MESSAGE_LENGTH`, and
  that cutoff point can land inside a fence. On the same principle as `LinkedText`'s `truncated` not
  linking a cut-off URL, a fence still open at the truncation point is treated as closed for rendering,
  and the full text is available in the full view.
- **The copy button and long-press compete for the same area.** Pointer-event boundaries must be
  explicitly designed on mobile so neither swallows the other — the part of this work that took the
  most care.
- **Home sort observation moves up to the list level.** `ChannelItem`'s `useLastChat` call is replaced
  by a prop, a structural change, and the related test (`ChannelList.test.tsx`) changes with it.
- **Order can shift once right after cold boot.** Before the cache fills, it renders with the fallback
  (`channel.updatedAt`), then re-sorts once the chat cache arrives. The two values are usually close so
  the shift is small, but not zero.
- **`PREVIEW_LOOKBACK = 30`'s cost now also lands on sorting.** The observation volume, multiplied by
  row count, is unchanged, and the importance of `useLastChat`'s comment warning "revert this first if
  home entry gets slow" goes up.
- **Login return only goes as far as the screen.** In-screen state such as the selected subscription
  plan is not restored, so the user must choose again.
- **Each of the 5 entry points is individually responsible for passing `returnTo`.** If even one misses
  it, that path silently falls back to home. Since the default is home, the failure is not visible, so
  all 5 paths are pinned with tests.

## References

- [ADR-0047: Web Reaction and Thread Refinements](0047-web-reaction-and-thread-refinements.md) — §3
  left this ADR's sort item as a follow-up.
- [ADR-0048: Unread Count Derivation Contract](0048-unread-count-derivation-contract.md) — flags
  using `lastChat$` as a head source as a rule violation.
- [ADR-0045: Web Emoji Reaction and Thread](0045-web-emoji-reaction-and-thread.md) — the basis for the
  `pickPreviewChat` feed filter.
