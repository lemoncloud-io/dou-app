import { type ComponentType, type ReactNode, createElement, lazy, Suspense } from 'react';

import { HTTP_METHODS, type HttpPort } from './methods';

import type * as Live from './live';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { HTTP_METHODS, type HttpMethod, type HttpPort } from './methods';
export type { PaymentWindow, PaymentWindowResult } from './createHttpPort';

export interface HttpSetup {
    port: HttpPort;
    /** Wraps the account surface's routes: the session lives inside it. */
    Host: ComponentType<{ children: ReactNode }>;
}

/**
 * The HTTP port, loaded on first use. The implementation pulls in the shared session runtime and the
 * payment SDK, which neither the production host's plans page nor a mock-only tab needs, so this
 * module holds only a stand-in that loads the real one when it is first called or rendered.
 */
export const createHttpSetup = (server: SubscriptionServer): HttpSetup => {
    let live: Promise<typeof Live> | undefined;
    let port: Promise<HttpPort> | undefined;
    // A failed load is forgotten, so the next call tries again instead of failing until a reload —
    // the chunk can be missing for a moment after a deploy.
    const load = () =>
        (live ??= import('./live').catch(error => {
            live = undefined;
            throw error;
        }));
    const loadPort = () =>
        (port ??= load()
            .then(module => module.createLiveHttpPort(server))
            .catch(error => {
                port = undefined;
                throw error;
            }));

    const proxy = Object.fromEntries(
        HTTP_METHODS.map(method => [
            method,
            (...args: unknown[]) =>
                loadPort().then(real => (real[method] as (...input: unknown[]) => Promise<unknown>)(...args)),
        ])
    ) as unknown as HttpPort;

    // The port is made before the host renders, so the runtime is booted before the host reads it.
    const LazyHost = lazy(() => loadPort().then(() => load().then(module => ({ default: module.SessionHost }))));
    const Host = ({ children }: { children: ReactNode }) =>
        createElement(Suspense, { fallback: null }, createElement(LazyHost, null, children));

    return { port: proxy, Host };
};
