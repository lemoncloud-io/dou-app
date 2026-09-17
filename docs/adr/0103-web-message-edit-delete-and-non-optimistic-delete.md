# ADR: message edit/delete on `apps/web`, shared predicates, and a delete that waits for the server

> Status: Accepted · Decided: 2026-09-17
> Scope: `apps/web/src/app/features/channels/**` · `apps/web/public/locales/{ko,en}/translation.json` ·
> `libs/data/src/domain/messageEdit.ts` · `libs/data/src/repositories/ChatRepository.ts` ·
> `.github/workflows/verify.yml`
> Related: [ADR-0093](./0093-web-emoji-reaction-and-thread.md) (introduced the long-press action
> sheet this extends) · [ADR-0047](./0047-web-reaction-and-thread-refinements.md) (the sheet's
> stable-row-count rule this gives up)

## Context

`apps/web` had no way to edit or delete a message. `apps/desktop-web` has had both since
2026-08-04, and everything underneath — the socket operations, the engine repository, the tombstone
rendering — was already present and already shared. The gap was a presentation layer, and its cost
fell on exactly the users least able to avoid it: a typo made on a phone stayed a typo.

Three things had to be decided rather than merely built.

**Where the two judgements live.** "May I change this message" and "has this message been changed"
both existed only inside `apps/desktop-web`. `apps/web` could not ask them without answering them a
second time.

**What "edited" even means.** The server has no edit flag — no `editedAt`, no `isEdited`. The chat
model has a last-updated timestamp and a last-modifier, and neither says a person rewrote the text.

**A delete that could not fail safely.** `ChatRepository.deleteChat` hid the cached row before the
request and restored the previous record if the request failed. The restore never worked.
`cacheWrite` merges, so writing the previous record back cannot clear a key that record never had —
and `hidden` was a key the optimistic write had _added_. A failed delete left the message looking
deleted while it was alive on the server, and the existing test did not catch it because its cache
double was a `jest.fn()`, which records the arguments of a write and not what the cache then holds.

## Decision

### 1. The predicates move to `libs/data/src/domain/`, and desktop is not touched

`canModifyMessage` and `isMessageEdited` now sit in the chat domain layer beside the preview
predicates, which are there for the same reason and set the shape: a pure judgement over one domain
model, no screen concepts. `apps/web` consumes them; `apps/desktop-web` keeps its own copy.

Three options were open. Copying the rules into `apps/web` would leave two copies with no canonical
one, both inside apps. Lifting desktop's copies into the shared layer is the clean end state but
requires changing `apps/desktop-web`, which was out of scope. The third — put the canonical copy in
the shared layer, move only `apps/web` onto it — was taken. **Two copies still exist, and the cost
is real**: if someone edits the desktop copy, the same message behaves differently on two devices.
The only thing holding them together is a comment in the shared file saying which one is canonical.
That is discipline, not a mechanism, and this ADR is the record that we chose to carry it.

The migration is deliberately deferred to the day the server grows a real edit flag, because that
day forces `apps/desktop-web` open anyway and forces `isMessageEdited` to be rewritten — one
opening instead of two.

**Authorship is NOT shared.** Desktop reconciles the account id an optimistic row carries with the
cloud id the server rewrites it to; `apps/web` compares a single id. Both already back something
visible — which side of the feed a bubble sits on — so gating on each app's existing answer adds no
new risk. If that answer is wrong, the alignment is visibly wrong first.

### 2. "Edited" is inferred client-side, and that is the settled answer, not a stopgap

`isMessageEdited` reports that `updatedAt` has moved past `createdAt`. We chose not to ask the
server for a flag.

**Measured after this was written, and the cost is larger than stated here.** The premise — that an
edit moves `updatedAt` past `createdAt` — holds on the server, but the `chat.update` RESPONSE
carries the pre-update value. `updateChat` writes that response verbatim, so on the editor's own
screen `updatedAt === createdAt` right after a successful save and no marker appears; the same row
re-fetched shows `updatedAt > createdAt` and the marker lands. The marker is therefore not late by
one server round trip, as decision 4 below implies, but by "until that room is fetched again."
Observed 2026-09-17 against the dev server.

**And the other party's screen is worse.** Measured with two accounts in a 1:1 room on 2026-09-17:
the edited text reaches the peer over the socket within a second, but the marker never appears
there — not on arrival, not after re-entering the room, not after a cold app restart. The author at
least gets it after a full reload. The likely mechanism is one this design already documented: an
edit does not advance `chatNo`, so watermark-based delta sync never re-pulls the row and the peer
keeps the socket-pushed copy, which carries the same stale `updatedAt`. So decision 2's guarantee —
that an edited message is marked — does not hold today for the reader it is meant for.

Left as is for now, and **not decided**: a client-side timestamp would assert an edit time the
server never gave, and re-fetching after every edit doubles the wait on the one operation this
design deliberately makes the user sit through — and would not help the peer at all, which is the
side that matters. The open question is recorded in the vault lane, not here.

The weakness this section was written for is a different one, and also real: this detects _the row
was written again_, not _a person changed the text_. Any future server-side write to a chat row — a moderation flag, a pin, a counter
— would make every touched message read as edited. Three exclusions keep it honest today (deleted
rows, whose delete is a `PUT` on the same row; unsent rows; missing timestamps), and the inference
never leaks to callers, who ask only "was this edited". Keeping it in one file is what makes the
eventual fix a one-line change.

### 3. Delete waits for the server; edit stays optimistic

The broken rollback was not repaired. It was made unnecessary: send the request, write the server's
answer, and if it fails nothing has changed and nothing needs undoing. The read–hide–restore branch
went away whole.

Delete is the operation with the least to gain from optimism. It already costs a confirmation step,
it is rare, and it cannot be undone; showing it as done before the server knows is not speed. Send
and edit keep their optimistic paths, where immediacy is worth it and a rollback actually works.

**This is a shared-engine change, so `apps/desktop-web`'s delete became non-optimistic too** — a
behavior change to a screen this work otherwise did not touch, accepted rather than special-cased.

### 4. Editing does not close on save, and diverges from desktop on purpose

Pressing save locks the editor and waits. Only the server's acceptance closes it. A rejection lands
back in an editor that still holds what was typed, and can be saved again.

Desktop closes immediately and leaves a notice. The two now differ. Mobile is the side that fails
more often, and there closing on the press means a failure has nowhere to return to — the person's
words are gone. Unifying this is not planned; the failure profiles genuinely differ.

The editor is seeded from the message's body, never from the bubble's rendered text. The bubble
truncates at 200 characters, and seeding from what is drawn would silently destroy everything past
the cut on the first save. This is pinned by a test rather than a comment.

### 5. The sheet's stable row count is given up

The long-press sheet deliberately kept a constant number of rows so targets would not move under
the thumb between long-presses. Edit and delete exist only on your own messages, so the list is now
two rows or four.

The alternative was a second message-action surface on a phone, which is worse than a sheet that is
sometimes longer. What the invariant was protecting is preserved: the new actions are appended
**below** the existing two, which keep their positions. The component says so in a comment, because
otherwise the next reader restores the invariant and removes the feature.

Delete also gets its own wording. `apps/web` already said "삭제" for clearing an unsent row from
your own screen. The two never appear on the same message, but the same person meets both, and one
word for both teaches that the earlier one was hidden from the other side too.

### 6. `apps/web` joins the CI test gate

The test step excluded `web` because 7 of its 2720 tests failed, so every change to the app was
verified by whoever remembered to run jest. All 7 were stale tests, not product bugs; they were
fixed and `web` came off the exclusion list. This was scope this work did not need and took anyway
— without it, a green CI says nothing about a change that is almost entirely `apps/web`.

## Consequences

**Gained.** Phone users can fix and remove their own messages. The two judgements have one
canonical home, so the eventual server flag is one replacement. A failed edit no longer swallows
what was typed. A failed delete no longer lies about having succeeded. Every `apps/web` test now
runs on every PR.

**Paid.** Two copies of the same rules until the desktop migration. False "edited" markers if the
server starts writing chat rows for other reasons. The sheet's row count is no longer constant.
Desktop's delete lost its optimistic feel. The two apps' edit-failure behavior, copy systems and
editing shapes have diverged. CI's test step got slower.

**Where it breaks first.** The two copies drifting silently. Nothing detects it — only the comment
naming the canonical copy stands in the way.
