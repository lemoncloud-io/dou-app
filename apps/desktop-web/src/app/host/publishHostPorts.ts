import { host } from '@chatic/host';

/**
 * The one file in this app that chooses how the host is reached: it picks an implementation for each
 * of `@chatic/host`'s ports and publishes them, once, from `main.tsx` before the first render.
 *
 * It is also the one file, beside `@chatic/bridges`' host profile, that may ask the host what it is —
 * `isNative()` and the shell's `CHATIC_APP_*` globals — and lint holds that (`@nx/workspace-host-facts`).
 * A feature asks a port, never the host. No port is defined yet; each arrives with the step that
 * moves its domain's features onto it, and is chosen here.
 */
export const publishHostPorts = (): void => {
    host.publish({});
};
