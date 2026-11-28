# @chatic/host-desktop

**The host capabilities an Electron main process carries out for the web inside it.** The desktop-web
half (`@chatic/host-web-desktop-shell`) asks over the bridge; this package does the work in main
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).
Capabilities move here one at a time; for now it holds the link preview fetch, the download rules and launch at login.

Tags: `layer:adapter` · `platform:desktop` · `formfactor:any`.

```ts
import { fetchUrlMetadata } from '@chatic/host-desktop';

host.registerHandler('FetchUrlMetadata', async message => ({
    type: 'OnFetchUrlMetadata',
    success: true,
    data: await fetchUrlMetadata(message.data.url),
}));
```

The bridge handler, the IPC and the window stay in the app (`apps/desktop/src/main/bridgeHandlers.ts`); see
[`apps/desktop/README.md`](../../../apps/desktop/README.md).

| Export                                                               | Does                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fetchUrlMetadata(url)`                                              | the page's title, description, https image and site name; `{ success: false, url }` when it cannot                           |
| `isPrivateHost(host)`                                                | `true` for a host name the preview fetch refuses (loopback, private, link-local, single-label, `.local`)                     |
| `UrlMetadataResult`                                                  | the result shape, the `OnFetchUrlMetadata` payload                                                                           |
| `savesWithoutAsking(name, mimeType)`                                 | `true` for an image whose name has its type's extension, which saves with no dialog                                          |
| `createDownloadTargets(dir, exists)`                                 | picks a free name in `dir` (`image (1).png`), counting names still in flight as taken                                        |
| `createDownloadLog(limit?)`                                          | the last finished paths under opaque ids, so the page can ask to reveal only what the shell saved                            |
| `DOWNLOAD_DONE_CHANNEL` · `DOWNLOAD_REVEAL_CHANNEL` · `DownloadDone` | the download IPC contract, also at `@chatic/host-desktop/downloadsContract`                                                  |
| `createLoginItem(host, platform)`                                    | reads and writes the OS login item through `host` (electron `app`); `read()` and `write(enabled)` return what the OS reports |
| `LOGIN_ITEM_UNSUPPORTED`                                             | `{ enabled: false, supported: false }`, the answer off macOS and Windows and to an untrusted frame                           |
| `LOGIN_ITEM_CHANNEL` · `LaunchAtLoginState`                          | the launch-at-login IPC contract, also at `@chatic/host-desktop/loginItemContract`                                           |

## Link previews

The fetch runs in main because the renderer is held by CORS, and anyone can make a message contain any URL, so
it is guarded against reaching the internal network:

- http(s) only; private, loopback and link-local hosts (IPv4, IPv6, mapped and compatible forms, single-label
  names, `.local`/`.internal`) are refused before every request;
- redirects are followed by hand (at most five), so each hop is checked first;
- a 3 s total timeout and a 256 KB read cap;
- only an https image URL is returned.

Not covered: a public name that resolves to a private address (DNS rebinding), since the check sees the name.
The tests are in `src/unfurl.test.ts`.

## Downloads

`apps/desktop/src/main/downloadsIpc.ts` listens to `will-download` and owns the IPC; the rules it applies are here:

- only a PNG, JPEG, GIF or WebP whose name has the matching extension skips the save dialog, so a script in
  the page cannot drop an executable into Downloads unseen;
- a name already on disk or still in flight gets a number, since `will-download` asks for a path before any
  byte is written;
- a completed download gets an id in the log (an interrupted one is reported without one, a cancelled one not
  at all), and `chatic-download:reveal` takes that id back; the log keeps the last 50 paths and never takes a
  path from the page.

The preload imports the contract from `@chatic/host-desktop/downloadsContract`: the preload runs sandboxed and
can require only `electron`, and the package root also carries the link preview fetch, which needs `node:net`.
The tests are in `src/downloads.test.ts`.

## Launch at login

`apps/desktop/src/main/loginItemIpc.ts` owns the `chatic-login-item` channel and passes electron's `app`; the rules are here:

- only macOS and Windows are supported; elsewhere every read and write answers `LOGIN_ITEM_UNSUPPORTED` and the
  OS is never touched;
- a write returns the setting read back from the OS, not the value asked for, since the OS can leave the
  registration pending approval;
- nothing is registered until the person turns it on, so a fresh install does not start at login.

The preload imports the contract from `@chatic/host-desktop/loginItemContract`, for the same sandbox reason as
downloads. The tests are in `src/loginItem.test.ts`.
