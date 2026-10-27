# ADR-0236: Message marks nest, as the composer stacks them

> Status: Accepted · Decided: 2026-10-27
> Scope: `apps/desktop-web/src/app/features/chat/components/RichText.tsx` ·
> `apps/desktop-web/src/app/shared/utils/stripMarkdown.ts` ·
> `apps/web/src/app/features/channels/utils/messageTokens.ts` ·
> `apps/web/src/app/features/channels/components/MessageText.tsx`
> Supersedes: the sentence "Marks do not nest, as on desktop" in
> [ADR-0201](./0201-the-web-reader-draws-the-whole-message-dialect-kept-inline-in-content.md). The rest
> of that decision — the dialect stays inline in `content`, both readers draw the same set with the same
> rules — stands unchanged.

## Context

The desktop composer's format buttons stack. Bold and italic on the same words export as
`***123123***`; italic on part of a bold run as `**a *b* c**`; bold with strikethrough as
`**~~x~~**`. That is ordinary markdown, and the editor reads it back the same way.

Both readers matched each mark in one pass whose bold and italic runs could hold no `*`. So
`***123123***` matched as bold `**123123**` one character in, and the outer `*` either side were left
as text: the message arrived as a bold `*123123*`, the italic lost. `**~~x~~**` matched, but the words
inside a mark were never read again, so it showed a bold `~~x~~`. ADR-0201 wrote the "do not nest"
rule down as the desktop's behaviour; nothing at the time stacked marks except by hand.

## Decision

Marks nest in both readers. A bold run may hold whole italic runs and an italic run whole bold runs;
strikethrough already held either. The words a mark captures are read again — for marks only.

Only marks, because the rest of ADR-0201's behaviour inside a mark is kept: an address inside `**…**`
stays its words (not linked, not unfurled), and the desktop still shows an `@name` inside a mark as
words while the web draws it as a mention, the difference ADR-0201 already lists.

## Alternatives

- **Only exact overlaps as a combined mark** (`***x***`, `**~~x~~**`). Rejected: italic on part of a
  bold run — the next thing a person does with the same two buttons — would still arrive broken.
- **Fix the desktop reader only.** Rejected: ADR-0201's rule that a dialect change lands in both
  readers together is what keeps one message reading the same on desktop and in the app.
- **Change what the composer writes** (refuse to stack, or write a form the old readers parse).
  Rejected: the editor shows both marks while typing, and every reader of ordinary markdown reads
  `***x***` as both. The readers were what was wrong.
- **Read links and mentions inside a mark too.** Not taken here: it changes what an address inside
  bold does (link and unfurl card), which is a separate decision from drawing the marks a person
  applied.

## Consequences

- A message formatted with stacked buttons reads as it was typed, on desktop, the web and the app.
- The web reader's mark token carries `children` (inline tokens) instead of a `value` string; its
  preview flattens them, so the home list still shows the words without markers. The desktop's
  flattener (sidebar preview, OS notification body) drops stacked markers by the same patterns.
- Messages already sent with stacked marks are fixed retroactively — the text was always right.
- The pattern's cost on long adversarial input (60,000 characters of `*` runs) stayed within the old
  one's, about 1–2 ms.
- On desktop the bold and italic patterns live in `markMatch.ts`, shared by the reader and the
  plain-text preview; the web keeps its own copy, as it does for labelled links.
