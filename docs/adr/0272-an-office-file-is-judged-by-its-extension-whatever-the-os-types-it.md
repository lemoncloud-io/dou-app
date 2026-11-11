# ADR-0272: An office file is judged by its extension, whatever the OS types it

> Status: Accepted · Decided: 2026-11-02 · Implemented: `fix/office-attachment-type`
> · Scope: `libs/data/src/domain/chatAttachments.ts` (`chatAttachmentFormat`)
> · Supersedes in part [ADR-0184](./0184-desktop-sends-a-zip-archive-and-the-phone-does-not.md): "an office file typed
> as a ZIP is still refused"
> · The module docs are [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md) and
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

A user could not attach any Word, Excel or PowerPoint file from desktop, not even a Word file they had
just created. The composer refused each one as `unsupported`. The same three files pass on another Mac,
where Chromium gives them their registered types.

The browser does not read an office file's bytes to type it. For DOCX, XLSX and PPTX it takes the type
the OS has registered for the extension, so the type depends on what is installed there. With no
office suite, a container can come in as a ZIP. With another suite holding the extension, it can come
in under that suite's own name for the format, as Hancom's labels already do for HWP
(`application/haansofthwp`, aliased in the table).

`chatAttachmentFormat` read the extension only when the type was empty or `application/octet-stream`.
Any other type was taken as given, so a real `.docx` under an unknown type found no format, and a real
`.docx` typed as a ZIP was refused because `docx` is another format's extension. ADR-0184 chose that
refusal on purpose, to stop an office file going up as an archive.

## Decision

**For DOCX, XLSX, PPTX and HWPX, the extension decides when the declared type is a ZIP or a type the
server does not know.**

- The file goes up as the document its extension names, under the server's content type for it. The
  send path already declares the format's type, not the picked file's
  (`libs/app-runtime/src/data/hooks/useSendImages.ts`), so the server sees a type it takes.
- A type that is one of the server's own formats still decides. A `.docx` typed as a PDF is still
  refused, because the name and the type disagree.
- The other formats are unchanged. An unknown type on any other extension is still refused, so an HEIC
  named `x.png` is still not sent as a PNG, and a legacy `.xls` (`application/vnd.ms-excel`) is still
  refused: the server does not take it.
- ADR-0184's aim holds: an office file never goes up as an archive. It now goes up as itself instead of
  being refused.

## Consequences

- **An archive renamed `.docx` goes up as a document.** Nothing reads the bytes, so a real ZIP named
  `x.docx` and typed as a ZIP is sent as a Word file. The receiver saves it as `x.docx`, a name that
  cannot run. An untyped file named `x.docx` was already sent the same way, so no new kind of file
  reaches anyone.
- **The table, the shells and the server are unchanged.** `apps/web` shares the rule, so a pick in the
  phone app is judged the same way: a document the shell hands over as a ZIP or under an unknown type
  now goes up too. Nothing in the native shells changes.
- **The vendor type itself is not recorded.** The failing machine's exact `File.type` was not
  observed. Handling every type the server does not know covers it without guessing an alias list.

## Alternatives considered

- **Add each vendor's name as an alias.** Rejected: the failing type was never observed, and an alias
  list only fixes the suites someone has already met.
- **Let the extension decide for every format.** Rejected: an HEIC named `x.png` would go up as a PNG,
  and a `.mp4` that is really a QuickTime file as a video other devices cannot play. Those formats are
  checked by their type for a reason. The office containers are the ones whose type depends on what
  else is installed.
- **Read the container's bytes to confirm it.** Rejected: opening the central directory of a 50 MiB
  file is more machinery than the case needs, and it would still not tell a renamed archive from a
  damaged document.
