import type { AppShellPort } from './appShell';
import type { CheckoutPort } from './checkout';
import type { DiagnosticsPort } from './diagnostics';
import type { FilesPort } from './files';
import type { LinksPort } from './links';
import type { MediaPort } from './media';
import type { PushPort } from './push';
import type { SignInPort } from './signIn';

/**
 * What the host does for a feature, one field per capability port.
 *
 * Every field is required. A host that cannot do something gets an implementation that says so —
 * never a missing field that a feature then fills with a browser's answer. The ports arrive one
 * domain at a time, each with the step that moves that domain's features onto it.
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
