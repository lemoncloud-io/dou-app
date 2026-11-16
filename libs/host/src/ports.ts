import type { CheckoutPort } from './checkout';

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
}
