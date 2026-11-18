import * as bindings from './hostPorts';
import { HOST_PORT_NAMES } from './ports';

import type { HostPorts } from './ports';

const { HostFacade, host } = bindings;

const none = (): HostPorts => ({
    checkout: { kind: 'none' },
    media: { kind: 'browser' },
    files: { kind: 'browser' },
    links: { kind: 'browser' },
    appShell: { kind: 'browser', os: null },
    signIn: { kind: 'browser', os: null },
    diagnostics: { kind: 'browser' },
    push: { kind: 'browser' },
});

describe('host', () => {
    it('refuses a read before the entry point publishes', () => {
        const facade = new HostFacade();

        expect(facade.isPublished).toBe(false);
        expect(() => facade.ports).toThrow('before the app');
    });

    it('returns what was published, frozen', () => {
        const facade = new HostFacade();
        const ports = none();

        facade.publish(ports);

        expect(facade.isPublished).toBe(true);
        expect(facade.ports).toEqual(ports);
        expect(Object.isFrozen(facade.ports)).toBe(true);
    });

    it('refuses a second publish and keeps the first', () => {
        const facade = new HostFacade();
        facade.publish(none());
        const first = facade.ports;

        expect(() => facade.publish(none())).toThrow('already published');
        expect(facade.ports).toBe(first);
    });

    it('can be published again after a test reset', () => {
        const facade = new HostFacade();
        facade.publish(none());
        facade.resetForTests();

        expect(facade.isPublished).toBe(false);
        expect(() => facade.publish(none())).not.toThrow();
    });
});

describe('the port bindings runtime.<port> re-exports', () => {
    afterEach(() => host.resetForTests());

    const objectBindings = {
        checkout: () => bindings.checkoutPort,
        media: () => bindings.mediaPort,
        files: () => bindings.filesPort,
        links: () => bindings.linksPort,
        appShell: () => bindings.appShellPort,
        signIn: () => bindings.signInPort,
        diagnostics: () => bindings.diagnosticsPort,
    } as const;

    it('names every port: seven objects and the push kind', () => {
        expect([...Object.keys(objectBindings), 'push'].sort()).toEqual([...HOST_PORT_NAMES].sort());
    });

    it.each(Object.entries(objectBindings))('%s throws on a read before the publish, naming the port', (name, read) => {
        expect(() => (read() as { kind: unknown }).kind).toThrow(`published them (host.publish): ${name}.kind`);
    });

    it('leaves the push kind unset before the publish', () => {
        expect(bindings.pushKind).toBeUndefined();
    });

    it.each(Object.entries(objectBindings))('%s is the very object host.ports holds once published', (name, read) => {
        host.publish(none());

        expect(read()).toBe(host.ports[name as keyof typeof objectBindings]);
    });

    it('carries the published push kind', () => {
        host.publish({ ...none(), push: { kind: 'shell' } });

        expect(bindings.pushKind).toBe('shell');
    });

    it('returns to unpublished on a test reset', () => {
        host.publish({ ...none(), push: { kind: 'shell' } });
        host.resetForTests();

        expect(() => bindings.signInPort.kind).toThrow('before the app');
        expect(bindings.pushKind).toBeUndefined();
    });

    it('stays printable before the publish', () => {
        // A test runner or a logger probes these on whatever it prints; a throw there would hide the
        // failure it was printing.
        const port = bindings.checkoutPort as unknown as Record<string, unknown>;

        expect(port.then).toBeUndefined();
        expect(port.toJSON).toBeUndefined();
        expect(port.asymmetricMatch).toBeUndefined();
    });

    it('is left alone by a holder a test makes for itself', () => {
        const own = new HostFacade();
        own.publish({ ...none(), push: { kind: 'shell' } });

        expect(bindings.pushKind).toBeUndefined();
        expect(() => bindings.mediaPort.kind).toThrow('before the app');
    });
});
