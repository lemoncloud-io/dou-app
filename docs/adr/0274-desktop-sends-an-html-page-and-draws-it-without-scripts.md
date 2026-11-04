# ADR-0274: Desktop sends an HTML page and draws it in a frame with no permissions

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/desktop-html-attachment`
> · Scope: `libs/data/src/domain/chatAttachments.ts` (`FORMATS`) · `apps/web/src/app/utils/phoneSends.ts`
> (`PHONE_SENDS`) · `apps/desktop-web/src/app/features/chat/utils/filePreview.ts` (`htmlPreviewDocument`)
> · `apps/desktop-web/src/app/features/chat/components/images/FileViewer.tsx`
> · Follows the shape of [ADR-0184](./0184-desktop-sends-a-zip-archive-and-the-phone-does-not.md)
> · The module docs are [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md),
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [libs/data uploads](../../libs/data/docs/uploads/README.md)

## Context

People export reports, dashboards and saved pages as `.html` and want to pass them around a channel
and read them without leaving the app. The composer refused an HTML file as `unsupported`, and the
document viewer drew only PDF and text.

An HTML page is not like the other documents the viewer draws. It is a program as much as a document:
it can run script, submit forms, open windows, navigate, and load anything from the network. The page
comes from another person, and the viewer runs inside the app that holds the session and the bridge
to the desktop shell.

The server does not take `text/html` yet. Its change is small (one format, one signature rule) plus one
change to how a message attachment is signed: it signs every original for `inline` viewing, and an
HTML original opened from that address would run in the storage bucket's origin. That work follows
this change.

## Decision

1. **`text/html` joins the shared format table** as a document, under `.html` and `.htm`. The table
   stays the one list of what may be sent, and each app narrows it with its own filter.
2. **Only desktop sends it.** The phone app leaves it out of its pickers and its judgement
   (`PHONE_SENDS`). It has no viewer for a page, and its shells' pickers and saves were never checked
   against the type.
3. **A page is drawn in an `<iframe sandbox="">` from `srcdoc`**, never in the app's own document. No
   sandbox token is granted, so the page runs no script, submits no form, opens no window and has an
   opaque origin.
4. **A policy goes ahead of the page**: `default-src 'none'` with only inline and `data:` styles,
   images, fonts and media, no referrer, and `<base target="_blank">`, which the sandbox refuses to
   open, so a link without a target of its own goes nowhere. It goes first inside the page's head, the
   only place a policy counts: the page is parsed by the browser's parser in an inert document and
   written back out with its doctype, so it keeps its layout mode. Scanning the text for where to put
   it was rejected — a crafted comment (`<!-->`) makes a scan and the parser disagree, and the policy
   lands in the body, where it is ignored. A link that names its own target beats the
   base; in the desktop app the shell's frame navigation gate refuses it, as it refuses any frame
   leaving for an untrusted origin.
5. **A page past 10 MB is not drawn.** It is saved instead; a page cut short renders broken.
6. **The app goes first.** Until the server takes `text/html`, an HTML upload from desktop is refused
   with a 415 and the message shows the failed file.

## Consequences

- **A page that needs script does not work in the viewer.** Charts drawn by JavaScript, interactive
  dashboards and single-page exports show their static HTML only. Saving the file and opening it in a
  browser is the way to run them, and the viewer's save is one click away.
- **Remote images and stylesheets do not load.** A page that links its CSS or images from the web
  shows unstyled or with broken images. This is the price of not telling the sender when, and from
  where, the page was read.
- **Links inside a page mostly do nothing.** A link without its own target opens nothing, in-page
  anchors included. A link with `target="_self"` is refused by the desktop shell; served in a plain
  browser, desktop-web lets the frame follow it, still without script but outside the policy.
- **The phone cannot save a received page.** Its shells save only the extensions they know and refuse
  `.html` with `INVALID`. A shell release that learns the extension fixes it; nothing on the web side
  does.
- **Until the server ships, desktop offers a format the server refuses.** The send fails visibly
  rather than silently, but the order of deploys matters: server first, then this change, or the
  window in between is short.
- The desktop shell's frame navigation gate is not asked about loading the `srcdoc` page, so it needs
  no exception (checked on Electron 33: no `will-frame-navigate` event, the frame drew, script did not
  run). The gate still guards the frame: it is what refuses a link that would take it elsewhere, so it
  must not be loosened for this frame.

## Alternatives considered

- **Show the source as text.** Rejected: safe, but not what anyone wants from a report.
- **Load it from a blob URL instead of `srcdoc`.** Rejected: a blob URL has the app's origin unless
  the sandbox strips it, and it still needs the policy put into the bytes. `srcdoc` takes the string
  directly and leaves nothing to revoke.
- **Allow scripts in the sandbox (`allow-scripts` without `allow-same-origin`).** Rejected for now:
  the origin stays opaque, but a script can still fetch from the network, mine, or draw a convincing
  login form inside the app's frame. Revisit if people need interactive exports.
- **Hold the client until the server takes the type.** Rejected: the client change is independent,
  and the server's change is specified separately; shipping order is a deploy decision, not a code one.
