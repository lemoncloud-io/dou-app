# ADR-0354: A mini app's consent is per place and says what members and an owned cloud carry

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/sub-webview-consent-copy`
> · Scope: `apps/mobile/src/app/subWebView/` (`subWebViewRuntimeConsentPrompt.ts` — the words;
> `subWebViewRuntimeConsent.ts` — the kept yes and its revision) · `apps/mobile/src/app/utils/i18n/`
> (the sentences)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md#runtime-reads)
> · Related: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> (the reads and the first question), [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md)
> (the send and its question), [ADR-0347](./0347-a-mini-app-reads-only-the-place-its-view-opened-on.md)
> (reads held to the opened place)

## Context

Before a mini app's first runtime answer the app asks the user, in a system alert, whether the page may
read this cloud. The question named the permissions as short phrases ("members and profiles") and said
the page could change nothing.

Three things it did not say had become true or were always true:

- **Members carry their accounts.** The rows a page reads are not filtered: a user row carries the
  account's sign-in id and whatever else the server fills in, and that is a deliberate choice (the
  owner who approves a mini app already holds that data, and a filter would be a list to keep in step
  with the server forever). Not filtering puts the weight on the user's yes, and the question did not
  tell them.
- **An owned cloud carries its account.** For a cloud the user owns, `cloud.getCloud` answers the
  relay's whole view of it: owner, verified email, linked account, subscription id, the cloud server's
  account number and its service endpoints. The question called all of that "the cloud".
- **Reads are held to a place.** Since ADR-0347 a page reads a place's rooms, messages and members only
  in the place it was opened in, and nothing once the user moves. The question still spoke of the
  cloud only, which reads wider than what is allowed.

A yes was kept per user, page and cloud (and per place for a page that sends), with the permissions it
covered. That left two questions: whether a yes given in one place should answer in another place of
the same cloud, and whether the users who said yes to the old words are asked again.

A user sees a cloud one place at a time — its rooms, its members, its messages — and a page reads only
the place it was opened in. A yes for one place's rooms is not a yes for another's.

## Decision

1. **Consent is per place, for every page.** A yes is kept per user, page, cloud and place — a page that
   only reads as much as one that sends — and the first open in another place of the same cloud asks
   again. Every permission, `cloud` included, is asked in the one question at that one unit: splitting the
   cloud's own row into a cloud-wide question would put two questions before one page for no gain. On
   Home the place is Home's own place. The store key always carries the place; a yes kept per cloud alone,
   before this, is never looked up again, since nothing says which place it was given in.
2. **The question is built from sentences, one per thing agreed to:** what the page reads (and, with
   `chatSend`, that it posts in the user's name); with `channel`, `chat` or `user`, that those come from
   this place only, and that another place asks again; with `user`, that members come with what their accounts carry,
   such as each member's sign-in id; with `cloud`, that an owned cloud comes with its owner, linked
   account, subscription and server; and what the page cannot do. A combination of permissions gets
   exactly the sentences that are true of it.
3. **A yes is kept with the revision of the words it was given under.** Each permission whose sentence
   has grown carries the revision it needs (`SUB_WEB_VIEW_CONSENT_REVISION`); a kept yes covers it only
   from that revision on. A yes kept before revisions existed reads as revision 1.
4. **An earlier yes that covered `user` or `cloud` is asked again** (until the user says yes; a no
   is kept for the view only, as always). It was given without the sentence that is the disclosure the
   unfiltered rows lean on. An earlier per-place yes (a page that sends) without either stands: the place
   sentence describes a narrowing (ADR-0347), so the user agreed to more than is now read, not less. An
   earlier read-only yes, kept per cloud, is asked again in each place by decision 1.

## Alternatives

- **Keep every earlier yes.** Fewer interruptions, and the rows a page reads did not change on the day
  the words did. Rejected for `user` and `cloud`: the not-filtering decision is defensible only if the user is told,
  and a yes given before the telling would carry the old, quieter question forever.
- **Ask every earlier yes again.** Simple, one version for the whole store. Rejected: a page that never
  read members would interrupt its users for a sentence that does not apply to it, or for one that
  narrows what it does.
- **Keep read-only yeses per cloud, and say "the place the page is opened in".** Fewer questions: one
  per cloud for a page that only reads, its reads still held to whichever place it opens in. Rejected:
  what the user agrees to is a place's rooms and members, which differ from place to place, and a yes
  given while looking at one place would quietly answer for places the user had not seen the page in.
- **Ask `cloud` per cloud and the rest per place.** Two questions for one page; the cloud's own row is
  read with the place's in every page that asks for it, so one question at the narrower unit is
  simpler and loses nothing.
- **A version on the whole store key instead of on the value.** It would orphan every kept answer at
  once, which is the second alternative by another route.

## Consequences

- Users who allowed a page that only reads see the question again, once per place they open it in.
  Users who allowed a page with `user` or `cloud` see it once more too, on that page's next runtime hello.
  A page already has to wait on the hello without a timeout; it now has to expect that wait even where
  the user allowed it before.
- The next time a sentence grows (a new permission's own sentence does not count, since a yes without
  that permission never covered it), its permission takes the next revision and only yeses covering it
  are asked again.
- A kept yes now ends in `;<revision>`. An app from before this change, after a downgrade, reads the
  suffix as part of the last permission's name, asks again and keeps a yes without it, which this app
  then asks again. Only a downgrade does that, and it costs a question, not a wrong answer.
- The words are the app's; a page cannot read them, and no message, field or bridge version changes.
