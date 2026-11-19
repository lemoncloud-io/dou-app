import { host } from '@chatic/runtime-client';

import * as facade from '../facade';

import { browserHostPorts, fakeRuntime, fakeRuntimeModule, publishTestHostPorts, resetTestHostPorts } from '.';

afterEach(() => resetTestHostPorts());

describe('fakeRuntime', () => {
    it('keeps the real members of a group the test does not touch', () => {
        const runtime = fakeRuntime({ data: { useRuntimeRepositories: () => 'repos' } });

        expect(runtime.data.useRuntimeRepositories()).toBe('repos');
        expect(runtime.data.getCloudRepositories).toBe(facade.data.getCloudRepositories);
        expect(runtime.session).toEqual({ ...facade.session });
    });

    it('re-reads a group the test gives as a getter on every access', () => {
        let paired = false;
        const runtime = fakeRuntime({
            get session() {
                return { useIsPairedSession: () => paired };
            },
        });

        expect(runtime.session.useIsPairedSession()).toBe(false);
        paired = true;
        expect(runtime.session.useIsPairedSession()).toBe(true);
        // The rest of the group stays real either way.
        expect(runtime.session.useGlobalSession).toBe(facade.session.useGlobalSession);
    });

    it('answers a port the test names, getter or value', () => {
        let native = false;
        const runtime = fakeRuntime({
            links: { kind: 'shell' },
            get signIn() {
                return { kind: native ? 'shell' : 'browser', os: null };
            },
        });

        expect(runtime.links.kind).toBe('shell');
        expect(runtime.signIn.kind).toBe('browser');
        native = true;
        expect(runtime.signIn.kind).toBe('shell');
    });

    it('lays a push kind on the push hooks', () => {
        const runtime = fakeRuntime({ push: { kind: 'shell' } });

        expect(runtime.push.kind).toBe('shell');
        expect(runtime.push.useDeviceTokenRegistration).toBe(facade.push.useDeviceTokenRegistration);
    });

    it("reads a browser's ports while nothing is published", () => {
        const runtime = fakeRuntime();

        expect(runtime.checkout).toEqual({ kind: 'none' });
        expect(runtime.signIn).toEqual({ kind: 'browser', os: null });
        expect(runtime.push.kind).toBe('browser');
    });

    it('reads the published ports once a test publishes them', () => {
        const runtime = fakeRuntime();
        const published = publishTestHostPorts({ media: { kind: 'shell' }, push: { kind: 'shell' } });

        expect(runtime.media).toBe(published.media);
        expect(runtime.push.kind).toBe('shell');
    });
});

describe('fakeRuntimeModule', () => {
    it('keeps the domain values real beside the fake runtime', () => {
        const module = fakeRuntimeModule({ connection: { RELAY_SLOT: 'relay' } });

        expect(module.RELAY_CLOUD_ID).toBe(jest.requireActual('@chatic/data').RELAY_CLOUD_ID);
        expect(module.isCloudDm).toBe(jest.requireActual('@chatic/data').isCloudDm);
        expect(module.runtime.connection.RELAY_SLOT).toBe('relay');
    });
});

describe('publishTestHostPorts', () => {
    it("publishes a browser's ports with the test's on top, replacing an earlier publish", () => {
        publishTestHostPorts({ signIn: { kind: 'shell', os: 'ios' } });
        const ports = publishTestHostPorts({ checkout: { kind: 'web', open: jest.fn() } });

        expect(ports.signIn).toEqual(browserHostPorts().signIn);
        expect(ports.checkout.kind).toBe('web');
        expect(facade.checkout).toBe(host.ports.checkout);
    });

    it('is undone by resetTestHostPorts', () => {
        publishTestHostPorts();
        resetTestHostPorts();

        expect(host.isPublished).toBe(false);
        expect(() => facade.signIn.kind).toThrow('before the app');
    });
});
