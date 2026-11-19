import type { AppShellPort } from './appShell';
import type { CheckoutPort } from './checkout';
import type { DiagnosticsPort } from './diagnostics';
import type { LinksPort } from './links';

/**
 * Who does a domain's work on this host: the shell — the app around the page — through its bridge, or
 * the browser, with what any browser engine offers the page. Every port from `media` on carries this
 * choice, and only the choice: the implementations take their types from the data layer and the
 * runtime, so they live in the app that uses them and read the port to know whether the shell's side
 * applies.
 *
 * `shell` is the word the workspace already uses for the native container, and `browser` names the
 * means every host has. "app" and "page" were avoided: they already name the projects under `apps/`,
 * mini apps, screens and pages of a feed.
 */
export type ShellOrBrowser = 'shell' | 'browser';

/** The phone platform the app said it runs on, where the shell does the work; `null` anywhere else. */
export type HostOs = 'ios' | 'android' | null;

/**
 * Who picks the photos, videos and documents a person attaches.
 *
 * - `shell` — the app does: its own picker and photo library, its video conversion, and the permission
 *   prompts behind them. What it picked stays in the app and goes up from there.
 * - `browser` — the page does, with its own file input; nothing else is on offer.
 *
 * Only the choice crosses this port. The app-side implementations take types from the data layer and
 * the runtime, so they live in the app that uses them. They, and the screens around them, read this
 * port to know whether the app's side applies.
 */
export interface MediaPort {
    readonly kind: MediaMethod;
}

export type MediaMethod = ShellOrBrowser;

/**
 * Who moves a message's files: uploads, downloads, and the first frame of a video without a poster.
 *
 * - `shell` — the app does: its transfer module puts and fetches the bytes in the background, keeps a
 *   downloaded file to open, save or share, and reads a video's frame from the device.
 * - `browser` — the page does, with its own requests: a PUT for an upload, a fetch saved under the file's
 *   name for a download, and a frame drawn from the bucket's copy.
 *
 * Only the choice crosses this port, as for `media`: the transfer modules live in the app that uses
 * them and read this port to know whether the app's side applies.
 */
export interface FilesPort {
    readonly kind: FilesMethod;
}

export type FilesMethod = ShellOrBrowser;

/**
 * Who signs a person in with a social provider, links accounts, and holds the account a second
 * device pairs with. `shell` — the app does, with the platform's own sign-in where it has one (`os`
 * says which), and this device can approve a pairing; `browser` — the page does, with the providers' web
 * flows, and this device is the one that asks to pair.
 */
export interface SignInPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
}

/**
 * Who receives notifications for this device: registering its token, muting it, and the taps and
 * deliveries that come back. `shell` — the app does, through its bridge; `browser` — nothing does: a
 * browser tab registers no device and receives no push.
 */
export interface PushPort {
    readonly kind: ShellOrBrowser;
}

/**
 * What the host does for a feature, one field per capability port.
 *
 * Every field is required. A host that cannot do something gets an implementation that says so —
 * never a missing field that a feature then fills with a browser's answer.
 */
export interface HostPorts {
    /** How this host sells a subscription: through an app store, by handing over to the website, or not at all. */
    checkout: CheckoutPort;
    /** Who picks the photos, videos and documents a person attaches: the app, or the page's own input. */
    media: MediaPort;
    /** Who moves a message's files — uploads, downloads, a video's first frame: the app, or the page's own requests. */
    files: FilesPort;
    /** Who takes links out of the page: the OS browser, the clipboard, share intake, invites. */
    links: LinksPort;
    /** Who runs the frame around the page: icon, badge, haptics, back, keyboard, theme and language, update. */
    appShell: AppShellPort;
    /** Who signs a person in with a provider, links accounts and approves a second device's pairing. */
    signIn: SignInPort;
    /** Where logs, telemetry, issue reports and boot metrics go. */
    diagnostics: DiagnosticsPort;
    /** Who registers this device for notifications and receives them. */
    push: PushPort;
}

/** The ports' names, in `HostPorts`' order. */
export const HOST_PORT_NAMES = [
    'checkout',
    'media',
    'files',
    'links',
    'appShell',
    'signIn',
    'diagnostics',
    'push',
] as const satisfies readonly (keyof HostPorts)[];
