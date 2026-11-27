# @chatic/host-web-browser

**The host ports as a plain browser tab does them.** A page with no shell around it opens links in a new
tab, copies with the Clipboard API, uploads with its own PUT and prepares images on a canvas; every
member that needs a shell is `null`. This is the browser member of the `host/web` family
([ADR-0375](../../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md));
the contract is `HostPorts` from [`@chatic/ports`](../../../contracts/ports/README.md).

Tags: `layer:adapter` · `platform:web` · `formfactor:any`.

| Export               | Port          | In a browser                                                                                     |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `browserAppShell`    | `appShell`    | `ownsWindow` and `reportsKeyboardHeight` are `false`; every capability `null`                    |
| `browserDiagnostics` | `diagnostics` | `entry: 'browser'`; debug switch, boot metrics and pending reports `null`                        |
| `browserFiles(put)`  | `files`       | `put` is the PUT the app hands in; `transfers` `null`                                            |
| `browserLinks`       | `links`       | `pageLinks` (`window.open`, the Clipboard API); share sheet, contacts, SMS, sub web view `null`  |
| `browserMedia`       | `media`       | picker, photo library, video converter and camera permission `null`; `images` is `browserImages` |
| `browserPush`        | `push`        | every member `null`                                                                              |
| `browserSignIn`      | `signIn`      | `sessionScope: 'tab'`, requests pairing, no provider sign-in or relay OAuth                      |

Each takes the choice the runtime made (`base`: `kind`, and `os` for `appShell` and `signIn`) and returns
the whole port, which is the `browser` half of runtime-hybrid-web's `ShellOrBrowserImplementations`:

```ts
import { browserLinks } from '@chatic/host-web-browser';
import { mobileShellLinks } from '@chatic/host-web-mobile-shell';
import { linksAdapters } from '@chatic/runtime-hybrid-web';

export const {
    host: linksHost,
    shell: linksShell,
    browser: linksBrowser,
} = linksAdapters({
    shell: mobileShellLinks({ bridge: webClient, subWebViewOpenScope }),
    browser: browserLinks,
});
```

Checkout is not here: a browser's checkout is the website's (`checkout/web`, still the app's own
`webCheckout`).

## Images — `media.images`

`browserImages` is the `media` port's `images` capability: `prepareImage(file, request)` and
`videoPoster(file)`, drawn on the page's canvas. The same functions, and the parts under them, are exported
by name (`prepareImage`, `prepareChatAttachment`, `makeVideoPoster`, the policies `AVATAR_IMAGE`,
`REPORT_PHOTO`, `CHAT_ATTACHMENT`, the profiles, `decodeImage`, `compressToBlob`, `toUploadFile`, …), and
`@chatic/shared` re-exports them under its old names, so callers that import them from there are unchanged.
The request and result types (`ImageRequest`, `ImageResult`, `CompressProfile`) are `@chatic/ports`'s, with
`File` as the file type.

How the image code decides what it does — one function with the destination's policy, `'inline'` always
compressed, the original kept at full size, a GIF never redrawn, EXIF read through `<img>`, the poster's
seek and settle — is written up in the [shared README](../../../shared/README.md#5-uploading-a-picture),
where its callers look for it.

## Rules

- **No runtime, no bridge.** The package imports `@chatic/ports` types and nothing else from the
  workspace, so `@chatic/runtime-web` can re-export `pageLinks` from it and `@chatic/shared` its image
  functions without pulling either the runtime or the shell bridge into what imports them.
- **A shell's page is also a browser.** `@chatic/host-web-mobile-shell` gives its `media` the same
  `browserImages`: inside the phone app the page still prepares its images itself.
