# ADR-0184: A ZIP archive is a chat attachment that desktop sends and the phone does not

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/desktop-zip-attachment`
> · Scope: `libs/data/src/domain/chatAttachments.ts` · `libs/data/src/domain/chatImages.ts`
> (`judgeChatAttachments`) · `apps/desktop-web/src/app/features/chat/` (composer tray, refusal toast)
> · `apps/desktop/src/main/downloads.ts` (unchanged: the save dialog)
> · `apps/web/src/app/features/channels/utils/attachSources.ts` (`sendsFromMobile`)
> · Extends [ADR-0148](./0148-desktop-sends-videos-and-documents-as-they-are.md)
> · The module docs are [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md),
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [apps/mobile native/attachment-picker.md](../../apps/mobile/docs/native/attachment-picker.md)

## Context

The format table in `@chatic/data` listed twelve formats, and the desktop composer refused a `.zip`
as unsupported before its upload started.

The server takes a ZIP archive as an upload from 2026-10-08: content type `application/zip`, kind
`file`, the documents' 50 MiB limit, a name that must end in `.zip`. It also reads
`application/x-zip-compressed` and `application/x-zip` as that type, and checks on completion that the
bytes start with a ZIP local file header (`50 4B 03 04`). The `@lemoncloud/chatic-socials-api`
package this repo installs was published before that and still names twelve types, so the table here
is ahead of the installed type list until the package is republished. A cloud that does not take the
format yet answers `415 UNSUPPORTED` for that file alone, and the message shows that file as failed.

Two things make an archive different from the twelve:

- **It can hold anything.** The rule that kept a document safe to save was that its name ends in its
  format's extension, so it cannot run as something else. An archive's own name is harmless, and what
  is inside it is not checked by anyone.
- **Four of the twelve are ZIP containers.** DOCX, XLSX, PPTX and HWPX start with the same bytes, and
  a system without their apps may type one as a ZIP.

## Decision

**ZIP is a thirteenth row in the one format table, of kind `file`.**

- The content type sent is `application/zip`, the extension is `zip`, and the limit is the `file`
  kind's 50 MiB. No rule is new: the name must end in `.zip` or gets it added, and another format's
  extension is refused.
- Chromium on Windows types a `.zip` as `application/x-zip-compressed`. That name and
  `application/x-zip` are aliases of `application/zip`, the way the Hancom labels are aliases of HWP.
- An office file typed as a ZIP is still refused, not sent as an archive: its extension is another
  format's, and the existing refusal covers it. Nothing reads the bytes to decide.
- The desktop shell saves an archive through its save dialog, like every other file that is not an
  image. Only an image whose type and extension agree skips the dialog.
- **The phone does not send one.** The table is shared with `apps/web`, so the row alone would have
  put ZIP in its page file input and its judgement of a pick. `chatAttachmentAccept` and
  `judgeChatAttachments` take a filter for an app that sends fewer formats than the server takes, and
  `apps/web` passes one that leaves ZIP out (`sendsFromMobile`). An archive that reaches the page
  anyway — the generic type admits any file — is refused as `unsupported`. The native pickers keep
  their own lists and do not offer it.

## Consequences

- **Nothing looks inside an archive.** It is sent, stored and saved as it is. The save dialog is the
  one point where a person sees the file before it lands, and the archive is never unpacked by the
  app.
- **A phone cannot save a received archive.** `SaveFile` keeps a file only under one of the twelve
  extensions the mobile shells list, and both lists refuse `zip` on purpose. Changing them is a native
  release and a decision of its own; until then an archive sent from desktop shows as a card on the
  phone and its save is refused. Sharing and opening judge a file by its bytes, which an archive
  passes; that path has not been tried on a device.
- **The two apps now differ in what they send.** That is the reason the phone is closed: it would
  hand out a file its own users cannot keep. The difference lives in one named filter in `apps/web`,
  not in the table.
- **The card draws the generic file icon.** There is no archive glyph; `messageFileKind` falls back
  to `file`.
- **An empty archive is refused after its upload.** An archive with no entries starts with the end
  record (`50 4B 05 06`), not a local file header, and the server refuses it when the upload
  completes. The tray does not read the bytes, so it lets that file through and its upload fails.
- **An older cloud fails late, per file.** One that does not take ZIP yet refuses it at upload start,
  after the tray has let it through.

## Alternatives

- **Send an archive as `application/octet-stream`.** Rejected for the reason ADR-0148 gives: the tray
  could no longer refuse an unknown extension up front, and the card would not know the kind before
  the server answers.
- **Mark the row desktop-only inside the shared table.** Rejected: the table mirrors what the server
  takes, and the card and the feed read it to know a received archive's kind on every app. What an
  app declines to send is that app's rule, so it is a filter the app passes in.
- **Leave the phone open and let the shared table decide.** Rejected: the phone would send a file that
  another phone cannot save.
- **Add `zip` to the mobile save lists in the same change.** Rejected for now: those lists refuse
  archives deliberately, and they ship on the app's release train, not the web's.
- **Tell a plain archive from an office file by its bytes.** Rejected: the extension rule already
  refuses the mismatch, and reading the central directory of a 50 MiB file to confirm it is more
  machinery than the case needs.
- **Save an archive without the dialog, as images are.** Rejected: dialog-free saving was allowed for
  images because a matching image extension cannot run. An archive is exactly what a person should
  see before it lands.
