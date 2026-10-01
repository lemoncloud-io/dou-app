# ADR-0151: A chat push and the channel list name what an attachment-only message carries

> Status: Accepted · Decided: 2026-09-30
> · Scope: the four mobile push locale sets · `apps/mobile/android/.../push/ChaticFirebaseMessagingService.kt` ·
> `apps/mobile/ios/ChaticNotificationServiceExtension/NotificationService.swift` ·
> `apps/mobile/src/app/services/notification/NotificationService.ts` ·
> `apps/mobile/src/app/utils/i18n/formatPushCopy.ts` ·
> `apps/web/src/app/features/home/components/ChannelList.tsx`
> · The module docs are [apps/mobile push README](../../apps/mobile/docs/push/README.md#chat-message-body)
> and [apps/web last-chat.md](../../apps/web/docs/feature/home/last-chat.md#what-the-row-prints)

## Context

A chat push's body is the translation key `push_chat_message_body`, template `{0}`, filled with the
message's text. A message that is only attachments has no text, and the server then sends the key
with no args at all. Every place that builds the banner handled that differently, and none of them
well:

| Path                                  | What an attachment-only message showed                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS background/killed (the extension) | a literal `{0}` — positional substitution with nothing to substitute                                                                          |
| Android, every app state              | a literal `{0}`, and the foreground in-app banner receives that same body                                                                     |
| iOS foreground                        | an empty body — this path never runs the extension, and the shell used the APNs `alert`, which the push server fills with the text or nothing |
| channel list row (mobile web)         | `사진` / `Photo`, counted from any attachment                                                                                                 |

The device cannot fix this alone: the payload carries neither the attachment kind nor the count.
And the server now takes videos and documents as well as images, stamping each upload with a kind
(`stereo`: `image`, `video`, `audio`, `file`), so "attachment" no longer means "photo" — a PDF would
preview as a photo in the list and, with an image-only push key, be announced as one.

Two more constraints shape the answer. The native templates do positional substitution only, so
"one" and "several" cannot share a key. And a key a build does not have shows up on the banner as
the key's name — the same failure a new title key once caused — so whatever the server starts
sending must already be in the installed apps.

The desktop app builds its banners in yet another place, and already names the kind on its own —
[ADR-0147](./0147-desktop-names-the-attachment-kind-and-makes-the-push-body-itself.md), which also put
the shared kind rule (`chatAttachmentSummary`) in `libs/data`. This record covers the phone and the
mobile web.

## Decision

1. **The server picks the body key by attachment kind; the device only fills in the copy.** Text,
   when there is any, wins and stays `push_chat_message_body`. Otherwise one kind gets its own pair —
   `push_chat_image_body` / `push_chat_images_body`, `…_video_…`, `…_file_…` — and mixed kinds or
   audio get `push_chat_attachments_body`. The plural keys take the count as `{0}`; the singular
   ones take nothing. An upload with no `stereo` is an image.
2. **All seven keys ship now**, videos and files included, though the app sends only images yet.
3. **Pushes speak in sentences, the list in nouns, with the same nouns.** `사진 3장을 보냈습니다` /
   `Sent 3 photos` on the banner, `사진 3장` / `3 photos` in the row. The list picks its noun by the
   same kind rule — the `chatAttachmentSummary` desktop already reads — so a row and its push name the
   same thing.
4. **The app goes first.** The server keeps sending today's payload until a build with the new keys
   has spread; the order of the rollout is what protects older builds from seeing key names.
5. **A template placeholder the args do not reach never reaches a banner.** For a body, the copy
   becomes `push_chat_fallback_body` (`새 메시지` / `New message`), which the server never sends; for a
   title, the placeholder is dropped. The three assemblers — Android, the iOS extension, the shell —
   share this one rule. It is judged on the template, so a message whose text contains `{0}` is shown
   as written. A key that is not found stays as it is.
6. **The shell builds the iOS foreground copy itself** from the payload's `loc_key`/`loc_args`, in the
   language the native handlers resolve, and falls back to the APNs `alert` only when the payload has
   no key or a field formats to nothing — the same cases in which the extension keeps the original.

## Consequences

- **Today's attachment-only push already improves.** Before the server changes anything, a new build
  shows `새 메시지` / `New message` on every mobile path instead of `{0}` or nothing. The kind-specific
  copy follows when the server switches over.
- **Four locale sets carry seven more keys and a fallback.** The parity test now also checks that the
  plural keys keep `{0}` and the singular keys and the fallback carry no placeholder, because either
  mistake would quietly send every such push to the fallback or lose its count.
- **The rule is written three times** — Kotlin, Swift, TypeScript — and has to change in all three.
  The module doc lists them together.
- **Desktop reads the same keys under its own record.** ADR-0147 maps the attachment `loc_key`s to its
  own labels, so the server can switch for every client at once.
- **An old build still shows key names if the server switches too early.** Nothing on the device can
  cover that without also hiding the rollout mistake, so the protection is the order in 4.

## Alternatives

- **The server sends only a count and each device picks the words.** Rejected: the same kind-and-count
  branching would be written into four assemblers instead of one sender, and the server already knows
  each upload's kind without looking anything up.
- **Prefix the text with the attachment — "[Photo] look at this", or "[3 photos] …".** Rejected: more
  keys for a case the list already settles by showing the text alone, and the row and the push would
  disagree.
- **Image keys only, video and file keys later.** Rejected: every new key costs a full app-first
  rollout before the server may use it. The server already accepts videos and documents, so the
  messages can arrive before the app can send them.
- **Let the guard also cover a key that is not found.** Rejected: the key name on a banner is the only
  visible sign that a payload outran the installed build.
- **Leave the iOS foreground on the APNs `alert`.** Rejected: the push server fills that without the
  reader's language, so no key the server could add would reach this path.
