import { type ComponentType, type ReactNode, createElement, lazy, Suspense } from 'react';

import { type CardEntryChannel, createCardEntryChannel } from '@chatic/web-checkout';
import { HTTP_METHODS, type HttpPort } from '@chatic/web-checkout';
import { createSandboxWindow } from '@chatic/web-checkout';

import type { HttpSandbox } from './createHttpPort';
import type { PaymentWindowHost } from '@chatic/web-checkout';

import type * as Live from './live';
import type { SubscriptionServer } from '../../../../../config/subscriptionServer';

export { HTTP_METHODS, type HttpMethod, type HttpPort } from '@chatic/web-checkout';
export type { HttpSandbox, PaymentWindow, PaymentWindowResult } from './createHttpPort';

export interface HttpSetup {
    port: HttpPort;
    Host: ComponentType<{ children: ReactNode }>;
    cardEntry: CardEntryChannel;
    sandboxWindow?: PaymentWindowHost;
}

export const createHttpSetup = (server: SubscriptionServer, options: { sandbox?: HttpSandbox } = {}): HttpSetup => {
    const cardEntry = createCardEntryChannel();
    const sandboxWindow = options.sandbox ? createSandboxWindow() : undefined;
    let live: Promise<typeof Live> | undefined;
    let port: Promise<HttpPort> | undefined;
    const load = () =>
        (live ??= import('./live').catch(error => {
            live = undefined;
            throw error;
        }));
    const loadPort = () =>
        (port ??= load()
            .then(module =>
                module.createLiveHttpPort(
                    server,
                    cardEntry,
                    options.sandbox && sandboxWindow
                        ? { ...options.sandbox, paymentWindow: sandboxWindow.paymentWindow }
                        : undefined
                )
            )
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

    const LazyHost = lazy(() => loadPort().then(() => load().then(module => ({ default: module.SessionHost }))));
    const Host = ({ children }: { children: ReactNode }) =>
        createElement(Suspense, { fallback: null }, createElement(LazyHost, null, children));

    return { port: proxy, Host, cardEntry, sandboxWindow: sandboxWindow?.host };
};
