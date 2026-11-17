# host ports — how this app reaches what the host can do

> Scope: `apps/web/src/app/host/`. The port types, the facade and the declaration reader are
> [`@chatic/host`](../../../../libs/host/README.md); the host profile they read is
> [`@chatic/bridges`](../../../../libs/bridges/README.md#the-host-profile).

What the host does for a feature — sell a subscription today, more domains as they move — reaches the
feature through a port of `@chatic/host`, never through `isNative()` or a `CHATIC_APP_*` global.
`publishHostPorts.ts` chooses one implementation per port, once, from `main.tsx` right after
`config.init()`, from what the host declared (or, for a shell built before declarations, the port's
legacy rule). A feature reads `host.ports.<port>` where it uses it.

## media

Who picks what a person attaches. `publishHostPorts` publishes `{ kind: resolveMediaMethod() }`; the
picker (`bridge/attachmentPicker.ts`) and the photo library (`bridge/photoLibrary.ts`) are unsupported
unless it is `'app'`, and the attach panel then opens the page's own input. The same answer decides the
three other places that used to ask `isNative()`: whether the camera input waits for the app's camera
permission (`ChatImageAttach`), whether the recent-photos strip shows outside the grid, whether a send
hands a video to the app to convert (`useSendImages`), and whether the permission banner can open the
app's settings (`PermissionDeniedBanner`).

## checkout

| What the host sells through | Implementation                    | What it does                                                                           |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `apple`, `google`           | `checkout/storeCheckout.ts`       | The store's catalog, purchase, finish, held purchases and management, over `appBridge` |
| `web`                       | `checkout/webCheckout.ts`         | Leaves for a page of the website (`leaveForWeb`); the purchase completes there         |
| nothing                     | `{ kind: 'none' }` in the chooser | Nothing to sell                                                                        |

The phone app declares its store and the desktop app declares that it sells nothing, from the first
builds made after they began to declare; the e2e fake shell declares as the phone does. A shell that
declares nothing — an older build — is answered as before: a bridge means a store (Apple's when the
injected platform is `ios`, Google's otherwise), and no bridge means the website. A declaration
(`CHATIC_APP_CAPABILITIES.checkout`) can say otherwise, which is what lets a development shell with a
bridge check the website's checkout — the virtual shell's `DOU_SHELL_CHECKOUT`
([shell-adapter § Checkout](../../../shell-adapter/README.md#checkout)).

**A purchase settles from the shell's events, not from its reply.** `Purchase` is posted; the shell
pushes `OnPurchaseSuccess` or `OnPurchaseError` later. `storeCheckout` listens to both for as long as
the port lives — from boot on — and settles the one purchase that is waiting, or gives it up as
`timeout` after 60 seconds. Every store failure is logged there: a cancellation as `info`, anything
else as `error`. The subscription feature (`useSubscriptionIap`) refuses a guest and a missing social
link before it asks the port, validates the receipt with the relay, then finishes the purchase.

**What goes to the store is shaped per store.** Google receives the offer token, the new plan and, on a
tier change, the old plan, without which it books a second subscription instead of a replacement;
Apple receives the product id alone.
