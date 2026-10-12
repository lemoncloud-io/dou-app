# ADR-0187: The phone sends and saves a ZIP archive

> Status: Accepted · Decided: 2026-10-12 · Implemented: `feat/mobile-zip-attachment`
> · Scope: `apps/web/src/app/features/channels/utils/attachSources.ts` (the filter removed)
> · `apps/web/src/app/features/channels/lib/fileExport.ts` (`archive-update-required`)
> · `apps/mobile/ios/Bridges/AttachmentPicker/Core/AttachmentPickerCore.swift` (`documentTypes`)
> · `apps/mobile/ios/Bridges/Transfer/Core/DownloadFiles.swift` (`serverFormats`)
> · `apps/mobile/android/app/src/main/java/io/chatic/dou/attach/core/AttachPickRules.kt`
> (`DOCUMENT_MIME_TYPES`) · `apps/mobile/android/app/src/main/java/io/chatic/dou/media/core/ExportFormats.kt`
> (`MIME_BY_EXTENSION`)
> · Supersedes in part [ADR-0184](./0184-desktop-sends-a-zip-archive-and-the-phone-does-not.md): the phone's part
> · The module docs are [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md),
> [apps/mobile native/attachment-picker.md](../../apps/mobile/docs/native/attachment-picker.md) and
> [apps/mobile native/media-export.md](../../apps/mobile/docs/native/media-export.md)

## Context

ADR-0184 made a ZIP archive the thirteenth row of the shared format table and let desktop send one,
but kept the phone from sending it: both mobile shells save a file only under one of their listed
extensions, `zip` was not among them, so a phone that received an archive could not keep it. Sending
one from a phone would have handed out a file other phones could not save, so `apps/web` passed a
filter (`sendsFromMobile`) that left ZIP out of its file inputs and its judgement of a pick, and the
native pickers did not offer it.

That reasoning had a gap. Desktop already sends archives, so every phone receives them regardless of
what phones send; closing the phone's side did not spare a single receiver. Meanwhile it left the
phone, and `apps/web` opened in any browser, unable to send a format the server, the desktop and the
card all handle.

The web and the shells ship on different trains. A web change reaches every app the day it merges; a
shell change waits for a store release, and older builds stay installed for a long time. An older
shell answers `SaveFile` for a `.zip` with `INVALID` — the same code it uses for any extension it
does not save.

## Decision

**The phone sends ZIP and keeps one it receives, through the same paths as a document.**

- **The filter is removed.** `apps/web` names all thirteen formats in its file inputs and judges a
  pick against all of them, wherever it runs: inside a new app, inside an older one, or in a browser.
  `chatAttachmentAccept` and `judgeChatAttachments` keep their filter argument; nothing passes one now,
  and it stays for the next format the server opens before every app follows.
- **The shell pickers offer ZIP.** iOS adds `UTType.zip` (`public.zip-archive`) to the documents
  picker, not its parent `UTType.archive`, which would also offer 7z, RAR and tar. Android adds
  `application/zip` and the two older names some storage providers still use,
  `application/x-zip-compressed` and `application/x-zip`; the web already maps both to
  `application/zip`. An archive is a `file`, held to the 50 MiB file limit.
- **The shells save ZIP.** `zip` → `application/zip` joins iOS `DownloadFiles.serverFormats` and
  Android `ExportFormats.MIME_BY_EXTENSION`. The name rule is unchanged: a name must end in a listed
  extension, so an office file — a ZIP by its bytes — is still saved under its own extension, and
  `.exe` or `.html` are still refused. Android saves to `Download/DoU/` with no dialog, as for any
  document; iOS uses its export sheet, as for any document.
- **Opening and sharing are unchanged.** Both judge a file by its bytes, which a non-empty archive
  passes. Where nothing on the device opens a ZIP, the existing `NO_HANDLER` path offers the share
  sheet.
- **An older app is told to update, per card.** When `SaveFile` answers `INVALID` and the name ends in
  `.zip`, `exportFile` returns `archive-update-required` and the card says an update saves archives.
  A new shell never answers `.zip` that way, so the pair identifies an old shell without asking it.
  It is not logged as a shell bug, and it does not set the page-wide "update required" state that a
  `NOT_FOUND` sets: that state disables every card, and the same old app still saves the other twelve
  formats. The card turns `done` all the same, since the file was downloaded, so opening or sharing
  it still works.
- **The bridge contract does not change.** No message, payload or error code is added, and the bridge
  version stays where it is. What changes is two lists inside each shell and comments in
  `@chatic/app-messages`.

## Consequences

- **Older apps fail to save an archive until they update, and say why.** The web ships first, so from
  that day any app may send an archive; an older shell meets it on save and shows the update notice.
  Open and share work there already. This is the order chosen on purpose: holding the web back for
  the store release would keep every browser and phone unable to send in the meantime, while older
  receivers were already receiving archives from desktop.
- **An older Android app can send an archive too.** Its picker offers `application/octet-stream`, under
  which some providers hand over a `.zip`; with the filter gone, the web accepts it. An older iOS app
  keeps greying `.zip` out until it updates.
- **Opening depends on the device.** iOS QuickLook previews a ZIP (`canPreview` is true for it, and also
  for a 7z or an empty archive, so it is no test of the format); its share button hands the file on
  either way. Android opens it in whatever file manager is installed; a device with none — a bare
  emulator — goes to the share sheet.
- **Nothing looks inside an archive**, as ADR-0184 already holds. An empty archive (`50 4B 05 06`)
  is refused by the server when its upload completes and by the shells' byte check on save or share.
- **The two apps send the same thirteen formats.** The exception ADR-0184 carried is gone; the format
  table and the two pickers agree.
- **The native lists are not covered by CI.** The Swift and Kotlin tests that pin them run locally only.

## Alternatives

- **Send from the phone only when its shell can save an archive** — keep the filter for older apps,
  drop it in browsers. Rejected: older receivers already get archives from desktop, so restraining
  older senders protects nobody, and the web would need a way to learn which formats a shell saves.
  The handshake lists which messages a shell answers, not which formats it takes, so that would be a
  new field.
- **Declare ZIP saving in the handshake's `capabilities`, and show the update notice before a press.**
  Rejected: it would know in advance, but it grows the handshake contract and both shells for a
  condition the existing `INVALID` already reveals, and only on the one card it affects.
- **Leave the older app's answer as the generic "couldn't download" failure.** Rejected: the person
  would retry a save that cannot succeed, with no hint that an update fixes it.
- **Save an archive on Android through the system "save as" dialog, as desktop does.** Rejected:
  desktop uses a dialog because that is where a person first sees the file before it lands. On the
  phone the person has already seen the card's name and pressed it, the app never unpacks the archive,
  and `.zip` is not an executable extension; every other document saves straight to `Download/DoU/`.
- **Offer `UTType.archive` on iOS.** Rejected: it is the parent of 7z, RAR, tar and gzip, all of which
  the server refuses.
