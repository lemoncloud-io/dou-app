# 0195. Messages carry labelled links as `[words](address)`

Date: 2026-10-13

## Status

Accepted.

## Context

Message text is a small markdown-like dialect. The desktop reader draws bold, italic, strike, inline
code, fenced blocks and quotes. The web reader (which the mobile app shows in its WebView) draws
inline code and fenced blocks. Both turn a bare `http(s)` address into a link. A link could only ever
be its address.

The desktop composer was rebuilt on Slack's layout, and Slack's link button asks for the words to
show and the address they go to. A button that could only insert an address was a poor match: it
made the user paste the address into the text, which the composer already did by itself. The
alternative was a link with words, which no reader understood: sent as `[docs](https://…)`, the
desktop drew the bracket text and linked the address with the closing parenthesis inside it, and the
web drew the brackets around a correct link.

## Decision

A message may hold a labelled link written as `[words](address)`, the inline-link form of markdown.
Readers draw the words as a link to the address when:

- the words hold no brackets and no line breaks, and
- the address is `http` or `https`, starts with a host, and holds no spaces or parentheses.

Anything else stays literal text, so `[x] done (see notes)` and `[x](javascript:…)` are not links.
Both readers apply the same rule, and a labelled link inside code stays code. Plain previews — the
sidebar, notifications and search on desktop, the home list on web — show the words. The web's link
preview card unfurls the address, as it does for a bare one.

The desktop composer writes this form from its link dialog, and only in a shape readers draw: brackets
in the words become parentheses, parentheses in the address are percent-encoded, and links pasted
from a web page that point anywhere else are unwrapped to their words. It reads the form back when a
message is edited, by the same rule, so the link stays a link. Typing the form by hand is not a shortcut in the composer. It is
sent as typed, and readers then draw it like any other labelled link.

## Alternatives

- **Keep links address-only.** No format change, and the composer's link button would insert the
  address at the caret. This was built first and rejected on review: it did not do what the button
  is for.
- **Slack's own `<address|words>`.** Block Kit messages already use it, but in plain message text
  `<` and `|` are ordinary characters people type, and the markdown form is what the composer's
  editor (Lexical) reads and writes without custom code.
- **Ship the desktop side alone.** Labelled links would then show raw on the web and in the mobile
  app until the web reader caught up. Both readers change in the same pull request instead.

## Consequences

- Clients built before this change show the raw `[words](address)` text. On those clients the
  address is still linked, with or without the closing parenthesis depending on the client. This
  lasts until each client is updated.
- An address that contains parentheses (some wiki URLs) goes out percent-encoded. A message written
  by hand with raw parentheses in a labelled link's address is not drawn as a link.
- The words are drawn as plain text. Formatting inside them (`[**docs**](…)`) shows its markers.
- Desktop search matches a labelled link by its words, not its address, because it searches the
  plain-text form.
- The two readers keep separate copies of the pattern, desktop in `linkMatch.ts` and web in
  `messageTokens.ts`. A change to the rule has to be made in both.
