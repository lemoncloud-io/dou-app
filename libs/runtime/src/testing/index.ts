// @chatic/runtime/testing — the one fake an app's tests use for `@chatic/runtime`.
//
// Two ways in, for the two things a test replaces:
//
// - The module, when a test mocks `@chatic/runtime`: `fakeRuntimeModule(overrides)` is what the mock
//   factory returns. Each group starts as the real one and takes the test's members on top, so a test
//   names only what it replaces; the domain's names (`RELAY_CLOUD_ID`, `isCloudDm`, …) stay real, which
//   a hand-written `{ runtime: { … } }` would have left out.
//
//       jest.mock('@chatic/runtime', () =>
//           require('@chatic/runtime/testing').fakeRuntimeModule({ data: { useRuntimeRepositories: () => repos } })
//       );
//       vi.mock('@chatic/runtime', async () =>
//           (await import('@chatic/runtime/testing')).fakeRuntimeModule({ signIn: { kind: 'shell', os: null } })
//       );
//
// - The host's ports, when a test leaves the module real: `publishTestHostPorts(overrides)` publishes a
//   browser's ports with the test's on top into the real holder, so `runtime.<port>` reads them.
//
// No jest or vitest here — both runners load this file, and each test brings its own `jest.fn()` or
// `vi.fn()`. It imports the facade's own files, never the package entry, because the entry is what a
// test mocks: a factory that loaded it would load itself.
import { HOST_PORT_NAMES, host } from '@chatic/runtime-client';
import type { HostPorts } from '@chatic/runtime-client';

import * as domain from '../domain';
import * as facade from '../facade';

import { browserAppShell } from './hostPorts/appShell';
import { browserDiagnostics } from './hostPorts/diagnostics';
import { browserLinks } from './hostPorts/links';

import type * as RuntimeModule from '../index';

type Runtime = typeof facade;

/** The groups that are namespaces of hooks and functions, as opposed to a host port. */
const NAMESPACE_GROUPS = ['boot', 'session', 'connection', 'data', 'sync', 'push', 'report', 'settings'] as const;

type PortGroup = Exclude<keyof HostPorts, 'push'>;
const PORT_GROUPS = HOST_PORT_NAMES.filter((name): name is PortGroup => name !== 'push');

/**
 * What a test replaces, group by group. A group's members are loose on purpose: a test hands in a
 * `jest.fn()`, a partial repository or a getter that answers per test, and the code under test is what
 * checks the shape. A group, or a port, may be a getter, read again on every access.
 */
export type RuntimeOverrides = { [G in keyof Runtime]?: Record<string, unknown> };

// Each port's browser value on its own, for a test that lays its own members on one.
export { browserAppShell, browserDiagnostics, browserLinks };

/** A browser tab's ports: nothing sold, and the page does everything itself. */
export const browserHostPorts = (): HostPorts => ({
    checkout: { kind: 'none' },
    media: { kind: 'browser' },
    files: { kind: 'browser' },
    links: browserLinks(),
    appShell: browserAppShell(),
    signIn: { kind: 'browser', os: null },
    diagnostics: browserDiagnostics(),
    push: { kind: 'browser' },
});

/**
 * Publishes a browser's ports with `overrides` on top into the real holder, replacing whatever a test
 * before published, and returns what `host.ports` now holds. `runtime.<port>` reads them from here on.
 */
export const publishTestHostPorts = (overrides: Partial<HostPorts> = {}): Readonly<HostPorts> => {
    host.resetForTests();
    host.publish({ ...browserHostPorts(), ...overrides });
    return host.ports;
};

/** Forgets the published ports; `runtime.<port>` throws again until the next publish. */
export const resetTestHostPorts = (): void => host.resetForTests();

/** `over`'s own properties — getters kept as getters — laid on a copy of the real group. */
const groupView = (group: (typeof NAMESPACE_GROUPS)[number], over: object | undefined, fallback: HostPorts) => {
    const view: Record<string, unknown> = { ...facade[group] };
    if (group === 'push') {
        // Live, like the real binding, with the browser's answer while nothing is published.
        Object.defineProperty(view, 'kind', {
            enumerable: true,
            configurable: true,
            get: () => (host.isPublished ? facade.push.kind : fallback.push.kind),
        });
    }
    if (over) Object.defineProperties(view, Object.getOwnPropertyDescriptors(over));
    return view;
};

/**
 * A `runtime` whose groups are the real ones with `overrides` on top. A port the test does not name
 * reads the real holder — what `publishTestHostPorts` put there — and a browser's port while nothing is
 * published, so a test that never thought about the host gets the plainest one.
 */
export const fakeRuntime = (overrides: RuntimeOverrides = {}): Runtime => {
    const fallback = browserHostPorts();
    const runtime: Record<string, unknown> = {};

    for (const group of NAMESPACE_GROUPS) {
        const given = Object.getOwnPropertyDescriptor(overrides, group);
        const getOverride = given?.get;
        if (getOverride) {
            Object.defineProperty(runtime, group, {
                enumerable: true,
                get: () => groupView(group, getOverride.call(overrides), fallback),
            });
        } else {
            runtime[group] = groupView(group, given?.value, fallback);
        }
    }

    for (const port of PORT_GROUPS) {
        const given = Object.getOwnPropertyDescriptor(overrides, port);
        Object.defineProperty(
            runtime,
            port,
            given
                ? { ...given, enumerable: true }
                : { enumerable: true, get: () => (host.isPublished ? host.ports[port] : fallback[port]) }
        );
    }

    return runtime as unknown as Runtime;
};

/**
 * The whole `@chatic/runtime` module for a mock factory: the domain's names as they are, and
 * `fakeRuntime(overrides)` as `runtime`.
 */
export const fakeRuntimeModule = (overrides: RuntimeOverrides = {}): typeof RuntimeModule => ({
    ...domain,
    runtime: fakeRuntime(overrides),
});
