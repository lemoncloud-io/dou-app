// @chatic/host — a transition shim. The host ports moved: their contracts and the holder the entry
// point publishes into are `@chatic/runtime-client`'s, read by features as `runtime.<port>` from
// `@chatic/runtime`; the shell-declaration reading the entry point chooses them from is
// `@chatic/runtime-web`'s. This package re-exports both under the names it had, so `host.ports.<port>`
// and `runtime.<port>` are the same objects until every import has moved, and then it is deleted.
//
// It takes both from their `/host` entries rather than the package barrels: the barrels carry the whole
// engine, and a module that only asked the host what it can do never loaded that before.

// the contracts and the one holder
export { HostFacade, host } from '@chatic/runtime-client/host';
export type {
    AppShellPort,
    CheckoutMethod,
    CheckoutPort,
    DiagnosticsPort,
    FilesMethod,
    FilesPort,
    HostOs,
    HostPorts,
    LinksPort,
    MediaMethod,
    MediaPort,
    NoCheckout,
    PushPort,
    ShellOrBrowser,
    SignInPort,
    StoreCheckout,
    StoreName,
    StorePurchase,
    StorePurchaseError,
    StorePurchaseRequest,
    WebCheckout,
} from '@chatic/runtime-client/host';

// reading the shell's declaration
export {
    CHECKOUT_INTRODUCED_IN,
    FILES_INTRODUCED_IN,
    MEDIA_INTRODUCED_IN,
    SHELL_DOMAINS_INTRODUCED_IN,
    hostOsOf,
    resolveAppShell,
    resolveCheckoutMethod,
    resolveDiagnosticsMethod,
    resolveFilesMethod,
    resolveLinksMethod,
    resolveMediaMethod,
    resolvePushMethod,
    resolveShellOrBrowser,
    resolveSignIn,
} from '@chatic/runtime-web/host';
