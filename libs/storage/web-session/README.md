# @chatic/storage-web-session

**A `KeyValueStore` over this tab's `sessionStorage`.** It survives a reload and dies with the tab
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The `tab` role of the storage port sits on it in a browser and in a page inside a shell,
wrapped in a `TolerantStore`.

Tags: `layer:foundation` · `platform:any` · `formfactor:any` — the same reason as
[`@chatic/storage-web-local`](../web-local/README.md), whose `WebStore` it builds on.

| Export              | Does                          |
| ------------------- | ----------------------------- |
| `webSessionStore()` | the store on `sessionStorage` |

## How to verify

```bash
cd libs/storage/web-session && ../../../node_modules/.bin/jest
```
