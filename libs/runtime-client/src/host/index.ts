// `@chatic/runtime-client/host` — the host ports alone: their contracts and the one holder, with none
// of the engine behind the package barrel. `@chatic/host` re-exports from here while it lasts, so a
// module that only asks the host what it can do does not load the runtime to find out; the barrel sells
// the same names from the same files, so both reach one holder.
export { HOST_PORT_NAMES } from './ports';
export {
    HostFacade,
    appShellPort,
    checkoutPort,
    diagnosticsPort,
    filesPort,
    host,
    linksPort,
    mediaPort,
    pushKind,
    signInPort,
} from './hostPorts';
export type {
    AppShellPort,
    DiagnosticsPort,
    FilesMethod,
    FilesPort,
    HostOs,
    HostPorts,
    LinksPort,
    MediaMethod,
    MediaPort,
    PushPort,
    ShellOrBrowser,
    SignInPort,
} from './ports';
export type {
    CheckoutMethod,
    CheckoutPort,
    NoCheckout,
    StoreCheckout,
    StoreName,
    StorePurchase,
    StorePurchaseError,
    StorePurchaseRequest,
    WebCheckout,
} from './checkout';
