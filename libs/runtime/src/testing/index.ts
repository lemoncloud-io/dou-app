import { HOST_PORT_NAMES, host } from '@chatic/runtime-client';
import type { HostPorts } from '@chatic/runtime-client';

import * as domain from '../domain';
import * as facade from '../facade';

import { browserAppShell } from './hostPorts/appShell';
import { browserDiagnostics } from './hostPorts/diagnostics';
import { browserFiles } from './hostPorts/files';
import { browserLinks } from './hostPorts/links';
import { browserMedia } from './hostPorts/media';
import { browserPush } from './hostPorts/push';
import { browserSignIn } from './hostPorts/signIn';

import type * as RuntimeModule from '../index';

type Runtime = typeof facade;
type RuntimeShape = Pick<Runtime, (typeof NAMESPACE_GROUPS)[number]>;

const NAMESPACE_GROUPS = ['boot', 'session', 'connection', 'data', 'sync', 'push', 'report', 'settings'] as const;

type PortGroup = Exclude<keyof HostPorts, 'push'>;
const PORT_GROUPS = HOST_PORT_NAMES.filter((name): name is PortGroup => name !== 'push');

export type RuntimeOverrides<R = Runtime> = { [G in keyof R]?: Record<string, unknown> };

export { browserAppShell, browserDiagnostics, browserFiles, browserLinks, browserMedia, browserPush, browserSignIn };

export const browserHostPorts = (): HostPorts => ({
    checkout: { kind: 'none' },
    media: browserMedia(),
    files: browserFiles(),
    links: browserLinks(),
    appShell: browserAppShell(),
    signIn: browserSignIn(),
    diagnostics: browserDiagnostics(),
    push: browserPush(),
});

export const publishTestHostPorts = (overrides: Partial<HostPorts> = {}): Readonly<HostPorts> => {
    host.resetForTests();
    host.publish({ ...browserHostPorts(), ...overrides });
    return host.ports;
};

export const resetTestHostPorts = (): void => host.resetForTests();

const groupView = (
    source: RuntimeShape,
    group: (typeof NAMESPACE_GROUPS)[number],
    over: object | undefined,
    fallback: HostPorts
) => {
    const view: Record<string, unknown> = { ...source[group] };
    if (group === 'push') {
        for (const field of Object.keys(fallback.push) as (keyof HostPorts['push'])[]) {
            Object.defineProperty(view, field, {
                enumerable: true,
                configurable: true,
                get: () => (host.isPublished ? source.push[field] : fallback.push[field]),
            });
        }
    }
    if (over) Object.defineProperties(view, Object.getOwnPropertyDescriptors(over));
    return view;
};

export const fakeRuntimeOf = <R extends RuntimeShape>(source: R, overrides: RuntimeOverrides<R> = {}): R => {
    const fallback = browserHostPorts();
    const runtime: Record<string, unknown> = {};

    for (const group of NAMESPACE_GROUPS) {
        const given = Object.getOwnPropertyDescriptor(overrides, group);
        const getOverride = given?.get;
        if (getOverride) {
            Object.defineProperty(runtime, group, {
                enumerable: true,
                get: () => groupView(source, group, getOverride.call(overrides), fallback),
            });
        } else {
            runtime[group] = groupView(source, group, given?.value, fallback);
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

    return runtime as unknown as R;
};

export const fakeRuntime = (overrides: RuntimeOverrides = {}): Runtime => fakeRuntimeOf(facade, overrides);

export const fakeRuntimeModule = (overrides: RuntimeOverrides = {}): typeof RuntimeModule => ({
    ...domain,
    runtime: fakeRuntime(overrides),
});
