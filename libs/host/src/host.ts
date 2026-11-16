import type { HostPorts } from './ports';

/**
 * The host's ports, chosen once by the app's entry point and read by features at the point of use.
 *
 * A module facade rather than a React context, because the callers that need a port are not all
 * React: logging, the boot sequence and other plain modules reach the host too. Published once —
 * a second publish is refused rather than replacing the first, because a replacement would leave
 * every caller that already read a port holding the old one, with nothing to show it happened.
 *
 * Read a port where it is used, never at module scope: a module evaluated before the entry point
 * publishes would throw, and one evaluated after would keep whatever it read first.
 */
export class HostFacade {
    private published: Readonly<HostPorts> | null = null;

    /** Called once, from the app's entry point, before the first render. */
    publish(ports: HostPorts): void {
        if (this.published) {
            throw new Error('[host] the ports are already published; the entry point publishes them once');
        }
        this.published = Object.freeze({ ...ports });
    }

    /** The published ports. Throws before `publish`, naming the step that was missed. */
    get ports(): Readonly<HostPorts> {
        if (!this.published) {
            throw new Error("[host] the ports are read before the app's entry point published them (host.publish)");
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
    }
}

export const host = new HostFacade();
