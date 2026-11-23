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

const INSPECTED = new Set(['then', 'toJSON', '$$typeof', 'asymmetricMatch', 'nodeType', 'constructor']);

type UnpublishedName = Exclude<keyof HostPorts, 'push'> | `push.${Exclude<keyof PushPort, 'kind'>}`;

const unpublished = <T extends object>(name: UnpublishedName): T =>
    new Proxy({} as T, {
        get(_target, property) {
            if (typeof property !== 'string' || INSPECTED.has(property)) return undefined;
            throw new Error(`${NOT_PUBLISHED}: ${name}.${property}`);
        },
    });

export let checkoutPort: CheckoutPort = unpublished('checkout');
export let mediaPort: MediaPort = unpublished('media');
export let filesPort: FilesPort = unpublished('files');
export let linksPort: LinksPort = unpublished('links');
export let appShellPort: AppShellPort = unpublished('appShell');
export let signInPort: SignInPort = unpublished('signIn');
export let diagnosticsPort: DiagnosticsPort = unpublished('diagnostics');
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

export class HostFacade {
    private published: Readonly<HostPorts> | null = null;

    constructor(private readonly onChange: (ports: Readonly<HostPorts> | null) => void = () => undefined) {}

    publish(ports: HostPorts): void {
        if (this.published) {
            throw new Error('[host] the ports are already published; the entry point publishes them once');
        }
        this.published = Object.freeze({ ...ports });
        this.onChange(this.published);
    }

    get ports(): Readonly<HostPorts> {
        if (!this.published) {
            throw new Error(NOT_PUBLISHED);
        }
        return this.published;
    }

    get isPublished(): boolean {
        return this.published !== null;
    }

    resetForTests(): void {
        this.published = null;
        this.onChange(null);
    }
}

export const host = new HostFacade(bindPorts);
