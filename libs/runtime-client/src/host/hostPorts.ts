import type { AppShellPort } from './appShell';
import type { CheckoutPort } from './checkout';
import type { DiagnosticsPort } from './diagnostics';
import type { LinksPort } from './links';
import type { FilesPort } from './files';
import type { MediaPort } from './media';
import type { HostPorts, ShellOrBrowser } from './ports';
import type { PushPort } from './push';
import type { SignInPort } from './signIn';

const NOT_PUBLISHED = "[host] the ports are read before the app's entry point published them (host.publish)";

/**
 * Property reads that test runners, loggers and promise checks make of any value they are handed. An
 * unpublished port answers them with `undefined`, so printing one — in a failed assertion, say — does
 * not throw a second error over the first.
 */
const INSPECTED = new Set(['then', 'toJSON', '$$typeof', 'asymmetricMatch', 'nodeType', 'constructor']);

/**
 * What a port, or one of the push port's members, is named in the error a read before the publish
 * throws: `push.notifications`, not `push`, so the message says which member was read too early.
 */
type UnpublishedName = Exclude<keyof HostPorts, 'push'> | `push.${Exclude<keyof PushPort, 'kind'>}`;

/**
 * What a port reads as before the entry point publishes: any property read throws, naming the step
 * that was missed, as `host.ports` does. A silent `undefined` would let a feature read the browser's
 * answer off a port that was never chosen.
 */
const unpublished = <T extends object>(name: UnpublishedName): T =>
    new Proxy({} as T, {
        get(_target, property) {
            if (typeof property !== 'string' || INSPECTED.has(property)) return undefined;
            throw new Error(`${NOT_PUBLISHED}: ${name}.${property}`);
        },
    });

// The published ports, one binding each, for `runtime.<port>` in `@chatic/runtime` to re-export.
// They are live bindings: a module that imported one sees the value `host.publish` assigned, which is
// what lets the facade hand out the very objects `host.ports` holds without a getter of its own.
export let checkoutPort: CheckoutPort = unpublished('checkout');
export let mediaPort: MediaPort = unpublished('media');
export let filesPort: FilesPort = unpublished('files');
export let linksPort: LinksPort = unpublished('links');
export let appShellPort: AppShellPort = unpublished('appShell');
export let signInPort: SignInPort = unpublished('signIn');
export let diagnosticsPort: DiagnosticsPort = unpublished('diagnostics');
/**
 * The push port's fields, each on its own: `runtime.push` is the push hooks' group already, so the port
 * joins it member by member — `runtime.push.kind`, `runtime.push.notifications`, … — rather than
 * replacing it. A string cannot throw on read the way the other ports do, so the kind is `undefined`
 * until the entry point publishes; the members throw on a read of theirs, as a port does, rather than
 * read as `null` — the browser's answer — off a port that was never chosen.
 */
export let pushKind: ShellOrBrowser | undefined = undefined;
export let pushNotifications: PushPort['notifications'] =
    unpublished<NonNullable<PushPort['notifications']>>('push.notifications');
export let pushDeviceToken: PushPort['deviceToken'] =
    unpublished<NonNullable<PushPort['deviceToken']>>('push.deviceToken');
export let pushTokenRenewal: PushPort['tokenRenewal'] =
    unpublished<NonNullable<PushPort['tokenRenewal']>>('push.tokenRenewal');
export let pushLocalBanner: PushPort['localBanner'] =
    unpublished<NonNullable<PushPort['localBanner']>>('push.localBanner');

const bindPorts = (ports: Readonly<HostPorts> | null): void => {
    checkoutPort = ports?.checkout ?? unpublished('checkout');
    mediaPort = ports?.media ?? unpublished('media');
    filesPort = ports?.files ?? unpublished('files');
    linksPort = ports?.links ?? unpublished('links');
    appShellPort = ports?.appShell ?? unpublished('appShell');
    signInPort = ports?.signIn ?? unpublished('signIn');
    diagnosticsPort = ports?.diagnostics ?? unpublished('diagnostics');
    pushKind = ports?.push.kind;
    pushNotifications = ports
        ? ports.push.notifications
        : unpublished<NonNullable<PushPort['notifications']>>('push.notifications');
    pushDeviceToken = ports
        ? ports.push.deviceToken
        : unpublished<NonNullable<PushPort['deviceToken']>>('push.deviceToken');
    pushTokenRenewal = ports
        ? ports.push.tokenRenewal
        : unpublished<NonNullable<PushPort['tokenRenewal']>>('push.tokenRenewal');
    pushLocalBanner = ports
        ? ports.push.localBanner
        : unpublished<NonNullable<PushPort['localBanner']>>('push.localBanner');
};

/**
 * The host's ports, chosen once by the app's entry point and read by features at the point of use.
 *
 * A module holder rather than a React context, because the callers that need a port are not all
 * React: logging, the boot sequence and other plain modules reach the host too. Published once —
 * a second publish is refused rather than replacing the first, because a replacement would leave
 * every caller that already read a port holding the old one, with nothing to show it happened.
 *
 * Read a port where it is used, never at module scope: a module evaluated before the entry point
 * publishes would throw, and one evaluated after would keep whatever it read first.
 */
export class HostFacade {
    private published: Readonly<HostPorts> | null = null;

    /**
     * @param onChange told of every publish and reset. The process-wide `host` binds the ports
     *   `runtime.<port>` re-exports through it; an instance a test makes for itself binds nothing.
     */
    constructor(private readonly onChange: (ports: Readonly<HostPorts> | null) => void = () => undefined) {}

    /** Called once, from the app's entry point, before the first render. */
    publish(ports: HostPorts): void {
        if (this.published) {
            throw new Error('[host] the ports are already published; the entry point publishes them once');
        }
        this.published = Object.freeze({ ...ports });
        this.onChange(this.published);
    }

    /** The published ports. Throws before `publish`, naming the step that was missed. */
    get ports(): Readonly<HostPorts> {
        if (!this.published) {
            throw new Error(NOT_PUBLISHED);
        }
        return this.published;
    }

    /** Whether `publish` has run — for a caller that can do without the host, such as a crash screen. */
    get isPublished(): boolean {
        return this.published !== null;
    }

    /** Tests only: forget the published ports, so a test can publish its own. */
    resetForTests(): void {
        this.published = null;
        this.onChange(null);
    }
}

/** The process's one holder: what the entry point publishes, and what `runtime.<port>` reads. */
export const host = new HostFacade(bindPorts);
