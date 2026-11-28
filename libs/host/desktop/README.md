# @chatic/host-desktop

**The host capabilities an Electron main process carries out for the web inside it.** The desktop-web
half (`@chatic/host-web-desktop-shell`) asks over the bridge; this package does the work in main
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).
Capabilities move here one at a time; for now it holds the link preview fetch.

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

| Export                  | Does                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `fetchUrlMetadata(url)` | the page's title, description, https image and site name; `{ success: false, url }` when it cannot       |
| `isPrivateHost(host)`   | `true` for a host name the preview fetch refuses (loopback, private, link-local, single-label, `.local`) |
| `UrlMetadataResult`     | the result shape, the `OnFetchUrlMetadata` payload                                                       |

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
