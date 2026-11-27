import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

const bridges = vi.hoisted(() => ({
    onEvent: vi.fn(),
    unsubscribe: vi.fn(),
    handler: null as null | ((message: unknown) => void),
}));
vi.mock('@chatic/bridges', () => ({
    webClient: { onEvent: bridges.onEvent },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { desktopSignIn } from './signIn';

const facts = {} as WebHostFacts;
const shell = () => desktopSignIn.shell({ kind: 'shell', os: null }, facts);
const browser = () => desktopSignIn.browser({ kind: 'browser', os: null }, facts);

beforeEach(() => {
    bridges.unsubscribe.mockReset();
    bridges.handler = null;
    bridges.onEvent.mockReset().mockImplementation((_type: string, handler: (message: unknown) => void) => {
        bridges.handler = handler;
        return bridges.unsubscribe;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('desktopSignIn — the desktop app signs in', () => {
    it("holds the device's own sign-in and approves pairings, but never asks for one", () => {
        expect(shell()).toMatchObject({
            kind: 'shell',
            sessionScope: 'device',
            approvesPairing: true,
            requestsPairing: false,
        });
    });

    it('has no provider sign-in of its own', () => {
        expect(shell().providerSignIn).toBeNull();
    });

    it("opens the relay's authorize page in a new window, which the app routes to the system browser", () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);

        shell().relayOAuth?.openAuthorize('https://relay.example/oauth/google/authorize');

        expect(open).toHaveBeenCalledWith('https://relay.example/oauth/google/authorize', '_blank');
    });

    it('completes a returned code where it lands', () => {
        expect(shell().relayOAuth?.returnedCode).toBe('complete');
    });

    it('passes on each deeplink the app forwards, and nothing for an event without one', () => {
        const listener = vi.fn();

        const unsubscribe = shell().relayOAuth?.handoffLinks?.subscribe(listener);

        expect(bridges.onEvent).toHaveBeenCalledWith('OnReceiveNotification', expect.any(Function));
        bridges.handler?.({ data: { notification: { data: { deeplink: 'chatic://oauth?code=c' } } } });
        bridges.handler?.({ data: { notification: { data: {} } } });
        bridges.handler?.({ data: { notification: { data: { deeplink: '' } } } });
        bridges.handler?.({ data: { notification: { data: { deeplink: 42 } } } });
        bridges.handler?.({ data: {} });
        bridges.handler?.(undefined);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('chatic://oauth?code=c');

        unsubscribe?.();
        expect(bridges.unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('desktopSignIn — the page signs in', () => {
    it("keeps a tab's sign-in and asks to pair, never approves", () => {
        expect(browser()).toMatchObject({
            kind: 'browser',
            sessionScope: 'tab',
            approvesPairing: false,
            requestsPairing: true,
            providerSignIn: null,
        });
    });

    it("navigates this tab to the relay's authorize page", () => {
        const assign = vi.fn();
        vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });

        browser().relayOAuth?.openAuthorize('https://relay.example/oauth/apple/authorize');

        expect(assign).toHaveBeenCalledWith('https://relay.example/oauth/apple/authorize');
    });

    it('hands a returned code back to the app, and receives no deeplinks itself', () => {
        expect(browser().relayOAuth).toMatchObject({ returnedCode: 'handoff', handoffLinks: null });
        expect(bridges.onEvent).not.toHaveBeenCalled();
    });
});
