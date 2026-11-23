# @chatic/block-kit

**The slice of Slack's Block Kit this workspace draws, and the reader that turns a message body into
it.** Structured messages — a webhook's error report, a bot's card — arrive from the server as a Block
Kit payload. This lib parses that payload defensively into a small set of block types, draws them as a
React card, and flattens them to one line of plain text for every surface that is not the message
itself. Nothing here produces Block Kit; it only reads what the server sends.

## Who imports it

Three apps, through the barrel only:

| Consumer                 | Uses                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | `ChannelMessageRow` draws a chat's blocks with `BlockKitMessage`; `features/channels/utils/messagePlainText.ts` flattens them for previews                                                                                                |
| `apps/desktop-web`       | `MessageRow` draws them; `RichText`, the composer's `editorConfig` and `MentionNode` take the `MSG_*` style classes, so what is typed is what readers see; `shared/utils/messagePlainText.ts` flattens; the specs read the webhook sample |
| `apps/block-kit-builder` | Composes payloads against the same `KnownBlock` types and previews them with the same `BlockKitMessage`                                                                                                                                   |

```bash
git grep -l "@chatic/block-kit" -- apps libs ':!*.md'
```

**Why this is a library.** The builder exists to show what a payload will look like in a channel.
A second copy of the renderer in the builder would let its preview drift from what `web` and
`desktop-web` actually draw, which is the one thing the preview is there to rule out. The two chat
apps share it for the same reason: a webhook card has to read the same on the phone and on the
desktop.

This lib **knows nothing about the domain.** `resolveChatBlocks` takes a structural
`{ content?, blocks$? }` rather than `DomainChat`, so `@chatic/data` is not among its dependencies; any
chat view satisfies the shape. It has no i18n of its own either — see [Labels](#labels).

## What is in it

| File                     | Holds                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blockKit.ts`            | The block types (`section`, `header`, `divider`, `context`, and `unknown`), `parseBlocks` and `toBlocks`, `hasDrawableBlocks`, `decodeSlackEntities`, the mark grammar (`SLACK_MARKS`, `markPattern`)            |
| `resolveChatBlocks.ts`   | The read priority for one chat: `blocks$` from the server, then a parse of `content`, then plain text                                                                                                            |
| `BlockKitMessage.tsx`    | The card: one component per block type, heading levels, the type badge, the source link on the last line                                                                                                         |
| `renderMrkdwn.tsx`       | Slack's mrkdwn as React nodes — bold, italic, strike, links, mentions, inline code chips, fenced blocks                                                                                                          |
| `CollapsibleCode.tsx`    | A fenced block that folds to three lines when folding saves at least two                                                                                                                                         |
| `blocksToPlainText.ts`   | `blocksToPlainText` and `mrkdwnToPlainText`, for sidebar previews, notifications, search and the clipboard                                                                                                       |
| `sourceLink.ts`          | `takeSourceLink`: finds the message's "full report" link (`source$.url`, else the server's fixed-label context element) and takes that element off the last line, so the card does not show it twice; `isWebUrl` |
| `messageClasses.ts`      | The `MSG_*` Tailwind classes message bodies are drawn with, shared with desktop-web's composer                                                                                                                   |
| `blockKitLabels.ts`      | The few words the renderer itself shows, and the context a caller fills them through                                                                                                                             |
| `sampleWebhookBlocks.ts` | One reference webhook message — the send body and the `blocks$` the server derives from it — for specs                                                                                                           |

## Rules

1. **Never draw nothing.** A block type this lib does not draw, or a supported one missing the field
   it needs, becomes an `unknown` block that carries its source as text. The card shows that source
   rather than an empty bubble; when no block in the message can be drawn at all, `BlockKitMessage` shows the original body instead, through the caller's `renderFallback`. `hasDrawableBlocks` is the single answer to "is there anything to draw
   as Block Kit"; `BlockKitMessage` and the callers that decide a row's layout (on `apps/web`, whether
   the message leaves the speech bubble) both read it, so the row and the renderer cannot disagree.
2. **Reading never throws.** `parseBlocks` returns `null` for anything that is not a JSON object with a
   non-empty `blocks` array, and callers read `null` as "plain text, drawn the way it always was".
   It decides by content alone — the opening brace, then the parse — and does not trust the message's
   `contentType` marker, whose value is not settled server-side and which this client's own send
   path sets to `'text'` by default.
3. **One read order, in one function.** `resolveChatBlocks` prefers a non-empty `blocks$` array from
   the server, then a parse of `content`. Its `source` says which: `'field'` means `content` is the
   server's own plain-text summary, and a caller that needs a display string uses that rather than
   folding the blocks back into text.
4. **Slack's mrkdwn is not the composer's markdown.** `*x*` is bold here and italic in `RichText`;
   `~x~` strikes here. The two parsers stay apart; what they share is the style classes in
   `messageClasses.ts`. `markPattern` is the one definition of a mark, used by both the renderer and
   the flattener: a mark counts only when its delimiters stand alone, which keeps `user_id` whole.
5. **The flattened line drops what it cannot say.** In one line of preview, raw JSON is noise, so
   `blocksToPlainText` leaves `unknown` blocks out whenever anything else has text, and falls back to
   their source only when nothing does.
6. **Only a web address becomes the source link.** The source link is webhook input the server
   stores without reading; `isWebUrl` lets `http` and `https` through and nothing else, because a
   caller hands that link to the OS browser.

## Why it works this way

- **Only webhook messages become cards.** `resolveChatBlocks` reads Block Kit only when
  `stereo === 'webhook'`. A person who pastes Block Kit JSON into the composer wrote text; drawing it
  as a card would let anyone post something indistinguishable from an integration's alert.
- **`blocks$` is typed `unknown` here.** The published socials API types do not declare it yet, and
  declaring it loosely lets callers pass a `DomainChat` that has no such field. An empty array falls
  through to the `content` parse, so a server that ever sends one still never produces an empty bubble.
- **The sender's `source$.color` and channel name are untrusted.** The server checks neither shape
  nor length, so they are only matched or parsed, never printed as markup or written into a style;
  the page gets only a computed `#RRGGBB`. The name table, hex shape and grey cut match the server's
  (case-insensitive), so the title's emoji and the badge colour cannot disagree. The table is a `Map`
  so a sender's `constructor` or `__proto__` gets no answer. Results are cached per value, bounded.
- **Accent contrast is measured on a stand-in ground.** Colours are walked in lightness only (hue
  kept) until they clear 4.5:1 against a ground just past the lightest dark card and the darkest
  light card of any caller, so one result is safe in all three apps. A caller whose `--card` goes
  beyond those bounds breaks that guarantee and has to be kept inside by hand.
- **Sizes are written out, not read from app tokens.** The callers name type tokens alike but size
  them differently (`text-body` is 16px in `apps/web`, 15px elsewhere), so tokens would draw a
  different card in each and the builder's preview would not match a channel. The `desktop` scale
  is one step larger than `phone` for the wider column.
- **Newlines are significant** in every Slack text object, so text keeps `white-space: pre-wrap`.
  A field written `*Label*\nvalue` is drawn as a small caption over its value, because two bold
  first lines side by side in a grid compete with the card's title.
- **Long values must not push the card wider.** Field values use `min-w-0` and
  `overflow-wrap: anywhere`, since a flex item will not shrink below its longest word (a hash, a URL).
  Fields flow as content-width columns capped in width, so a maximised window does not put a label a
  screen away from its value.
- **A context block's elements are joined with a space**, the same as `blocksToPlainText`, so the
  sidebar preview and the message read the same.
- **Fenced runs wrap, they do not scroll.** In a card a fence is nearly always a stack trace, and a
  sideways scroll on a phone hides the end of each frame line, which holds the file and line number.
  The composer's fenced block keeps its well; it is code a person pasted.
- **Folding drops lines instead of clamping them.** A CSS line clamp counts wrapped lines and a
  `max-height` assumes a line height, so a narrow card would fold differently from a wide one. The
  cost is that browser find skips the folded lines; the flattened copy still holds all of them. A fold
  needs at least two lines saved for one line of chrome, and keeps three visible (the first line of a
  trace is the error, the next two say where it came from). The fold is a local control, not an
  `actions` block, which the server contract does not carry.
- **Inline code is a bordered chip in the text's own face**, not monospace: in a webhook card it is a
  value (service, version, status). `font-family: inherit` undoes preflight's monospace and
  `box-decoration-clone` keeps the chip's edges when it wraps.
- **Entities decode after link parsing** in the flattener, and the character in front of a mark is
  decoded with the run before it. Decoding first would turn an escaped `&lt;` into a link that was
  never in the message, or split an `&amp;` in half.
- **Compiled patterns are built once at module load**, since the flattener runs over every cached row
  of a search.
- **The type badge text is the channel name as words** (`ci-deploy` becomes `ci deploy`); the capitals
  are CSS, so a copied badge and a screen reader get the words. It is cut to one line.
- **The caller's `labels` and `renderFallback` stay props** because the lib has no i18n and does not
  know the app's message dialect.

## Usage

```tsx
import { BlockKitMessage, resolveChatBlocks, takeSourceLink } from '@chatic/block-kit';

const { blocks } = resolveChatBlocks(chat);
if (blocks) {
    const { blocks: drawn, sourceUrl } = takeSourceLink(blocks);
    return (
        <BlockKitMessage
            blocks={drawn}
            raw={chat.content ?? ''}
            sourceUrl={sourceUrl}
            renderFallback={body => <RichText text={body} />}
            onLinkClick={openOutside}
            labels={{ collapseCode: t('…') }}
        />
    );
}
```

- **`raw`** is the original message body, shown when nothing in `blocks` can be drawn.
- **`renderFallback`** draws that body. It is a prop, not an import, because the callers read a body
  differently: desktop-web passes its `RichText` (the composer's dialect, the reader's own mentions
  highlighted), the builder passes nothing and gets literal text.
- **`onLinkClick`** opens a link in place of the anchor's default `target="_blank"`. Inside the
  phone app's WebView a `_blank` anchor replaces the app's own page, so `apps/web` passes its handler
  that opens the URL outside the app.
- **`sourceUrl`** is drawn as a labelled link on the card's last line, in the card's link colour. It is
  ignored unless it is `http(s)`.

## Labels

The renderer shows three words of its own — expand and collapse on a folded code block, and the
accessible name of the source link. Each caller already translates differently (`web` fetches its
locales, `desktop-web` bundles typed tables, the builder has none), so this lib does not grow an i18n
of its own: a caller passes `labels` to `BlockKitMessage`, and anything left out reads in English,
which is what the builder's preview wants.

## Styling

The classes name tokens that each rendering app declares in its own Tailwind config and stylesheet:
the colours `hairline`, `well`, `code-inline`, `label`, `description`, `link` and `primary-ink`, the
type scale `text-body`, `text-callout`, `text-caption` and `text-overline`, and a `focus-ring`
utility. This lib ships no CSS. An app's Tailwind `content` also has to reach `libs/block-kit/src`,
or the classes used only here are purged: `apps/desktop-web` names the folder, and `apps/web` and
the builder reach it through `createGlobPatternsForDependencies`. `cn` comes from `libs/ui-kit`'s
barrel, `@chatic/ui-kit`.

## How to verify

```bash
npx nx test block-kit
npx nx typecheck block-kit
npx nx lint block-kit
```

The suite runs on vitest in jsdom, because `BlockKitMessage` renders. The specs sit beside the files
they cover. `sampleWebhookBlocks.ts` is not checked against the server: a change to the shape the
server stores shows up only when someone updates the sample.
