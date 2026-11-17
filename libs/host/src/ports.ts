import type { CheckoutPort } from './checkout';
import type { FilesPort } from './files';
import type { MediaPort } from './media';

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
}
